import { AlertManager } from '../lib/notifications.js';

export class NotificationPreferences {
  enabled = $state(false);
  sound = $state(false);
  status = $state('');

  constructor(callbacks) {
    this.alerts = new AlertManager(callbacks);
    this.refresh();
  }

  refresh() {
    this.enabled = this.alerts.enabled && globalThis.Notification?.permission === 'granted';
    this.sound = this.alerts.sound;
    this.status =
      globalThis.Notification?.permission === 'denied'
        ? 'Notifikationer er blokeret i browserens indstillinger.'
        : '';
  }

  async toggle() {
    if (this.enabled) {
      this.alerts.disable();
      this.refresh();
      return;
    }
    const result = await this.alerts.enable().catch(() => 'unavailable');
    this.refresh();
    if (result === 'unsupported')
      this.status = 'Systemnotifikationer er ikke tilgængelige her. Se ? for hjælp.';
    if (result === 'unavailable') this.status = 'Notifikationer kunne ikke aktiveres. Prøv igen.';
  }

  setSound(value) {
    this.sound = value;
    this.alerts.setSound(value);
  }
  unlockSound() {
    this.alerts.unlockSound();
  }
  receive(message) {
    this.alerts.receive(message);
  }
  destroy() {
    this.alerts.destroy();
  }
}
