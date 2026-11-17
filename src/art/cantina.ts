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
