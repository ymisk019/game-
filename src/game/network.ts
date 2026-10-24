// ===================== الشبكة (Network) =====================
// الكونسل يتصل بالسيرفر المحلي عبر WebSocket ويستقبل مدخلات التلفونات فقط.
// الفيزياء كلها تُحسب هنا على شاشة الكونسل.

export interface PadInput {
  x: number;
  y: number;
  shoot: boolean;
  jump: boolean;
  dive: boolean;
}

export interface PadInfo {
  id: string;
  name: string;
  connected: boolean;
  slot: 0 | 1; // اللاعب 1 أو 2
  input: PadInput;
  lastSeen: number;
}

export type NetStatus = 'connecting' | 'online' | 'offline';

const emptyInput = (): PadInput => ({ x: 0, y: 0, shoot: false, jump: false, dive: false });

class Network {
  ws: WebSocket | null = null;
  status: NetStatus = 'connecting';
  code = '';
  url = '';
  ip = '';
  pads = new Map<string, PadInfo>();
  listeners = new Set<() => void>();
  retry = 0;
  started = false;
  onPadLost: ((p: PadInfo) => void) | null = null;
  onPadBack: ((p: PadInfo) => void) | null = null;
  onPadPause: (() => void) | null = null;
  /** يحدد الكونسل أي لاعب يأخذ التلفون الجديد */
  pickSlot: ((pref: 'ball' | 'keeper' | null) => 0 | 1) | null = null;

  start() {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private connect() {
    if (location.protocol === 'file:') {
      this.status = 'offline';
      this.emit();
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.status = 'connecting';
    this.emit();
    ws.onopen = () => {
      this.retry = 0;
      const prev = sessionStorage.getItem('bvk_room') || undefined;
      ws.send(JSON.stringify({ t: 'host', code: prev }));
    };
    ws.onmessage = (ev) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onclose = () => {
      this.ws = null;
      this.status = 'offline';
      // أي تلفون يعتبر منقطعاً لحين عودة السيرفر
      this.pads.forEach((p) => {
        if (p.connected) {
          p.connected = false;
          p.input = emptyInput();
          this.onPadLost?.(p);
        }
      });
      this.emit();
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose يتكفل */
    };
  }

  private scheduleReconnect() {
    this.retry++;
    const delay = Math.min(5000, 800 * this.retry);
    window.setTimeout(() => this.connect(), delay);
  }

  private handle(m: Record<string, unknown>) {
    switch (m.t) {
      case 'room': {
        this.code = String(m.code);
        this.ip = String(m.ip);
        this.url = String(m.url);
        this.status = 'online';
        sessionStorage.setItem('bvk_room', this.code);
        this.emit();
        break;
      }
      case 'pad-join': {
        const id = String(m.id);
        let p = this.pads.get(id);
        const pref = (m.role as 'ball' | 'keeper' | null) ?? null;
        if (!p) {
          const slot = this.pickSlot ? this.pickSlot(pref) : 0;
          p = { id, name: String(m.name || 'Phone'), connected: true, slot, input: emptyInput(), lastSeen: performance.now() };
          this.pads.set(id, p);
        } else {
          const wasLost = !p.connected;
          p.connected = true;
          p.name = String(m.name || p.name);
          p.lastSeen = performance.now();
          if (wasLost) this.onPadBack?.(p);
        }
        this.sendTo(id, { t: 'slot', slot: p.slot });
        this.emit();
        break;
      }
      case 'pad-leave': {
        const p = this.pads.get(String(m.id));
        if (p) {
          p.connected = false;
          p.input = emptyInput();
          this.onPadLost?.(p);
          this.emit();
        }
        break;
      }
      case 'in': {
        const p = this.pads.get(String(m.id));
        if (p) {
          p.input.x = Number(m.x) || 0;
          p.input.y = Number(m.y) || 0;
          p.input.shoot = !!m.s;
          p.input.jump = !!m.j;
          p.input.dive = !!m.d;
          p.lastSeen = performance.now();
        }
        break;
      }
      case 'pause': {
        this.onPadPause?.();
        break;
      }
      case 'role': {
        // اختيار الدور من التلفون في شاشة الانتظار
        const p = this.pads.get(String(m.id));
        if (p && this.pickSlot) {
          p.slot = this.pickSlot(m.role as 'ball' | 'keeper');
          this.sendTo(p.id, { t: 'slot', slot: p.slot });
          this.emit();
        }
        break;
      }
    }
  }

  setPadSlot(id: string, slot: 0 | 1) {
    const p = this.pads.get(id);
    if (!p) return;
    p.slot = slot;
    this.sendTo(id, { t: 'slot', slot });
    this.emit();
  }

  removePad(id: string) {
    this.pads.delete(id);
    this.emit();
  }

  sendTo(id: string, msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'to', id, msg }));
  }

  /** إرسال لكل تلفونات لاعب معين */
  sendToSlot(slot: 0 | 1, msg: Record<string, unknown>) {
    this.pads.forEach((p) => {
      if (p.slot === slot && p.connected) this.sendTo(p.id, msg);
    });
  }

  broadcast(msg: Record<string, unknown>) {
    this.pads.forEach((p) => p.connected && this.sendTo(p.id, msg));
  }

  vibrate(slot: 0 | 1, pattern: number | number[]) {
    this.sendToSlot(slot, { t: 'vib', p: pattern });
  }
}

export const net = new Network();
