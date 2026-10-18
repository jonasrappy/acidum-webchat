export class ComposerState {
  account = $state('');
  text = $state('');
  error = $state('');
  timer = null;

  constructor(getData) {
    this.getData = getData;
  }

  select(account) {
    if (account === this.account) return false;
    this.save();
    this.account = account;
    this.text = this.getData()?.draft(account) || '';
    return true;
  }

  save() {
    clearTimeout(this.timer);
    if (this.account) this.getData()?.setDraft(this.account, this.text);
  }

  changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 200);
  }

  reset() {
    clearTimeout(this.timer);
    this.account = this.text = this.error = '';
  }
}
