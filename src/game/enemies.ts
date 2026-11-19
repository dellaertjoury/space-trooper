/**
 * Phase 3 enemies: the Dune Raider brute (melee staff) and the Dune Raider gunner (rifle).
 * Pure, deterministic logic like the player: patrol -> spot -> close in / keep distance -> telegraphed attack.
 * Every attack has a long, readable wind-up so a roll or a jump always answers it.
 */
import { Body, moveX, moveY, onGround, T, Tile, TileMap, Rect } from '../core/tilemap';

export type EnemyKind = 'raider' | 'gunner';
export type EState = 'patrol' | 'chase' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dead';

export const ENEMY = {
  raider: { hp: 70, walk: 0.9, run: 2.3, sight: 230, reach: 30, windup: 28, strike: 12, recover: 28, dmg: 14, cooldown: 30, credits: 25 },
  gunner: { hp: 45, walk: 0.8, run: 1.6, sight: 300, reach: 0, windup: 36, strike: 12, recover: 34, dmg: 10, cooldown: 50, credits: 20, keepAway: 120, boltSpeed: 6.5 },
};
/** the brute's staff while it swings, relative to the front of its body */
const SWING = { dx: -4, dy: 4, w: 52, h: 50 };
/** the gunner's muzzle relative to body centre / top (measured on the shooting frames) */
export const GUNNER_MUZZLE = { dx: 46, dy: 17 };

export interface Enemy {
  id: number;
  kind: EnemyKind;
  body: Body;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  state: EState;
  t: number;
  cd: number;
  homeX: number;
  range: number;
  flash: number;
  lastHitId: number;
  lastBoltHit: number;
  swingId: number;
  aggro: boolean;
}

export function makeEnemy(id: number, kind: EnemyKind, feetX: number, feetY: number, range = 4 * T): Enemy {
  const w = 24, h = 62; // drawn 15% larger than the sheet, like the Trooper
  return {
    id, kind, body: { x: Math.round(feetX - w / 2), y: feetY - h, w, h, rx: 0, ry: 0, ignoreOneWay: false },
    vx: 0, vy: 0, facing: -1, hp: ENEMY[kind].hp, maxHp: ENEMY[kind].hp, state: 'patrol', t: 0, cd: 0,
    homeX: feetX, range, flash: 0, lastHitId: -1, lastBoltHit: -1, swingId: 0, aggro: false,
  };
}

export const ecx = (e: Enemy) => e.body.x + e.body.w / 2;

/** Hitbox of the brute's staff during the strike, or null. */
export function swingBox(e: Enemy): Rect | null {
  if (e.kind !== 'raider' || e.state !== 'strike') return null;
  const b = e.body;
  const x = e.facing > 0 ? b.x + b.w + SWING.dx : b.x - SWING.dx - SWING.w;
  return { x, y: b.y + SWING.dy, w: SWING.w, h: SWING.h };
}

function setState(e: Enemy, s: EState) { e.state = s; e.t = 0; }

/** Clear line at chest height between two points (tiles only). */
export function lineOfSight(map: TileMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10);
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    if (map.get(Math.floor(x / T), Math.floor(y / T)) === Tile.Solid) return false;
  }
  return true;
}

/** Is there floor to stand on one step ahead (so patrols don't walk off ledges)? */
function groundAhead(map: TileMap, e: Enemy, dir: number): boolean {
  const b = e.body;
  const fx = dir > 0 ? b.x + b.w + 2 : b.x - 3;
  const t = map.get(Math.floor(fx / T), Math.floor((b.y + b.h + 2) / T));
  return t === Tile.Solid || t === Tile.OneWay;
}

function wallAhead(map: TileMap, e: Enemy, dir: number): boolean {
  const b = e.body;
  return map.solidAt({ x: b.x + dir * 3, y: b.y, w: b.w, h: b.h - 2 });
}

export interface EnemyHooks {
  target: { x: number; y: number; alive: boolean } | null; // player chest point
  fire: (e: Enemy, x: number, y: number, dir: number) => void;
}

export function updateEnemy(e: Enemy, map: TileMap, hooks: EnemyHooks) {
  const S = ENEMY[e.kind];
  const b = e.body;
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.cd > 0) e.cd--;

  const grounded = onGround(map, b);
  let want = 0; // desired horizontal speed

  if (e.state === 'dead') {
    e.vx *= 0.85;
  } else {
    const tg = hooks.target;
    const cx = ecx(e), chestY = b.y + 16;
    const dx = tg ? tg.x - cx : 0, dy = tg ? tg.y - chestY : 0;
    const sees = !!tg && tg.alive && Math.abs(dx) < S.sight && Math.abs(dy) < 70 && (Math.sign(dx) === e.facing || e.aggro || Math.abs(dx) < 60)
      && lineOfSight(map, cx, chestY, tg.x, tg.y);
    if (sees) e.aggro = true;
    if (tg && (!tg.alive || Math.abs(dx) > S.sight * 1.6 || Math.abs(dy) > 140)) e.aggro = false;

    switch (e.state) {
      case 'patrol': {
        if (e.aggro) { setState(e, 'chase'); break; }
        const off = cx - e.homeX;
        if ((e.facing > 0 && off > e.range) || (e.facing < 0 && off < -e.range)) e.facing = -e.facing;
        if (grounded && (wallAhead(map, e, e.facing) || !groundAhead(map, e, e.facing))) e.facing = -e.facing;
        // pause at each end of the beat, like a sentry
        want = e.t % 240 < 40 ? 0 : e.facing * S.walk;
        break;
      }
      case 'chase': {
        if (!e.aggro) { setState(e, 'patrol'); break; }
        e.facing = Math.sign(dx) || e.facing;
        const blocked = grounded && (wallAhead(map, e, e.facing) || !groundAhead(map, e, e.facing));
        if (e.kind === 'raider') {
          const gap = Math.abs(dx) - b.w / 2 - 10;
          if (gap <= S.reach && Math.abs(dy) < 40 && e.cd === 0) { setState(e, 'windup'); break; }
          want = blocked || gap <= S.reach ? 0 : e.facing * S.run;
        } else {
          const g = ENEMY.gunner;
          if (Math.abs(dx) < g.keepAway) {
            const away = -e.facing;
            const canBack = !(grounded && (wallAhead(map, e, away) || !groundAhead(map, e, away)));
            want = canBack ? away * S.run : 0;
          }
          if (sees && e.cd === 0 && Math.abs(dx) >= 60) { setState(e, 'windup'); want = 0; }
        }
        break;
      }
      case 'windup':
        want = 0;
        if (e.t >= S.windup) {
          setState(e, 'strike');
          if (e.kind === 'raider') { e.swingId++; e.vx = e.facing * 2.4; } // a short lunge into the swing
          else hooks.fire(e, cx + e.facing * GUNNER_MUZZLE.dx, b.y + GUNNER_MUZZLE.dy, e.facing);
        }
        break;
      case 'strike':
        want = 0;
        if (e.t >= S.strike) setState(e, 'recover');
        break;
      case 'recover':
        want = 0;
        if (e.t >= S.recover) { e.cd = S.cooldown; setState(e, e.aggro ? 'chase' : 'patrol'); }
        break;
      case 'hurt':
        if (e.t >= 16) setState(e, 'chase');
        break;
    }
  }

  // movement
  if (e.state !== 'hurt' && e.state !== 'dead' && e.state !== 'strike') {
    const acc = grounded ? 0.35 : 0.1;
    if (e.vx < want) e.vx = Math.min(want, e.vx + acc); else if (e.vx > want) e.vx = Math.max(want, e.vx - acc);
  } else if (grounded) e.vx *= 0.8;
  if (grounded && e.state !== 'dead' && e.vx !== 0 && !groundAhead(map, e, Math.sign(e.vx)) && e.state !== 'hurt') e.vx = 0; // never step off a ledge on purpose
  e.vy = Math.min(10, e.vy + 0.5);
  if (moveX(map, b, e.vx)) e.vx = 0;
  if (moveY(map, b, e.vy)) e.vy = 0;
}

/** Apply a hit. Returns true if it killed. The brute keeps its poise while swinging (no stagger). */
export function hurtEnemy(e: Enemy, dmg: number, dir: number, knock: number): boolean {
  if (e.state === 'dead') return false;
  e.hp -= dmg;
  e.flash = 6;
  e.aggro = true;
  if (e.hp <= 0) { e.hp = 0; setState(e, 'dead'); e.vx = dir * knock; e.vy = -3; return true; }
  const poise = e.kind === 'raider' && (e.state === 'strike' || (e.state === 'windup' && e.t > 12));
  if (!poise) { setState(e, 'hurt'); e.vx = dir * knock; e.facing = -dir; }
  return false;
}

/** Animation for the renderer. */
export function enemyAnim(e: Enemy): { name: string; t: number } {
  switch (e.state) {
    case 'dead': return { name: 'death', t: e.t };
    case 'hurt': return { name: 'hurt', t: e.t };
    case 'windup': return { name: 'windup', t: e.t };
    case 'strike': return { name: 'strike', t: e.t };
    case 'recover': return { name: 'recover', t: e.t };
    default:
      if (Math.abs(e.vy) > 1.5) return { name: e.vy < 0 ? 'jump' : 'fall', t: e.t };
      if (Math.abs(e.vx) > 1.4) return { name: 'run', t: e.t };
      if (Math.abs(e.vx) > 0.2) return { name: 'walk', t: e.t };
      return { name: 'idle', t: e.t };
  }
}
