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
        .sort((a, b) => a.name.localeCompare(b.name, 'da'));
    }
  }
}

export class ChatSession {
  open = $state(false);
  demo = $state(false);
  loginError = $state('');
  resumeAvailable = $state(Boolean(readToken()));
  status = $state('Forbinder…');
  online = $state(false);
  accounts = $state.raw([]);
  active = $state('');
  logOnly = $state(false);
  mode = $state('all');
  person = $state('');
  query = $state('');
  searchText = $state('');
  searchOpen = $state(false);
  showEvents = $state(true);
  textSize = $state(16);
  notice = $state(false);
  hasOlder = $state(false);
  rosterRevision = $state(0);
  dialogs = $state({ rooms: false, settings: false, person: false, message: false });
  selectedPerson = $state.raw(null);
  alert = $state.raw(null);
  history = new LocalHistory();
  eventLog = new EventLog();
  timeline = new TimelineWindow();

  totalUnread = $derived(this.accounts.reduce((sum, account) => sum + account.unread, 0));
  currentAccount = $derived(this.accounts.find((account) => account.name === this.active));
  followAccount = $derived(
    this.accounts.some((account) => account.name === this.composer.account)
      ? this.composer.account
      : '',
  );
  heading = $derived(this.logOnly ? 'Hændelseslog' : this.active || 'Alle samtaler');
  subtitle = $derived(
    this.logOnly
      ? 'Markeringer og hændelser fra dine acidum-brugere.'
      : this.currentAccount?.room
        ? `${this.currentAccount.room.name}${this.currentAccount.room.id != null ? ' · Rum ' + this.currentAccount.room.id : ''}`
        : '',
  );
  title = $derived(
    this.open
      ? `${this.totalUnread ? '(' + this.totalUnread + ') ' : ''}${this.active ? this.active + ' · ' : ''}acidum`
      : 'acidum · webchat',
  );
  emptyText = $derived(
    this.query
      ? 'Ingen beskeder matcher din søgning i den indlæste historik.'
      : this.logOnly
        ? 'Ingen markerede hændelser endnu.'
        : !this.accounts.length
          ? 'Venter på brugerfaner fra acidum. Kontrollér, at programmet kører med webchat slået til.'
          : 'Dine beskeder vises, så snart acidum sender dem.',
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
      () => this.timeline.updateBookmarks((message) => this.messageTools.isSaved(message)),
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
        this.disconnect(false);
        this.loginError =
          'Ingen adgang til den gemte chat lige nu. Prøv igen eller indsæt et nyt link.';
      },
    });
  }

  mount() {
    const removeViewport = trackViewport(() => this.scrollToBottom());
    const listeners = [];
    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      listeners.push(() => target.removeEventListener(event, handler));
    };
    listen(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.composer.save();
        this.history.flush();
      } else if (this.open) this.refresh();
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
      this.composer.save();
      this.history.flush();
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
      this.composer.save();
      this.history.detach();
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
    this.token = token;
    writeToken(token);
    this.demo = false;
    this.open = true;
    this.loginError = '';
    this.history.resetView();
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
        if (this.composer.text) this.composer.save();
        else this.composer.text = this.localData.draft(this.composer.account);
        if (this.history.enabled) this.queueCurrentHistory();
        this.schedule();
      })
      .catch(() => {
        if (generation === this.loginGeneration)
          this.history.status = 'Lokal lagring er ikke tilgængelig. Chatten fortsætter.';
      });
    this.connection.start(token);
    this.schedule();
  }

  disconnect(forget = true) {
    ++this.loginGeneration;
    this.composer.save();
    this.connection.stop();
    this.history.detach();
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
    this.composer.reset();
    this.store = new ChatStore();
    this.accounts = [];
    this.timeline.clear();
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
    const previous = new Map(this.accounts.map((account) => [account.name, account]));
    const accounts = this.store.names.map((name) => {
      const account = previous.get(name) || new Account(name);
      account.update(this.store.tab(name), this.dialogs.rooms);
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
      if (!historical && message.serverNotify) this.notifications.receive(message);
      const visible =
        !this.dialogOpen &&
        this.accept(message) &&
        (!this.active || this.active === message.account) &&
        this.matchesQuery(message);
      if (message.attention && (document.hidden || !visible || !this.nearBottom)) {
        this.store.tab(message.account).unread++;
        this.navDirty = true;
      }
      if (visible && (this.showEvents || !message.system)) this.viewDirty = true;
      if (message.type === 'room' || this.dialogs.rooms) this.navDirty = true;
      if (message.account === this.composer.account) this.rosterRevision++;
      if (visible && !this.nearBottom) this.notice = true;
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
          if (viewDirty && this.nearBottom) this.refresh();
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

  matchesQuery(message, query = this.query.toLocaleLowerCase('da')) {
    return (
      !query ||
      `${(message.accounts || [message.account]).join(' ')} ${message.name} ${message.text}`
        .toLocaleLowerCase('da')
        .includes(query)
    );
  }

  combinedMessages() {
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
    const seen = new Set(current.map((message) => message.account + '\0' + message.key));
    const messages = [
      ...this.history.rows.filter((message) => !seen.has(message.account + '\0' + message.key)),
      ...current,
    ]
      .filter(
        (message) =>
          (!this.active || message.account === this.active) && (this.showEvents || !message.system),
      )
      .sort(
        (a, b) =>
          a.time - b.time || a.account.localeCompare(b.account) || a.key.localeCompare(b.key),
      );
    const query = this.query.toLocaleLowerCase('da');
    return (this.active ? messages : mergeRoomCopies(messages)).filter(
      (message) => this.matchesQuery(message, query) && this.accept(message),
    );
  }

  canClearAttention() {
    return this.mode === 'all' && !this.person && !this.query && !this.dialogOpen;
  }

  clearAttention() {
    if (!this.nearBottom || !this.canClearAttention()) return;
    for (const [name, tab] of this.store.tabs)
      if (!this.active || this.active === name) tab.unread = 0;
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
    const node = this.timelineNode;
    const before = node?.scrollHeight || 0;
    const top = node?.scrollTop || 0;
    const messages = this.combinedMessages();
    this.timeline.update(
      messages.slice(-this.pageSize),
      (message) => this.messageTools.isSaved(message),
      (message) =>
        message.superuser ||
        (message.accounts || [message.account]).some((account) =>
          this.store.isSuperuser(account, message.name),
        ),
    );
    this.hasOlder =
      !this.logOnly &&
      (messages.length > this.pageSize ||
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
    this.pageSize = 250;
    this.nearBottom = true;
    this.refresh();
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
    if (this.composer.select(name)) this.rosterRevision++;
    if (changeView && this.active && this.active !== name) this.choose(name);
  }

  send() {
    const text = this.composer.text;
    if (!text.trim() || !this.store.names.includes(this.composer.account)) return;
    if (text.length > 100) {
      this.composer.error = 'Beskeden må højst være 100 tegn.';
      return;
    }
    this.composer.error = '';
    if (this.demo)
      this.ingest({
        me: { name: this.composer.account },
        user: { name: this.composer.account },
        type: 'text',
        text,
        time: Date.now(),
      });
    else if (!this.online || !this.connection.send({ name: this.composer.account, say: text })) {
      this.composer.error = 'Forbindelsen er afbrudt. Din besked er stadig i feltet.';
      return;
    }
    this.composer.text = '';
    this.composer.save();
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
  setShowEvents(value) {
    this.showEvents = value;
    this.filterChanged();
  }
  setTextSize(value) {
    this.textSize = Number(value);
    writePreference('acidum-text-size', String(this.textSize));
    this.scrollToBottom();
  }

  presentNames() {
    this.rosterRevision;
    return [...(this.store.tabs.get(this.composer.account)?.presence.values() || [])]
      .filter((person) => person.present)
      .map((person) => person.name);
  }

  rosterComplete() {
    this.rosterRevision;
    return Boolean(this.store.tabs.get(this.composer.account)?.rosterComplete);
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
      this.messageTools.status = 'Forbindelsen er afbrudt. Prøv igen, når du er forbundet.';
      return;
    }
    this.closeDialog('message');
  }

  exportChat() {
    const blob = new Blob([exportText(this.combinedMessages())], {
      type: 'text/plain;charset=utf-8',
    });
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
    if (value && !this.demo) this.queueCurrentHistory();
    this.schedule();
  }
  async clearHistory() {
    await this.history.clear();
    this.schedule();
  }

  receiveAlert(message) {
    if (
      !document.hidden &&
      !this.dialogOpen &&
      this.nearBottom &&
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
    this.status = 'Eksempeltilstand';
    this.localData = new LocalData({ getItem: () => null, setItem: () => {} }, 'demo');
    this.updateTabs(['Nova', 'Milo']);
    this.ingest(demoEvents(), { historical: true });
  }
}
