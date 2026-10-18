export const MAX_MESSAGES = 700;
const userKey = (name) =>
  String(name || '')
    .normalize('NFKC')
    .toLocaleLowerCase('da');
export function parseToken(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Indsæt dit acidum-webchat-link.');
  let token;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'acium.app' || url.pathname !== '/chat')
      throw new Error('Linket skal være https://acium.app/chat?token=…');
    token = url.searchParams.get('token');
  } else token = value;
  if (!token || !/^[A-Za-z0-9._~-]{8,2048}$/.test(token))
    throw new Error('Linket mangler et gyldigt chat-token.');
  return token;
}
export function describe(event) {
  const user = event.user?.name || '';
  switch (event.type) {
    case 'text':
      return { name: user, text: String(event.text || '') };
    case 'priv':
      return {
        name: event.from?.name || '',
        text: `${event.from?.name === event.me?.name ? `til ${event.to?.name || '?'}` : 'hvisker'}: ${event.text || ''}`,
        private: true,
      };
    case 'join':
      return { name: user, text: 'er kommet ind', system: true };
    case 'part':
      return {
        name: user,
        text: `er gået til ${event.room?.name || event.room?.id || 'et andet rum'}`,
        system: true,
      };
    case 'quit':
      return { name: user, text: 'har forladt chatten', system: true };
    case 'room':
      return {
        name: '',
        text: `Velkommen til ${event.room?.name || 'rummet'}${event.room?.id != null ? ` · ${event.room.id}` : ''}`,
        system: true,
      };
    case 'log':
      return event.event === 'panic'
        ? {
            name: '',
            text: event.users?.length
              ? `Panic aktiveret af ${event.users.map((u) => u.name).join(', ')}`
              : 'Panic deaktiveret',
            system: true,
          }
        : null;
    default:
      return null;
  }
}
const attentionCache = new WeakMap();
const termPatterns = new Map();
// Honor server log/notify markers without needing to load its trigger configuration.
export function needsAttention(event) {
  if (!['text', 'priv'].includes(event?.type)) return false;
  const account = event.me?.name;
  if (typeof account !== 'string' || !account) return false;
  const sender = event.type === 'priv' ? event.from?.name : event.user?.name;
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase('da');
  if (event.notify || event.log) return true;
  if (normalize(sender) === normalize(account)) return false;
  return [account].some((term) => {
    const name = normalize(term)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!name) return false;
    let pattern = termPatterns.get(name);
    if (!pattern) {
      pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${name}(?=$|[^\\p{L}\\p{N}_])`, 'u');
      termPatterns.set(name, pattern);
      if (termPatterns.size > 512) termPatterns.delete(termPatterns.keys().next().value);
    }
    return pattern.test(normalize(event.text));
  });
}
export class ChatStore {
  constructor(limit = MAX_MESSAGES) {
    this.limit = limit;
    this.tabs = new Map();
    this.names = [];
    this.serial = 0;
    this.roleRevision = 0;
  }
  tab(name) {
    if (!this.tabs.has(name))
      this.tabs.set(name, {
        messages: [],
        keys: new Set(),
        lastLine: 0,
        unread: 0,
        room: null,
        roomSince: -Infinity,
        rosterComplete: false,
        presence: new Map(),
        presenceRevision: 0,
        userRoles: new Map(),
      });
    return this.tabs.get(name);
  }
  setTabs(names) {
    this.names = [...new Set(names.filter((n) => typeof n === 'string' && n.length <= 100))].slice(
      0,
      50,
    );
    for (const name of this.names) this.tab(name);
    for (const name of this.tabs.keys()) if (!this.names.includes(name)) this.tabs.delete(name);
  }
  isSuperuser(account, name) {
    return this.tabs.get(account)?.userRoles.get(userKey(name))?.superuser === true;
  }
  rememberSuperuser(tab, user, time) {
    if (typeof user?.name !== 'string' || !user.name) return;
    if (![true, false, 1, 0].includes(user.superuser)) return;
    const key = userKey(user.name);
    const previous = tab.userRoles.get(key);
    if (previous && previous.time > time) return;
    const superuser = user.superuser === true || user.superuser === 1;
    tab.userRoles.set(key, { superuser, time });
    if (Boolean(previous?.superuser) !== superuser) this.roleRevision++;
    if (tab.userRoles.size > 1000) {
      const oldest = tab.userRoles.keys().next().value;
      if (tab.userRoles.get(oldest).superuser) this.roleRevision++;
      tab.userRoles.delete(oldest);
    }
  }
  add(event) {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.me?.name !== 'string' ||
      !this.names.includes(event.me.name)
    )
      return null;
    const description = describe(event),
      time = Number(event.time);
    if (!description || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime()))
      return null;
    const tab = this.tab(event.me.name);
    const key = JSON.stringify([
      time,
      event.type,
      description.name,
      description.text,
      Boolean(event.log),
      Boolean(event.notify),
    ]);
    if (tab.keys.has(key)) return null;
    const sender = event.type === 'priv' ? event.from : event.user;
    this.rememberSuperuser(tab, sender, time);
    if (event.type === 'room' && Array.isArray(event.users)) {
      for (const user of event.users.slice(0, 500)) this.rememberSuperuser(tab, user, time);
    }
    if (event.type === 'log' && event.event === 'panic' && Array.isArray(event.users)) {
      for (const user of event.users.slice(0, 500))
        this.rememberSuperuser(tab, { name: user?.name, superuser: true }, time);
    }
    const room =
      event.type === 'room'
        ? event.room
        : event.type !== 'part' && event.room
          ? event.room
          : time >= tab.roomSince
            ? tab.room
            : null;
    const roomKey =
      room?.id != null
        ? 'id:' + String(room.id)
        : room?.name && room.name !== 'Ukendt rum'
          ? 'name:' + room.name
          : undefined;
    const message = {
      id: ++this.serial,
      key,
      time,
      roomKey,
      account: event.me.name,
      type: event.type,
      log: Boolean(event.log || event.notify || event.type === 'log'),
      serverMarked: Boolean(event.log || event.notify),
      serverNotify: Boolean(event.notify),
      attention: needsAttention(event),
      superuser: this.isSuperuser(event.me.name, description.name),
      ...description,
    };
    tab.keys.add(key);
    tab.messages.push(message);
    tab.lastLine = Math.max(tab.lastLine, time);
    if (event.type === 'room' && time >= tab.roomSince) {
      tab.room = { name: String(event.room?.name || 'Ukendt rum'), id: event.room?.id };
      tab.roomSince = time;
      tab.presence.clear();
      tab.presenceRevision++;
      tab.rosterComplete = Array.isArray(event.users);
      for (const user of (Array.isArray(event.users) ? event.users : []).slice(0, 500)) {
        if (typeof user?.name === 'string')
          tab.presence.set(user.name, { name: user.name, time, present: true, source: 'snapshot' });
      }
      tab.presence.set(event.me.name, { name: event.me.name, time, present: true, source: 'self' });
    }
    // This is observed presence, not a complete server roster. Whispers do not prove room presence.
    if (
      ['text', 'join', 'part', 'quit'].includes(event.type) &&
      typeof event.user?.name === 'string' &&
      time >= tab.roomSince
    ) {
      const name = event.user.name,
        previous = tab.presence.get(name);
      if (!previous || time >= previous.time) {
        tab.presence.set(name, {
          name,
          time,
          present: event.type === 'text' || event.type === 'join',
          source: event.type,
        });
        tab.presenceRevision++;
        if (tab.presence.size > 500) tab.presence.delete(tab.presence.keys().next().value);
      }
    }
    while (tab.messages.length > this.limit) tab.keys.delete(tab.messages.shift().key);
    return message;
  }
  messages(account, logOnly = false, query = '', systems = true) {
    const messages = account
      ? this.tabs.get(account)?.messages || []
      : [...this.tabs.values()]
          .flatMap((t) => t.messages)
          .sort((a, b) => a.time - b.time || a.id - b.id);
    const search = query.toLocaleLowerCase('da');
    return messages.filter(
      (m) =>
        (!logOnly || m.log) &&
        (systems || !m.system) &&
        (!search || `${m.account} ${m.name} ${m.text}`.toLocaleLowerCase('da').includes(search)),
    );
  }
}
export function retryDelay(attempt, random = Math.random) {
  return Math.round(Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) * (0.8 + random() * 0.4));
}

export function messageAttention(message) {
  if (attentionCache.has(message)) return attentionCache.get(message);
  const value = (message.accounts || [message.account]).some((account) =>
    needsAttention({
      type: message.type,
      me: { name: account },
      user: { name: message.name },
      from: { name: message.name },
      text: message.text,
      notify: message.serverMarked ?? message.log,
    }),
  );
  attentionCache.set(message, value);
  return value;
}
export function messageLinks(text) {
  return [...String(text || '').matchAll(/https?:\/\/[^\s<>"']+/giu)].map((match) =>
    match[0].replace(/[.,!?;:)\]]+$/u, ''),
  );
}
export function matchesMode(message, mode) {
  if (mode === 'mentions') return messageAttention(message);
  if (mode === 'private') return message.type === 'priv';
  if (mode === 'links') return messageLinks(message.text).length > 0;
  return true;
}
