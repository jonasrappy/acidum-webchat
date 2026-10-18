// Only browser-local user choices. The scope is a one-way hash; no token is stored here.
export class LocalData {
  constructor(storage, scope) {
    this.storage = storage;
    this.key = 'acidum-local-' + scope;
    this.drafts = new Map();
    this.saved = new Map();
    try {
      const value = JSON.parse(storage.getItem(this.key) || '{}');
      for (const [key, text] of (Array.isArray(value.drafts) ? value.drafts : []).slice(0, 50))
        if (typeof key === 'string' && typeof text === 'string')
          this.drafts.set(key, text.slice(0, 100));
      for (const message of (Array.isArray(value.saved) ? value.saved : []).slice(-200))
        if (
          message &&
          typeof message.account === 'string' &&
          typeof message.key === 'string' &&
          typeof message.text === 'string' &&
          Number.isFinite(message.time)
        )
          this.saved.set(this.id(message), message);
    } catch {}
  }
  id(message) {
    return JSON.stringify([message.account, message.key]);
  }
  persist() {
    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({ drafts: [...this.drafts], saved: [...this.saved.values()] }),
      );
      return true;
    } catch {
      return false;
    }
  }
  draft(account) {
    return this.drafts.get(account) || '';
  }
  setDraft(account, text) {
    if (!account) return;
    this.drafts.delete(account);
    if (text) this.drafts.set(account, text.slice(0, 100));
    while (this.drafts.size > 50) this.drafts.delete(this.drafts.keys().next().value);
    return this.persist();
  }
  toggleSaved(message) {
    const id = this.id(message);
    if (this.saved.has(id)) this.saved.delete(id);
    else {
      this.saved.set(id, message);
      while (this.saved.size > 200) this.saved.delete(this.saved.keys().next().value);
    }
    return this.persist();
  }
  isSaved(message) {
    return this.saved.has(this.id(message));
  }
}
export function exportText(messages) {
  return messages
    .map(
      (m) =>
        `${new Date(m.time).toISOString()} [${(m.accounts || [m.account]).join(', ')}] ${m.name ? m.name + ': ' : ''}${m.text}`,
    )
    .join('\n');
}
