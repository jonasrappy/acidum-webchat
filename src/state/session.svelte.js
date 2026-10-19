import { tick } from 'svelte';
import { ChatStore, parseToken, messageAttention, matchesMode } from '../lib/core.js';
import { mergeRoomCopies } from '../lib/timeline.js';
import { LocalData, exportText } from '../lib/local-data.js';
import { NotificationPreferences } from './notifications.svelte.js';
import { ComposerState } from './composer.svelte.js';
import { MessageTools } from './message-tools.svelte.js';
import { ChatConnection } from '../lib/connection.js';
import { demoEvents } from '../lib/demo.js';
import {
  readToken,
  writeToken,
  readPreference,
  writePreference,
  localStorageOrFallback,
  loginScope,
} from '../lib/storage.js';
import { trackViewport } from '../actions/viewport.js';
import { TimelineWindow } from './timeline.svelte.js';
import { LocalHistory } from './history.svelte.js';
import { EventLog } from '../lib/event-log.js';
import { DesktopOverview } from './overview.svelte.js';
import { CloudSync } from './sync.svelte.js';

class Account {
  room = $state.raw(null);
  unread = $state(0);
  people = $state.raw([]);
  complete = $state(false);
  roomSince = $state(0);
  revision = -1;

  constructor(name) {
    this.name = name;
  }

  update(tab, includePeople) {
    this.room = tab.room;
    this.unread = tab.unread;
    this.complete = tab.rosterComplete;
    this.roomSince = tab.roomSince;
    if (includePeople && this.revision !== tab.presenceRevision) {
      this.revision = tab.presenceRevision;
      this.people = [...tab.presence.values()]
        .filter((person) => person.present)
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    }
  }
}

export class ChatSession {
  open = $state(false);
  demo = $state(false);
  loginError = $state('');
  resumeAvailable = $state(Boolean(readToken()));
  status = $state('Connecting…');
  online = $state(false);
  accounts = $state.raw([]);
  active = $state('');
  logOnly = $state(false);
  mode = $state('all');
  person = $state('');
  query = $state('');
  searchText = $state('');
  searchOpen = $state(false);
  showEvents = $state(readPreference('acidum-show-room-activity', 'yes') !== 'no');
  highlightOwnMessages = $state(readPreference('acidum-highlight-own-messages', 'yes') !== 'no');
  textSize = $state(16);
  notice = $state(false);
  hasOlder = $state(false);
  rosterRevision = $state(0);
  roleRevision = $state(0);
  wide = $state(false);
  layout = $state(readPreference('acidum-desktop-layout', 'overview'));
  desktopComposer = $state(readPreference('acidum-desktop-composer', 'panels'));
  peopleOpen = $state(readPreference('acidum-room-people', 'yes') !== 'no');
  dialogs = $state({ rooms: false, settings: false, person: false, message: false });
  selectedPerson = $state.raw(null);
  alert = $state.raw(null);
  history = new LocalHistory();
  eventLog = new EventLog();
  timeline = new TimelineWindow();
  overview = new DesktopOverview();
  composer = $state.raw(null);
  composers = new Map();

  layoutAvailable = $derived(
    this.wide && !this.active && !this.logOnly && this.accounts.length > 1,
  );
  overviewAvailable = $derived(this.layoutAvailable && this.accounts.length <= 6);
  overviewActive = $derived(this.overviewAvailable && this.layout === 'overview');
  panelComposers = $derived(this.overviewActive && this.desktopComposer !== 'shared');
  roomRail = $derived(this.wide && Boolean(this.active) && !this.logOnly && this.peopleOpen);

  totalUnread = $derived(this.accounts.reduce((sum, account) => sum + account.unread, 0));
  ownNames = $derived(
    new Set(this.accounts.map((account) => account.name.normalize('NFKC').toLocaleLowerCase('en'))),
  );
  currentAccount = $derived(this.accounts.find((account) => account.name === this.active));
  followAccount = $derived(
    this.accounts.some((account) => account.name === this.composer.account)
      ? this.composer.account
      : '',
  );
  heading = $derived(this.logOnly ? 'Event log' : this.active || 'All chats');
  subtitle = $derived(
    this.logOnly
      ? 'Latest 100 events'
      : this.currentAccount?.room
        ? `${this.currentAccount.room.name}${this.currentAccount.room.id != null ? ' · Room ' + this.currentAccount.room.id : ''}`
        : '',
  );
  title = $derived(
    this.open
      ? `${this.totalUnread ? '(' + this.totalUnread + ') ' : ''}${this.active ? this.active + ' · ' : ''}acidum`
      : 'acidum · webchat',
  );
  emptyText = $derived(
    this.query || this.person || this.mode === 'private'
      ? 'No messages match the selected filters in the loaded history.'
      : this.logOnly
        ? 'No marked events yet.'
        : !this.accounts.length
          ? 'Waiting for accounts from acidum. Check that the desktop app is running with webchat enabled.'
          : 'Messages appear as soon as acidum sends them.',
  );
  dialogOpen = $derived(Object.values(this.dialogs).some(Boolean));

  store = new ChatStore();
  localData = null;
  token = '';
  loginGeneration = 0;
  pageSize = 250;
  nearBottom = true;
  lastChatAccount = '';
  pendingAccount = '';
  timelineNode = null;
  searchTimer = null;
  alertTimer = null;
  incomingTimer = null;
  frame = 0;
  viewDirty = false;
  navDirty = false;
  lastRender = 0;
  scrollRevision = 0;
  loadingOlder = false;

  constructor() {
    this.sync = new CloudSync((messages) => {
      this.eventLog.capture(messages);
      this.eventLog.flush();
      this.schedule();
    });
    const savedSize = Number(readPreference('acidum-text-size', '16'));
    if (Number.isFinite(savedSize) && savedSize >= 10 && savedSize <= 30)
      this.textSize = Math.round(savedSize);
    this.notifications = new NotificationPreferences({
      onAlert: (message) => this.receiveAlert(message),
      onOpen: (account) => this.openAlert(account),
    });
    this.composer = new ComposerState(() => this.localData);
    this.messageTools = new MessageTools(
      () => this.localData,
      () => {
        const isSaved = (message) => this.messageTools.isSaved(message);
        this.timeline.updateBookmarks(isSaved);
        for (const panel of this.overview.panels) panel.timeline.updateBookmarks(isSaved);
      },
    );
    this.connection = new ChatConnection({
      onData: (data, options) => this.ingest(data, options),
      onStatus: (text, online) => {
        this.status = text;
        this.online = online;
      },
      onDisconnected: () => {
        this.online = false;
        for (const tab of this.store.tabs.values()) tab.rosterComplete = false;
        this.syncNavigation();
      },
      onRefused: () => {
        if (this.sync.enabled) {
          this.status = 'Desktop chat unavailable · saved history is available';
          this.connection.timer = setTimeout(() => this.connection.reconnect(), 60000);
          return;
        }
        this.disconnect(false);
        this.loginError = 'The saved chat is unavailable right now. Try again or paste a new link.';
      },
    });
  }

  mount() {
    const removeViewport = trackViewport(() => this.scrollToBottom());
    const desktop = window.matchMedia('(min-width: 1100px)');
    const updateDesktop = () => {
      const changed = this.wide !== desktop.matches;
      this.wide = desktop.matches;
      if (changed && this.open) {
        this.nearBottom = true;
        this.schedule();
      }
    };
    updateDesktop();
    const listeners = [];
    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      listeners.push(() => target.removeEventListener(event, handler));
    };
    listen(desktop, 'change', updateDesktop);
    listen(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.saveDrafts();
        this.history.flush();
        this.sync.flush();
      } else if (this.open) {
        this.refresh();
        this.sync.run();
      }
    });
    listen(document, 'pointerdown', () => this.notifications.unlockSound());
    listen(document, 'keydown', (event) => {
      this.notifications.unlockSound();
      if (
        event.key === '/' &&
        !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
        this.open &&
        !this.dialogOpen
      ) {
        event.preventDefault();
        this.searchOpen = true;
        tick().then(() => document.getElementById('search')?.focus({ preventScroll: true }));
      }
    });
    listen(window, 'online', () => this.reconnect());
    listen(window, 'offline', () => this.connection.offline());
    listen(window, 'pagehide', () => {
      this.saveDrafts();
      this.history.flush();
      this.sync.flush();
      this.connection.stop();
    });
    listen(window, 'pageshow', (event) => {
      if (event.persisted && this.token) this.connection.start(this.token);
    });
    const fragment = new URLSearchParams(location.hash.slice(1));
    const incoming = fragment.get('token');
    this.pendingAccount = fragment.get('account') || '';
    if (incoming || this.pendingAccount)
      window.history.replaceState(null, '', location.pathname + location.search);
    const saved = incoming || readToken();
    if (location.hash === '#demo' && !saved) this.enterDemo();
    else if (saved) this.start(saved);
    return () => {
      listeners.forEach((remove) => remove());
      removeViewport();
      this.saveDrafts();
      this.history.detach();
      this.sync.detach();
      this.overview.reset();
      this.connection.stop();
      this.notifications.destroy();
      clearTimeout(this.searchTimer);
      clearTimeout(this.alertTimer);
      clearTimeout(this.incomingTimer);
      cancelAnimationFrame(this.frame);
    };
  }

  start(input) {
    let token;
    try {
      token = parseToken(input);
    } catch (error) {
      this.loginError = error.message;
      return;
    }
    const generation = ++this.loginGeneration;
    this.sync.detach();
    this.token = token;
    writeToken(token);
    this.demo = false;
    this.open = true;
    this.loginError = '';
    this.history.resetView();
    this.overview.reset();
    this.localData = null;
    this.eventLog = new EventLog();
    this.history.scope = '';
    loginScope(token)
      .then((scope) => {
        if (generation !== this.loginGeneration) return;
        this.history.scope = scope;
        this.localData = new LocalData(localStorageOrFallback(), scope);
        const pending = this.eventLog.rows.flatMap((row) => row.sources || [row]);
        this.eventLog = new EventLog(localStorageOrFallback(), scope);
        this.eventLog.capture([...pending, ...this.store.messages('')]);
        this.eventLog.flush();
        for (const composer of this.composers.values()) {
          if (composer.text) composer.save();
          else composer.text = this.localData.draft(composer.account);
        }
        if (this.history.enabled) this.queueCurrentHistory();
        this.sync.attach(token, scope).then(() => {
          if (generation === this.loginGeneration) {
            this.seedSync();
            this.sync.importArchive().catch(() => {});
          }
        });
        this.schedule();
      })
      .catch(() => {
        if (generation === this.loginGeneration)
          this.history.status = 'Local storage is unavailable. The chat will continue.';
      });
    this.connection.start(token);
    this.schedule();
  }

  disconnect(forget = true) {
    ++this.loginGeneration;
    this.saveDrafts();
    this.connection.stop();
    this.history.detach();
    this.sync.flush();
    this.sync.detach();
    clearTimeout(this.alertTimer);
    clearTimeout(this.searchTimer);
    clearTimeout(this.incomingTimer);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.incomingTimer = null;
    this.viewDirty = this.navDirty = false;
    this.token = '';
    if (forget) writeToken(null);
    this.resumeAvailable = Boolean(readToken());
    this.localData = null;
    this.eventLog = new EventLog();
    for (const composer of this.composers.values()) composer.reset();
    this.composers.clear();
    this.composer = new ComposerState(() => this.localData);
    this.store = new ChatStore();
    this.accounts = [];
    this.timeline.clear();
    this.overview.reset();
    this.active = '';
    this.searchText = '';
    this.query = '';
    this.person = '';
    this.mode = 'all';
    this.logOnly = false;
    this.demo = false;
    this.online = false;
    this.searchOpen = false;
    this.alert = null;
    this.selectedPerson = null;
    this.messageTools.reset();
    this.pendingAccount = '';
    this.lastChatAccount = '';
    this.pageSize = 250;
    this.nearBottom = true;
    this.notice = false;
    this.hasOlder = false;
    this.closeDialogs(false);
    this.open = false;
    tick().then(() => document.getElementById('chat-link')?.focus({ preventScroll: true }));
  }

  resume() {
    const token = readToken();
    if (token) this.start(token);
  }
  reconnect() {
    if (!this.demo && this.token) this.connection.reconnect();
  }

  syncNavigation() {
    this.roleRevision = this.store.roleRevision;
    const previous = new Map(this.accounts.map((account) => [account.name, account]));
    const accounts = this.store.names.map((name) => {
      this.accountComposer(name);
      const account = previous.get(name) || new Account(name);
      account.update(
        this.store.tab(name),
        this.dialogs.rooms || (this.roomRail && name === this.active),
      );
      return account;
    });
    if (
      accounts.length !== this.accounts.length ||
      accounts.some((account, index) => account !== this.accounts[index])
    )
      this.accounts = accounts;
  }

  updateTabs(names) {
    this.store.setTabs(names);
    for (const [name, composer] of this.composers) {
      if (this.store.names.includes(name)) continue;
      composer.save();
      composer.reset();
      this.composers.delete(name);
    }
    if (this.active && !this.store.names.includes(this.active)) this.active = '';
    if (!this.store.names.includes(this.composer.account))
      this.setSendAs(this.store.names[0] || '', false);
    this.syncNavigation();
    if (this.pendingAccount && this.store.names.includes(this.pendingAccount)) {
      const account = this.pendingAccount;
      this.pendingAccount = '';
      this.openAlert(account);
    }
    for (const name of this.store.names)
      this.connection.send({ name, lastLine: this.store.tab(name).lastLine });
  }

  ingest(payload, { historical = false } = {}) {
    let logChanged = false;
    const received = [];
    for (const event of (Array.isArray(payload) ? payload : [payload]).slice(0, 10000)) {
      if (Array.isArray(event?.tabs)) {
        this.updateTabs(event.tabs);
        this.viewDirty = this.navDirty = true;
        continue;
      }
      const roleRevision = this.store.roleRevision;
      const message = this.store.add(event);
      if (!message) continue;
      received.push(message);
      if (this.eventLog.relevant(message)) logChanged = true;
      if (this.store.roleRevision !== roleRevision) this.viewDirty = true;
      if (!this.demo) this.history.queue(message);
      if (!this.demo) this.sync.queue(message);
      if (!historical && message.serverNotify) this.notifications.receive(message);
      const visible =
        !this.dialogOpen &&
        this.accept(message) &&
        (!this.active || this.active === message.account) &&
        this.matchesQuery(message);
      const atLatest = this.overviewActive
        ? this.overview.canRead(message.account)
        : this.nearBottom;
      if (message.attention && (document.hidden || !visible || !atLatest)) {
        this.store.tab(message.account).unread++;
        this.navDirty = true;
      }
      if (visible && (this.showEvents || !message.system)) this.viewDirty = true;
      if (
        message.type === 'room' ||
        this.dialogs.rooms ||
        (this.roomRail && message.account === this.active)
      )
        this.navDirty = true;
      if (message.account === this.composer.account) this.rosterRevision++;
      if (visible && !this.nearBottom) this.notice = true;
      if (
        this.overviewActive &&
        this.accept(message) &&
        this.matchesQuery(message) &&
        (this.showEvents || !message.system)
      )
        this.overview.note(message);
    }
    if (logChanged) {
      const changed = this.eventLog.capture([...this.store.messages(''), ...received]);
      this.eventLog.flush();
      if (changed && this.logOnly) this.viewDirty = true;
    }
    if (!document.hidden && !this.incomingTimer) {
      this.incomingTimer = setTimeout(
        () => {
          this.incomingTimer = null;
          if (document.hidden) return;
          const viewDirty = this.viewDirty;
          const navDirty = this.navDirty;
          this.viewDirty = this.navDirty = false;
          if (viewDirty && (this.nearBottom || this.overviewActive)) this.refresh();
          else if (navDirty) this.syncNavigation();
        },
        Math.max(0, 80 - (performance.now() - this.lastRender)),
      );
    }
  }

  accept(message) {
    return (
      (!this.logOnly || message.log || messageAttention(message)) &&
      (!this.person || message.name === this.person) &&
      matchesMode(message, this.mode)
    );
  }

  matchesQuery(message, query = this.query.toLocaleLowerCase('en')) {
    return (
      !query ||
      `${(message.accounts || [message.account]).join(' ')} ${message.name} ${message.text}`
        .toLocaleLowerCase('en')
        .includes(query)
    );
  }

  combinedMessages(extra = []) {
    if (this.logOnly)
      return this.eventLog.rows.filter(
        (message) =>
          (!this.active || (message.accounts || [message.account]).includes(this.active)) &&
          (this.showEvents || !message.system) &&
          this.matchesQuery(message) &&
          this.accept(message),
      );
    const current = this.active
      ? this.store.tabs.get(this.active)?.messages || []
      : [...this.store.tabs.values()].flatMap((tab) => tab.messages);
    const unique = new Map();
    for (const message of [...this.sync.rows, ...this.history.rows, ...extra, ...current])
      unique.set(message.account + '\0' + message.key, message);
    const messages = [...unique.values()]
      .filter(
        (message) =>
          (!this.active || message.account === this.active) && (this.showEvents || !message.system),
      )
      .sort(
        (a, b) =>
          a.time - b.time || a.account.localeCompare(b.account) || a.key.localeCompare(b.key),
      );
    const query = this.query.toLocaleLowerCase('en');
    return (this.active ? messages : mergeRoomCopies(messages)).filter(
      (message) => this.matchesQuery(message, query) && this.accept(message),
    );
  }

  canClearAttention() {
    return this.mode === 'all' && !this.person && !this.query && !this.dialogOpen;
  }

  clearAttention() {
    if (document.hidden || !this.canClearAttention()) return;
    for (const [name, tab] of this.store.tabs)
      if (
        (!this.active || this.active === name) &&
        (this.overviewActive ? this.overview.canRead(name) : this.nearBottom)
      )
        tab.unread = 0;
  }

  schedule() {
    if (!document.hidden && !this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.refresh();
      });
  }

  refresh({ older = false } = {}) {
    if (!this.open) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastRender = performance.now();
    this.clearAttention();
    this.syncNavigation();
    if (this.overviewActive) {
      this.overview.refresh(this);
      this.timeline.clear();
      return;
    }
    const node = this.timelineNode;
    const before = node?.scrollHeight || 0;
    const top = node?.scrollTop || 0;
    const messages = this.combinedMessages();
    this.timeline.update(
      messages.slice(-this.pageSize),
      (message) => this.messageTools.isSaved(message),
      (message) => this.isSuperuser(message),
    );
    this.hasOlder =
      !this.logOnly &&
      (messages.length > this.pageSize ||
        this.sync.hasMore ||
        Boolean(this.history.enabled && this.history.scope && this.history.hasMore && !this.demo));
    if (this.nearBottom) this.notice = false;
    const revision = ++this.scrollRevision;
    tick().then(() => {
      if (!node || revision !== this.scrollRevision) return;
      node.scrollTop = this.nearBottom
        ? node.scrollHeight
        : older
          ? top + node.scrollHeight - before
          : top;
      this.loadingOlder = false;
    });
  }

  attachTimeline(node) {
    this.timelineNode = node;
    return {
      destroy: () => {
        if (this.timelineNode === node) this.timelineNode = null;
      },
    };
  }

  scrollToBottom() {
    if (this.overviewActive) {
      requestAnimationFrame(() => {
        for (const panel of this.overview.panels)
          if (panel.nearBottom && panel.node) panel.node.scrollTop = panel.node.scrollHeight;
      });
      return;
    }
    if (this.open && this.nearBottom)
      requestAnimationFrame(() => {
        if (this.timelineNode) this.timelineNode.scrollTop = this.timelineNode.scrollHeight;
      });
  }

  onScroll() {
    const node = this.timelineNode;
    if (!node) return;
    this.nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
    if (node.scrollTop < 100 && node.scrollHeight > node.clientHeight + 100) this.loadOlder();
    if (this.nearBottom && this.notice) {
      this.notice = false;
      this.clearAttention();
      this.syncNavigation();
    }
  }

  async loadOlder() {
    if (this.logOnly) return;
    if (this.loadingOlder || this.history.loading || this.demo) return;
    const messages = this.combinedMessages();
    if (messages.length > this.pageSize) {
      this.pageSize += 250;
      this.nearBottom = false;
      this.loadingOlder = true;
      this.refresh({ older: true });
      return;
    }
    if (this.sync.hasMore && (await this.sync.loadOlder())) {
      this.pageSize += 250;
      this.nearBottom = false;
      this.loadingOlder = true;
      this.refresh({ older: true });
      return;
    }
    if (
      await this.history.load(this.active, messages[0], {
        query: this.query,
        systems: this.showEvents,
        accept: (message) => this.accept(message),
      })
    ) {
      this.pageSize += 250;
      this.nearBottom = false;
      this.loadingOlder = true;
      this.refresh({ older: true });
    }
  }

  filterChanged() {
    this.history.resetView();
    this.overview.reset();
    this.pageSize = 250;
    this.nearBottom = true;
    this.refresh();
  }

  isOwnMessage(message) {
    return (
      this.highlightOwnMessages &&
      (message.type === 'text' || message.type === 'priv') &&
      this.ownNames.has(message.name.normalize('NFKC').toLocaleLowerCase('en'))
    );
  }

  isSuperuser(message) {
    return (
      message.superuser ||
      (message.accounts || [message.account]).some((account) =>
        this.store.isSuperuser(account, message.name),
      )
    );
  }

  setLayout(layout) {
    this.layout = layout;
    writePreference('acidum-desktop-layout', layout);
    this.filterChanged();
  }

  setDesktopComposer(value) {
    this.saveDrafts();
    this.desktopComposer = value;
    writePreference('acidum-desktop-composer', value);
    tick().then(() => this.scrollToBottom());
  }

  togglePeople() {
    this.peopleOpen = !this.peopleOpen;
    writePreference('acidum-room-people', this.peopleOpen ? 'yes' : 'no');
    this.syncNavigation();
    this.scrollToBottom();
  }

  replyAs(name) {
    this.setSendAs(name, false);
    tick().then(() => this.focusComposer(name));
  }

  focusComposer(name = this.composer.account) {
    const id = this.panelComposers ? 'account-' + encodeURIComponent(name) + '-message' : 'message';
    document.getElementById(id)?.focus({ preventScroll: true });
  }

  accountComposer(name) {
    if (!this.composers.has(name))
      this.composers.set(name, new ComposerState(() => this.localData, name));
    return this.composers.get(name);
  }

  saveDrafts() {
    for (const composer of this.composers.values()) composer.save();
  }

  choose(name, logOnly = false) {
    this.composer.save();
    if (logOnly) {
      this.mode = 'all';
      this.person = '';
    } else if (name !== this.active) this.person = '';
    this.active = name;
    this.logOnly = logOnly;
    if (!logOnly) this.lastChatAccount = name;
    if (name && this.store.tabs.has(name)) this.setSendAs(name, false);
    this.notice = false;
    this.filterChanged();
  }

  chooseLastChat() {
    this.choose(this.store.names.includes(this.lastChatAccount) ? this.lastChatAccount : '');
  }

  setSendAs(name, changeView = true) {
    if (name !== this.composer.account) {
      this.composer.save();
      this.composer = this.accountComposer(name);
      this.rosterRevision++;
    }
    if (changeView && this.active && this.active !== name) this.choose(name);
  }

  send(composer = this.composer) {
    const text = composer.text;
    if (!text.trim() || !this.store.names.includes(composer.account)) return;
    if (text.length > 100) {
      composer.error = 'Messages can contain up to 100 characters.';
      return;
    }
    composer.error = '';
    if (this.demo)
      this.ingest({
        me: { name: composer.account },
        user: { name: composer.account },
        type: 'text',
        text,
        time: Date.now(),
      });
    else if (!this.online || !this.connection.send({ name: composer.account, say: text })) {
      composer.error = 'Disconnected. Your message is still in the text field.';
      return;
    }
    composer.text = '';
    composer.save();
  }

  searchChanged() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query = this.searchText.trim();
      this.filterChanged();
    }, 80);
  }

  clearSearch() {
    this.searchText = '';
    this.searchChanged();
  }
  togglePrivate() {
    this.mode = this.mode === 'private' ? 'all' : 'private';
    this.filterChanged();
  }
  clearPerson() {
    this.person = '';
    this.filterChanged();
  }
  seedSync() {
    if (!this.sync.enabled) return;
    for (const message of [
      ...this.store.messages(''),
      ...this.eventLog.rows.flatMap((row) => row.sources || [row]),
    ])
      this.sync.queue(message);
  }

  async connectSync() {
    await this.sync.connect();
    this.seedSync();
    this.sync.importArchive().catch(() => {});
    this.sync.schedule(1000);
  }

  disconnectSync() {
    this.sync.disable();
    this.filterChanged();
  }

  setShowEvents(value) {
    this.showEvents = value;
    writePreference('acidum-show-room-activity', value ? 'yes' : 'no');
    this.filterChanged();
  }
  setHighlightOwnMessages(value) {
    this.highlightOwnMessages = value;
    writePreference('acidum-highlight-own-messages', value ? 'yes' : 'no');
  }

  setTextSize(value) {
    this.textSize = Number(value);
    writePreference('acidum-text-size', String(this.textSize));
    this.scrollToBottom();
  }

  presentNames(account = this.composer.account) {
    this.rosterRevision;
    return [...(this.store.tabs.get(account)?.presence.values() || [])]
      .filter((person) => person.present)
      .map((person) => person.name);
  }

  rosterComplete(account = this.composer.account) {
    this.rosterRevision;
    return Boolean(this.store.tabs.get(account)?.rosterComplete);
  }

  openDialog(name) {
    if (name === 'rooms') {
      this.dialogs.rooms = true;
      this.syncNavigation();
    } else {
      if (name === 'settings') this.notifications.refresh();
      this.dialogs[name] = true;
    }
  }

  closeDialog(name) {
    this.dialogs[name] = false;
    this.schedule();
  }
  closeDialogs(refresh = true) {
    for (const name of Object.keys(this.dialogs)) this.dialogs[name] = false;
    if (refresh) this.schedule();
  }

  openPerson(name, accounts) {
    const account = accounts.includes(this.composer.account)
      ? this.composer.account
      : accounts.find((name) => this.store.tabs.has(name)) || accounts[0];
    this.selectedPerson = { name, account };
    this.openDialog('person');
  }

  mentionPerson() {
    if (!this.selectedPerson) return;
    const { name, account } = this.selectedPerson;
    this.closeDialogs();
    this.choose(account);
    this.composer.text = (name + ' ' + this.composer.text).slice(0, 100);
    this.composer.save();
    tick().then(() => document.getElementById('message')?.focus({ preventScroll: true }));
  }

  filterPerson() {
    if (!this.selectedPerson) return;
    const { name, account } = this.selectedPerson;
    this.closeDialogs();
    this.choose(account);
    this.person = name;
    this.mode = 'all';
    this.searchOpen = true;
    this.filterChanged();
  }

  openMessage(message) {
    this.messageTools.select(message);
    this.openDialog('message');
  }

  followMessage() {
    const destination = this.messageTools.selected?.destination;
    const account = this.followAccount;
    if (!destination || !Number.isSafeInteger(destination.id) || destination.id < 0 || !account)
      return;
    if (!this.online || !this.connection.send({ name: account, say: '/goto ' + destination.id })) {
      this.messageTools.status = 'Disconnected. Try again once the connection is restored.';
      return;
    }
    this.closeDialog('message');
  }

  exportChat() {
    const blob = new Blob(
      [exportText(this.overviewActive ? this.overview.messages(this) : this.combinedMessages())],
      {
        type: 'text/plain;charset=utf-8',
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'acidum-' + new Date().toISOString().slice(0, 10) + '.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  queueCurrentHistory() {
    for (const tab of this.store.tabs.values())
      for (const message of tab.messages) this.history.queue(message);
  }
  setHistory(value) {
    this.history.setEnabled(value);
    this.overview.reset();
    if (value && !this.demo) this.queueCurrentHistory();
    this.schedule();
  }
  async clearHistory() {
    await this.history.clear();
    this.overview.reset();
    this.schedule();
  }

  receiveAlert(message) {
    if (
      !document.hidden &&
      !this.dialogOpen &&
      (this.overviewActive ? this.overview.canRead(message.account) : this.nearBottom) &&
      (!this.active || this.active === message.account) &&
      this.accept(message)
    )
      return;
    this.alert = message;
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => (this.alert = null), 7000);
  }

  openAlert(account) {
    if (!this.store.names.includes(account)) {
      this.pendingAccount = account;
      return;
    }
    this.closeDialogs();
    this.mode = 'all';
    this.person = this.query = this.searchText = '';
    this.choose(account);
    this.alert = null;
  }

  enterDemo() {
    this.demo = this.open = this.online = true;
    this.status = 'Demo mode';
    this.localData = new LocalData({ getItem: () => null, setItem: () => {} }, 'demo');
    this.updateTabs(['Nova', 'Milo']);
    this.ingest(demoEvents(), { historical: true });
  }
}
