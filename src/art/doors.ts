/**
 * Sci-fi sliding doors in the style of the reference renders: a rounded opening with white light
 * strips and orange markers, closed by two grey leaves with orange inlays, a window, vents and a
 * keypad. Flat front view (2D), drawn at 2x like the rest of the procedural art.
 */
const S = 2;
type Ctx = CanvasRenderingContext2D;
function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * S); cv.height = Math.round(h * S);
  const c = cv.getContext('2d')!;
  c.scale(S, S);
  return [cv, c];
}
const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const ORANGE = '#f08a1e', INK = '#141012';

/** Door geometry in world px: the opening and the frame around it. */
export const DOOR = { openW: 52, openH: 92, rim: 7, top: 16 };
export const DOOR_W = DOOR.openW + DOOR.rim * 2 + 12;  // frame incl. side grooves
export const DOOR_H = DOOR.openH + DOOR.rim + DOOR.top;

/** The opening: rim, side grooves, orange markers, and the lit interior you see when the door is open. */
export function drawDoorFrame(): HTMLCanvasElement {
  const W = DOOR_W, H = DOOR_H, ox = (W - DOOR.openW) / 2, oy = DOOR.top;
  const [cv, c] = mk(W, H);
  // wall plate behind the frame
  c.fillStyle = '#3b3633'; rr(c, 0, 4, W, H - 4, 6); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  // side grooves
  for (const x of [2.5, W - 5.5]) { c.fillStyle = '#2a2624'; rr(c, x, oy + 4, 3, DOOR.openH - 10, 1.5); c.fill(); }
  // orange marker blocks above, like the reference
  c.fillStyle = ORANGE; c.fillRect(ox + 2, 6, 4, 7); c.fillRect(ox + 7, 6, 4, 7);
  c.fillStyle = '#ffd08a'; c.fillRect(ox + 2, 6, 4, 1.5); c.fillRect(ox + 7, 6, 4, 1.5);
  // rounded rim
  c.fillStyle = '#9a9894'; rr(c, ox - DOOR.rim, oy - DOOR.rim + 3, DOOR.openW + DOOR.rim * 2, DOOR.openH + DOOR.rim - 3, 12); c.fill();
  c.fillStyle = '#56514d'; rr(c, ox - DOOR.rim + 1.5, oy - DOOR.rim + 4.5, DOOR.openW + DOOR.rim * 2 - 3, DOOR.openH + DOOR.rim - 4.5, 11); c.fill();
  // interior: dark corridor with panelled walls and a warm floor light
  rr(c, ox, oy, DOOR.openW, DOOR.openH, 9);
  const g = c.createLinearGradient(0, oy, 0, oy + DOOR.openH);
  g.addColorStop(0, '#191617'); g.addColorStop(0.75, '#231d1c'); g.addColorStop(1, '#3a2a22');
  c.fillStyle = g; c.fill();
  c.save(); rr(c, ox, oy, DOOR.openW, DOOR.openH, 9); c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
  for (const x of [ox + 10, ox + DOOR.openW / 2 - 7, ox + DOOR.openW / 2 + 7, ox + DOOR.openW - 10]) { c.beginPath(); c.moveTo(x, oy + 12); c.lineTo(x, oy + DOOR.openH - 12); c.stroke(); }
  c.strokeRect(ox + 6, oy + 14, DOOR.openW - 12, DOOR.openH - 30);
  const fl = c.createLinearGradient(0, oy + DOOR.openH - 16, 0, oy + DOOR.openH);
  fl.addColorStop(0, 'rgba(255,170,90,0)'); fl.addColorStop(1, 'rgba(255,170,90,0.35)');
  c.fillStyle = fl; c.fillRect(ox, oy + DOOR.openH - 16, DOOR.openW, 16);
  c.restore();
  // white light strips down both sides of the opening
  for (const x of [ox + 1.2, ox + DOOR.openW - 3.2]) {
    for (let y = oy + 10; y < oy + DOOR.openH - 8; y += 5.5) {
      if (Math.abs(y - (oy + DOOR.openH * 0.5)) < 7) continue; // the control box breaks the strip
      c.fillStyle = '#f4f6ff'; rr(c, x, y, 2, 3.6, 1); c.fill();
    }
  }
  c.fillStyle = '#222'; c.fillRect(ox + 0.5, oy + DOOR.openH * 0.5 - 6, 3, 12);
  c.fillStyle = '#e03a2a'; c.fillRect(ox + 1, oy + DOOR.openH * 0.5 - 5, 2, 2);
  c.fillStyle = '#3a7bd5'; c.fillRect(ox + 1, oy + DOOR.openH * 0.5 + 1, 2, 3);
  return cv;
}

/** One leaf of the sliding door (left or right half of the opening). */
export function drawDoorLeaf(side: 'left' | 'right'): HTMLCanvasElement {
  const W = DOOR.openW / 2, H = DOOR.openH;
  const [cv, c] = mk(W, H);
  const L = side === 'left';
  // leaf body, chamfered at the outer top corner like the reference
  c.beginPath();
  if (L) { c.moveTo(0, 7); c.lineTo(7, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(0, H); }
  else { c.moveTo(0, 0); c.lineTo(W - 7, 0); c.lineTo(W, 7); c.lineTo(W, H); c.lineTo(0, H); }
  c.closePath();
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, L ? '#858990' : '#7b7f86'); g.addColorStop(1, L ? '#7b7f86' : '#858990');
  c.fillStyle = g; c.fill();
  c.strokeStyle = '#4c4f55'; c.lineWidth = 1; c.stroke();
  // inset panel with the orange inlay line
  const px = L ? 3 : 2.5, pw = W - 5.5;
  rr(c, px, 9, pw, H - 18, 8); c.strokeStyle = '#5d6168'; c.lineWidth = 1.2; c.stroke();
  rr(c, px + 1.6, 10.6, pw - 3.2, H - 21.2, 7); c.strokeStyle = ORANGE; c.lineWidth = 0.7; c.stroke();
  rr(c, px + 3, 12, pw - 6, H - 24, 6); c.strokeStyle = '#6a6e75'; c.lineWidth = 0.8; c.stroke();
  if (L) {
    // tall window recess + vent louvres
    rr(c, 7, 16, W - 13, 36, 5); c.fillStyle = '#5f636a'; c.fill(); c.strokeStyle = '#9aa0a8'; c.lineWidth = 0.8; c.stroke();
    rr(c, 8.5, 17.5, W - 16, 33, 4); c.fillStyle = '#6d7178'; c.fill();
    rr(c, 7, 58, W - 13, 20, 2); c.fillStyle = '#70747b'; c.fill(); c.strokeStyle = '#4c4f55'; c.stroke();
    for (let y = 60.5; y < 77; y += 2.6) { c.fillStyle = '#9ea3ab'; rr(c, 8.5, y, W - 16, 1.4, 0.7); c.fill(); }
    c.fillStyle = ORANGE; for (const [x, y] of [[8, 59], [W - 7.5, 59], [8, 76.6], [W - 7.5, 76.6]]) c.fillRect(x, y, 0.9, 0.9);
  } else {
    // orange button, slot, vents and keypad, top to bottom
    c.fillStyle = ORANGE; c.beginPath(); c.arc(W / 2 + 2, 18, 3.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c96a12'; c.beginPath(); c.arc(W / 2 + 2, 18, 2.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = ORANGE; rr(c, W / 2, 26, 4.5, 7, 1); c.fill(); c.fillStyle = '#b55c10'; c.fillRect(W / 2 + 1, 27, 2.5, 5);
    c.fillStyle = '#9ea3ab'; c.fillRect(W / 2 - 1, 37, 6.5, 2.4);
    c.fillStyle = '#8c9098'; c.fillRect(W / 2 - 0.5, 42, 6, 6); c.fillStyle = '#5d6168'; for (let i = 0; i < 3; i++) c.fillRect(W / 2 + 0.5, 43.2 + i * 1.6, 4, 0.7);
    c.fillStyle = ORANGE; rr(c, W / 2 - 0.5, 52, 6, 17, 1); c.fill();
    for (let y = 53.5; y < 68; y += 1.9) { c.fillStyle = '#9ea3ab'; c.fillRect(W / 2 + 0.6, y, 3.8, 1.1); }
    c.fillStyle = ORANGE; rr(c, W / 2, 75, 5, 5, 1); c.fill(); c.fillStyle = '#8c9098'; c.fillRect(W / 2 + 0.8, 75.8, 3.4, 3.4);
    // keypad on the seam
    c.fillStyle = '#9ea3ab'; rr(c, -0.5, 43, 5, 11, 1); c.fill(); c.fillStyle = ORANGE; c.fillRect(0, 44, 4, 4.5);
  }
  // bottom corner trims
  c.strokeStyle = ORANGE; c.lineWidth = 0.6; c.beginPath();
  if (L) { c.moveTo(3, H - 6); c.lineTo(8, H - 6); c.lineTo(10, H - 3); c.lineTo(W - 3, H - 3); }
  else { c.moveTo(W - 3, H - 6); c.lineTo(W - 8, H - 6); c.lineTo(W - 10, H - 3); c.lineTo(3, H - 3); }
  c.stroke();
  return cv;
}
