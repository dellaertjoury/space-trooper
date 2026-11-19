/**
 * A sliding door on screen: the frame (with the lit interior) and two leaves that slide into the
 * walls when the Trooper comes close. Purely visual: what the door does is up to the scene.
 */
import Phaser from 'phaser';
import { DOOR, DOOR_H, DOOR_W, drawDoorFrame, drawDoorLeaf } from '../art/doors';

export function makeDoorTextures(scene: Phaser.Scene) {
  const tex = (k: string, cv: HTMLCanvasElement) => { if (!scene.textures.exists(k)) scene.textures.addCanvas(k, cv); };
  tex('doorFrame', drawDoorFrame());
  tex('doorLeafL', drawDoorLeaf('left'));
  tex('doorLeafR', drawDoorLeaf('right'));
}

export class SlidingDoor {
  private frame: Phaser.GameObjects.Image;
  private left: Phaser.GameObjects.Image;
  private right: Phaser.GameObjects.Image;
  private open = 0;
  private readonly ox: number;
  private readonly oy: number;
  private readonly lw = DOOR.openW / 2;

  /** cx: centre of the door, floorY: the floor it stands on. */
  constructor(scene: Phaser.Scene, readonly cx: number, readonly floorY: number, depth = 0.6, readonly range = 64) {
    makeDoorTextures(scene);
    this.frame = scene.add.image(cx, floorY, 'doorFrame').setOrigin(0.5, 1).setScale(0.5).setDepth(depth);
    this.ox = cx - DOOR.openW / 2;
    this.oy = floorY - DOOR_H + DOOR.top;
    this.left = scene.add.image(this.ox, this.oy, 'doorLeafL').setOrigin(0).setScale(0.5).setDepth(depth + 0.01);
    this.right = scene.add.image(this.ox + this.lw, this.oy, 'doorLeafR').setOrigin(0).setScale(0.5).setDepth(depth + 0.01);
    this.apply();
  }

  get width() { return DOOR_W; }

  /** Ease open while the Trooper is near (same floor), shut again when he walks away. */
  update(px: number, feetY: number, forceOpen = false) {
    const near = forceOpen || (Math.abs(px - this.cx) < this.range && Math.abs(feetY - this.floorY) < 8);
    const target = near ? 1 : 0;
    this.open += (target - this.open) * 0.18;
    if (Math.abs(target - this.open) < 0.01) this.open = target;
    this.apply();
  }

  private apply() {
    const o = this.open, w = this.lw, texW = w * 2; // textures are drawn at 2x
    const hidden = o * w;
    // each leaf slides into the wall; the part inside the wall is cropped away
    this.left.setX(this.ox - hidden).setCrop(hidden * 2, 0, Math.max(0, texW - hidden * 2), DOOR.openH * 2).setVisible(o < 0.99);
    this.right.setX(this.ox + w + hidden).setCrop(0, 0, Math.max(0, texW - hidden * 2), DOOR.openH * 2).setVisible(o < 0.99);
  }

  destroy() { this.frame.destroy(); this.left.destroy(); this.right.destroy(); }
}
