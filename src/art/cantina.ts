/**
 * The Cantina interior, drawn in code in the comic style of the Trooper art:
 * bold ink outlines, flat cel shading (base / shadow / highlight), warm interior light, cool holograms.
 * Everything is drawn at 2x (ART_SCALE) and shown at 0.5.
 */
import { Rng } from '../core/rng';
import { ART_SCALE } from './procedural';

type C = CanvasRenderingContext2D;
const INK = '#140e1e';

function mk(w: number, h: number): [HTMLCanvasElement, C] {
  const cv = document.createElement('canvas');
  cv.width = w * ART_SCALE; cv.height = h * ART_SCALE;
  const c = cv.getContext('2d')!;
  c.scale(ART_SCALE, ART_SCALE);
  c.lineJoin = 'round'; c.lineCap = 'round';
  return [cv, c];
}

/** filled shape with a bold ink outline */
function shape(c: C, path: () => void, fill: string, line = 3) {
  c.beginPath(); path(); c.closePath();
  c.fillStyle = fill; c.fill();
  c.lineWidth = line; c.strokeStyle = INK; c.stroke();
}
function rect(c: C, x: number, y: number, w: number, h: number, fill: string, line = 3, r = 0) {
  shape(c, () => (r ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h)), fill, line);
}
function band(c: C, x: number, y: number, w: number, h: number, fill: string) { c.fillStyle = fill; c.fillRect(x, y, w, h); }

export interface CantinaLayout {
  w: number; h: number; floorY: number;
  stations: { id: StationId; x: number; label: string }[];
  lamps: { x: number; y: number }[];
  holos: { x: number; y: number; kind: 'sabers' | 'planet' }[];
}
export type StationId = 'scrapper' | 'armoury' | 'forge' | 'workshop' | 'mission';

export const LAYOUT: CantinaLayout = {
  w: 1728, h: 552, floorY: 480,
  stations: [
    { id: 'scrapper', x: 250, label: 'Scrapper Stall' },
    { id: 'armoury', x: 540, label: 'Armoury' },
    { id: 'forge', x: 1150, label: 'Saber Forge' },
    { id: 'workshop', x: 1400, label: 'Droid Workshop' },
    { id: 'mission', x: 1610, label: 'Mission Table' },
  ],
  lamps: [{ x: 160, y: 120 }, { x: 420, y: 110 }, { x: 680, y: 96 }, { x: 1070, y: 96 }, { x: 1270, y: 110 }, { x: 1520, y: 120 }],
  holos: [{ x: 1150, y: 404, kind: 'sabers' }, { x: 1610, y: 404, kind: 'planet' }],
};

export function drawCantina(L = LAYOUT): HTMLCanvasElement {
  const { w, h, floorY } = L;
  const [cv, c] = mk(w, h);
  const rng = new Rng(42);

  // ---------------------------------------------------------------- back wall
  const g = c.createLinearGradient(0, 0, 0, floorY);
  g.addColorStop(0, '#1a0d12'); g.addColorStop(0.45, '#3a1c1c'); g.addColorStop(1, '#4b2621');
  c.fillStyle = g; c.fillRect(0, 0, w, floorY);
  // big wall panels with ink seams + top highlight
  for (let x = 0; x < w; x += 144) {
    rect(c, x + 6, 150, 132, floorY - 210, '#47231f', 3, 10);
    band(c, x + 10, 154, 124, 6, '#6a3a2c');
    band(c, x + 10, floorY - 80, 124, 14, '#36191a');
    for (const yy of [168, floorY - 92]) for (const xx of [x + 18, x + 126]) { c.fillStyle = '#7d4a36'; c.beginPath(); c.arc(xx, yy, 3, 0, 7); c.fill(); }
  }
  // ceiling arches
  for (let x = -40; x < w; x += 288) {
    c.beginPath(); c.moveTo(x, 150); c.quadraticCurveTo(x + 144, 40, x + 288, 150); c.lineTo(x + 288, 0); c.lineTo(x, 0); c.closePath();
    c.fillStyle = '#140a0e'; c.fill(); c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(x + 10, 146); c.quadraticCurveTo(x + 144, 52, x + 278, 146); c.lineWidth = 3; c.strokeStyle = '#6a3a2c'; c.stroke();
  }
  // pipes along the ceiling
  for (const [y, col] of [[60, '#5b5f73'], [76, '#474a5c']] as [number, string][]) {
    rect(c, -10, y, w + 20, 12, col, 3, 6);
    band(c, 0, y + 2, w, 3, '#8a8fa8');
    for (let x = 60; x < w; x += 220) rect(c, x, y - 4, 14, 20, '#3a3c4a', 3, 3);
  }

  // ---------------------------------------------------------------- portholes onto a twin-sun dusk
  for (const px of [395, 870, 1290]) {
    const r = 46, py = 230;
    c.save(); c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.clip();
    const sky = c.createLinearGradient(0, py - r, 0, py + r);
    sky.addColorStop(0, '#2b1640'); sky.addColorStop(0.55, '#b5506a'); sky.addColorStop(0.8, '#f29a5e'); sky.addColorStop(1, '#ffd28a');
    c.fillStyle = sky; c.fillRect(px - r, py - r, r * 2, r * 2);
    c.fillStyle = '#ffe6b0'; c.beginPath(); c.arc(px - 12, py + 6, 11, 0, 7); c.fill();
    c.fillStyle = '#ffc890'; c.beginPath(); c.arc(px + 12, py + 14, 6, 0, 7); c.fill();
    c.fillStyle = '#5a2a40';
    c.beginPath(); c.moveTo(px - r, py + 30); c.lineTo(px - 20, py + 18); c.lineTo(px - 5, py + 26); c.lineTo(px + 22, py + 16); c.lineTo(px + r, py + 28); c.lineTo(px + r, py + r); c.lineTo(px - r, py + r); c.fill();
    c.restore();
    c.lineWidth = 9; c.strokeStyle = '#5b5f73'; c.beginPath(); c.arc(px, py, r + 4, 0, 7); c.stroke();
    c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.arc(px, py, r + 9, 0, 7); c.stroke(); c.beginPath(); c.arc(px, py, r, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.beginPath(); c.arc(px, py, r - 8, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  }

  // ---------------------------------------------------------------- bar: shelves, bottles, counter
  const bx0 = 700, bx1 = 1050;
  for (const sy of [190, 250]) {
    rect(c, bx0 + 20, sy, bx1 - bx0 - 40, 10, '#6b3d2a', 3, 2);
    for (let x = bx0 + 34; x < bx1 - 40; x += 18 + rng.int(0, 8)) {
      const bh = rng.int(22, 38), col = rng.pick(['#3fa36b', '#c94b3a', '#e0a33a', '#4a7fd1', '#9b59d0', '#d6d0b8']);
      shape(c, () => { c.roundRect(x, sy - bh, 10, bh, 3); }, col, 2.5);
      band(c, x + 2, sy - bh + 4, 2, bh - 8, 'rgba(255,255,255,0.5)');
      rect(c, x + 3, sy - bh - 6, 4, 7, '#2a1c18', 2);
    }
  }
  // neon sign
  c.font = 'bold 22px Oswald, Impact, sans-serif'; c.textAlign = 'center';
  c.lineWidth = 6; c.strokeStyle = INK; c.strokeText('THE RUSTY HYPERDRIVE', (bx0 + bx1) / 2, 160);
  c.fillStyle = '#ff9a5c'; c.fillText('THE RUSTY HYPERDRIVE', (bx0 + bx1) / 2, 160);
  // counter
  rect(c, bx0, 360, bx1 - bx0, 26, '#8a5236', 4, 6);
  band(c, bx0 + 4, 364, bx1 - bx0 - 8, 6, '#c27a4e');
  rect(c, bx0 + 14, 386, bx1 - bx0 - 28, floorY - 386, '#5a2f24', 4, 4);
  for (let x = bx0 + 34; x < bx1 - 30; x += 64) { rect(c, x, 400, 44, floorY - 420, '#4a2620', 3, 6); band(c, x + 4, 404, 36, 4, '#7a4632'); }
  band(c, bx0 + 18, 452, bx1 - bx0 - 36, 4, '#ff9a5c');
  // stools
  for (const sx of [760, 850, 940]) {
    rect(c, sx - 3, 430, 6, floorY - 430, '#3a3c4a', 2);
    shape(c, () => c.ellipse(sx, 428, 20, 7, 0, 0, 7), '#b5543c', 3);
    band(c, sx - 12, 424, 18, 2, '#e08a62');
  }
  // bartender droid behind the counter
  {
    const dx = 875;
    rect(c, dx - 26, 286, 52, 76, '#a9b0c4', 3, 14);
    band(c, dx - 20, 292, 8, 60, '#d5dbe8');
    rect(c, dx - 20, 236, 40, 46, '#c4c9d8', 3, 18);
    rect(c, dx - 14, 252, 28, 12, INK, 2, 4);
    c.fillStyle = '#ffb347'; c.beginPath(); c.arc(dx - 6, 258, 3.5, 0, 7); c.arc(dx + 6, 258, 3.5, 0, 7); c.fill();
    rect(c, dx - 3, 222, 6, 16, '#5b5f73', 2); c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(dx, 220, 4, 0, 7); c.fill();
    rect(c, dx + 24, 300, 30, 9, '#a9b0c4', 3, 4);   // arm holding a glass
    rect(c, dx + 50, 286, 10, 16, 'rgba(140,220,255,0.7)', 2, 2);
  }

  // ---------------------------------------------------------------- Scrapper stall
  {
    const sx = 130, ex = 380;
    // awning
    for (let i = 0; i < 6; i++) {
      const x0 = sx + i * ((ex - sx) / 6);
      shape(c, () => { c.moveTo(x0, 196); c.lineTo(x0 + (ex - sx) / 6, 196); c.lineTo(x0 + (ex - sx) / 6 - 4, 236); c.quadraticCurveTo(x0 + (ex - sx) / 12, 248, x0 + 4, 236); }, i % 2 ? '#d8b98a' : '#b5543c', 3);
    }
    rect(c, sx - 6, 186, ex - sx + 12, 12, '#6b3d2a', 3, 3);
    rect(c, sx, 196, 8, floorY - 196, '#5b5f73', 3); rect(c, ex - 8, 196, 8, floorY - 196, '#5b5f73', 3);
    // counter of crates
    for (const [x, y, ww, hh, col] of [[150, 404, 80, 76, '#8a6a3c'], [232, 420, 70, 60, '#7a5a34'], [304, 398, 70, 82, '#8a6a3c'], [180, 352, 64, 52, '#9b7a46']] as [number, number, number, number, string][]) {
      rect(c, x, y, ww, hh, col, 3, 3);
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + ww - 4, y + hh - 4); c.moveTo(x + ww - 4, y + 4); c.lineTo(x + 4, y + hh - 4); c.stroke();
      band(c, x + 3, y + 3, ww - 6, 4, 'rgba(255,230,180,0.35)');
    }
    // hanging scrap
    for (const [x, len] of [[170, 40], [215, 60], [260, 34], [320, 52], [350, 28]] as [number, number][]) {
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 236); c.lineTo(x, 236 + len); c.stroke();
      rect(c, x - 8, 236 + len, 16, 12, rng.pick(['#7a7f94', '#a9b0c4', '#5b5f73', '#c27a4e']), 2.5, 3);
    }
  }

  // ---------------------------------------------------------------- Armoury rack
  {
    const ax = 460, ax1 = 630;
    rect(c, ax, 200, ax1 - ax, 210, '#2e2a33', 4, 8);
    band(c, ax + 6, 206, ax1 - ax - 12, 6, '#4a4552');
    for (const y of [260, 340]) rect(c, ax + 10, y, ax1 - ax - 20, 8, '#5b5f73', 2.5, 3);
    // weapon pegs
    for (let i = 0; i < 4; i++) { const x = ax + 26 + i * 40; rect(c, x, 214, 6, 40, '#6d7186', 2.5, 2); }
    rect(c, ax - 10, 410, ax1 - ax + 20, 70, '#3a2a26', 4, 6);   // bench
    band(c, ax - 4, 414, ax1 - ax + 8, 5, '#6b4a3a');
  }

  // ---------------------------------------------------------------- holo-tables (Forge, Mission)
  for (const hx of [1150, 1610]) {
    shape(c, () => c.ellipse(hx, floorY - 2, 80, 12, 0, 0, 7), '#1c1a22', 3);
    rect(c, hx - 24, 420, 48, floorY - 424, '#3a3c4a', 3, 4);
    shape(c, () => c.ellipse(hx, 420, 86, 18, 0, 0, 7), '#4a4d60', 4);
    shape(c, () => c.ellipse(hx, 416, 70, 12, 0, 0, 7), '#2a5f7a', 3);
    c.fillStyle = 'rgba(120,230,255,0.9)';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(hx + Math.cos(a) * 58, 416 + Math.sin(a) * 9, 3, 0, 7); c.fill(); }
  }

  // ---------------------------------------------------------------- Droid workshop bench
  {
    const wx = 1320, wx1 = 1480;
    rect(c, wx, 400, wx1 - wx, 20, '#6b4a3a', 4, 4);
    band(c, wx + 4, 403, wx1 - wx - 8, 4, '#a57256');
    rect(c, wx + 8, 420, 12, floorY - 420, '#3a3c4a', 3); rect(c, wx1 - 20, 420, 12, floorY - 420, '#3a3c4a', 3);
    // pegboard with tools
    rect(c, wx + 6, 236, wx1 - wx - 12, 120, '#3b3530', 4, 6);
    for (let y = 250; y < 350; y += 14) for (let x = wx + 20; x < wx1 - 14; x += 14) { c.fillStyle = '#26211e'; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
    rect(c, wx + 22, 256, 10, 48, '#a9b0c4', 2.5, 3); rect(c, wx + 46, 262, 30, 10, '#c27a4e', 2.5, 3);
    rect(c, wx + 90, 254, 8, 56, '#7a7f94', 2.5, 2); rect(c, wx + 112, 270, 24, 24, '#5b5f73', 2.5, 12);
    // parts bin
    rect(c, wx + 100, 370, 46, 30, '#5b5f73', 3, 3); band(c, wx + 104, 372, 38, 4, '#8a8fa8');
  }

  // ---------------------------------------------------------------- hangar door (mission exit)
  {
    const dx = 1666, dw = 52;
    rect(c, dx, 210, dw, floorY - 210, '#2a2c38', 4, 6);
    for (let y = 226; y < floorY - 10; y += 28) { band(c, dx + 4, y, dw - 8, 3, '#4a4d60'); band(c, dx + 4, y + 3, dw - 8, 2, '#1c1d26'); }
    for (let y = 214; y < floorY; y += 34) { c.fillStyle = y % 68 ? '#ffb347' : INK; c.fillRect(dx - 6, y, 6, 17); }
  }

  // ---------------------------------------------------------------- floor
  const fg = c.createLinearGradient(0, floorY, 0, h);
  fg.addColorStop(0, '#3a1f1a'); fg.addColorStop(1, '#140a0c');
  c.fillStyle = fg; c.fillRect(0, floorY, w, h - floorY);
  c.fillStyle = INK; c.fillRect(0, floorY, w, 4);
  band(c, 0, floorY + 4, w, 3, '#7a4632');
  for (let x = 0; x < w; x += 96) { c.strokeStyle = 'rgba(20,14,30,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, floorY + 8); c.lineTo(x - 30, h); c.stroke(); }
  for (let y = floorY + 26; y < h; y += 24) band(c, 0, y, w, 2, 'rgba(20,14,30,0.5)');
  return cv;
}

/** Hologram of a planet for the Mission Table. */
export function drawPlanetHolo(): HTMLCanvasElement {
  const [cv, c] = mk(120, 120);
  c.strokeStyle = 'rgba(160,240,255,0.95)'; c.lineWidth = 2;
  c.beginPath(); c.arc(60, 60, 34, 0, 7); c.stroke();
  for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(60, 60 + k * 34, 34 * Math.sqrt(1 - k * k), 6, 0, 0, 7); c.stroke(); }
  c.beginPath(); c.ellipse(60, 60, 12, 34, 0, 0, 7); c.stroke();
  c.beginPath(); c.ellipse(60, 64, 56, 10, -0.15, 0, 7); c.stroke();
  c.fillStyle = 'rgba(160,240,255,0.25)'; c.beginPath(); c.arc(60, 60, 34, 0, 7); c.fill();
  return cv;
}

/** Light cone rising from a holo-table. */
export function drawHoloCone(): HTMLCanvasElement {
  const [cv, c] = mk(160, 150);
  const g = c.createLinearGradient(0, 150, 0, 0);
  g.addColorStop(0, 'rgba(110,220,255,0.55)'); g.addColorStop(1, 'rgba(110,220,255,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(50, 150); c.lineTo(110, 150); c.lineTo(160, 0); c.lineTo(0, 0); c.closePath(); c.fill();
  return cv;
}

/** Warm light pool under a hanging lamp, plus the lamp itself. */
export function drawHangingLamp(): HTMLCanvasElement {
  const [cv, c] = mk(60, 120);
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(30, 0); c.lineTo(30, 70); c.stroke();
  shape(c, () => { c.moveTo(12, 92); c.lineTo(18, 70); c.lineTo(42, 70); c.lineTo(48, 92); }, '#b5543c', 3);
  band(c, 20, 73, 20, 3, '#e08a62');
  c.fillStyle = '#ffe2a8'; c.beginPath(); c.ellipse(30, 93, 14, 4, 0, 0, 7); c.fill();
  return cv;
}

// =====================================================================================================
// Two-floor hub (tile scale). Floors are bands of wall, joined by a stairwell in the centre.
// =====================================================================================================

/** Wall art behind the two floors: warm panels, pipes, the stairwell door on both floors, bar shelves. */
export function drawHubBackdrop(w: number, h: number, floors: number[], wallL = 48, wallR = w - 48, slab = 72, stairX = w / 2): HTMLCanvasElement {
  const [cv, c] = mk(w, h);
  const rng = new Rng(7);
  const [G, P] = floors;
  c.fillStyle = '#120a0d'; c.fillRect(0, 0, w, h);
  const bands = [[48, P], [P + slab, G]];
  bands.forEach(([y0, y1], bi) => {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, ['#2a161b', '#3a1c1c'][bi]); g.addColorStop(1, ['#43221f', '#4b2621'][bi]);
    c.fillStyle = g; c.fillRect(wallL, y0, wallR - wallL, y1 - y0);
    for (let x = wallL + 8; x < wallR - 60; x += 96) {
      rect(c, x, y0 + 26, 88, y1 - y0 - 40, ['#3b1d1f', '#47231f'][bi], 2.5, 6);
      band(c, x + 4, y0 + 29, 80, 4, ['#56302a', '#6a3a2c'][bi]);
      c.fillStyle = '#7d4a36'; for (const xx of [x + 10, x + 78]) { c.beginPath(); c.arc(xx, y0 + 40, 2, 0, 7); c.fill(); }
    }
    rect(c, wallL, y0 + 6, wallR - wallL, 8, '#4a4d60', 2.5, 4);
    band(c, wallL, y0 + 8, wallR - wallL, 2, '#7f84a0');
    for (let x = wallL + 40; x < wallR; x += 170) rect(c, x, y0 + 3, 10, 14, '#2e2f3c', 2, 2);
  });

  // the stairwell: the same doorway on both floors, steps going up (ground) or down (upper floor)
  for (const [fy, up] of [[G, true], [P, false]] as [number, boolean][]) {
    const dw = 66, dh = 104, dx = stairX - dw / 2, dy = fy - dh;
    rect(c, dx - 8, dy - 8, dw + 16, dh + 8, '#5b5f73', 3, 8);
    c.fillStyle = '#0b0709'; c.fillRect(dx, dy, dw, dh);
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const sx = dx + 4 + i * ((dw - 8) / steps);
      const sh = up ? 10 + i * 12 : dh - 12 - i * 12;
      c.fillStyle = i % 2 ? '#3a2422' : '#45292a';
      c.fillRect(sx, fy - sh, (dw - 8) / steps + 1, sh);
      band(c, sx, fy - sh, (dw - 8) / steps + 1, 2, '#8a5236');
    }
    const lg = c.createLinearGradient(0, dy, 0, fy);
    lg.addColorStop(0, up ? 'rgba(255,190,120,0.35)' : 'rgba(0,0,0,0)'); lg.addColorStop(1, up ? 'rgba(0,0,0,0)' : 'rgba(255,190,120,0.25)');
    c.fillStyle = lg; c.fillRect(dx, dy, dw, dh);
    for (let y = dy; y < fy; y += 20) { c.fillStyle = (y / 20) % 2 ? '#ffb347' : INK; c.fillRect(dx - 8, y, 5, 10); c.fillRect(dx + dw + 3, y, 5, 10); }
    c.font = 'bold 12px Oswald, Impact, sans-serif'; c.textAlign = 'center';
    c.lineWidth = 4; c.strokeStyle = INK;
    const label = up ? 'UPSTAIRS  \u25B2' : 'DOWNSTAIRS  \u25BC';
    c.strokeText(label, stairX, dy - 14); c.fillStyle = '#ffd58a'; c.fillText(label, stairX, dy - 14);
  }

  // the bar's back wall: bottle shelves + neon sign (ground floor, left)
  const barX = 300;
  for (const sy of [G - 112, G - 82]) {
    rect(c, barX - 110, sy, 220, 6, '#6b3d2a', 2.5, 2);
    for (let x = barX - 100; x < barX + 100; x += 14 + rng.int(0, 6)) {
      const bh = rng.int(12, 20), col = rng.pick(['#3fa36b', '#c94b3a', '#e0a33a', '#4a7fd1', '#9b59d0', '#d6d0b8']);
      shape(c, () => c.roundRect(x, sy - bh, 7, bh, 2), col, 1.8);
      band(c, x + 1.5, sy - bh + 3, 1.5, bh - 6, 'rgba(255,255,255,0.5)');
    }
  }
  c.font = 'bold 16px Oswald, Impact, sans-serif'; c.textAlign = 'center';
  c.lineWidth = 5; c.strokeStyle = INK; c.strokeText('THE RUSTY HYPERDRIVE', barX, G - 128);
  c.fillStyle = '#ff9a5c'; c.fillText('THE RUSTY HYPERDRIVE', barX, G - 128);

  // Scrapper awning (upper floor, left)
  for (let i = 0; i < 6; i++) {
    const x0 = 74 + i * 42;
    shape(c, () => { c.moveTo(x0, P - 112); c.lineTo(x0 + 42, P - 112); c.lineTo(x0 + 39, P - 88); c.quadraticCurveTo(x0 + 21, P - 80, x0 + 3, P - 88); }, i % 2 ? '#d8b98a' : '#b5543c', 2.5);
  }
  rect(c, 70, P - 118, 260, 8, '#6b3d2a', 2.5, 2);
  rect(c, 74, P - 110, 5, 110, '#5b5f73', 2); rect(c, 325, P - 110, 5, 110, '#5b5f73', 2);
  return cv;
}

/** Decks and walls as tiles: solid = warm dark metal, one-way decks = thick plank floors with beams. */
export function drawHubTiles(map: { w: number; h: number; get(x: number, y: number): number }, T: number): HTMLCanvasElement {
  const [cv, c] = mk(map.w * T, map.h * T);
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = map.get(tx, ty), X = tx * T, Y = ty * T;
    if (t === 1) {
      band(c, X, Y, T, T, '#1c1216');
      band(c, X + 2, Y + 2, T - 4, T - 4, (tx + ty) % 2 ? '#24171b' : '#21151a');
      if (map.get(tx, ty - 1) !== 1) { band(c, X, Y, T, 5, '#7a4632'); band(c, X, Y, T, 2, '#c27a4e'); band(c, X, Y + 5, T, 2, INK); }
    } else if (t === 2) {
      // plank deck: top lip, planks, dark underside; a support beam every 4 tiles
      band(c, X, Y, T, 14, '#5a2f24');
      band(c, X, Y, T, 3, '#c27a4e');
      band(c, X, Y + 3, T, 2, '#8a5236');
      band(c, X, Y + 12, T, 3, INK);
      c.strokeStyle = 'rgba(20,14,30,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X + (tx % 2 ? 6 : 16), Y + 5); c.lineTo(X + (tx % 2 ? 6 : 16), Y + 12); c.stroke();
      const left = map.get(tx - 1, ty) !== 2, right = map.get(tx + 1, ty) !== 2;
      if (tx % 4 === 0 && !left && !right) { rect(c, X + 9, Y + 14, 6, 8, '#3a3c4a', 1.5); }
      if (left) band(c, X, Y, 2, 14, INK);
      if (right) band(c, X + T - 2, Y, 2, 14, INK);
    }
  }
  return cv;
}

/** Bar counter with stools (drawn in front of the bartender). */
export function drawBarCounter(): HTMLCanvasElement {
  const [cv, c] = mk(260, 48);
  rect(c, 2, 2, 256, 10, '#8a5236', 2.5, 4);
  band(c, 5, 4, 250, 3, '#c27a4e');
  rect(c, 10, 12, 240, 34, '#5a2f24', 2.5, 3);
  for (let x = 22; x < 240; x += 42) { rect(c, x, 17, 30, 24, '#4a2620', 2, 4); band(c, x + 3, 19, 24, 2, '#7a4632'); }
  band(c, 12, 38, 236, 2, '#ff9a5c');
  return cv;
}

/** Round holo-table (the hologram floats above it). */
export function drawHoloTable(): HTMLCanvasElement {
  const [cv, c] = mk(80, 30);
  rect(c, 30, 10, 20, 20, '#3a3c4a', 2.5, 3);
  shape(c, () => c.ellipse(40, 9, 36, 7, 0, 0, 7), '#4a4d60', 2.5);
  shape(c, () => c.ellipse(40, 7, 28, 4.5, 0, 0, 7), '#2a5f7a', 2);
  c.fillStyle = 'rgba(120,230,255,0.95)';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(40 + Math.cos(a) * 22, 7 + Math.sin(a) * 3.4, 1.4, 0, 7); c.fill(); }
  return cv;
}

/** Armoury wall rack (the gear sprites hang on it). */
export function drawArmouryRack(): HTMLCanvasElement {
  const [cv, c] = mk(120, 92);
  rect(c, 4, 2, 112, 70, '#2e2a33', 3, 6);
  band(c, 8, 6, 104, 4, '#4a4552');
  rect(c, 10, 38, 100, 4, '#5b5f73', 2, 2);
  rect(c, 0, 72, 120, 20, '#3a2a26', 3, 4);
  band(c, 4, 75, 112, 3, '#6b4a3a');
  return cv;
}
