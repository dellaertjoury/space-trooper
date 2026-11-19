import Phaser from 'phaser';
import { InputSystem, padCombo, rle, unrle } from '../core/input';
import { Sim, SimOptions, simulate } from '../game/sim';
import { GameEvent } from '../game/player';
import { drawBackdrop, drawBlade, drawBolt, drawDummy, drawGlow, drawLamp, drawLevel, drawSlash, drawSpark, CRATE_COLORS, drawCrateSide } from '../art/procedural';
import { Issue, IssueTracker } from '../debug/issues';
import { DEFAULT_LOADOUT, Loadout, loadoutFrom, loadProfile, Profile, SABER_COLORS, saveProfile } from '../game/profile';
import { EnemyView, preloadChar, preloadTrooper, TrooperView } from './trooperView';
import { shared } from './shared';

declare const __BUILD__: string;
export const BUILD = `v0.1-${__BUILD__}`;
export const VIEW_W = 960, VIEW_H = 540;
const STEP_MS = 1000 / 60;


export class GameScene extends Phaser.Scene {
  sim!: Sim;
  input2!: InputSystem;
  tracker!: IssueTracker;
  loadout: Loadout = DEFAULT_LOADOUT;
  private profile: Profile | null = null;
  private leaving = false;
  private acc = 0;
  private paused = false;
  private userPaused = false;
  testMode = false;
  private replayQueue: number[] | null = null;

  private view!: TrooperView;
  private droneSprite: Phaser.GameObjects.Image | null = null;
  private resTexts: Phaser.GameObjects.Text[] = [];
  private blade!: Phaser.GameObjects.Image;
  private blaster!: Phaser.GameObjects.Image;
  private bolts: Phaser.GameObjects.Image[] = [];
  private dummies: Phaser.GameObjects.Image[] = [];
  private dummyBars: Phaser.GameObjects.Graphics[] = [];
  private enemyViews: EnemyView[] = [];
  private crateViews: Phaser.GameObjects.Image[] = [];
  private deadT = 0;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private hud!: Phaser.GameObjects.Container;
  private hpBar!: Phaser.GameObjects.Graphics;
  private slotSaber!: Phaser.GameObjects.Container;
  private slotBlaster!: Phaser.GameObjects.Container;
  private banner!: Phaser.GameObjects.Text;
  private help!: Phaser.GameObjects.Container;
  private camX = 0;
  private camY = 0;
  private fpsSamples: number[] = [];
  private webgl = false;

  constructor() { super('game'); }

  preload() {
    preloadTrooper(this);
    preloadChar(this, 'raider');
    preloadChar(this, 'gunner');
    if (!this.textures.exists('droid_turret')) this.load.image('droid_turret', 'assets/cantina/droid_turret.png');
    for (const k of ['icon_health', 'icon_credit', 'icon_crystal_blue', 'icon_crystal_purple', 'icon_droidpart', 'icon_ingot', 'saber', 'blaster_heavy'])
      this.load.image('ui_' + k, `assets/ui/${k}.png`);
  }

  create(data?: { loadout?: Loadout }) {
    this.webgl = this.game.renderer.type === Phaser.WEBGL;
    this.testMode = new URLSearchParams(location.search).has('test');
    this.leaving = false;
    this.bolts = []; this.dummies = []; this.dummyBars = []; this.resTexts = []; this.enemyViews = []; this.crateViews = []; this.deadT = 0;
    // test mode always uses the default loadout so agent runs are comparable
    this.profile = this.testMode ? null : loadProfile();
    this.loadout = data?.loadout ?? (this.profile ? loadoutFrom(this.profile) : DEFAULT_LOADOUT);
    const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1) || 1;
    this.sim = new Sim(seed, this.loadout);
    this.input2 = shared.input();
    this.input2.record = [];
    this.input2.resetEdges();

    // textures
    const tex = (key: string, cv: HTMLCanvasElement) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, cv); };
    tex('level', drawLevel(this.sim.map));
    tex('bgFar', drawBackdrop(1024, VIEW_H, 0));
    tex('bgNear', drawBackdrop(1280, VIEW_H, 1));
    tex('blade', drawBlade());
    tex('bolt', drawBolt());
    tex('boltGreen', drawBolt('#3fdc6a'));
    tex('boltBlue', drawBolt('#3f9cff'));
    for (const col of Object.keys(CRATE_COLORS)) { tex(`crate_${col}`, drawCrateSide(col, false)); tex(`crate_${col}_open`, drawCrateSide(col, true)); }
    tex('slash', drawSlash());
    tex('slash3', drawSlash(42, 9));
    tex('dummy', drawDummy());
    tex('spark', drawSpark());
    tex('glowWarm', drawGlow(110, '255,150,70'));
    tex('glowCool', drawGlow(110, '70,220,255'));
    tex('glowGreen', drawGlow(110, '90,255,140'));
    tex('lampWarm', drawLamp('#ff9a3c'));
    tex('lampCool', drawLamp('#46e6ff'));
    tex('lampGreen', drawLamp('#6cff9a'));

    const SX = VIEW_W / 2, SY = VIEW_H / 2; // screen-space offset under the 2x zoom
    this.bgFar = this.add.tileSprite(SX, SY, VIEW_W, VIEW_H, 'bgFar').setOrigin(0).setScrollFactor(0).setTileScale(0.5);
    this.bgNear = this.add.tileSprite(SX, SY, VIEW_W, VIEW_H, 'bgNear').setOrigin(0).setScrollFactor(0).setAlpha(0.9).setTileScale(0.5);
    // light shafts
    const shafts = this.add.graphics().setScrollFactor(0.3).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 9; i++) { shafts.fillStyle(0x3a7fbf, 0.05); shafts.fillTriangle(200 + i * 420, -20, 260 + i * 420, -20, 120 + i * 420 + 200, 700); }

    // push the backdrop back: dim it, then a teal haze near the floor
    this.add.rectangle(SX, SY, VIEW_W, VIEW_H, 0x05070f, 0.5).setOrigin(0).setScrollFactor(0);
    const haze = this.add.graphics().setScrollFactor(0).setPosition(SX, SY).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 12; i++) { haze.fillStyle(0x1f6f7a, 0.018); haze.fillRect(0, VIEW_H - 40 - i * 14, VIEW_W, 40 + i * 14); }
    for (const l of this.sim.level.lamps) {
      const key = l.color === 'warm' ? 'Warm' : l.color === 'cool' ? 'Cool' : 'Green';
      this.add.image(l.x + 12, l.y + 12, 'glow' + key).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setScale(0.5);
    }
    this.add.image(0, 0, 'level').setOrigin(0).setScale(0.5);
    for (const l of this.sim.level.lamps) {
      const key = l.color === 'warm' ? 'Warm' : l.color === 'cool' ? 'Cool' : 'Green';
      this.add.image(l.x + 12, l.y + 12, 'lamp' + key).setScale(0.5);
      this.add.image(l.x + 12, l.y + 12, 'glow' + key).setBlendMode(Phaser.BlendModes.ADD).setScale(0.175).setAlpha(0.8);
    }
    for (const s of this.sim.level.signs) {
      this.add.text(s.x, s.y - 18, s.text, { fontFamily: 'monospace', fontSize: '10px', color: '#8fb3d9' }).setAlpha(0.75).setResolution(3);
    }
    for (const d of this.sim.dummies) {
      this.dummies.push(this.add.image(d.x + d.w / 2, d.y + d.h, 'dummy').setOrigin(0.5, 1).setScale(0.5));
      this.dummyBars.push(this.add.graphics());
    }

    this.buildActors();

    // weapons are drawn into the Trooper's attack/shoot frames; these stay for the asset checks only
    this.blaster = this.add.image(0, 0, 'blade').setVisible(false);
    this.blade = this.add.image(0, 0, 'blade').setVisible(false);
    this.view = new TrooperView(this, this.loadout.saberColor, this.loadout.dual);
    this.droneSprite = this.sim.drone ? this.add.image(0, 0, 'droid_turret').setScale(0.16).setDepth(3) : null;
    // exit door back to the Cantina
    const ex = this.sim.level.exit;
    if (ex) {
      const g = this.add.graphics().setDepth(0.5);
      g.fillStyle(0x140e1e).fillRoundedRect(ex.x - 4, ex.y - 6, ex.w + 8, ex.h + 6, 6);
      g.fillStyle(0x2a1c18).fillRoundedRect(ex.x, ex.y - 2, ex.w, ex.h + 2, 4);
      g.fillStyle(0xff9a3c, 0.85).fillRect(ex.x + 4, ex.y + 2, ex.w - 8, 3);
      g.lineStyle(2, 0xb0843f).strokeRoundedRect(ex.x, ex.y - 2, ex.w, ex.h + 2, 4);
      this.add.image(ex.x + ex.w / 2, ex.y + 10, 'glowWarm').setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setAlpha(0.8);
      this.add.text(ex.x + ex.w / 2, ex.y - 26, 'SPACE', { fontFamily: 'Oswald, Impact, sans-serif', fontSize: '8px', color: '#140e1e', backgroundColor: '#ffd58a', padding: { x: 3, y: 0 } }).setOrigin(0.5).setResolution(3);
      this.add.text(ex.x + ex.w / 2, ex.y - 14, 'CANTINA', { fontFamily: 'Oswald, Impact, sans-serif', fontSize: '11px', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 3 }).setOrigin(0.5).setResolution(3);
    }
    if (this.webgl) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.92, 0.3);

    this.cameras.main.setZoom(2);
    this.snapCamera();
    this.buildHud();

    this.tracker = shared.tracker({
      build: BUILD,
      pause: (on) => { this.paused = on; this.input2.enabled = !on; if (!on) this.input2.resetEdges(); },
      screenshot: () => this.screenshot(),
      context: () => this.context(),
      replay: (i) => this.replay(i),
    });

    this.input.keyboard?.on('keydown-ESC', () => { if (!this.tracker.isOpen) this.togglePause(); });
    this.input.keyboard?.on('keydown-P', () => { if (!this.tracker.isOpen) this.togglePause(); });
    this.input.keyboard?.on('keydown-H', () => { if (!this.tracker.isOpen) this.help.setVisible(!this.help.visible); });
    this.input.keyboard?.on('keydown-R', () => { if (!this.tracker.isOpen && this.userPaused) this.restart(this.sim.seed); });
    this.input.keyboard?.on('keydown-C', () => { if (!this.tracker.isOpen && this.userPaused) this.leaveRun(); });
    exposeTestApi(this);
    this.render();
  }

  // ------------------------------------------------------------ loop
  update(_t: number, delta: number) {
    this.fpsSamples.push(delta);
    if (this.fpsSamples.length > 120) this.fpsSamples.shift();
    const combo = padCombo();
    if (combo === 'log' && !this.tracker.isOpen) this.tracker.openLogger();
    if (combo === 'dash' && !this.tracker.isOpen) this.tracker.toggleDashboard();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const start = !!Array.from(pads).find((p) => p?.buttons[9]?.pressed);
    if (start && !(this as any)._startHeld && !this.tracker.isOpen) this.togglePause();
    (this as any)._startHeld = start;

    if (this.testMode || this.paused || this.userPaused) { this.render(); return; }
    this.acc += Math.min(delta, 100);
    let n = 0;
    while (this.acc >= STEP_MS && n < 5) {
      this.acc -= STEP_MS;
      n++;
      const forced = this.replayQueue ? this.replayQueue.shift() : undefined;
      if (this.replayQueue && !this.replayQueue.length) { this.replayQueue = null; this.banner.setText(''); this.flash('Replay finished: you have control'); }
      this.tick(this.input2.sample(forced));
    }
    if (this.sim.exitRequested && !this.leaving) this.leaveRun();
    if (this.sim.player.state === 'dead' && !this.leaving && ++this.deadT === 1) {
      this.banner.setText('DEFEATED  ·  back to the Cantina');
      this.time.delayedCall(1800, () => this.leaveRun(true));
    }
    this.render();
  }

  /** Back to the Cantina: bank what this run earned. */
  leaveRun(defeated = false) {
    if (this.leaving || this.testMode) return;
    this.leaving = true;
    const st = this.sim.stats;
    const p = loadProfile();
    p.res.credits += st.credits;
    p.runs += 1;
    p.bestKills = Math.max(p.bestKills, st.kills);
    saveProfile(p);
    this.cameras.main.fadeOut(350, 8, 6, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('cantina', { result: { credits: st.credits, kills: st.kills, defeated } }));
  }

  /** One simulation frame, including hit-stop (input pressed during hit-stop is kept for the next frame). */
  tick(inp: { held: number; pressed: number; released: number }) {
    this.sim.step(inp);
    for (const e of this.sim.events) this.fx(e);
  }

  togglePause() {
    this.userPaused = !this.userPaused;
    this.input2.resetEdges();
    this.help.setVisible(this.userPaused);
    this.banner.setText(this.userPaused ? 'PAUSED  ·  Esc resume  ·  R restart  ·  C back to Cantina' : '');
  }

  restart(seed: number, loadout: Loadout = this.loadout) {
    this.sim = new Sim(seed, loadout);
    this.deadT = 0;
    this.buildActors();
    this.input2.record = [];
    this.input2.resetEdges();
    this.userPaused = false;
    this.help.setVisible(false);
    this.banner.setText('');
    this.snapCamera();
  }

  replay(i: Issue) {
    if (!i.inputsFull?.length) return;
    const lo = (i.state as any)?.loadout as Loadout | undefined;  // replay with the loadout the issue was logged with
    this.restart(i.seed, lo ?? this.loadout);
    if (i.start) { this.sim.teleport(i.start.tx, i.start.ty); this.snapCamera(); }
    this.replayQueue = unrle(i.inputsFull);
    this.banner.setText(`REPLAY · ${i.title.slice(0, 40)}`);
  }

  /** Sprites for the sim's enemies and crates (rebuilt on restart / replay). */
  private buildActors() {
    for (const v of this.enemyViews) v.destroy();
    for (const c of this.crateViews) c.destroy();
    this.enemyViews = this.sim.enemies.map((e) => new EnemyView(this, e));
    this.crateViews = this.sim.crates.map((c) => this.add.image(c.x + c.w / 2, c.y + c.h + 1, 'crate_' + c.color).setOrigin(0.5, 1).setDepth(1.5).setScale(0.5));
  }

  // ------------------------------------------------------------ rendering
  snap() { this.snapCamera(); this.render(); }
  isPaused() { return this.paused || this.userPaused; }

  private snapCamera() {
    const p = this.sim.player.body;
    this.camX = p.x - VIEW_W / 2;
    this.camY = p.y - VIEW_H * 0.55;
  }

  render() {
    const sim = this.sim, p = sim.player, b = p.body;
    this.view.update(p, p.invulnerable && p.state !== 'roll' ? 0.6 : 1);
    if (this.droneSprite && sim.drone) {
      this.droneSprite.setPosition(sim.drone.x, sim.drone.y + Math.sin(sim.frame / 12) * 2).setFlipX(p.facing < 0);
    }

    // bolts: the Trooper's blaster is green, the turret drone's blue, the raiders' red
    while (this.bolts.length < sim.bolts.length) this.bolts.push(this.add.image(0, 0, 'bolt').setDepth(4).setScale(0.5));
    this.bolts.forEach((im, i) => {
      const bo = sim.bolts[i];
      im.setVisible(!!bo);
      if (!bo) return;
      const key = bo.enemy ? 'bolt' : bo.drone ? 'boltBlue' : 'boltGreen';
      if (im.texture.key !== key) {
        im.setTexture(key);
        if (this.webgl) { im.preFX?.clear(); im.preFX?.addGlow(bo.enemy ? 0xff4a4a : bo.drone ? 0x3f9cff : 0x3fdc6a, 3, 0, false, 0.1, 8); }
      }
      im.setPosition(bo.x, bo.y).setRotation(Math.atan2(bo.vy, Math.abs(bo.vx)) * Math.sign(bo.vx || 1)).setFlipX(bo.vx < 0);
    });
    for (const v of this.enemyViews) v.update();
    sim.crates.forEach((c, i) => {
      const im = this.crateViews[i];
      if (!im) return;
      const key = 'crate_' + c.color + (c.open ? '_open' : '');
      if (im.texture.key !== key) im.setTexture(key);
      if (c.flash > 0) im.setTintFill(0xffffff); else im.clearTint();
    });

    // dummies
    sim.dummies.forEach((d, i) => {
      const im = this.dummies[i], bar = this.dummyBars[i];
      im.setPosition(d.x + d.w / 2, d.y + d.h);
      im.setAlpha(d.respawn > 0 ? 0.15 : 1);
      if (d.flash > 0) im.setTintFill(0xffffff); else im.clearTint();
      bar.clear();
      if (d.respawn === 0 && d.hp < d.maxHp) {
        bar.fillStyle(0x140e1e).fillRect(d.x - 2, d.y - 10, d.w + 4, 5);
        bar.fillStyle(0xff4a5a).fillRect(d.x - 1, d.y - 9, (d.w + 2) * Math.max(0, d.hp / d.maxHp), 3);
      }
    });

    // camera: look ahead in the facing direction, settle vertically
    const tx = b.x + b.w / 2 - VIEW_W / 2 + p.facing * 70;
    const ty = b.y + b.h / 2 - VIEW_H * 0.55;
    if (this.testMode) { this.camX = tx; this.camY = ty; }
    this.camX += (tx - this.camX) * 0.1;
    this.camY += (ty - this.camY) * (Math.abs(ty - this.camY) > 120 ? 0.18 : 0.08);
    const cam = this.cameras.main;
    const vx = Phaser.Math.Clamp(this.camX, 0, sim.map.pixelW - VIEW_W), vy = Phaser.Math.Clamp(this.camY, 0, sim.map.pixelH - VIEW_H);
    cam.centerOn(vx + VIEW_W / 2, vy + VIEW_H / 2);
    this.bgFar.tilePositionX = vx * 0.3; this.bgFar.tilePositionY = vy * 0.1;
    this.bgNear.tilePositionX = vx * 0.8; this.bgNear.tilePositionY = vy * 0.4;

    this.updateHud();
  }

  // ------------------------------------------------------------ effects
  private fx(e: GameEvent) {
    const puff = (x: number, y: number, n: number, color: number, spread = 1.5, up = 0.6, life = 300) => {
      for (let i = 0; i < n; i++) {
        const s = this.add.image(x, y, 'spark').setTint(color).setScale((0.75 + ((i * 37) % 10) / 10) * 0.5).setDepth(5);
        const ang = (i / n) * Math.PI * 2;
        this.tweens.add({ targets: s, x: x + Math.cos(ang) * 14 * spread, y: y - Math.abs(Math.sin(ang)) * 12 * up - 4, alpha: 0, scale: 0.2, duration: life, onComplete: () => s.destroy() });
      }
    };
    switch (e.type) {
      case 'jump': puff(e.x, e.y, 6, 0x8a93ad, 1.2, 0.3); break;
      case 'doublejump': puff(e.x, e.y, 10, 0x46e6ff, 1.6, 0.2, 260); break;
      case 'walljump': puff(e.x - (e.dir ?? 0) * 12, e.y, 6, 0xd6ecff, 0.8, 1.2); break;
      case 'land': if ((e.dmg ?? 0) > 6) puff(e.x, e.y, 8, 0x8a93ad, 1.8, 0.3); break;
      case 'hurt': {
        puff(e.x, e.y, 10, 0xff5a5a, 1.6, 1, 260);
        this.cameras.main.shake(90, 0.004);
        this.cameras.main.flash(90, 120, 20, 20, false);
        const t = this.add.text(e.x, e.y - 14, '-' + e.dmg, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ff6a6a', stroke: '#140e1e', strokeThickness: 3 }).setOrigin(0.5).setDepth(7).setResolution(3);
        this.tweens.add({ targets: t, y: e.y - 40, alpha: 0, duration: 700, onComplete: () => t.destroy() });
        break;
      }
      case 'loot': {
        puff(e.x, e.y, 10, 0xffd58a, 1.4, 1.4, 360);
        const t = this.add.text(e.x, e.y - 6, `+${e.dmg} credits`, { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 3 }).setOrigin(0.5).setDepth(7).setResolution(3);
        this.tweens.add({ targets: t, y: e.y - 36, alpha: 0, duration: 900, onComplete: () => t.destroy() });
        break;
      }
      case 'enemyshoot': {
        const f = this.add.image(e.x, e.y, 'spark').setTint(0xff6a5a).setScale(1.4).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: f, alpha: 0, scale: 0.5, duration: 90, onComplete: () => f.destroy() });
        break;
      }
      case 'death': this.cameras.main.shake(200, 0.006); break;
      case 'roll': puff(e.x - (e.dir ?? 1) * 8, e.y, 5, 0x8a93ad, 1.2, 0.3); break;
      case 'slash': break; // the swing arc is drawn into the Trooper's saber frames (tinted by the crystal)
      case 'shoot': {
        const f = this.add.image(e.x + (e.dir ?? 1) * 4, e.y, 'spark').setTint(0x9affb0).setScale(1.5).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: f, alpha: 0, scale: 0.5, duration: 80, onComplete: () => f.destroy() });
        break;
      }
      case 'boltwall': puff(e.x, e.y, 6, 0xc8ffd0, 0.8, 1); break;
      case 'hit': {
        puff(e.x, e.y + 20, 8, 0xffffff, 1.4, 1, 220);
        const big = (e.dmg ?? 0) >= 20;
        if (big) this.cameras.main.shake(110, 0.005);
        const t = this.add.text(e.x, e.y - 6, String(e.dmg), { fontFamily: 'monospace', fontSize: big ? '16px' : '12px', fontStyle: 'bold', color: big ? '#ffd58a' : '#ffffff', stroke: '#140e1e', strokeThickness: 3 })
          .setOrigin(0.5).setDepth(7).setResolution(3);
        this.tweens.add({ targets: t, y: e.y - 34, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
        break;
      }
      case 'kill': puff(e.x, e.y, 16, 0xff9a3c, 2.4, 1.6, 420); this.cameras.main.shake(120, 0.004); break;
      case 'swap': this.flash(this.sim.player.weapon === 'saber' ? 'Vibro-saber' : 'Blaster'); break;
    }
  }

  // ------------------------------------------------------------ HUD
  private buildHud() {
    const c = this.add.container(VIEW_W / 2, VIEW_H / 2).setScrollFactor(0).setDepth(100); // offset for the 2x zoom
    this.hud = c;
    const frame = (x: number, y: number, w: number, h: number) => {
      const g = this.add.graphics();
      g.fillStyle(0x140e1e, 0.85).fillRect(x, y, w, h);
      g.lineStyle(1, 0xb0843f).strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      g.lineStyle(1, 0xf0c46e).lineBetween(x + 3, y + 3, x + w - 3, y + 3);
      return g;
    };
    c.add(frame(10, 10, 200, 34));
    c.add(this.add.image(26, 27, 'ui_icon_health').setScale(0.5));
    this.hpBar = this.add.graphics();
    c.add(this.hpBar);
    c.add(frame(VIEW_W - 290, 10, 280, 30));
    const res = ['icon_crystal_purple', 'icon_crystal_blue', 'icon_credit', 'icon_droidpart', 'icon_ingot'];
    res.forEach((k, i) => {
      c.add(this.add.image(VIEW_W - 276 + i * 54, 25, 'ui_' + k).setScale(0.5));
      const t = this.add.text(VIEW_W - 264 + i * 54, 19, 'x0', { fontFamily: 'monospace', fontSize: '11px', color: '#fff4dc' }).setResolution(3);
      this.resTexts.push(t);
      c.add(t);
    });
    const slot = (x: number, key: string, label: string) => {
      const s = this.add.container(x, VIEW_H - 58);
      s.add(frame(0, 0, 50, 48));
      const ic = this.add.image(25, 21, 'ui_' + key).setScale(0.5);
      if (key === 'saber') ic.setTint(SABER_COLORS[this.loadout.saberColor].hex);
      s.add(ic);
      s.add(this.add.text(25, 40, label, { fontFamily: 'monospace', fontSize: '9px', color: '#ffd58a' }).setOrigin(0.5, 0).setResolution(3));
      c.add(s);
      return s;
    };
    this.slotSaber = slot(12, 'saber', 'SABER');
    this.slotBlaster = slot(68, 'blaster_heavy', 'BLASTER');
    c.add(this.add.text(126, VIEW_H - 40, 'A / Y swap', { fontFamily: 'monospace', fontSize: '10px', color: '#8d97b3' }).setResolution(3));
    c.add(this.add.text(VIEW_W - 10, VIEW_H - 18, `${BUILD}  ·  F8 log issue  ·  F9 dashboard  ·  H controls  ·  Esc pause`, { fontFamily: 'monospace', fontSize: '10px', color: '#8d97b3' }).setOrigin(1, 0).setResolution(3));
    this.banner = this.add.text(VIEW_W / 2, 70, '', { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 4 }).setOrigin(0.5).setResolution(3);
    c.add(this.banner);

    // controls / help panel
    const h = this.add.container(VIEW_W / 2 - 230, 110).setVisible(false);
    h.add(frame(0, 0, 460, 250));
    const lines = [
      'CONTROLS                 KEYBOARD          GAMEPAD',
      'Move                     ← →               stick / d-pad',
      'Jump  (again: flip)      ↑                 A',
      'Roll (dodge)             ↓                 B / RB / RT',
      'Drop through platform    ↓ standing still  d-pad down',
      'Attack / fire / use      Space             X',
      'Swap saber / blaster     A                 Y',
      'Abilities (coming)       Z  E  R',
      'Wall jump                ↑ on a wall',
      'Ledge: climb / let go    ↑ / ↓',
      'Pause                    Esc / P           Start',
      'Log an issue             F8                Select + Y',
      'Issue dashboard          F9                Select + X',
    ];
    h.add(this.add.text(16, 14, lines.join('\n'), { fontFamily: 'monospace', fontSize: '11px', color: '#e8ecf6', lineSpacing: 6 }).setResolution(3));
    this.help = h;
    c.add(h);
    this.time.delayedCall(400, () => { if (!this.testMode) this.flash('Press H for controls'); });
  }

  private updateHud() {
    const p = this.sim.player;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x140e1e).fillRect(42, 19, 158, 14);
    this.hpBar.fillStyle(0x46dc6e).fillRect(43, 20, 156 * (p.hp / p.maxHp), 12);
    this.hpBar.fillStyle(0xaaffbe).fillRect(43, 20, 156 * (p.hp / p.maxHp), 2);
    if (p.shield > 0) { // overshield sits on top of the health bar
      this.hpBar.fillStyle(0x46c8ff, 0.9).fillRect(43, 20, Math.min(156, 156 * (p.shield / p.maxHp)), 5);
    }
    const r = this.profile?.res;
    const vals = r ? [r.rareCrystals, r.crystals, r.credits + this.sim.stats.credits, r.droidParts, r.ingots] : [0, 0, this.sim.stats.credits, 0, 0];
    this.resTexts.forEach((t, i) => { const v = 'x' + vals[i]; if (t.text !== v) t.setText(v); });
    this.slotSaber.setAlpha(p.weapon === 'saber' ? 1 : 0.45).setY(VIEW_H - (p.weapon === 'saber' ? 62 : 58));
    this.slotBlaster.setAlpha(p.weapon === 'blaster' ? 1 : 0.45).setY(VIEW_H - (p.weapon === 'blaster' ? 62 : 58));
  }

  flash(msg: string) {
    const t = this.add.text(VIEW_W, VIEW_H * 1.5 - 90, msg, { fontFamily: 'monospace', fontSize: '13px', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(101).setResolution(3);
    this.tweens.add({ targets: t, alpha: 0, y: VIEW_H * 1.5 - 104, delay: 900, duration: 500, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------ issue context
  context() {
    const rec = this.input2.record;
    return { seed: this.sim.seed, frame: this.sim.frame, state: this.sim.snapshot(), inputsTail: rle(rec.slice(-600)), inputsFull: rle(rec) };
  }

  screenshot(): Promise<string | undefined> {
    return new Promise((resolve) => {
      try {
        this.game.renderer.snapshot((img) => {
          try {
            const cv = document.createElement('canvas');
            cv.width = 480; cv.height = 270;
            const c = cv.getContext('2d')!;
            c.imageSmoothingEnabled = true;
            c.drawImage(img as HTMLImageElement, 0, 0, 480, 270);
            resolve(cv.toDataURL('image/jpeg', 0.7));
          } catch { resolve(undefined); }
        });
      } catch { resolve(undefined); }
    });
  }

  fps(): number {
    if (!this.fpsSamples.length) return 0;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    return Math.round(1000 / avg);
  }
}

/** window.__ST: the hook the test agents (and you, in the console) use to drive and inspect the game. */
function exposeTestApi(scene: GameScene) {
  const api = {
    ready: true,
    build: BUILD,
    get testMode() { return scene.testMode; },
    state: () => scene.sim.snapshot(),
    hash: () => scene.sim.hash(),
    invariants: () => scene.sim.invariants(),
    fps: () => scene.fps(),
    /** advance n frames holding `mask` (test mode); returns invariant violations seen */
    step: (n: number, mask = 0) => {
      const bad: { frame: number; msgs: string[] }[] = [];
      for (let i = 0; i < n; i++) {
        scene.tick(scene.input2.sample(mask));
        const v = scene.sim.invariants();
        if (v.length) bad.push({ frame: scene.sim.frame, msgs: v });
      }
      scene.render();
      return bad;
    },
    /** run a whole list of masks (one per frame) */
    run: (masks: number[]) => {
      const bad: { frame: number; msgs: string[] }[] = [];
      for (const m of masks) {
        scene.tick(scene.input2.sample(m));
        const v = scene.sim.invariants();
        if (v.length) bad.push({ frame: scene.sim.frame, msgs: v });
      }
      scene.render();
      return bad;
    },
    reset: (seed = 1) => scene.restart(seed),
    record: () => rle(scene.input2.record),
    teleport: (tx: number, ty: number) => { scene.sim.teleport(tx, ty); scene.input2.record = []; scene.snap(); },
    /** headless simulation (no rendering): returns final state, hash and any invariant violations */
    simulate: (seed: number, masks: number[], start?: { tx: number; ty: number }, opts?: SimOptions) => simulate(seed, masks, start, 1, undefined, opts),
    simulateMany: (jobs: { seed: number; masks: number[]; start?: { tx: number; ty: number }; opts?: SimOptions }[]) => jobs.map((j) => simulate(j.seed, j.masks, j.start, 1, undefined, j.opts)),
    level: () => ({ w: scene.sim.map.w, h: scene.sim.map.h, tiles: Array.from(scene.sim.map.tiles), spawn: scene.sim.level.spawn, dummies: scene.sim.level.dummies }),
    objects: () => scene.children.length,
    tweens: () => scene.tweens.getTweens().length,
    paused: () => scene.isPaused(),
    textures: () => ['trooper', 'trooper_glow', 'trooper_halo', 'trooper_core', 'raider', 'gunner', 'crate_brown', 'level', 'bolt', 'boltGreen', 'dummy', 'ui_icon_health', 'ui_saber', 'ui_blaster_heavy'].map((k) => [k, scene.textures.exists(k) && scene.textures.get(k).key !== '__MISSING']),
    addIssue: (i: Partial<Issue> & { title: string }) => scene.tracker.add(i),
    screenshot: () => scene.screenshot(),
  };
  (window as any).__ST = api;
}
