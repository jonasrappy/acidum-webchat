import { readPreference, writePreference } from '../lib/storage.js';

export class LocalHistory {
  enabled = $state(readPreference('acium-webchat-save-history') === 'yes');
  loading = $state(false);
  status = $state('');
  hasMore = $state(true);
  scope = '';
  rows = [];
  before = null;
  generation = 0;
  pending = [];
  timer = null;
  writing = Promise.resolve();

  resetView() {
    ++this.generation;
    this.rows = [];
    this.before = null;
    this.hasMore = true;
    this.loading = false;
    this.status = '';
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    writePreference('acium-webchat-save-history', enabled ? 'yes' : 'no');
    if (!enabled) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pending = [];
    }
    this.resetView();
  }

  queue(message) {
    if (!this.enabled || !this.scope) return;
    this.pending.push(message);
    if (this.pending.length >= 250) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending.splice(0);
    const scope = this.scope;
    if (!scope || !batch.length) return this.writing;
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        const { saveMessages } = await import('../lib/archive.js');
        await saveMessages(scope, batch);
      })
      .catch(() => {
        if (scope === this.scope)
          this.status = 'Lokal historik kunne ikke gemmes. Chatten fortsætter.';
      });
    return this.writing;
  }

  async load(account, oldest, options) {
    if (this.loading || !this.enabled || !this.scope || !this.hasMore) return false;
    this.loading = true;
    this.status = 'Henter ældre beskeder fra denne enhed…';
    const generation = this.generation;
    try {
      await this.flush();
      const { archiveId, loadBefore } = await import('../lib/archive.js');
      if (generation !== this.generation) return false;
      this.before ??= oldest
        ? { time: oldest.time, archiveId: archiveId(this.scope, oldest) }
        : null;
      const result = await loadBefore(this.scope, account, this.before, options);
      if (generation !== this.generation) return false;
      this.before = result.before;
      this.hasMore = result.hasMore;
      this.rows = [...result.messages, ...this.rows].slice(-10000);
      this.status = result.hasMore ? '' : 'Begyndelsen af den lokalt gemte historik.';
      return true;
    } catch {
      if (generation === this.generation)
        this.status = 'Browseren kunne ikke hente den lokale historik.';
      return false;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  async clear() {
    if (!this.scope) return;
    const scope = this.scope;
    try {
      await this.flush();
      const { clearScope } = await import('../lib/archive.js');
      await clearScope(scope);
      if (scope !== this.scope) return;
      this.resetView();
      this.status =
        'Den gemte historik er slettet. Nye beskeder gemmes, hvis “Gem historik” er valgt.';
    } catch {
      if (scope === this.scope) this.status = 'Historikken kunne ikke slettes.';
    }
  }

  detach() {
    this.flush();
    this.scope = '';
    this.resetView();
  }
}
