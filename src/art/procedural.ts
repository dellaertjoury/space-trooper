/** Procedural pixel art for the Phase 1 test room. Replaced by real tilesets in Phase 4. */
import { Rng } from '../core/rng';
import { T, Tile, TileMap } from '../core/tilemap';

type Ctx = CanvasRenderingContext2D;
/** All art is drawn at 2x so it stays crisp on the 2x-zoomed (1080p) camera; the game displays it at scale 0.5. */
export const ART_SCALE = 2;
function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * ART_SCALE); cv.height = Math.round(h * ART_SCALE);
  const c = cv.getContext('2d')!;
  c.scale(ART_SCALE, ART_SCALE);
  return [cv, c];
}
const px = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

export const PAL = {
  ink: '#140e1e',
  metal0: '#0c101b', metal1: '#151c2b', metal2: '#212a40', metal3: '#33415e', edge: '#78c4d4', edgeHi: '#d4f6ff',
  moss: '#3f8f5a', moss2: '#6cd08a',
  rust: '#7a4a3a', cyan: '#46e6ff', orange: '#ff9a3c', red: '#ff4a4a', green: '#6cff9a',
  bg0: '#070a14', bg1: '#0d1426', bg2: '#132039', bg3: '#1b2c4a',
};

/** Draws the whole level (tiles only) into one canvas. */
export function drawLevel(map: TileMap, seed = 3): HTMLCanvasElement {
  const [cv, c] = mk(map.pixelW, map.pixelH);
  const rng = new Rng(seed);
  const solid = (x: number, y: number) => map.get(x, y) === Tile.Solid;

  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.get(tx, ty), X = tx * T, Y = ty * T;
      if (t === Tile.Solid) {
        const open = { u: !solid(tx, ty - 1), d: !solid(tx, ty + 1), l: !solid(tx - 1, ty), r: !solid(tx + 1, ty) };
        const deep = !open.u && !open.d && !open.l && !open.r && solid(tx, ty - 2) && solid(tx - 1, ty - 1) && solid(tx + 1, ty - 1);
        px(c, X, Y, T, T, PAL.metal1);
        if (deep) {
          // interior of thick walls: same material, quieter detail (must never read as a hole)
          px(c, X + 2, Y + 2, T - 4, T - 4, (tx + ty) % 2 ? '#141a28' : '#161d2c');
          px(c, X, Y + T - 1, T, 1, PAL.metal0);
          if (rng.next() < 0.2) px(c, X + 6, Y + 6, 2, 2, PAL.metal2);
        } else {
          // panel seams + rivets
          px(c, X + 2, Y + 2, T - 4, T - 4, (tx + ty) % 2 ? PAL.metal1 : '#18202f');
          px(c, X, Y + T - 1, T, 1, PAL.metal0);
          px(c, X + T - 1, Y, 1, T, PAL.metal0);
          if (rng.next() < 0.5) { px(c, X + 4, Y + 4, 2, 2, PAL.metal3); px(c, X + T - 6, Y + 4, 2, 2, PAL.metal3); }
          if (rng.next() < 0.12) px(c, X + 6, Y + 10, 12, 3, PAL.rust);
          if (rng.next() < 0.06) { px(c, X + 9, Y + 9, 6, 6, '#0b1220'); px(c, X + 11, Y + 11, 2, 2, PAL.cyan); }
        }
        // lit top edge = the walkable surface reads instantly
        if (open.u) {
          px(c, X, Y, T, 4, PAL.metal3);
          px(c, X, Y, T, 1, PAL.edgeHi);
          px(c, X, Y + 1, T, 1, PAL.edge);
          if (rng.next() < 0.25) px(c, X + rng.int(2, 18), Y + 4, 3, 2, PAL.metal2);
          // moss creeping over the lit edge
          if (rng.next() < 0.35) {
            const mx = X + rng.int(0, 12), mw = rng.int(4, 12);
            px(c, mx, Y - 1, mw, 2, PAL.moss); px(c, mx + 1, Y - 2, Math.max(1, mw - 3), 1, PAL.moss2);
            for (let k = 0; k < mw; k += 3) px(c, mx + k, Y + 1, 1, rng.int(2, 6), PAL.moss);
          }
        }
        if (open.l) { px(c, X, Y, 2, T, PAL.metal2); px(c, X, Y, 1, T, PAL.metal3); }
        if (open.r) { px(c, X + T - 2, Y, 2, T, PAL.metal0); }
        if (open.d) {
          px(c, X, Y + T - 3, T, 3, PAL.metal0);
          if (rng.next() < 0.3) px(c, X + rng.int(3, 18), Y + T, 1, rng.int(4, 14), '#2a3550');
          if (rng.next() < 0.25) { const vx = X + rng.int(2, 20), len = rng.int(6, 20); for (let k = 0; k < len; k++) px(c, vx + (k % 6 < 3 ? 0 : 1), Y + T + k, 1, 1, k > len - 3 ? PAL.moss2 : PAL.moss); }
        }
      } else if (t === Tile.OneWay) {
        px(c, X, Y, T, 6, PAL.metal2);
        px(c, X, Y, T, 1, PAL.edgeHi);
        px(c, X, Y + 1, T, 1, PAL.edge);
        px(c, X, Y + 5, T, 1, PAL.ink);
        for (let i = 2; i < T; i += 6) px(c, X + i, Y + 3, 3, 1, PAL.metal0);
        if (tx % 3 === 0) px(c, X + 10, Y + 6, 3, 6, PAL.metal1); // strut
        if (tx % 4 === 1) px(c, X + 4, Y + 3, 4, 1, PAL.cyan);
      }
    }
  }
  return cv;
}

/** Far background: ship interior silhouettes. Tiled horizontally by the scene. */
export function drawBackdrop(w: number, h: number, layer: 0 | 1, seed = 9): HTMLCanvasElement {
  const [cv, c] = mk(w, h);
  const rng = new Rng(seed + layer * 17);
  if (layer === 0) {
    // banded vertical gradient (pixel-art style, dithered between bands)
    const bands = [PAL.bg0, PAL.bg1, PAL.bg2, PAL.bg3, '#22365a'];
    for (let y = 0; y < h; y++) {
      const t = y / h * (bands.length - 1);
      const i = Math.floor(t), f = t - i;
      for (let x = 0; x < w; x += 1) {
        const use = (x + y) % 2 === 0 ? f > 0.66 : f > 0.33;
        c.fillStyle = bands[Math.min(bands.length - 1, i + (use ? 1 : 0))];
        c.fillRect(x, y, 1, 1);
      }
    }
    // distant gantries and windows
    for (let i = 0; i < 18; i++) {
      const x = rng.int(0, w), bw = rng.int(30, 90), top = rng.int(h * 0.15, h * 0.55);
      px(c, x, top, bw, h - top, '#101a30');
      px(c, x, top, bw, 2, '#1d2c4c');
      for (let wy = top + 10; wy < h - 20; wy += 18)
        for (let wx = x + 6; wx < x + bw - 8; wx += 14)
          if (rng.next() < 0.35) px(c, wx, wy, 6, 4, rng.next() < 0.8 ? '#2b5f7a' : '#7a5a2b');
    }
    // stars through the hull breach
    for (let i = 0; i < 120; i++) px(c, rng.int(0, w), rng.int(0, h * 0.4), 1, 1, rng.next() < 0.7 ? '#5d7398' : '#c9e6ff');
  } else {
    // nearer: arches, pipes, hanging cables, light strips
    for (let x = 0; x < w; x += 160) {
      const a = x + rng.int(0, 40);
      px(c, a, 0, 22, h, '#0e1628');
      px(c, a + 2, 0, 2, h, '#18243e');
      for (let y = 40; y < h; y += 38) px(c, a + 9, y, 4, 10, rng.next() < 0.5 ? '#1f7f99' : '#0e1628');
      // arch
      c.fillStyle = '#0e1628';
      for (let k = 0; k < 60; k++) { const yy = 60 + Math.round(30 * Math.cos((k / 60) * Math.PI)); c.fillRect(a + 22 + k * 2, yy, 2, 10); }
    }
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, w), len = rng.int(40, 160);
      for (let y = 0; y < len; y++) px(c, x + Math.round(Math.sin(y / 18) * 3), y, 1, 1, '#0a0f1c');
    }
    for (let i = 0; i < 6; i++) { const y = rng.int(h * 0.3, h * 0.8); px(c, 0, y, w, 3, '#0f1a2f'); px(c, 0, y + 1, w, 1, '#1a2b4a'); }
  }
  return cv;
}

/** Vibro-saber blade, pointing right, hilt at x=0. */
export function drawBlade(color = PAL.cyan): HTMLCanvasElement {
  const [cv, c] = mk(44, 6);
  px(c, 0, 1, 9, 4, PAL.ink); px(c, 1, 2, 7, 2, '#6d7186'); px(c, 2, 2, 2, 1, '#a9adbf'); px(c, 8, 1, 2, 4, '#9a9fb5');
  px(c, 10, 1, 33, 4, color); px(c, 10, 2, 32, 2, '#f2feff'); px(c, 42, 2, 2, 2, color);
  return cv;
}

export function drawBolt(color = PAL.red): HTMLCanvasElement {
  const [cv, c] = mk(20, 4);
  px(c, 0, 0, 20, 4, color); px(c, 2, 1, 17, 2, '#fff2ea');
  return cv;
}

/** Slash arc (crescent), drawn for a sword facing right. */
export function drawSlash(r = 34, thick = 7, color = PAL.cyan): HTMLCanvasElement {
  const [cv, c] = mk(r * 2 + 8, r * 2 + 8);
  const cx = r + 4, cy = r + 4;
  for (let a = -75; a <= 75; a += 1) {
    const rad = (a * Math.PI) / 180;
    const t = 1 - Math.abs(a) / 75;
    const th = Math.max(1, Math.round(thick * t));
    for (let k = 0; k < th; k++) {
      const rr = r - k;
      const x = Math.round(cx + Math.cos(rad) * rr), y = Math.round(cy + Math.sin(rad) * rr);
      c.fillStyle = k < 2 ? '#f4feff' : color;
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

export function drawDummy(): HTMLCanvasElement {
  // training droid: a squat target post
  const [cv, c] = mk(32, 48);
  px(c, 13, 30, 6, 16, PAL.ink); px(c, 14, 30, 4, 16, '#4b5672');
  px(c, 6, 44, 20, 4, PAL.ink); px(c, 7, 44, 18, 3, '#3a4561');
  px(c, 3, 4, 26, 28, PAL.ink); px(c, 4, 5, 24, 26, '#cfd3dc'); px(c, 4, 5, 24, 3, '#eef1f6'); px(c, 4, 26, 24, 5, '#9aa2b4');
  px(c, 8, 12, 16, 9, PAL.ink); px(c, 9, 13, 14, 7, '#1d2840'); px(c, 11, 15, 4, 3, PAL.orange); px(c, 17, 15, 4, 3, PAL.orange);
  px(c, 14, 0, 4, 5, PAL.ink); px(c, 15, 1, 2, 3, PAL.red);
  return cv;
}

export function drawSpark(): HTMLCanvasElement {
  const [cv, c] = mk(4, 4);
  px(c, 1, 0, 2, 4, '#ffffff'); px(c, 0, 1, 4, 2, '#ffffff');
  return cv;
}

/** Soft round glow for lamps (drawn additively). */
export function drawGlow(r: number, rgb: string): HTMLCanvasElement {
  const [cv, c] = mk(r * 2, r * 2);
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${rgb},0.55)`); g.addColorStop(0.35, `rgba(${rgb},0.18)`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(0, 0, r * 2, r * 2);
  return cv;
}

/** Wall lamp fixture. */
export function drawLamp(color: string): HTMLCanvasElement {
  const [cv, c] = mk(10, 12);
  px(c, 2, 0, 6, 2, PAL.ink); px(c, 1, 2, 8, 8, PAL.ink); px(c, 2, 3, 6, 6, color); px(c, 3, 4, 3, 3, '#ffffff'); px(c, 3, 10, 4, 2, PAL.ink);
  return cv;
}

/** Supply crate seen straight from the side (flat 2D, no top face). Opened: lid tipped back, light inside. */
export const CRATE_COLORS: Record<string, [string, string, string]> = {
  grey: ['#6c7486', '#8a93a6', '#4a5162'], brown: ['#8a5a36', '#a87348', '#5e3d25'], green: ['#5f6e3e', '#7a8a50', '#414c2a'],
  blue: ['#3e5878', '#55739a', '#2a3d55'], maroon: ['#6e3240', '#8a4252', '#4a212b'],
};
export function drawCrateSide(color: string, open: boolean): HTMLCanvasElement {
  const [base, hi, dark] = CRATE_COLORS[color] ?? CRATE_COLORS.grey;
  const W = 30, H = 30, top = 8; // body sits in the lower 22 px; room above for the lid
  const [cv, c] = mk(W, H);
  const ink = PAL.ink;
  const box = (x: number, y: number, w: number, h: number, fill: string) => { c.fillStyle = ink; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.fillStyle = fill; c.fillRect(x, y, w, h); };
  if (open) {
    // lid tipped up behind the box
    c.save(); c.translate(3, top + 1); c.rotate(-1.05);
    box(0, -3, 24, 3, hi); c.restore();
    c.fillStyle = 'rgba(255,214,140,0.85)'; c.fillRect(4, top - 1, W - 8, 2);
  } else {
    box(2, top - 3, W - 4, 4, hi); // lid
  }
  box(2, top + 1, W - 4, H - top - 2, base);            // body
  c.fillStyle = dark; c.fillRect(2, top + 1, W - 4, 2);  // shadow under the lid
  c.fillStyle = hi; c.fillRect(2, top + 5, W - 4, 1); c.fillRect(2, H - 6, W - 4, 1);
  for (const x of [2, W - 6]) { c.fillStyle = dark; c.fillRect(x, top + 1, 4, H - top - 2); c.fillStyle = '#c9ced8'; c.fillRect(x + 1, top + 3, 2, 2); c.fillRect(x + 1, H - 5, 2, 2); }
  c.fillStyle = ink; c.fillRect(W / 2 - 4, top + 8, 8, 6);
  c.fillStyle = open ? '#3a3f4c' : '#ffd36a'; c.fillRect(W / 2 - 3, top + 9, 6, 4); // latch light
  return cv;
}
