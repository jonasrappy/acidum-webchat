export const MAX_MESSAGES = 700;
export function parseToken(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('Indsæt dit Acium-webchat-link.');
  let token;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'acium.app' || url.pathname !== '/chat')
      throw new Error('Linket skal være https://acium.app/chat?token=…');
    token = url.searchParams.get('token');
  } else token = value;
  if (!token || !/^[A-Za-z0-9._~-]{8,2048}$/.test(token)) throw new Error('Linket mangler et gyldigt chat-token.');
  return token;
}
export function describe(event) {
  const user = event.user?.name || '';
  switch (event.type) {
    case 'text': return {name: user, text: String(event.text || '')};
    case 'priv': return {name: event.from?.name || '', text: `${event.from?.name === event.me?.name ? `til ${event.to?.name || '?'}` : 'hvisker'}: ${event.text || ''}`, private: true};
    case 'join': return {name: user, text: 'er kommet ind', system: true};
    case 'part': return {name: user, text: `er gået til ${event.room?.name || event.room?.id || 'et andet rum'}`, system: true};
    case 'quit': return {name: user, text: 'har forladt chatten', system: true};
    case 'room': return {name: '', text: `Velkommen til ${event.room?.name || 'rummet'}${event.room?.id != null ? ` · ${event.room.id}` : ''}`, system: true};
    case 'log': return event.event === 'panic' ? {name: '', text: event.users?.length ? `Panic aktiveret af ${event.users.map(u => u.name).join(', ')}` : 'Panic deaktiveret', system: true} : null;
    default: return null;
  }
}
export class ChatStore {
  constructor(limit = MAX_MESSAGES) { this.limit = limit; this.tabs = new Map(); this.names = []; this.serial = 0; }
  tab(name) {
    if (!this.tabs.has(name)) this.tabs.set(name, {messages: [], keys: new Set(), lastLine: 0, unread: 0, room: null});
    return this.tabs.get(name);
  }
  setTabs(names) {
    this.names = [...new Set(names.filter(n => typeof n === 'string' && n.length <= 100))].slice(0, 50);
    for (const name of this.names) this.tab(name);
    for (const name of this.tabs.keys()) if (!this.names.includes(name)) this.tabs.delete(name);
  }
  add(event) {
    if (!event || typeof event !== 'object' || typeof event.me?.name !== 'string' || !this.names.includes(event.me.name)) return null;
    const description = describe(event), time = Number(event.time);
    if (!description || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) return null;
    const tab = this.tab(event.me.name);
    const key = JSON.stringify([time, event.type, description.name, description.text, Boolean(event.log), Boolean(event.notify)]);
    if (tab.keys.has(key)) return null;
    const message = {id: ++this.serial, key, time, account: event.me.name, type: event.type, log: Boolean(event.log || event.notify || event.type === 'log'), ...description};
    tab.keys.add(key); tab.messages.push(message); tab.lastLine = Math.max(tab.lastLine, time);
    if (event.type === 'room') tab.room = {name: String(event.room?.name || 'Ukendt rum'), id: event.room?.id};
    while (tab.messages.length > this.limit) tab.keys.delete(tab.messages.shift().key);
    return message;
  }
  messages(account, logOnly = false, query = '', systems = true) {
    const messages = account ? (this.tabs.get(account)?.messages || []) : [...this.tabs.values()].flatMap(t => t.messages).sort((a,b) => a.time - b.time || a.id - b.id);
    const search = query.toLocaleLowerCase('da');
    return messages.filter(m => (!logOnly || m.log) && (systems || !m.system) && (!search || `${m.account} ${m.name} ${m.text}`.toLocaleLowerCase('da').includes(search)));
  }
}
export function retryDelay(attempt, random = Math.random) { return Math.round(Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) * (0.8 + random() * 0.4)); }
