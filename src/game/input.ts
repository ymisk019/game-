// ===================== المدخلات (Input) =====================
// كيبورد + يد بلايستيشن/إكسبوكس (Gamepad API) + تلفون (عبر الشبكة)
// كل لاعب يمكنه استخدام أي جهاز، والمدخلات تُدمج لكل لاعب.
import { net, type Slot } from './network';

export interface PlayerInput {
  x: number; // -1 يسار .. 1 يمين (من منظور المهاجم)
  y: number; // -1 خلف .. 1 أمام (باتجاه المرمى)
  shoot: boolean;
  jump: boolean;
  dive: boolean;
}

export const emptyInput = (): PlayerInput => ({ x: 0, y: 0, shoot: false, jump: false, dive: false });

const keys = new Set<string>();
let anyPressed = false;
let pausePressed = false;

// ربط يد التحكم باللاعب: index -> slot
export const gamepadSlots = new Map<number, Slot>();

/** عدد اللاعبين النشطين: 2 عادي، 4 في الشاشة المقسومة */
export let maxPlayers = 2;
export function setMaxPlayers(n: 2 | 4) {
  maxPlayers = n;
  // أي يد كانت على لاعب غير متاح ترجع للاعب 1
  gamepadSlots.forEach((sl, idx) => {
    if (sl >= n) gamepadSlots.set(idx, 0);
  });
  emitPads();
}
const prevPadButtons = new Map<number, boolean[]>();
let gamepadListeners = new Set<() => void>();

export function onGamepadsChanged(fn: () => void) {
  gamepadListeners.add(fn);
  return () => {
    gamepadListeners.delete(fn);
  };
}
const emitPads = () => gamepadListeners.forEach((f) => f());

function blockKey(code: string) {
  return ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(code);
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
    if (blockKey(e.code) && document.body.dataset.playing === '1') e.preventDefault();
    if (!keys.has(e.code)) {
      anyPressed = true;
      if (e.code === 'Escape' || e.code === 'KeyP') pausePressed = true;
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('gamepadconnected', emitPads);
  window.addEventListener('gamepaddisconnected', (e) => {
    gamepadSlots.delete((e as GamepadEvent).gamepad.index);
    emitPads();
  });
}

const k = (c: string) => (keys.has(c) ? 1 : 0);

function keyboardInput(slot: Slot): PlayerInput {
  if (slot >= 2) return emptyInput();
  if (slot === 0) {
    return {
      x: k('KeyD') - k('KeyA'),
      y: k('KeyW') - k('KeyS'),
      shoot: keys.has('Space'),
      jump: keys.has('Space'),
      dive: keys.has('KeyE') || keys.has('KeyF'),
    };
  }
  return {
    x: k('ArrowRight') - k('ArrowLeft'),
    y: k('ArrowUp') - k('ArrowDown'),
    shoot: keys.has('Enter') || keys.has('NumpadEnter'),
    jump: keys.has('Enter') || keys.has('NumpadEnter'),
    dive: keys.has('ShiftRight') || keys.has('ShiftLeft') || keys.has('Numpad0'),
  };
}

function dead(v: number) {
  return Math.abs(v) < 0.18 ? 0 : v;
}

export function getGamepads(): Gamepad[] {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(list).filter((g): g is Gamepad => !!g && g.connected);
}

/** تحديث أيدي التحكم: الانضمام التلقائي وتبديل اللاعب في شاشة الانتظار */
export function pollGamepads(inLobby: boolean) {
  for (const gp of getGamepads()) {
    const prev = prevPadButtons.get(gp.index) ?? [];
    const now = gp.buttons.map((b) => b.pressed);
    const pressed = (i: number) => now[i] && !prev[i];
    if (now.some((b, i) => b && !prev[i])) anyPressed = true;
    if (pressed(9) || pressed(8)) pausePressed = true;
    if (!gamepadSlots.has(gp.index) && now.some((b) => b)) {
      // انضمام: أول مكان فارغ (اللاعب 1، ثم 2، ثم 3، ثم 4)
      const used = new Set(gamepadSlots.values());
      let pick: Slot = 0;
      for (let i = 0; i < maxPlayers; i++) {
        if (!used.has(i as Slot)) {
          pick = i as Slot;
          break;
        }
      }
      gamepadSlots.set(gp.index, pick);
      emitPads();
    }
    if (inLobby && gamepadSlots.has(gp.index)) {
      const cur = gamepadSlots.get(gp.index) as Slot;
      if (pressed(14) && cur > 0) {
        gamepadSlots.set(gp.index, (cur - 1) as Slot);
        emitPads();
      }
      if (pressed(15) && cur < maxPlayers - 1) {
        gamepadSlots.set(gp.index, (cur + 1) as Slot);
        emitPads();
      }
    }
    prevPadButtons.set(gp.index, now);
  }
}

function gamepadInput(slot: Slot, out: PlayerInput) {
  for (const gp of getGamepads()) {
    if (gamepadSlots.get(gp.index) !== slot) continue;
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    let x = dead(gp.axes[0] ?? 0);
    let y = -dead(gp.axes[1] ?? 0);
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    if (b(12)) y = 1;
    if (b(13)) y = -1;
    if (Math.abs(x) > Math.abs(out.x)) out.x = x;
    if (Math.abs(y) > Math.abs(out.y)) out.y = y;
    out.shoot ||= b(0) || b(7);
    out.jump ||= b(1) || b(3);
    out.dive ||= b(2) || b(6);
  }
}

function phoneInput(slot: Slot, out: PlayerInput) {
  net.pads.forEach((p) => {
    if (p.slot !== slot || !p.connected) return;
    if (Math.abs(p.input.x) > Math.abs(out.x)) out.x = p.input.x;
    if (Math.abs(p.input.y) > Math.abs(out.y)) out.y = p.input.y;
    out.shoot ||= p.input.shoot;
    out.jump ||= p.input.jump;
    out.dive ||= p.input.dive;
  });
}

/** المدخلات المدموجة لكل لاعب من كل الأجهزة */
export function getInput(slot: Slot): PlayerInput {
  const out = keyboardInput(slot);
  gamepadInput(slot, out);
  phoneInput(slot, out);
  const len = Math.hypot(out.x, out.y);
  if (len > 1) {
    out.x /= len;
    out.y /= len;
  }
  return out;
}

/** هل ضُغط أي زر منذ آخر استدعاء (لتخطي الإعادة) */
export function consumeAny() {
  let a = anyPressed;
  anyPressed = false;
  // التلفون: أي زر مضغوط
  net.pads.forEach((p) => {
    if (p.connected && (p.input.shoot || p.input.jump || p.input.dive)) a = true;
  });
  return a;
}

/** نسخة للمحرك الثاني: تفحص فقط أيدي وتلفونات لاعبيه */
export function anyFor(base: 0 | 2): boolean {
  let a = false;
  net.pads.forEach((p) => {
    if (p.connected && (p.slot === base || p.slot === base + 1) && (p.input.shoot || p.input.jump || p.input.dive)) a = true;
  });
  for (const gp of getGamepads()) {
    const sl = gamepadSlots.get(gp.index);
    if ((sl === base || sl === base + 1) && gp.buttons.some((b) => b.pressed)) a = true;
  }
  return a;
}

export function consumePause() {
  const p = pausePressed;
  pausePressed = false;
  return p;
}

/** اهتزاز يد التحكم إن كانت تدعمه */
export function rumble(slot: Slot, strong: number, ms: number) {
  for (const gp of getGamepads()) {
    if (gamepadSlots.get(gp.index) !== slot) continue;
    const act = (gp as unknown as { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } }).vibrationActuator;
    act?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(() => {});
  }
}

export function resetGamepadListeners() {
  gamepadListeners = new Set();
}
