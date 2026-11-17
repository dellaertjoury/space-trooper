/** The whole game world, stepped at a fixed 60 Hz. Deterministic: same seed + inputs = same result. */
import { InputFrame } from '../core/input';
import { Rng } from '../core/rng';
import { overlaps, Rect, T, TileMap } from '../core/tilemap';
import { LevelDef, testRoom } from './level';
import { GameEvent, Player, TUNE } from './player';
import { DEFAULT_LOADOUT, Loadout } from './profile';

export interface Bolt { x: number; y: number; vx: number; vy: number; life: number; dead: boolean; dmg: number; drone?: boolean }

export interface Dummy {
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  flash: number; respawn: number; lastHitId: number; knock: number;
  homeX: number;
}

export class Sim {
  frame = 0;
  level: LevelDef;
  map: TileMap;
  player: Player;
  bolts: Bolt[] = [];
  dummies: Dummy[] = [];
  events: GameEvent[] = [];
  rng: Rng;
  stats = { kills: 0, damage: 0, jumps: 0, rolls: 0, shots: 0, slashes: 0, credits: 0 };
  /** companion drone (turret droid) */
  drone: { x: number; y: number; cd: number } | null = null;
  exitRequested = false;
  freeze = 0; // hit-stop frames
  private pendingPressed = 0;

  constructor(readonly seed = 1, readonly loadout: Loadout = DEFAULT_LOADOUT) {
    this.rng = new Rng(seed);
    this.level = testRoom();
    this.map = this.level.map;
    this.player = new Player(this.level.spawn.x, this.level.spawn.y, loadout);
    if (loadout.droid === 'turret') this.drone = { x: this.level.spawn.x - 20, y: this.level.spawn.y - 20, cd: 60 };
    for (const d of this.level.dummies) {
      this.dummies.push({ x: d.x - 14, y: d.y - 46, w: 28, h: 46, hp: 60, maxHp: 60, flash: 0, respawn: 0, lastHitId: -1, knock: 0, homeX: d.x - 14 });
    }
  }

  step(inp: InputFrame) {
    this.frame++;
    this.events = [];
    // hit-stop: the world pauses for a few frames on a hit; presses made meanwhile are kept
    if (this.freeze > 0) { this.freeze--; this.pendingPressed |= inp.pressed; return; }
    if (this.pendingPressed) { inp = { ...inp, pressed: inp.pressed | (this.pendingPressed & inp.held) }; this.pendingPressed = 0; }
    const p = this.player;
    p.update(this.map, inp, this.events, (x, y, dir) => {
      this.bolts.push({ x, y, vx: dir * TUNE.boltSpeed, vy: 0, life: 70, dead: false, dmg: Math.round(7 * this.loadout.blasterDmg) });
      this.stats.shots++;
    });

    // turret drone: follows behind the shoulder, fires an aimed bolt at the nearest droid in range
    if (this.drone) {
      const d = this.drone, b = p.body;
      const tx = b.x + b.w / 2 - p.facing * 26, ty = b.y - 14;
      d.x += (tx - d.x) * 0.12; d.y += (ty - d.y) * 0.12;
      if (d.cd > 0) d.cd--;
      else {
        let best: Dummy | null = null, bd = 320;
        for (const t of this.dummies) {
          if (t.respawn > 0) continue;
          const dist = Math.hypot(t.x + t.w / 2 - d.x, t.y + t.h / 2 - d.y);
          if (dist < bd) { bd = dist; best = t; }
        }
        if (best) {
          const dx = best.x + best.w / 2 - d.x, dy = best.y + best.h / 2 - d.y, len = Math.hypot(dx, dy) || 1;
          this.bolts.push({ x: d.x, y: d.y, vx: (dx / len) * 9, vy: (dy / len) * 9, life: 60, dead: false, dmg: 6, drone: true });
          this.events.push({ type: 'shoot', x: d.x, y: d.y, dir: Math.sign(dx) || 1 });
          d.cd = 90;
        }
      }
    }

    // exit door: press Up in front of it to leave for the Cantina
    const ex = this.level.exit;
    if (ex && (inp.pressed & 4) && overlaps(p.body, ex)) { this.exitRequested = true; this.events.push({ type: 'exit', x: ex.x, y: ex.y }); }

    // saber hits
    const hb = p.saberHitbox();
    if (hb) {
      for (const d of this.dummies) {
        if (d.respawn > 0 || d.lastHitId === p.attack.id) continue;
        if (overlaps(hb, d)) {
          d.lastHitId = p.attack.id;
          const dmg = Math.round([10, 12, 24][p.attack.stage - 1] * this.loadout.saberDmg);
          const dir = Math.sign(d.x + d.w / 2 - p.cx) || p.facing; // the staff's rear blade knocks backwards
          this.hit(d, dmg, dir, p.attack.stage === 3 ? 6 : 3);
        }
      }
    }

    // bolts
    for (const b of this.bolts) {
      const steps = 3;
      for (let i = 0; i < steps && !b.dead; i++) {
        b.x += b.vx / steps;
        b.y += b.vy / steps;
        const r: Rect = { x: b.x - 6, y: b.y - 2, w: 12, h: 4 };
        if (this.map.solidAt(r)) {
          b.dead = true;
          this.events.push({ type: 'boltwall', x: b.x, y: b.y, dir: Math.sign(b.vx) });
          break;
        }
        for (const d of this.dummies) {
          if (d.respawn > 0 || !overlaps(r, d)) continue;
          b.dead = true;
          this.hit(d, b.dmg, Math.sign(b.vx) || 1, 1.5);
          break;
        }
      }
      if (--b.life <= 0) b.dead = true;
    }
    this.bolts = this.bolts.filter((b) => !b.dead);

    // dummies: flash, knockback spring, respawn
    for (const d of this.dummies) {
      if (d.flash > 0) d.flash--;
      if (d.respawn > 0 && --d.respawn === 0) { d.hp = d.maxHp; d.x = d.homeX; }
      d.x += d.knock;
      d.knock *= 0.75;
      d.x += (d.homeX - d.x) * 0.08;
      if (Math.abs(d.knock) < 0.05) d.knock = 0;
    }

    for (const e of this.events) {
      if (e.type === 'jump' || e.type === 'doublejump' || e.type === 'walljump') this.stats.jumps++;
      if (e.type === 'roll') this.stats.rolls++;
      if (e.type === 'slash') this.stats.slashes++;
    }
  }

  private hit(d: Dummy, dmg: number, dir: number, knock: number) {
    d.hp -= dmg;
    d.flash = 6;
    d.knock = dir * knock;
    this.stats.damage += dmg;
    this.events.push({ type: 'hit', x: d.x + d.w / 2, y: d.y, dmg, dir });
    this.freeze = Math.max(this.freeze, dmg >= 20 ? 6 : 3);
    if (d.hp <= 0) {
      d.respawn = 150;
      this.stats.kills++;
      this.stats.credits += 15;
      this.events.push({ type: 'kill', x: d.x + d.w / 2, y: d.y + d.h / 2 });
    }
  }

  /** Place the player standing on the floor below tile (tx, ty). Deterministic, used by tests and replays. */
  teleport(tx: number, ty: number) {
    const p = this.player, b = p.body;
    b.x = tx * T + 2; b.y = ty * T - b.h; b.rx = b.ry = 0; p.vx = p.vy = 0;
    if (this.drone) { this.drone.x = b.x - 20; this.drone.y = b.y - 14; }
  }

  /** Rules that must hold every frame. The Developer agent checks these. */
  invariants(): string[] {
    const p = this.player, b = p.body, out: string[] = [];
    const num = [b.x, b.y, p.vx, p.vy, b.rx, b.ry];
    if (num.some((n) => !Number.isFinite(n))) out.push('player has a non-finite position or velocity');
    if (this.map.solidAt(b) && p.state !== 'climb') out.push(`player overlaps a solid tile in state ${p.state}`);
    if (b.x < 0 || b.y < 0 || b.x + b.w > this.map.pixelW || b.y + b.h > this.map.pixelH) out.push('player outside level bounds');
    if (Math.abs(p.vx) > 20 || Math.abs(p.vy) > 20) out.push(`impossible velocity vx=${p.vx.toFixed(2)} vy=${p.vy.toFixed(2)}`);
    if (b.h !== 56 && p.state !== 'roll') out.push(`hitbox height ${b.h} outside a roll (state ${p.state})`);
    if (p.attack.stage < 0 || p.attack.stage > 3) out.push('invalid combo stage');
    if (this.bolts.length > 60) out.push('bolt leak: more than 60 bolts alive');
    return out;
  }

  /** Small fingerprint of the world, used to prove replays are deterministic. */
  hash(): string {
    const p = this.player, b = p.body;
    const parts = [this.frame, b.x, b.y, b.h, p.vx.toFixed(4), p.vy.toFixed(4), p.state, p.attack.stage, this.bolts.length,
      ...this.dummies.map((d) => d.hp + ':' + d.x.toFixed(2))];
    let h = 2166136261;
    for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0).toString(16);
  }

  snapshot() {
    const p = this.player, b = p.body;
    return {
      frame: this.frame, seed: this.seed, level: this.level.name, loadout: this.loadout,
      drone: this.drone ? { x: +this.drone.x.toFixed(1), y: +this.drone.y.toFixed(1) } : null,
      player: { x: b.x, y: b.y, w: b.w, h: b.h, tileX: Math.floor((b.x + b.w / 2) / T), tileY: Math.floor((b.y + b.h - 1) / T), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), state: p.state, facing: p.facing, weapon: p.weapon, hp: p.hp, combo: p.attack.stage, airJumps: p.airJumps },
      bolts: this.bolts.length,
      dummies: this.dummies.map((d) => ({ hp: d.hp, alive: d.respawn === 0 })),
      stats: { ...this.stats },
    };
  }
}

/** Run a fresh, render-free simulation: used by the agents to search thousands of input sequences quickly. */
export function simulate(seed: number, masks: number[], start?: { tx: number; ty: number }, checkEvery = 1, loadout?: Loadout) {
  const sim = new Sim(seed, loadout);
  if (start) sim.teleport(start.tx, start.ty);
  let prev = 0;
  const violations: { frame: number; msgs: string[] }[] = [];
  const trace: { x: number; y: number; state: string; f: number }[] = [];
  let minY = Infinity, maxX = -Infinity, invulnFrames = 0;
  for (let i = 0; i < masks.length; i++) {
    const held = masks[i];
    sim.step({ held, pressed: held & ~prev, released: prev & ~held });
    prev = held;
    const b = sim.player.body;
    if (b.y < minY) minY = b.y;
    if (sim.player.invulnerable) invulnFrames++;
    if (b.x > maxX) maxX = b.x;
    if (i % checkEvery === 0) {
      const v = sim.invariants();
      if (v.length) { violations.push({ frame: i, msgs: v }); if (violations.length > 5) break; }
    }
    if (i % 2 === 0) trace.push({ x: b.x, y: b.y, state: sim.player.state, f: i });
  }
  return { state: sim.snapshot(), hash: sim.hash(), violations, minY, maxX, trace, invulnFrames };
}
