/**
 * The Space Trooper: movement + weapons state machine. Pure logic, no rendering,
 * so it runs identically in the game, in replays and inside the test agents.
 * Units: pixels and frames (60 per second).
 */
import { BTN, InputFrame } from '../core/input';
import { Body, moveX, moveY, onGround, T, Tile, TileMap, Rect } from '../core/tilemap';

export const TUNE = {
  runSpeed: 3.6,
  groundAccel: 0.7,
  groundDecel: 0.9,
  airAccel: 0.45,
  gravity: 0.46,
  apexGravity: 0.2, // floatier top of the jump while jump is held
  apexBand: 2.4,    // |vy| below this counts as the top of the jump
  maxFall: 9.5,
  fastFall: 12,
  jumpVel: -9.4,
  doubleJumpVel: -8.2,
  jumpCut: 0.45, // releasing jump early cuts upward speed
  coyoteFrames: 6,
  bufferFrames: 7,
  rollFrames: 24,
  rollSpeed: 7,
  rollIframes: [2, 18] as [number, number],
  rollCooldown: 8,
  wallSlideMax: 2.2,
  wallJumpVx: 5.5,
  wallJumpVy: -8.8,
  wallJumpLock: 10,
  climbFrames: 18,
  dropFrames: 12,
  shootCooldown: 13,
  boltSpeed: 12,
};

const STAND_H = 56, ROLL_H = 22, W = 20;
/** muzzle of the blaster relative to the hitbox centre / top, measured on the shooting frames */
export const MUZZLE = { dx: 30, dy: 11 };

export type Weapon = 'blaster' | 'saber';
export type PState = 'ground' | 'air' | 'roll' | 'wall' | 'ledge' | 'climb' | 'hurt' | 'dead';

/** Saber combo: windup, active, recovery (frames), damage, hitbox relative to the front of the body */
export const COMBO = [
  { windup: 5, active: 5, recover: 12, dmg: 10, lunge: 2.5, box: { dx: 4, dy: -6, w: 50, h: 52 } },
  { windup: 4, active: 5, recover: 12, dmg: 12, lunge: 2.5, box: { dx: 2, dy: -24, w: 48, h: 64 } },
  { windup: 8, active: 6, recover: 18, dmg: 24, lunge: 4.0, box: { dx: 4, dy: -4, w: 60, h: 62 } },
];

export interface GameEvent {
  type: 'exit' | 'hurt' | 'death' | 'loot' | 'enemyshoot' | 'enemyswing' | 'jump' | 'doublejump' | 'walljump' | 'land' | 'roll' | 'slash' | 'shoot' | 'swap' | 'ledge' | 'climb' | 'drop' | 'hit' | 'kill' | 'boltwall';
  x: number;
  y: number;
  dir?: number;
  dmg?: number;
  stage?: number;
}

export class Player {
  body: Body;
  vx = 0;
  vy = 0;
  facing = 1;
  state: PState = 'air';
  hp = 100;
  maxHp = 100;
  weapons: Weapon[] = ['blaster', 'saber']; // testing build: both from the start
  weapon: Weapon = 'saber';

  coyote = 0;
  buffer = 0;
  airJumps = 1;
  rollT = 0;
  rollCd = 0;
  wallDir = 0;
  wallLock = 0;
  ledge = { tx: 0, top: 0, dir: 0 };
  climbT = 0;
  climbFrom = { x: 0, y: 0 };
  climbTo = { x: 0, y: 0 };
  ledgeCd = 0;
  dropT = 0;
  iframes = 0;

  attack = { stage: 0, t: 0, queued: false, id: 0, air: false };
  shootCd = 0;
  shootT = 0;
  landT = 0;
  djT = 0; // double-jump animation timer
  wjT = 0; // wall-jump (backflip) animation timer
  framesInState = 0;

  dual = false;
  rollCooldownFrames = TUNE.rollCooldown;
  shield = 0;
  private comboTable = COMBO;

  constructor(x: number, y: number, opts?: { maxHp: number; shield: number; dual: boolean; rollCooldown: number }) {
    this.body = { x, y, w: W, h: STAND_H, rx: 0, ry: 0, ignoreOneWay: false };
    if (opts) {
      this.maxHp = this.hp = opts.maxHp;
      this.shield = opts.shield;
      this.dual = opts.dual;
      this.rollCooldownFrames = opts.rollCooldown;
      // vibro-staff: 20% faster swings
      if (opts.dual) this.comboTable = COMBO.map((c) => ({ ...c, windup: Math.max(2, Math.round(c.windup * 0.8)), active: c.active, recover: Math.round(c.recover * 0.8) }));
    }
  }

  combo(stage: number) { return this.comboTable[stage - 1]; }

  get cx() { return this.body.x + this.body.w / 2; }
  get feet() { return this.body.y + this.body.h; }
  get invulnerable() { return this.iframes > 0 || (this.state === 'roll' && this.rollT >= TUNE.rollIframes[0] && this.rollT <= TUNE.rollIframes[1]); }

  /**
   * Take a hit from an enemy. Rolls (i-frames) and the post-hit flicker ignore it; the overshield
   * soaks damage first. Returns true if the hit landed.
   */
  damage(map: TileMap, dmg: number, dir: number, events: GameEvent[]): boolean {
    if (this.state === 'dead' || this.invulnerable) return false;
    const soaked = Math.min(this.shield, dmg);
    this.shield -= soaked;
    this.hp = Math.max(0, this.hp - (dmg - soaked));
    this.attack.stage = 0;
    this.iframes = 50;
    // caught at the end of a roll: stand up first (if there is no room, the roll simply carries on)
    const canStand = this.body.h === STAND_H || this.setHeight(map, STAND_H);
    events.push({ type: 'hurt', x: this.cx, y: this.body.y + 20, dmg, dir });
    if (this.hp <= 0) {
      this.setState('dead');
      this.vx = 0;
      events.push({ type: 'death', x: this.cx, y: this.body.y + 20 });
      return true;
    }
    if (!canStand) return true;
    this.vx = dir * 3.2;
    this.vy = -4;
    this.setState('hurt');
    return true;
  }

  /** Current saber hitbox in world space, or null. */
  saberHitbox(): Rect | null {
    const a = this.attack;
    if (!a.stage) return null;
    const c = this.combo(a.stage);
    if (a.t < c.windup || a.t >= c.windup + c.active) return null;
    const b = this.body;
    let x = this.facing > 0 ? b.x + b.w + c.box.dx - 8 : b.x - c.box.dx - c.box.w + 8;
    let w = c.box.w;
    if (this.dual) { // the staff's rear blade also hits behind
      const back = 30;
      if (this.facing > 0) { x -= b.w + back; w += b.w + back; } else { w += b.w + back; }
    }
    return { x, y: b.y + c.box.dy, w, h: c.box.h };
  }

  private setState(s: PState) {
    if (s !== this.state) { this.state = s; this.framesInState = 0; }
  }

  private setHeight(map: TileMap, h: number): boolean {
    const b = this.body;
    const ny = b.y + b.h - h;
    if (h > b.h && map.solidAt({ x: b.x, y: ny, w: b.w, h })) return false;
    b.y = ny; b.h = h;
    return true;
  }

  private touchingWall(map: TileMap, dir: number): boolean {
    const b = this.body;
    return map.solidAt({ x: b.x + dir, y: b.y + 8, w: b.w, h: b.h - 16 });
  }

  /** Is there a grabbable ledge in front of the hands right now? */
  private findLedge(map: TileMap, dir: number): { tx: number; top: number } | null {
    const b = this.body;
    const tx = Math.floor((dir > 0 ? b.x + b.w : b.x - 1) / T);
    // the grab window (20 px) must be wider than the fastest fall per frame (13 px), or a fast fall skips it
    for (let ty = Math.floor((b.y - 4) / T); ty <= Math.floor((b.y + 16) / T); ty++) {
      const top = ty * T;
      if (top < b.y - 4 || top > b.y + 16) continue;
      if (map.get(tx, ty) !== Tile.Solid || map.get(tx, ty - 1) === Tile.Solid) continue;
      // room to stand on top of the ledge?
      const standX = dir > 0 ? tx * T : (tx + 1) * T - b.w;
      if (map.solidAt({ x: standX, y: top - STAND_H, w: b.w, h: STAND_H })) continue;
      // nothing above the hands on our side
      if (map.solidAt({ x: b.x, y: top - 8, w: b.w, h: 8 })) continue;
      // the hang position itself must be free (the window can reach a floor or ceiling)
      const hangX = dir > 0 ? tx * T - b.w : (tx + 1) * T;
      if (map.solidAt({ x: hangX, y: top - 6, w: b.w, h: b.h })) continue;
      return { tx, top };
    }
    return null;
  }

  update(map: TileMap, inp: InputFrame, events: GameEvent[], spawnBolt: (x: number, y: number, dir: number) => void) {
    const held = (m: number) => (inp.held & m) !== 0;
    const pressed = (m: number) => (inp.pressed & m) !== 0;
    const b = this.body;
    const dirIn = (held(BTN.RIGHT) ? 1 : 0) - (held(BTN.LEFT) ? 1 : 0);
    this.framesInState++;

    if (this.state === 'dead') { // fall to the floor and stay there
      this.vy = Math.min(TUNE.maxFall, this.vy + TUNE.gravity);
      if (moveY(map, b, this.vy)) this.vy = 0;
      return;
    }
    if (this.iframes > 0) this.iframes--;
    if (this.rollCd > 0) this.rollCd--;
    if (this.ledgeCd > 0) this.ledgeCd--;
    if (this.shootCd > 0) this.shootCd--;
    if (this.shootT > 0) this.shootT--;
    if (this.landT > 0) this.landT--;
    if (this.djT > 0) this.djT--;
    if (this.wjT > 0) this.wjT--;
    if (pressed(BTN.JUMP)) this.buffer = TUNE.bufferFrames;
    else if (this.buffer > 0) this.buffer--;
    if (this.dropT > 0 && --this.dropT === 0) b.ignoreOneWay = false;

    // ---------------- weapon swap
    if (pressed(BTN.SWAP) && !this.attack.stage && this.weapons.length > 1) {
      this.weapon = this.weapon === 'saber' ? 'blaster' : 'saber';
      events.push({ type: 'swap', x: this.cx, y: b.y });
    }

    // ---------------- ledge hang / climb are their own little worlds
    if (this.state === 'ledge') {
      this.vx = this.vy = 0;
      const d = this.ledge.dir;
      if (pressed(BTN.JUMP) && dirIn === -d) {
        this.wallJump(-d, events);
      } else if (pressed(BTN.JUMP) || pressed(BTN.UP)) {
        this.setState('climb');
        this.climbT = 0;
        this.climbFrom = { x: b.x, y: b.y };
        this.climbTo = { x: d > 0 ? this.ledge.tx * T : (this.ledge.tx + 1) * T - b.w, y: this.ledge.top - STAND_H };
        this.buffer = 0;
        events.push({ type: 'climb', x: this.cx, y: b.y });
      } else if (pressed(BTN.DOWN) || pressed(BTN.ROLL)) {
        this.setState('air');
        this.ledgeCd = 16;
      }
      return;
    }
    if (this.state === 'climb') {
      this.climbT++;
      const k = Math.min(1, this.climbT / TUNE.climbFrames);
      // up first, then over
      const ky = Math.min(1, k * 1.6), kx = Math.max(0, (k - 0.45) / 0.55);
      b.y = Math.round(this.climbFrom.y + (this.climbTo.y - this.climbFrom.y) * ky);
      if (map.solidAt(b)) b.y = this.climbTo.y;
      b.x = Math.round(this.climbFrom.x + (this.climbTo.x - this.climbFrom.x) * kx);
      if (map.solidAt(b)) { b.x = this.climbTo.x; b.y = this.climbTo.y; }
      if (k >= 1) { b.x = this.climbTo.x; b.y = this.climbTo.y; this.setState('ground'); this.airJumps = 1; }
      return;
    }

    // ---------------- drop through a one-way platform: Down while standing still on it
    // (Down is also the roll key on the keyboard, so standing still on a platform means "drop", not "roll")
    const onOneWay = this.state === 'ground' && map.oneWayBelow(b) && !map.solidAt({ ...b, y: b.y + 1 });
    let dropped = false;
    if (onOneWay && !dirIn && (pressed(BTN.DOWN) || (held(BTN.DOWN) && pressed(BTN.JUMP))) && !this.attack.stage) {
      b.ignoreOneWay = true;
      this.dropT = TUNE.dropFrames;
      this.buffer = 0;
      this.coyote = 0;
      dropped = true;
      events.push({ type: 'drop', x: this.cx, y: this.feet });
    }

    // ---------------- roll
    if (!dropped && pressed(BTN.ROLL) && this.state !== 'roll' && this.rollCd === 0 && this.state !== 'hurt') {
      const a = this.attack;
      const cancellable = !a.stage || a.t >= this.combo(a.stage).windup + this.combo(a.stage).active;
      if (cancellable) {
        if (dirIn) this.facing = dirIn;
        this.attack.stage = 0;
        this.setHeight(map, ROLL_H);
        this.setState('roll');
        this.rollT = 0;
        events.push({ type: 'roll', x: this.cx, y: this.feet, dir: this.facing });
      }
    }

    const grounded = onGround(map, b);

    if (this.state === 'roll') {
      this.rollT++;
      this.vx = this.facing * TUNE.rollSpeed * (this.rollT > TUNE.rollFrames - 5 ? 0.6 : 1);
      if (this.rollT >= TUNE.rollFrames) {
        if (this.setHeight(map, STAND_H)) {
          this.setState(grounded ? 'ground' : 'air');
          this.rollCd = this.rollCooldownFrames;
        } else {
          this.rollT = TUNE.rollFrames - 6; // can't stand up yet (low tunnel): keep rolling
        }
      }
      // jumping out of a roll is allowed once the dodge window has passed
      if (this.buffer && grounded && this.rollT > TUNE.rollIframes[1] && this.setHeight(map, STAND_H)) {
        this.setState('ground');
      }
    }

    // ---------------- attacks
    const a = this.attack;
    if (pressed(BTN.ATTACK) && this.state !== 'roll' && this.state !== 'hurt') {
      if (this.weapon === 'saber') {
        if (!a.stage) this.startSwing(1, !grounded, events);
        else a.queued = true;
      }
    }
    if (this.weapon === 'blaster' && held(BTN.ATTACK) && this.shootCd === 0 && this.state !== 'roll' && this.state !== 'hurt') {
      this.shootCd = TUNE.shootCooldown;
      this.shootT = 10;
      const by = b.y + MUZZLE.dy; // the blaster's muzzle in the shooting frames (chest height)
      spawnBolt(this.cx + this.facing * MUZZLE.dx, by, this.facing);
      events.push({ type: 'shoot', x: this.cx + this.facing * MUZZLE.dx, y: by, dir: this.facing });
    }
    if (a.stage) {
      a.t++;
      const c = this.combo(a.stage);
      if (a.t === c.windup) {
        if (!a.air) this.vx = this.facing * c.lunge;
        events.push({ type: 'slash', x: this.cx, y: b.y, dir: this.facing, stage: a.stage });
      }
      const end = c.windup + c.active + c.recover;
      if (a.queued && a.t >= c.windup + c.active && a.stage < 3 && !a.air) {
        this.startSwing(a.stage + 1, false, events);
      } else if (a.t >= end) {
        a.stage = 0;
      }
    }

    // ---------------- horizontal movement
    const attacking = a.stage > 0;
    if (this.state !== 'roll') {
      if (this.wallLock > 0) this.wallLock--;
      else {
        const target = attacking && grounded ? 0 : dirIn * TUNE.runSpeed;
        const accel = grounded ? (dirIn && !attacking ? TUNE.groundAccel : TUNE.groundDecel) : TUNE.airAccel;
        if (attacking && grounded) this.vx *= 0.82;
        else if (this.vx < target) this.vx = Math.min(target, this.vx + accel);
        else if (this.vx > target) this.vx = Math.max(target, this.vx - accel);
        if (dirIn && !attacking && this.shootT === 0) this.facing = dirIn;
        else if (dirIn && !attacking && this.shootT > 0 && grounded) this.facing = dirIn;
      }
    }

    // ---------------- jumping
    if (grounded && this.state !== 'roll') { this.coyote = TUNE.coyoteFrames; this.airJumps = 1; }
    else if (this.coyote > 0) this.coyote--;

    if (this.state !== 'roll' && this.state !== 'hurt') {
      if (dropped) {
        // already falling through
      } else if (this.buffer > 0 && this.coyote > 0) {
        this.vy = TUNE.jumpVel;
        this.buffer = 0;
        this.coyote = 0;
        a.stage = a.stage && a.t >= this.combo(a.stage).windup + this.combo(a.stage).active ? 0 : a.stage;
        events.push({ type: 'jump', x: this.cx, y: this.feet });
      } else if (this.state === 'wall' && this.buffer > 0) {
        if (this.wallTopNear(map, this.wallDir)) {
          // vault: the top of this wall is close, so jump straight up and over instead of kicking away
          this.vy = TUNE.jumpVel;
          this.vx = 0;
          this.buffer = 0;
          this.facing = this.wallDir;
          this.setState('air');
          events.push({ type: 'walljump', x: this.cx, y: b.y + 30, dir: this.wallDir });
        } else {
          this.wallJump(-this.wallDir, events);
        }
      } else if (pressed(BTN.JUMP) && !grounded && this.airJumps > 0 && this.coyote === 0) {
        this.vy = TUNE.doubleJumpVel;
        this.airJumps--;
        this.buffer = 0;
        this.djT = 16;
        events.push({ type: 'doublejump', x: this.cx, y: this.feet });
      }
    }
    if ((inp.released & BTN.JUMP) && this.vy < 0) this.vy *= TUNE.jumpCut;

    // ---------------- gravity
    const apex = Math.abs(this.vy) < TUNE.apexBand && held(BTN.JUMP);
    let maxFall = held(BTN.DOWN) ? TUNE.fastFall : TUNE.maxFall;
    if (this.state === 'wall') maxFall = TUNE.wallSlideMax;
    this.vy = Math.min(maxFall, this.vy + (apex ? TUNE.apexGravity : TUNE.gravity));
    if (this.state === 'wall' && this.vy > maxFall) this.vy = maxFall;

    // ---------------- integrate
    const wasGrounded = grounded;
    const fallSpeed = this.vy;
    if (moveX(map, b, this.vx)) this.vx = 0;
    if (moveY(map, b, this.vy)) this.vy = 0;
    const nowGrounded = onGround(map, b);

    if (!wasGrounded && nowGrounded && fallSpeed > 2) {
      events.push({ type: 'land', x: this.cx, y: this.feet, dmg: fallSpeed });
      this.landT = fallSpeed > 8 ? 8 : 4;
    }

    // ---------------- resolve the resulting state
    if (this.state === 'roll' || this.state === 'hurt') {
      if (this.state === 'hurt' && this.framesInState > 18) this.setState(nowGrounded ? 'ground' : 'air');
      return;
    }
    if (nowGrounded) { this.setState('ground'); return; }

    // wall slide / ledge grab while falling and pushing into a wall
    const pushDir = dirIn;
    if (this.vy >= 0 && pushDir && this.touchingWall(map, pushDir) && !attacking) {
      if (this.ledgeCd === 0) {
        const L = this.findLedge(map, pushDir);
        if (L) {
          this.ledge = { tx: L.tx, top: L.top, dir: pushDir };
          b.y = L.top - 6;
          b.ry = 0;
          b.x = pushDir > 0 ? L.tx * T - b.w : (L.tx + 1) * T;
          b.rx = 0;
          this.vx = this.vy = 0;
          this.facing = pushDir;
          this.airJumps = 1;
          this.setState('ledge');
          events.push({ type: 'ledge', x: this.cx, y: b.y });
          return;
        }
      }
      this.wallDir = pushDir;
      this.facing = -pushDir; // face away from the wall, ready to jump off
      this.setState('wall');
      this.airJumps = 1;
      return;
    }
    this.setState('air');
  }

  /** Is the top of the wall we cling to within vaulting reach (about 4 tiles above the head)? */
  private wallTopNear(map: TileMap, dir: number): boolean {
    const b = this.body;
    const tx = Math.floor((dir > 0 ? b.x + b.w : b.x - 1) / T);
    for (let ty = Math.floor((b.y + b.h / 2) / T); ty >= Math.floor((b.y - 100) / T); ty--) {
      if (map.get(tx, ty) !== Tile.Solid) return map.get(tx, ty + 1) === Tile.Solid && !map.solidAt({ x: b.x, y: ty * T - 8, w: b.w, h: 8 });
    }
    return false;
  }

  private wallJump(dir: number, events: GameEvent[]) {
    this.vx = dir * TUNE.wallJumpVx;
    this.vy = TUNE.wallJumpVy;
    this.facing = dir;
    this.wallLock = TUNE.wallJumpLock;
    this.wjT = 18;
    this.buffer = 0;
    this.setState('air');
    events.push({ type: 'walljump', x: this.cx, y: this.body.y + 30, dir });
  }

  private startSwing(stage: number, air: boolean, events: GameEvent[]) {
    this.attack = { stage, t: 0, queued: false, id: this.attack.id + 1, air };
  }

  /** Animation the renderer should show, plus playback time in frames. */
  anim(): { name: string; t: number } {
    const a = this.attack;
    if (this.state === 'dead') return { name: 'death', t: this.framesInState };
    if (this.state === 'hurt') return { name: 'hurt', t: this.framesInState };
    if (this.state === 'roll') return { name: 'roll', t: this.rollT };
    if (this.state === 'ledge') return { name: 'ledgehang', t: 0 };
    if (this.state === 'climb') return { name: 'climb', t: this.climbT };
    if (a.stage) return { name: 'saber' + a.stage, t: a.t };
    // the blaster only exists in the shooting frames, so show them whenever a shot was just fired
    if (this.shootT > 0 && this.state !== 'wall') return { name: 'shoot', t: 10 - this.shootT };
    if (this.state === 'wall') return { name: 'wallslide', t: this.framesInState };
    if (this.state === 'air') {
      if (this.wjT > 0) return { name: 'walljump', t: 18 - this.wjT };
      if (this.djT > 0) return { name: 'doublejump', t: 16 - this.djT };
      return { name: this.vy < 0 ? 'jump' : 'fall', t: this.framesInState };
    }
    if (this.landT > 0) return { name: 'land', t: 8 - this.landT };
    if (Math.abs(this.vx) > 2.4) return { name: 'run', t: this.framesInState };
    if (Math.abs(this.vx) > 0.4) return { name: 'walk', t: this.framesInState };
    return { name: this.weapon === 'blaster' ? 'idle_blaster' : 'idle', t: this.framesInState };
  }
}
