/**
 * Input: keyboard + gamepad + bot, folded into one 8-bit mask per simulation frame.
 * Every frame's mask is recorded, so any moment can be replayed exactly.
 */
export const BTN = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4,
  DOWN: 8,
  JUMP: 16,
  ATTACK: 32,
  ROLL: 64,
  SWAP: 128,
} as const;

export interface InputFrame {
  held: number;
  pressed: number;
  released: number;
}

export const KEYMAP: Record<string, number> = {
  ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT,
  ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  ArrowUp: BTN.UP, KeyW: BTN.UP,
  ArrowDown: BTN.DOWN, KeyS: BTN.DOWN,
  Space: BTN.JUMP, KeyZ: BTN.JUMP,
  KeyJ: BTN.ATTACK, KeyX: BTN.ATTACK,
  KeyK: BTN.ROLL, ShiftLeft: BTN.ROLL, ShiftRight: BTN.ROLL, KeyC: BTN.ROLL,
  KeyQ: BTN.SWAP, KeyL: BTN.SWAP,
};

/** Standard gamepad mapping: A jump, X attack, B / RT roll, Y swap. */
function padMask(): number {
  let m = 0;
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const b = (i: number) => !!p.buttons[i]?.pressed;
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    if (b(14) || ax < -0.4) m |= BTN.LEFT;
    if (b(15) || ax > 0.4) m |= BTN.RIGHT;
    if (b(12) || ay < -0.5) m |= BTN.UP;
    if (b(13) || ay > 0.5) m |= BTN.DOWN;
    if (b(0)) m |= BTN.JUMP;
    if (b(2)) m |= BTN.ATTACK;
    if (b(1) || b(7) || b(5)) m |= BTN.ROLL;
    if (b(3)) m |= BTN.SWAP;
  }
  return m;
}

/** Gamepad "Select + Y" opens the issue logger, "Select + X" the dashboard. */
export function padCombo(): 'log' | 'dash' | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.buttons[8]?.pressed) continue;
    if (p.buttons[3]?.pressed) return 'log';
    if (p.buttons[2]?.pressed) return 'dash';
  }
  return null;
}

export class InputSystem {
  private down = 0;
  private latched = 0; // keys tapped between two frames still count once
  private prev = 0;
  botMask: number | null = null; // set by test agents
  enabled = true;
  /** whole-session recording, one byte per sim frame */
  record: number[] = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const b = KEYMAP[e.code];
      if (b === undefined) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.down |= b;
      this.latched |= b;
    });
    target.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b !== undefined) this.down &= ~b;
    });
    target.addEventListener('blur', () => { this.down = 0; });
  }

  /** Sample one frame. Pass an explicit mask to drive the game from a bot or a replay. */
  sample(forced?: number): InputFrame {
    let held: number;
    if (forced !== undefined) held = forced;
    else if (this.botMask !== null) held = this.botMask;
    else held = this.enabled ? this.down | this.latched | padMask() : 0;
    this.latched = 0;
    const f = { held, pressed: held & ~this.prev, released: this.prev & ~held };
    this.prev = held;
    this.record.push(held);
    if (this.record.length > 60 * 60 * 30) this.record.splice(0, 60 * 60); // cap ~30 min
    return f;
  }

  resetEdges() {
    this.prev = 0;
    this.latched = 0;
  }
}

/** Compact run-length encoding for recorded inputs: [mask, count, mask, count, ...] */
export function rle(frames: number[]): number[] {
  const out: number[] = [];
  for (const m of frames) {
    if (out.length && out[out.length - 2] === m) out[out.length - 1]++;
    else out.push(m, 1);
  }
  return out;
}

export function unrle(r: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.length; i += 2) for (let k = 0; k < r[i + 1]; k++) out.push(r[i]);
  return out;
}
