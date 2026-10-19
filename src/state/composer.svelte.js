export class ComposerState {
  account = $state('');
  text = $state('');
  error = $state('');
  timer = null;

  constructor(getData, account = '') {
    this.getData = getData;
    this.account = account;
    this.text = this.getData()?.draft(account) || '';
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
