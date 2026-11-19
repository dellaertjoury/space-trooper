/**
 * The Cantina: the hub every run starts from, two floors at run scale joined by a stairwell.
 * Ground floor: the bar and Mission Control. Upper floor: Scrapper, Forge, Armoury, Workshop.
 * Space (or clicking a sign) uses a station; Up / Down in the stairwell door changes floor.
 * Mission Control (or the START MISSION button) launches a run with your loadout.
 */
import Phaser from 'phaser';
import { BTN, padCombo, rle } from '../core/input';
import { TileMap, T } from '../core/tilemap';
import { Player } from '../game/player';
import { loadoutFrom, loadProfile, Profile, RES_ICON, Resources, saveProfile } from '../game/profile';
import { drawArmouryRack, drawBarCounter, drawHoloCone, drawHoloTable, drawHubBackdrop, drawHubTiles, StationId } from '../art/cantina';
import { HUB_DROIDS, FLOOR, HUB_H, HUB_PROPS, HUB_SPAWN, HUB_STATIONS, HUB_W, hubMap, SLAB, STAIRS } from '../game/hubLevel';
import { drawGlow } from '../art/procedural';
import { closeStation, isStationOpen, navigate, openStation } from '../ui/stations';
import { preloadTrooper, TrooperView } from './trooperView';
import { BUILD, VIEW_H, VIEW_W } from './GameScene';
import { shared } from './shared';
import { IssueTracker } from '../debug/issues';

const STEP_MS = 1000 / 60;
const ROOM_W = HUB_W * T, ROOM_H = HUB_H * T;
const CANTINA_ASSETS = ['droid_turret', 'gear_chest', 'gear_shoulder', 'gear_boots', 'gear_gauntlet'];
const PROCEDURAL = ['barCounter', 'holoTable', 'armouryRack'];
const FONT = 'Oswald, Impact, sans-serif';

export class CantinaScene extends Phaser.Scene {
  profile!: Profile;
  player!: Player;
  private map!: TileMap;
  private view!: TrooperView;
  private acc = 0;
  private frame = 0;
  private signs: { id: StationId; text: Phaser.GameObjects.Text; glow: Phaser.GameObjects.Image; prompt: Phaser.GameObjects.Text }[] = [];
  private camX = 0;
  private camY = 0;
  private near: StationId | null = null;
  private resTexts: Partial<Record<keyof Resources, Phaser.GameObjects.Text>> = {};
  private interactQueued = false;
  private padPrev = 0;
  private leaving = false;
  private paused = false;
  private tracker!: IssueTracker;

  constructor() { super('cantina'); }

  preload() {
    preloadTrooper(this);
    for (const k of CANTINA_ASSETS) if (!this.textures.exists(k)) this.load.image(k, `assets/cantina/${k}.png`);
    const keys = new Set(HUB_PROPS.map((p) => p.key));
    for (const c of ['blue', 'green', 'red', 'white']) { keys.add('h2_cone_' + c); keys.add('h2_holox_' + c); }
    for (const k of keys) {
      if (PROCEDURAL.includes(k) || CANTINA_ASSETS.includes(k) || this.textures.exists(k)) continue;
      this.load.image(k, k.startsWith('h2_') ? `assets/hub2/${k.slice(3)}.png` : `assets/hub/${k}.png`);
    }
    if (!this.textures.exists('bar_droid')) this.load.spritesheet('bar_droid', 'assets/bar_droid.png', { frameWidth: 112, frameHeight: 184 });
    if (!this.cache.json.exists('barDroidMeta')) this.load.json('barDroidMeta', 'assets/bar_droid.json');
    for (const k of ['icon_health', 'icon_credit', 'icon_crystal_blue', 'icon_crystal_purple', 'icon_droidpart', 'icon_ingot'])
      if (!this.textures.exists('ui_' + k)) this.load.image('ui_' + k, `assets/ui/${k}.png`);
  }

  create(data?: { result?: { credits: number; kills: number; defeated?: boolean } }) {
    this.leaving = false;
    this.signs = [];
    this.resTexts = {};
    this.profile = loadProfile();

    this.map = hubMap();
    const lo = loadoutFrom(this.profile);
    this.player = new Player(HUB_SPAWN.x, HUB_SPAWN.y, lo);
    this.player.facing = data?.result ? -1 : 1;

    // art
    const tex = (key: string, cv: () => HTMLCanvasElement) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, cv()); };
    tex('hubBackdrop', () => drawHubBackdrop(ROOM_W, ROOM_H, [FLOOR.ground, FLOOR.top], 48, ROOM_W - 48, SLAB, STAIRS.cx));
    tex('hubTiles', () => drawHubTiles(this.map, T));
    tex('barCounter', drawBarCounter);
    tex('holoTable', drawHoloTable);
    tex('armouryRack', drawArmouryRack);
    tex('holoCone', drawHoloCone);
    tex('glowWarmBig', () => drawGlow(160, '255,160,80'));
    tex('glowCoolBig', () => drawGlow(140, '80,220,255'));
    this.add.image(0, 0, 'hubBackdrop').setOrigin(0).setScale(0.5);
    this.add.image(0, 0, 'hubTiles').setOrigin(0).setScale(0.5).setDepth(0.5);

    // props, each at its real world size
    const sc = this.saberHolo();
    for (const p of HUB_PROPS) {
      let key = p.key;
      if (key === 'h2_cone_blue') key = 'h2_cone_' + sc.tex;
      if (key === 'h2_holox_blue') key = 'h2_holox_' + sc.tex;
      if (!this.textures.exists(key)) continue;
      const im = this.add.image(p.x, p.y, key).setOrigin(0.5, p.hang ? 0 : 1).setFlipX(!!p.flip).setDepth(p.front ? 4 : 1);
      im.setScale(p.h / im.height);
      if (p.glow !== undefined) {
        const gy = p.hang ? p.y + p.h : p.y - p.h / 2;
        const g = this.add.image(p.x, gy, p.hang ? 'glowWarmBig' : 'glowCoolBig').setBlendMode(Phaser.BlendModes.ADD)
          .setTint(p.glow).setScale(p.hang ? 0.55 : 0.3).setAlpha(p.hang ? 0.55 : 0.6).setDepth(0.8);
        if (p.bob) this.tweens.add({ targets: g, y: gy - 3, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      if (p.bob) this.tweens.add({ targets: im, y: p.y - 3, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (p.holo) {
        im.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.92);
        if (key !== p.key && sc.tint) im.setTint(sc.tint);
        if (key.startsWith('h2_cone') || key.startsWith('h2_holox')) this.forgeHolos.push(im);
        this.tweens.add({ targets: im, alpha: 0.6, duration: 120, yoyo: true, repeat: -1, repeatDelay: 1600 + Math.random() * 2400 });
      }
    }
    this.buildBarDroid();

    // holo-signs over every station (click to open)
    for (const st of HUB_STATIONS) {
      const x = (st.x0 + st.x1) / 2, y = st.signY;
      const glow = this.add.image(x, y, 'glowCoolBig').setBlendMode(Phaser.BlendModes.ADD).setScale(0.45, 0.16).setAlpha(0.35).setDepth(5);
      const text = this.add.text(x, y, st.label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', stroke: '#140e1e', strokeThickness: 4 })
        .setOrigin(0.5).setResolution(3).setDepth(6).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.open(st.id));
      const prompt = this.add.text(x, y + 15, 'SPACE  OPEN', { fontFamily: FONT, fontSize: '8px', color: '#140e1e', backgroundColor: '#ffd58a', padding: { x: 4, y: 1 } })
        .setOrigin(0.5).setResolution(3).setDepth(6).setVisible(false);
      this.tweens.add({ targets: [text, glow], y: y - 2, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.signs.push({ id: st.id, text, glow, prompt });
    }

    this.view = new TrooperView(this, this.profile.saber.color, this.profile.saber.form === 'dual', 3);
    this.stairPrompt = this.add.text(STAIRS.cx, 0, '', { fontFamily: FONT, fontSize: '8px', color: '#140e1e', backgroundColor: '#ffd58a', padding: { x: 4, y: 1 } })
      .setOrigin(0.5).setResolution(3).setDepth(6).setVisible(false);

    // camera: 2x zoom like the run, follows the Trooper in both directions
    const cam = this.cameras.main;
    cam.setZoom(2);
    this.camX = this.player.cx; this.camY = this.player.body.y;
    if (this.game.renderer.type === Phaser.WEBGL) cam.postFX.addVignette(0.5, 0.5, 0.9, 0.35);
    cam.fadeIn(400, 8, 6, 12);

    this.buildHud(data?.result);

    // input
    const input = shared.input();
    input.record = [];
    input.resetEdges();
    input.enabled = true;
    this.input.keyboard?.on('keydown-ENTER', () => { if (!isStationOpen()) this.interactQueued = true; });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!isStationOpen()) return;
      if (e.code === 'Escape') this.closePanel();
      else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { e.preventDefault(); navigate('next'); }
      else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { e.preventDefault(); navigate('prev'); }
    });
    this.events.once('shutdown', () => closeStation());

    this.tracker = shared.tracker({
      build: BUILD,
      pause: (on) => { this.paused = on; input.enabled = !on && !isStationOpen(); if (!on) input.resetEdges(); },
      screenshot: () => this.screenshot(),
      context: () => ({ seed: 0, frame: this.frame, state: { scene: 'cantina', station: this.near, profile: this.profile, player: { x: this.player.body.x, y: this.player.body.y, tileX: Math.floor(this.player.cx / T), tileY: Math.floor((this.player.feet - 1) / T), state: this.player.state } }, inputsTail: rle(input.record.slice(-600)), inputsFull: [] }),
      replay: () => this.flash('Replays only work for issues logged during a run'),
    });
    this.exposeApi();
    this.render();
  }

  // ------------------------------------------------------------ loop
  update(_t: number, delta: number) {
    const combo = padCombo();
    if (combo === 'log' && !this.tracker.isOpen) this.tracker.openLogger();
    if (combo === 'dash' && !this.tracker.isOpen) this.tracker.toggleDashboard();
    if (isStationOpen()) { this.padNavigate(); this.render(); return; }
    if (this.paused || this.leaving) { this.render(); return; }
    const input = shared.input();
    this.acc += Math.min(delta, 100);
    let n = 0;
    while (this.acc >= STEP_MS && n < 5) {
      this.acc -= STEP_MS; n++; this.frame++;
      if (this.frameStep(input.sample())) break;
    }
    this.render();
  }

  private padNavigate() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    let m = 0;
    for (const p of pads) {
      if (!p) continue;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      if (b(12) || b(14) || (p.axes[1] ?? 0) < -0.5) m |= 1;
      if (b(13) || b(15) || (p.axes[1] ?? 0) > 0.5) m |= 2;
      if (b(0)) m |= 4;
      if (b(1)) m |= 8;
    }
    const pressed = m & ~this.padPrev;
    this.padPrev = m;
    if (pressed & 1) navigate('prev');
    if (pressed & 2) navigate('next');
    if (pressed & 4) navigate('click');
    if (pressed & 8) this.closePanel();
  }

  open(id: StationId) {
    if (isStationOpen() || this.leaving) return;
    shared.input().enabled = false;
    shared.input().resetEdges();
    this.padPrev = 0b1111; // ignore the button that opened the panel
    openStation(id, {
      profile: this.profile,
      changed: () => { saveProfile(this.profile); this.view.setSaber(this.profile.saber.color, this.profile.saber.form === 'dual'); this.refreshHud(); },
      launch: () => this.launch(),
      close: () => this.closePanel(),
    });
  }

  closePanel() {
    closeStation();
    shared.input().enabled = true;
    shared.input().resetEdges();
  }

  launch() {
    if (this.leaving) return;
    this.leaving = true;
    closeStation();
    const loadout = loadoutFrom(this.profile);
    this.profile.nextRunShield = 0; // the overshield is spent on this run
    saveProfile(this.profile);
    shared.input().enabled = true;
    this.cameras.main.fadeOut(400, 8, 6, 12);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('game', { loadout }));
  }

  /** One hub frame. Returns true when the frame opened a panel or started the stairs. */
  frameStep(f: { held: number; pressed: number; released: number }, instantStairs = false): boolean {
    // Space uses things here instead of swinging; Up / Down in the stairwell door change floor
    const use = (f.pressed & BTN.ATTACK) !== 0 || this.interactQueued;
    this.interactQueued = false;
    const stair = this.stairDir(f.pressed);
    const strip = BTN.ATTACK | (stair ? BTN.JUMP | BTN.ROLL | BTN.UP | BTN.DOWN : 0);
    const g = { held: f.held & ~strip, pressed: f.pressed & ~strip, released: f.released };
    this.player.update(this.map, g, [], () => { /* no shooting range in the bar */ });
    if (stair) { this.takeStairs(stair, instantStairs); return true; }
    this.near = this.stationHere();
    if (use && this.near) { this.open(this.near); return true; }
    return false;
  }

  // ------------------------------------------------------------ stairs + bar droid
  private stairPrompt!: Phaser.GameObjects.Text;
  private transit = false;
  private forgeHolos: Phaser.GameObjects.Image[] = [];
  private droids: { s: Phaser.GameObjects.Sprite; x: number; dir: number; mode: 'walk' | 'idle' | 'wave' | 'bounce'; t: number; waved: boolean; area: typeof HUB_DROIDS[number] }[] = [];

  floorOf(): 'ground' | 'top' | null {
    const f = this.player.feet;
    return Math.abs(f - FLOOR.ground) < 4 ? 'ground' : Math.abs(f - FLOOR.top) < 4 ? 'top' : null;
  }

  private inStairs() { const p = this.player; return p.state === 'ground' && p.cx >= STAIRS.x0 && p.cx <= STAIRS.x1; }

  /** +1 = going up, -1 = going down, 0 = no stair move this frame */
  private stairDir(pressed: number): number {
    if (this.transit || !this.inStairs()) return 0;
    const fl = this.floorOf();
    if (fl === 'ground' && (pressed & BTN.UP)) return 1;
    if (fl === 'top' && (pressed & BTN.DOWN)) return -1;
    return 0;
  }

  takeStairs(dir: number, instant = false) {
    const move = () => {
      const b = this.player.body;
      b.y = (dir > 0 ? FLOOR.top : FLOOR.ground) - b.h; b.ry = 0;
      b.x = Math.round(STAIRS.cx - b.w / 2); b.rx = 0;
      this.player.vx = this.player.vy = 0;
      this.camX = this.player.cx; this.camY = b.y;
    };
    if (instant) { move(); this.render(); return; }
    this.transit = true;
    const cam = this.cameras.main;
    cam.fadeOut(160, 8, 6, 12);
    cam.once('camerafadeoutcomplete', () => { move(); this.render(); cam.fadeIn(180, 8, 6, 12); this.transit = false; shared.input().resetEdges(); });
  }

  /** The Forge's holograms take the colour of the equipped crystal. */
  private saberHolo(): { tex: string; tint?: number } {
    const c = this.profile.saber.color;
    if (c === 'purple') return { tex: 'white', tint: 0xb47cff };
    return { tex: c === 'green' ? 'green' : c === 'red' ? 'red' : 'blue' };
  }

  private buildBarDroid() {
    this.droids = [];
    if (!this.textures.exists('bar_droid')) return;
    const meta = this.cache.json.get('barDroidMeta');
    HUB_DROIDS.forEach((area, i) => {
      const s = this.add.sprite(area.start, area.y, 'bar_droid', 0).setOrigin(0.5, meta.feetY / meta.frameHeight).setScale(0.44).setDepth(2.5);
      // stagger them so they don't all move in step
      this.droids.push({ s, x: area.start, dir: i % 2 ? -1 : 1, mode: i ? 'idle' : 'walk', t: i * 97, waved: false, area });
    });
  }

  /** The bar droid wanders in front of the bar, waves when the Trooper comes over, bounces now and then. */
  private updateDroid() {
    if (!this.droids.length) return;
    const A = this.cache.json.get('barDroidMeta').anims as Record<string, number[]>;
    for (const d of this.droids) this.updateOneDroid(d, A);
  }

  private updateOneDroid(d: CantinaScene['droids'][number], A: Record<string, number[]>) {
    const BAR_DROID = d.area;
    d.t++;
    const p = this.player;
    const near = Math.abs(p.feet - d.area.y) < 4 && Math.abs(p.cx - d.x) < 70;
    if (!near) d.waved = false;
    if (near && !d.waved && d.mode !== 'wave') { d.mode = 'wave'; d.t = 0; d.waved = true; }
    switch (d.mode) {
      case 'walk':
        d.x += d.dir * 0.5;
        if (d.x > BAR_DROID.x1 || d.x < BAR_DROID.x0) d.dir = -d.dir;
        if (d.t > 360 && d.t % 60 === 0) { d.mode = (d.t / 60) % 3 === 0 ? 'bounce' : 'idle'; d.t = 0; }
        break;
      case 'idle': if (d.t > 150) { d.mode = 'walk'; d.t = 0; } break;
      case 'bounce': if (d.t >= A.bounce.length * 7 * 2) { d.mode = 'idle'; d.t = 0; } break;
      case 'wave': if (d.t >= A.wave.length * 7 * 2) { d.mode = near ? 'idle' : 'walk'; d.t = 0; } break;
    }
    let frame: number;
    if (d.mode === 'walk') frame = A.walk[Math.floor(d.t / 7) % A.walk.length];
    else if (d.mode === 'wave') frame = A.wave[Math.floor(d.t / 7) % A.wave.length];
    else if (d.mode === 'bounce') frame = A.bounce[Math.floor(d.t / 7) % A.bounce.length];
    else frame = A.idle[Math.floor(d.t / 9) % A.idle.length];
    // the side-view walk faces right; front-facing poses need no flip
    d.s.setFrame(frame).setPosition(d.x, BAR_DROID.y).setFlipX(d.mode === 'walk' && d.dir < 0);
  }

  // ------------------------------------------------------------ rendering
  /** The station the Trooper is standing at (same floor, inside its zone), if any. */
  private stationHere(): StationId | null {
    const p = this.player;
    if (p.state !== 'ground') return null;
    for (const st of HUB_STATIONS) if (Math.abs(p.feet - st.floor) < 3 && p.cx >= st.x0 && p.cx <= st.x1) return st.id;
    return null;
  }

  private render() {
    const p = this.player;
    this.view.update(p);
    this.near = this.stationHere();
    this.updateDroid();
    const fl = this.floorOf();
    const showStair = this.inStairs() && !isStationOpen() && !!fl;
    this.stairPrompt.setVisible(showStair);
    if (showStair) this.stairPrompt.setText(fl === 'ground' ? '▲  UPSTAIRS' : '▼  DOWNSTAIRS').setY((fl === 'ground' ? FLOOR.ground : FLOOR.top) - 72);
    for (const im of this.forgeHolos) { const sc = this.saberHolo(); if (sc.tint) im.setTint(sc.tint); else im.clearTint(); }
    for (const s of this.signs) {
      const on = s.id === this.near;
      s.prompt.setVisible(on && !isStationOpen());
      s.text.setColor(on ? '#ffe9b0' : '#ffffff').setScale(on ? 1.12 : 1);
      s.glow.setAlpha(on ? 0.7 : 0.35);
    }
    // smooth follow; clamp to the room
    this.camX += (p.cx + p.facing * 50 - this.camX) * 0.12;
    this.camY += (p.body.y + 10 - this.camY) * 0.12;
    const cx = Phaser.Math.Clamp(this.camX, VIEW_W / 2, ROOM_W - VIEW_W / 2);
    const cy = Phaser.Math.Clamp(this.camY, VIEW_H / 2, ROOM_H - VIEW_H / 2);
    this.cameras.main.centerOn(cx, cy);
  }

  // ------------------------------------------------------------ HUD (resource bar like the reference, big launch button)
  private buildHud(result?: { credits: number; kills: number; defeated?: boolean }) {
    const c = this.add.container(VIEW_W / 2, VIEW_H / 2).setScrollFactor(0).setDepth(100); // offset for the 2x zoom
    const g = this.add.graphics();
    g.fillStyle(0x140e1e, 0.82).fillRoundedRect(10, 8, 190, 50, 8);
    g.lineStyle(2, 0xb0843f).strokeRoundedRect(10, 8, 190, 50, 8);
    g.fillStyle(0x140e1e, 0.82).fillRoundedRect(VIEW_W - 430, 8, 420, 34, 17);
    g.lineStyle(2, 0xb0843f).strokeRoundedRect(VIEW_W - 430, 8, 420, 34, 17);
    c.add(g);
    c.add(this.add.text(22, 11, 'THE CANTINA', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#140e1e', strokeThickness: 4 }).setResolution(3));
    const sub = this.add.text(22, 37, '', { fontFamily: FONT, fontSize: '11px', color: '#ffd58a' }).setResolution(3);
    sub.setName('sub');
    c.add(sub);
    const order: (keyof Resources)[] = ['rareCrystals', 'crystals', 'credits', 'droidParts', 'ingots'];
    order.forEach((k, i) => {
      const x = VIEW_W - 418 + i * 82;
      c.add(this.add.image(x + 8, 25, 'ui_' + RES_ICON[k]).setScale(0.55));
      const t = this.add.text(x + 22, 15, '0', { fontFamily: FONT, fontSize: '17px', color: '#ffffff', stroke: '#140e1e', strokeThickness: 3 }).setResolution(3);
      this.resTexts[k] = t;
      c.add(t);
    });
    // START MISSION button (bottom right)
    const bw = 210, bh = 46, bx = VIEW_W - bw - 14, by = VIEW_H - bh - 14;
    const btn = this.add.graphics();
    btn.fillStyle(0x140e1e).fillRoundedRect(bx - 3, by - 3, bw + 6, bh + 6, 10);
    btn.fillStyle(0x3fbf3a).fillRoundedRect(bx, by, bw, bh, 8);
    btn.fillStyle(0x8dff7a).fillRoundedRect(bx + 4, by + 3, bw - 8, 10, 5);
    btn.lineStyle(2, 0xd6ffcc).strokeRoundedRect(bx + 2, by + 2, bw - 4, bh - 4, 7);
    c.add(btn);
    const bt = this.add.text(bx + bw / 2, by + bh / 2, 'START MISSION', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', stroke: '#1d4a1a', strokeThickness: 5 })
      .setOrigin(0.5).setResolution(3);
    c.add(bt);
    const hit = this.add.zone(bx + bw / 2, by + bh / 2, bw, bh).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.open('mission'));
    c.add(hit);
    c.add(this.add.text(14, VIEW_H - 22, `← → walk  ·  Space use a station (or click its sign)  ·  ▲ ▼ stairs  ·  F8 log issue  ·  F9 dashboard  ·  ${BUILD}`,
      { fontFamily: 'monospace', fontSize: '10px', color: '#c7b8a4' }).setResolution(3));
    if (result) {
      const t = this.add.text(VIEW_W / 2, 70, `${result.defeated ? 'Defeated on' : 'Back from'} the Training Deck  ·  +${result.credits} credits  ·  ${result.kills} enemies down`,
        { fontFamily: FONT, fontSize: '16px', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 4 }).setOrigin(0.5).setResolution(3);
      c.add(t);
      this.tweens.add({ targets: t, alpha: 0, delay: 3500, duration: 800 });
    }
    (this as any)._hud = c;
    this.refreshHud();
  }

  refreshHud() {
    for (const [k, t] of Object.entries(this.resTexts)) t!.setText(String(this.profile.res[k as keyof Resources]));
    const sub = ((this as any)._hud as Phaser.GameObjects.Container).getByName('sub') as Phaser.GameObjects.Text;
    const path = this.profile.path === 0 ? 'Path undecided' : this.profile.path > 0 ? 'Light Path' : 'Dark Path';
    sub.setText(`Runs ${this.profile.runs} · ${path}`);
  }

  flash(msg: string) {
    const t = this.add.text(VIEW_W, VIEW_H * 1.5 - 90, msg, { fontFamily: FONT, fontSize: '14px', color: '#ffd58a', stroke: '#140e1e', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(101).setResolution(3);
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 500, onComplete: () => t.destroy() });
  }

  screenshot(): Promise<string | undefined> {
    return new Promise((resolve) => {
      try {
        this.game.renderer.snapshot((img) => {
          const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270;
          cv.getContext('2d')!.drawImage(img as HTMLImageElement, 0, 0, 480, 270);
          resolve(cv.toDataURL('image/jpeg', 0.7));
        });
      } catch { resolve(undefined); }
    });
  }

  /** window.__ST while in the Cantina (the agents use it to test the hub). */
  private exposeApi() {
    const scene = this;
    (window as any).__ST = {
      ready: true,
      build: BUILD,
      scene: 'cantina',
      profile: () => JSON.parse(JSON.stringify(scene.profile)),
      near: () => scene.near,
      stations: () => HUB_STATIONS.map((s) => ({ id: s.id, x: (s.x0 + s.x1) / 2, floor: s.floor })),
      floors: () => ({ ...FLOOR, stairs: STAIRS.cx }),
      floor: () => scene.floorOf(),
      stairsInstant: (dir: number) => scene.takeStairs(dir, true),
      /** put the Trooper at a station (or an x on the ground floor) */
      walkTo: (to: StationId | number) => {
        const st = HUB_STATIONS.find((s) => s.id === to);
        const b = scene.player.body;
        b.x = Math.round((st ? (st.x0 + st.x1) / 2 : (to as number)) - b.w / 2);
        b.y = (st ? st.floor : FLOOR.ground) - b.h; b.rx = b.ry = 0;
        scene.player.vx = scene.player.vy = 0; scene.player.state = 'ground';
        scene.camX = scene.player.cx; scene.camY = b.y;
        scene.render(); return scene.near;
      },
      player: () => ({ x: scene.player.body.x, y: scene.player.body.y, state: scene.player.state, feet: scene.player.feet }),
      /** frame-exact stepping for tests: hold `mask` for n frames (no real-time input) */
      step: (n: number, mask = 0) => {
        let prev = (scene as any)._testPrev ?? 0;
        for (let i = 0; i < n; i++) {
          scene.frameStep({ held: mask, pressed: mask & ~prev, released: prev & ~mask }, true);
          prev = mask;
        }
        (scene as any)._testPrev = prev;
        scene.render();
        return { x: scene.player.body.x, feet: scene.player.feet, state: scene.player.state };
      },
      open: (id: StationId) => scene.open(id),
      close: () => scene.closePanel(),
      isOpen: () => isStationOpen(),
      launch: () => scene.launch(),
      resetProfile: () => { localStorage.removeItem('st.profile.v1'); scene.scene.restart(); },
      fps: () => Math.round(scene.game.loop.actualFps),
      paused: () => scene.paused,
    };
  }
}
