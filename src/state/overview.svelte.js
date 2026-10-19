import { tick } from 'svelte';
import { TimelineWindow } from './timeline.svelte.js';
import { LocalHistory } from './history.svelte.js';

class RoomPanel {
  accounts = $state.raw([]);
  timeline = new TimelineWindow();
  history = new LocalHistory();
  notice = $state(false);
  hasOlder = $state(false);
  visible = false;
  nearBottom = true;
  limit = 0;
  loaded = 0;
  node = null;
  revision = 0;
  loadingOlder = false;
  height = 0;

  constructor(key, accounts) {
    this.key = key;
    this.accounts = accounts;
    this.members = new Set(accounts.map((account) => account.name));
  }

  update(messages, session, { force = false, older = false } = {}) {
    this.hasOlder =
      messages.length > this.limit ||
      session.sync.hasOlder([...this.members]) ||
      Boolean(
        session.history.enabled && session.history.scope && this.history.hasMore && !session.demo,
      );
    if (!force && !this.nearBottom) return;
    const node = this.node;
    const height = node?.scrollHeight || 0;
    const top = node?.scrollTop || 0;
    this.timeline.update(
      messages.slice(-this.limit),
      (message) => session.messageTools.isSaved(message),
      (message) => session.isSuperuser(message),
    );
    if (this.nearBottom) this.notice = false;
    const revision = ++this.revision;
    tick().then(() => {
      if (!node || node !== this.node || revision !== this.revision) return;
      node.scrollTop = this.nearBottom
        ? node.scrollHeight
        : older
          ? top + node.scrollHeight - height
          : top;
    });
  }

  attach(node) {
    this.node = node;
    this.height = node.clientHeight;
    tick().then(() => {
      if (this.node === node && this.nearBottom) node.scrollTop = node.scrollHeight;
    });
    return {
      destroy: () => {
        this.node = null;
        this.visible = false;
      },
    };
  }

  dispose() {
    this.history.detach();
    this.timeline.clear();
    this.node = null;
    ++this.revision;
  }
}

export class DesktopOverview {
  panels = $state.raw([]);
  byAccount = new Map();

  sync(accounts) {
    const rooms = new Map();
    for (const account of accounts) {
      const room = account.room;
      const key =
        room?.id != null
          ? `id:${room.id}`
          : room?.name
            ? `room:${room.name}`
            : `account:${account.name}`;
      if (!rooms.has(key)) rooms.set(key, []);
      rooms.get(key).push(account);
    }
    const previous = new Map(this.panels.map((panel) => [panel.key, panel]));
    const panels = [...rooms.values()].map((members) => {
      const key = JSON.stringify(members.map((account) => account.name).sort());
      const panel = previous.get(key) || new RoomPanel(key, members);
      previous.delete(key);
      if (members.some((account, index) => account !== panel.accounts[index]))
        panel.accounts = members;
      return panel;
    });
    for (const panel of previous.values()) panel.dispose();
    const limit = Math.max(1, Math.floor(250 / Math.max(1, panels.length)));
    for (const panel of panels) panel.limit = limit + panel.loaded;
    this.byAccount = new Map(
      panels.flatMap((panel) => panel.accounts.map((account) => [account.name, panel])),
    );
    if (
      panels.length !== this.panels.length ||
      panels.some((panel, index) => panel !== this.panels[index])
    )
      this.panels = panels;
  }

  owner(message) {
    return (
      this.byAccount.get(message.account) ||
      (message.accounts || []).map((name) => this.byAccount.get(name)).find(Boolean)
    );
  }

  canRead(name) {
    const panel = this.byAccount.get(name);
    return Boolean(panel?.node && panel.visible && panel.nearBottom);
  }

  note(message) {
    const panel = this.byAccount.get(message.account);
    if (panel && !panel.nearBottom) panel.notice = true;
  }

  messages(session) {
    return session.combinedMessages(this.panels.flatMap((panel) => panel.history.rows));
  }

  refresh(session, options) {
    this.sync(session.accounts);
    const buckets = new Map(this.panels.map((panel) => [panel, []]));
    for (const message of this.messages(session)) buckets.get(this.owner(message))?.push(message);
    for (const panel of this.panels) panel.update(buckets.get(panel), session, options);
  }

  onScroll(panel, session) {
    const node = panel.node;
    if (!node) return;
    const wasAtBottom = panel.nearBottom;
    if (wasAtBottom && panel.height !== node.clientHeight) node.scrollTop = node.scrollHeight;
    panel.height = node.clientHeight;
    panel.nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
    if (panel.nearBottom) {
      if (!wasAtBottom && panel.notice) this.latest(panel, session);
      session.clearAttention();
      session.syncNavigation();
    }
    if (!panel.nearBottom && node.scrollTop < 60 && node.scrollHeight > node.clientHeight + 100)
      this.loadOlder(panel, session);
  }

  latest(panel, session) {
    panel.nearBottom = true;
    panel.notice = false;
    const messages = this.messages(session).filter((message) => this.owner(message) === panel);
    panel.update(messages, session, { force: true });
    session.clearAttention();
    session.syncNavigation();
  }

  async loadOlder(panel, session) {
    if (panel.loadingOlder || !this.panels.includes(panel)) return;
    panel.loadingOlder = true;
    try {
      const messages = this.messages(session).filter((message) => this.owner(message) === panel);
      if (messages.length <= panel.limit) {
        if (
          session.sync.hasOlder([...panel.members]) &&
          (await session.sync.loadOlder([...panel.members]))
        ) {
          if (!this.panels.includes(panel) || !session.overviewActive) return;
        } else {
          await session.history.flush();
          if (!this.panels.includes(panel) || !session.overviewActive || session.demo) return;
          panel.history.scope = session.history.scope;
          panel.history.enabled = session.history.enabled;
          if (
            !(await panel.history.load('', messages[0], {
              query: session.query,
              systems: session.showEvents,
              accept: (message) => panel.members.has(message.account) && session.accept(message),
            }))
          )
            return;
          if (!this.panels.includes(panel) || !session.overviewActive) return;
        }
      }
      panel.nearBottom = false;
      panel.loaded += 100;
      panel.limit += 100;
      const older = this.messages(session).filter((message) => this.owner(message) === panel);
      panel.update(older, session, { force: true, older: true });
    } finally {
      panel.loadingOlder = false;
    }
  }

  reset() {
    for (const panel of this.panels) panel.dispose();
    this.panels = [];
    this.byAccount.clear();
  }
}
