import { retryDelay } from './core.js';

export class ChatConnection {
  socket = null;
  token = '';
  generation = 0;
  attempt = 0;
  refusals = 0;
  timer = null;
  stopped = true;

  constructor({ onData, onStatus, onRefused, onDisconnected }) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.onRefused = onRefused;
    this.onDisconnected = onDisconnected;
  }

  start(token) {
    this.token = token;
    this.stopped = false;
    this.attempt = 0;
    this.refusals = 0;
    this.connect();
  }

  connect() {
    if (!this.token || this.stopped) return;
    this.closeSocket();
    if (!navigator.onLine) {
      this.onStatus('No internet connection', false);
      return;
    }
    const generation = this.generation;
    this.onStatus(this.attempt ? 'Reconnecting…' : 'Connecting…', false);
    let socket;
    try {
      socket = new WebSocket(`wss://ws0.acium.app/chat/ws?token=${encodeURIComponent(this.token)}`);
      this.socket = socket;
    } catch {
      this.onStatus('Could not start the connection', false);
      return;
    }
    let received = false;
    socket.onopen = () => {
      if (generation === this.generation) this.onStatus('Connected', true);
    };
    socket.onmessage = (event) => {
      if (
        generation !== this.generation ||
        typeof event.data !== 'string' ||
        event.data.length > 8_000_000
      )
        return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      received = true;
      this.refusals = 0;
      this.attempt = 0;
      this.onData(data, { historical: Array.isArray(data) });
    };
    socket.onerror = () => {
      if (generation === this.generation) socket.close();
    };
    socket.onclose = (event) => {
      if (generation !== this.generation || this.stopped) return;
      this.onDisconnected();
      if (!received && event.code === 1005 && ++this.refusals >= 3) {
        this.onRefused();
        return;
      }
      if (!navigator.onLine) {
        this.onStatus('No internet connection', false);
        return;
      }
      const delay = retryDelay(this.attempt++);
      this.onStatus(`Disconnected · retrying in ${Math.ceil(delay / 1000)} s`, false);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }

  send(data) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  reconnect() {
    this.attempt = 0;
    this.connect();
  }

  offline() {
    clearTimeout(this.timer);
    this.onStatus('No internet connection', false);
  }

  closeSocket() {
    ++this.generation;
    clearTimeout(this.timer);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  stop() {
    this.stopped = true;
    this.closeSocket();
  }
}
