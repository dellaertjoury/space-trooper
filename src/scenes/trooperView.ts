/**
 * Draws the Trooper from the sprite-sheet layers: dual blade (behind), base art, tinted blade edge,
 * additive glow. Shared by the Cantina and the run so both always look identical.
 */
import Phaser from 'phaser';
import { Player } from '../game/player';
import { SABER_COLORS, SaberColor } from '../game/profile';

export interface FrameMeta { x: number; y: number; glow?: boolean; dual?: boolean }
export interface SheetMeta { frameWidth: number; frameHeight: number; feetY: number; scale: number; frames: FrameMeta[]; anims: Record<string, { frames: number[]; fps: number; loop: boolean }> }

export const TROOPER_SHEETS = ['trooper', 'trooper_glow', 'trooper_edge', 'trooper_dual', 'trooper_dual_glow', 'trooper_dual_edge'];

export function preloadTrooper(scene: Phaser.Scene) {
  for (const k of TROOPER_SHEETS) {
    if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/${k}.png`, { frameWidth: 256, frameHeight: 224 });
  }
  if (!scene.cache.json.exists('trooperMeta')) scene.load.json('trooperMeta', 'assets/trooper.json');
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
      scene.add.sprite(0, 0, key, 0).setOrigin(0.5, M.feetY / M.frameHeight).setScale(M.scale).setDepth(depth + d).setBlendMode(blend);
    this.layers.dual = mk('trooper_dual', -0.2);
    this.layers.dualEdge = mk('trooper_dual_edge', -0.15);
    this.layers.base = mk('trooper', 0);
    this.layers.edge = mk('trooper_edge', 0.05);
    this.layers.glow = mk('trooper_glow', 0.1, Phaser.BlendModes.ADD);
    this.layers.dualGlow = mk('trooper_dual_glow', 0.1, Phaser.BlendModes.ADD);
    this.color = SABER_COLORS[color].hex;
    this.dual = dual;
    this.setSaber(color, dual);
  }

  setSaber(color: SaberColor, dual: boolean) {
    this.color = SABER_COLORS[color].hex;
    this.dual = dual;
    for (const k of ['edge', 'dualEdge', 'glow', 'dualGlow']) this.layers[k].setTint(this.color);
    this.layers.edge.setAlpha(0.92); this.layers.dualEdge.setAlpha(0.92);
    this.layers.glow.setAlpha(0.85); this.layers.dualGlow.setAlpha(0.85);
  }

  /** Pick the animation frame for the player's current state and place every layer. */
  update(p: Player, alpha = 1) {
    const M = this.meta, b = p.body;
    const a = p.anim();
    const A = M.anims[a.name] ?? M.anims.idle;
    const step = 60 / A.fps;
    let k = Math.floor(a.t / step);
    k = A.loop ? k % A.frames.length : Math.min(k, A.frames.length - 1);
    if (a.name.startsWith('saber')) {
      const c = p.combo(Number(a.name.slice(5)));
      k = a.t < c.windup ? 0 : a.t < c.windup + c.active ? 1 : 2; // pin the strike frame to the hit window
    }
    const fi = A.frames[k];
    const fm = M.frames[fi];
    let face = p.facing;
    if (p.state === 'wall') face = p.wallDir;
    const px = b.x + b.w / 2;
    const py = p.state === 'ledge' ? b.y + 66 : b.y + b.h; // the hang pose's hands sit ~60 px above its feet
    const saberOut = p.weapon === 'saber';
    for (const [key, s] of Object.entries(this.layers)) {
      const isDual = key.startsWith('dual');
      const isBlade = key !== 'base';
      const show = !isBlade || (saberOut && (isDual ? this.dual && !!fm.dual : !!fm.glow));
      s.setVisible(show).setFrame(fi).setFlipX(face < 0).setPosition(px, py);
      if (key === 'base') s.setAlpha(alpha);
    }
  }

  get x() { return this.layers.base.x; }
  get y() { return this.layers.base.y; }

  destroy() { for (const s of Object.values(this.layers)) s.destroy(); }
}
