/** Tile grid + pixel-exact collision (integer positions with sub-pixel remainders). */
export const T = 24; // tile size in pixels

export const enum Tile {
  Empty = 0,
  Solid = 1,
  OneWay = 2, // platform you can jump up through and drop down through
}

export interface Rect { x: number; y: number; w: number; h: number }

export class TileMap {
  readonly tiles: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.tiles = new Uint8Array(w * h);
  }
  get(tx: number, ty: number): Tile {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return Tile.Solid;
    return this.tiles[ty * this.w + tx] as Tile;
  }
  set(tx: number, ty: number, t: Tile) {
    if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) this.tiles[ty * this.w + tx] = t;
  }
  fill(x0: number, y0: number, x1: number, y1: number, t: Tile) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  get pixelW() { return this.w * T; }
  get pixelH() { return this.h * T; }

  /** Does the rect overlap a solid tile? */
  solidAt(r: Rect): boolean {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 1) / T);
    const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 1) / T);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) if (this.get(tx, ty) === Tile.Solid) return true;
    return false;
  }

  /** One-way tiles block only a body whose feet are exactly on the tile's top edge, moving down. */
  oneWayBelow(r: Rect): boolean {
    const feet = r.y + r.h; // y of the first row below the body
    if (feet % T !== 0) return false;
    const ty = feet / T;
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 1) / T);
    for (let tx = x0; tx <= x1; tx++) if (this.get(tx, ty) === Tile.OneWay) return true;
    return false;
  }
}

export interface Body extends Rect {
  rx: number; // sub-pixel remainders
  ry: number;
  ignoreOneWay: boolean;
}

/** Move horizontally pixel by pixel. Returns true if blocked. */
export function moveX(map: TileMap, b: Body, amount: number): boolean {
  b.rx += amount;
  let move = Math.round(b.rx);
  if (move === 0) return false;
  b.rx -= move;
  const sign = Math.sign(move);
  while (move !== 0) {
    if (map.solidAt({ x: b.x + sign, y: b.y, w: b.w, h: b.h })) {
      b.rx = 0;
      return true;
    }
    b.x += sign;
    move -= sign;
  }
  return false;
}

/** Move vertically pixel by pixel; one-way platforms stop downward movement. Returns true if blocked. */
export function moveY(map: TileMap, b: Body, amount: number): boolean {
  b.ry += amount;
  let move = Math.round(b.ry);
  if (move === 0) return false;
  b.ry -= move;
  const sign = Math.sign(move);
  while (move !== 0) {
    if (sign > 0 && !b.ignoreOneWay && map.oneWayBelow(b)) {
      b.ry = 0;
      return true;
    }
    if (map.solidAt({ x: b.x, y: b.y + sign, w: b.w, h: b.h })) {
      b.ry = 0;
      return true;
    }
    b.y += sign;
    move -= sign;
  }
  return false;
}

export function onGround(map: TileMap, b: Body): boolean {
  return map.solidAt({ x: b.x, y: b.y + 1, w: b.w, h: b.h }) || (!b.ignoreOneWay && map.oneWayBelow(b));
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
