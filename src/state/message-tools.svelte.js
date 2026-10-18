export class MessageTools {
  selected = $state.raw(null);
  saved = $state(false);
  status = $state('');

  constructor(getData, onChange) {
    this.getData = getData;
    this.onChange = onChange;
  }

  isSaved(message) {
    return Boolean(
      (message.sources || [message]).some((source) => this.getData()?.isSaved(source)),
    );
  }

  select(message) {
    this.selected =
      message.sources?.find((source) => this.getData()?.isSaved(source)) ||
      message.sources?.[0] ||
      message;
    if (!this.selected.destination && message.destination)
      this.selected = { ...this.selected, destination: message.destination };
    this.saved = this.isSaved(this.selected);
    this.status = '';
  }

  toggle() {
    const data = this.getData();
    if (!this.selected || !data) return;
    const persisted = data.toggleSaved(this.selected);
    this.saved = this.isSaved(this.selected);
    this.status = persisted
      ? 'Updated on this device.'
      : 'The browser could not save this permanently.';
    this.onChange();
  }

  async copy() {
    if (!this.selected) return;
    try {
      await navigator.clipboard.writeText(this.selected.text);
      this.status = 'Copied.';
    } catch {
      this.status = 'The browser blocked copying. Select and copy the text instead.';
    }
  }

  reset() {
    this.selected = null;
    this.saved = false;
    this.status = '';
  }
}
