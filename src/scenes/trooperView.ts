/**
 * Sprite views for the Trooper and the enemies, built from the sheets cut by tools/art/chars_extract.py.
 * Every frame is anchored on the character's feet (feetY) and centred on the head, so flipping is free.
 * The Trooper's saber is split into layers: base art, tinted halo, white-hot core, additive glow,
 * so the blade takes whatever crystal colour is equipped. Dual form adds a mirrored rear blade.
 */
import Phaser from 'phaser';
import { CHAR_SCALE, Player } from '../game/player';
import { Enemy, enemyAnim } from '../game/enemies';
import { SABER_COLORS, SaberColor } from '../game/profile';

export interface FrameMeta { glow?: boolean; h: number }
export interface Anim { frames: number[]; fps: number; loop: boolean }
export interface SheetMeta { frameWidth: number; frameHeight: number; feetY: number; scale: number; frames: FrameMeta[]; anims: Record<string, Anim> }

const SHEETS: Record<string, string[]> = {
  trooper: ['trooper', 'trooper_halo', 'trooper_core', 'trooper_glow'],
  raider: ['raider'],
  gunner: ['gunner'],
};
const SIZE: Record<string, [number, number]> = { trooper: [320, 182], raider: [488, 170], gunner: [288, 176] };

export function preloadChar(scene: Phaser.Scene, name: keyof typeof SHEETS) {
  const [fw, fh] = SIZE[name];
  for (const k of SHEETS[name]) if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/${k}.png`, { frameWidth: fw, frameHeight: fh });
  if (!scene.cache.json.exists(name + 'Meta')) scene.load.json(name + 'Meta', `assets/${name}.json`);
}
export const preloadTrooper = (scene: Phaser.Scene) => preloadChar(scene, 'trooper');

function frameFor(A: Anim, t: number): number {
  const step = 60 / A.fps;
  let k = Math.floor(t / step);
  k = A.loop ? k % A.frames.length : Math.min(k, A.frames.length - 1);
  return A.frames[k];
}

export class TrooperView {
  readonly meta: SheetMeta;
  private layers: Record<string, Phaser.GameObjects.Sprite> = {};
  color: number;
  dual: boolean;

  constructor(private scene: Phaser.Scene, color: SaberColor, dual: boolean, depth = 2) {
    this.meta = scene.cache.json.get('trooperMeta');
    const M = this.meta;
    const mk = (key: string, d: number, blend = Phaser.BlendModes.NORMAL) =>
      scene.add.sprite(0, 0, key, 0).setOrigin(0.5, M.feetY / M.frameHeight).setScale(M.scale * CHAR_SCALE).setDepth(depth + d).setBlendMode(blend);
    this.layers.rearHalo = mk('trooper_halo', -0.2);
    this.layers.rearCore = mk('trooper_core', -0.19);
    this.layers.rearGlow = mk('trooper_glow', -0.18, Phaser.BlendModes.ADD);
    this.layers.base = mk('trooper', 0);
    this.layers.halo = mk('trooper_halo', 0.05);
    this.layers.core = mk('trooper_core', 0.06);
    this.layers.glow = mk('trooper_glow', 0.1, Phaser.BlendModes.ADD);
    this.color = SABER_COLORS[color].hex;
    this.dual = dual;
    this.setSaber(color, dual);
  }

  setSaber(color: SaberColor, dual: boolean) {
    this.color = SABER_COLORS[color].hex;
    this.dual = dual;
    for (const k of ['halo', 'glow', 'rearHalo', 'rearGlow']) this.layers[k].setTint(this.color);
    this.layers.halo.setAlpha(0.95); this.layers.rearHalo.setAlpha(0.8);
    this.layers.glow.setAlpha(0.9); this.layers.rearGlow.setAlpha(0.7);
  }

  /** Pick the animation frame for the player's current state and place every layer. */
  update(p: Player, alpha = 1) {
    const M = this.meta, b = p.body;
    const a = p.anim();
    const A = M.anims[a.name] ?? M.anims.idle;
    let fi: number;
    if (a.name.startsWith('saber')) {
      const c = p.combo(Number(a.name.slice(5)));
      // play the whole swing, timed to the combo: frames 0-2 wind up, 3-5 land in the hit window, 6 recovers
      let k: number;
      if (a.t < c.windup) k = Math.min(2, Math.floor((a.t / c.windup) * 3));
      else if (a.t < c.windup + c.active) k = 3 + Math.min(2, Math.floor(((a.t - c.windup) / c.active) * 3));
      else k = 6;
      fi = A.frames[Math.min(k, A.frames.length - 1)];
    } else fi = frameFor(A, a.t);
    const fm = M.frames[fi];
    let face = p.facing;
    if (p.state === 'wall') face = p.wallDir; // hugging the wall
    const px = b.x + b.w / 2;
    // hanging: the frame's top (the hands) sits on the ledge
    const py = p.state === 'ledge' ? b.y + 6 + fm.h * CHAR_SCALE : b.y + b.h;
    const blade = p.weapon === 'saber' && !!fm.glow;
    for (const [key, s] of Object.entries(this.layers)) {
      const rear = key.startsWith('rear');
      const show = key === 'base' || (blade && (!rear || this.dual));
      s.setVisible(show);
      if (!show) continue;
      s.setFrame(fi).setPosition(px, py).setFlipX(rear ? face > 0 : face < 0);
      if (key === 'base') s.setAlpha(alpha);
    }
  }

  get x() { return this.layers.base.x; }
  get y() { return this.layers.base.y; }

  destroy() { for (const s of Object.values(this.layers)) s.destroy(); }
}

/** A Dune Raider on screen. */
export class EnemyView {
  readonly meta: SheetMeta;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, readonly e: Enemy, depth = 1.8) {
    this.meta = scene.cache.json.get(e.kind + 'Meta');
    const M = this.meta;
    this.sprite = scene.add.sprite(0, 0, e.kind, 0).setOrigin(0.5, M.feetY / M.frameHeight).setScale(M.scale * CHAR_SCALE).setDepth(depth);
    this.bar = scene.add.graphics().setDepth(depth + 0.1);
  }

  update() {
    const e = this.e, b = e.body, M = this.meta;
    const a = enemyAnim(e);
    const A = M.anims[a.name] ?? M.anims.idle;
    this.sprite.setFrame(frameFor(A, a.t)).setPosition(b.x + b.w / 2, b.y + b.h).setFlipX(e.facing < 0);
    if (e.flash > 0) this.sprite.setTintFill(0xffffff); else this.sprite.clearTint();
    // telegraph: the wind-up glows red so the player can read the attack coming
    if (e.state === 'windup' && e.flash === 0) this.sprite.setTint(e.t % 8 < 4 ? 0xff8a7a : 0xffffff);
    this.sprite.setAlpha(e.state === 'dead' ? Math.max(0, 1 - Math.max(0, e.t - 60) / 40) : 1);
    this.bar.clear();
    if (e.state !== 'dead' && e.hp < e.maxHp) {
      this.bar.fillStyle(0x140e1e).fillRect(b.x - 4, b.y - 12, b.w + 8, 5);
      this.bar.fillStyle(0xff4a5a).fillRect(b.x - 3, b.y - 11, (b.w + 6) * (e.hp / e.maxHp), 3);
    }
  }

  destroy() { this.sprite.destroy(); this.bar.destroy(); }
}
