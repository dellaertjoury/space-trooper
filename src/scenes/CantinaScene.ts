/**
 * The Cantina: the hub every run starts from. Walk between the stations, press Up / E (or click a sign)
 * to open one. The Mission Table (or the START MISSION button) launches a run with your loadout.
 */
import Phaser from 'phaser';
import { BTN, padCombo, rle } from '../core/input';
import { Tile, TileMap, T } from '../core/tilemap';
import { Player } from '../game/player';
import { loadoutFrom, loadProfile, Profile, RES_ICON, Resources, saveProfile } from '../game/profile';
import { drawCantina, drawHangingLamp, drawHoloCone, drawPlanetHolo, LAYOUT, StationId } from '../art/cantina';
import { drawGlow } from '../art/procedural';
import { closeStation, isStationOpen, navigate, openStation } from '../ui/stations';
import { preloadTrooper, TrooperView } from './trooperView';
import { BUILD, VIEW_H, VIEW_W } from './GameScene';
import { shared } from './shared';
import { IssueTracker } from '../debug/issues';

const STEP_MS = 1000 / 60;
const NEAR = 70;
const FONT = 'Oswald, Impact, sans-serif';

export class CantinaScene extends Phaser.Scene {
  profile!: Profile;
  player!: Player;
  private map!: TileMap;
  private view!: TrooperView;
  private acc = 0;
  private frame = 0;
  private signs: { id: StationId; x: number; text: Phaser.GameObjects.Text; glow: Phaser.GameObjects.Image; prompt: Phaser.GameObjects.Text }[] = [];
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
    for (const k of ['scrapper_a', 'scrapper_b', 'droid_turret', 'droid_medic', 'gear_chest', 'gear_shoulder', 'gear_boots', 'gear_gauntlet', 'saber_blue', 'saber_red'])
      if (!this.textures.exists(k)) this.load.image(k, `assets/cantina/${k}.png`);
    for (const k of ['icon_health', 'icon_credit', 'icon_crystal_blue', 'icon_crystal_purple', 'icon_droidpart', 'icon_ingot'])
      if (!this.textures.exists('ui_' + k)) this.load.image('ui_' + k, `assets/ui/${k}.png`);
  }

  create(data?: { result?: { credits: number; kills: number } }) {
    this.leaving = false;
    this.signs = [];
    this.resTexts = {};
    this.profile = loadProfile();
    const L = LAYOUT;

    // walkable room: a floor and two walls
    this.map = new TileMap(Math.ceil(L.w / T), Math.ceil(L.h / T));
    const floorRow = L.floorY / T;
    this.map.fill(0, floorRow, this.map.w - 1, this.map.h - 1, Tile.Solid);
    this.map.fill(0, 0, 0, this.map.h - 1, Tile.Solid);
    this.map.fill(this.map.w - 1, 0, this.map.w - 1, this.map.h - 1, Tile.Solid);
    const lo = loadoutFrom(this.profile);
    this.player = new Player(875 - 10, L.floorY - 56, lo);
    this.player.facing = data?.result ? -1 : 1;

    // art
    const tex = (key: string, cv: HTMLCanvasElement) => { if (!this.textures.exists(key)) this.textures.addCanvas(key, cv); };
    tex('cantinaBg', drawCantina());
    tex('holoCone', drawHoloCone());
    tex('planetHolo', drawPlanetHolo());
    tex('hangLamp', drawHangingLamp());
    tex('glowWarmBig', drawGlow(160, '255,160,80'));
    tex('glowCoolBig', drawGlow(140, '80,220,255'));
    this.add.image(0, 0, 'cantinaBg').setOrigin(0).setScale(0.5);

    for (const l of L.lamps) {
      this.add.image(l.x, l.y - 40, 'hangLamp').setOrigin(0.5, 0).setScale(0.5);
      this.add.image(l.x, l.y + 30, 'glowWarmBig').setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.55);
    }
    // NPCs and props
    this.add.image(272, L.floorY, 'scrapper_a').setOrigin(0.5, 1).setScale(0.5).setFlipX(true).setDepth(1);
    this.add.image(132, L.floorY, 'scrapper_b').setOrigin(0.5, 1).setScale(0.5).setDepth(1);
    this.add.image(505, 300, 'gear_chest').setScale(0.3);
    this.add.image(578, 302, 'gear_shoulder').setScale(0.3);
    this.add.image(505, 386, 'gear_boots').setScale(0.24);
    this.add.image(585, 390, 'gear_gauntlet').setScale(0.24);
    this.add.image(1370, 372, 'droid_medic').setScale(0.28);
    const drone = this.add.image(1446, 330, 'droid_turret').setScale(0.24);
    this.tweens.add({ targets: drone, y: 322, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // holograms: crossed sabers over the Forge, a planet over the Mission Table
    for (const h of L.holos) {
      this.add.image(h.x, h.y, 'holoCone').setOrigin(0.5, 1).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
      this.add.image(h.x, h.y - 60, 'glowCoolBig').setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.5);
      const parts: Phaser.GameObjects.Image[] = [];
      if (h.kind === 'sabers') {
        // crossed blue and red blades: the two paths
        parts.push(this.add.image(h.x - 4, h.y - 58, 'saber_blue').setScale(0.2).setAngle(-15));
        parts.push(this.add.image(h.x + 4, h.y - 58, 'saber_red').setScale(0.2).setAngle(-165).setFlipY(true));
      } else {
        parts.push(this.add.image(h.x, h.y - 56, 'planetHolo').setScale(0.5));
        this.tweens.add({ targets: parts[0], angle: 360, duration: 24000, repeat: -1 });
      }
      for (const p of parts) {
        p.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75);
        this.tweens.add({ targets: p, alpha: 0.5, duration: 140, yoyo: true, repeat: -1, repeatDelay: 1800 + Math.random() * 2400 });
      }
    }

    // holo-signs over every station (click to open)
    const labelY: Record<StationId, number> = { scrapper: 150, armoury: 170, forge: 290, workshop: 200, mission: 290 };
    for (const st of L.stations) {
      const y = labelY[st.id];
      const glow = this.add.image(st.x, y, 'glowCoolBig').setBlendMode(Phaser.BlendModes.ADD).setScale(0.55, 0.22).setAlpha(0.35).setDepth(5);
      const text = this.add.text(st.x, y, st.label, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#140e1e', strokeThickness: 5 })
        .setOrigin(0.5).setResolution(3).setDepth(6).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.open(st.id));
      const prompt = this.add.text(st.x, y + 20, '▲ / E  OPEN', { fontFamily: FONT, fontSize: '10px', color: '#140e1e', backgroundColor: '#ffd58a', padding: { x: 5, y: 2 } })
        .setOrigin(0.5).setResolution(3).setDepth(6).setVisible(false);
      this.tweens.add({ targets: [text, glow], y: y - 3, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.signs.push({ id: st.id, x: st.x, text, glow, prompt });
    }

    this.view = new TrooperView(this, this.profile.saber.color, this.profile.saber.form === 'dual', 3);

    // camera: 2x zoom like the run, follows the Trooper sideways
    const cam = this.cameras.main;
    cam.setZoom(2);
    cam.setBounds(0, 0, L.w, L.h);
    if (this.game.renderer.type === Phaser.WEBGL) cam.postFX.addVignette(0.5, 0.5, 0.9, 0.35);
    cam.fadeIn(400, 8, 6, 12);

    this.buildHud(data?.result);

    // input
    const input = shared.input();
    input.record = [];
    input.resetEdges();
    input.enabled = true;
    this.input.keyboard?.on('keydown-E', () => { this.interactQueued = true; });
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
      context: () => ({ seed: 0, frame: this.frame, state: { scene: 'cantina', station: this.near, profile: this.profile, player: { x: this.player.body.x, tileX: Math.floor(this.player.cx / T), tileY: floorRow - 1, state: this.player.state } }, inputsTail: rle(input.record.slice(-600)), inputsFull: [] }),
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
      const f = input.sample();
      const events: never[] = [];
      this.player.update(this.map, f, events, () => { /* no shooting range in the bar */ });
      if ((f.pressed & BTN.UP) || this.interactQueued) {
        this.interactQueued = false;
        if (this.near) { this.open(this.near); break; }
      }
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

  // ------------------------------------------------------------ rendering
  private render() {
    const p = this.player;
    this.view.update(p);
    const cx = p.cx;
    let best: StationId | null = null, bd = NEAR;
    for (const s of this.signs) { const d = Math.abs(s.x - cx); if (d < bd) { bd = d; best = s.id; } }
    this.near = best;
    for (const s of this.signs) {
      const on = s.id === best;
      s.prompt.setVisible(on && !isStationOpen());
      s.text.setColor(on ? '#ffe9b0' : '#ffffff').setScale(on ? 1.12 : 1);
      s.glow.setAlpha(on ? 0.7 : 0.35);
    }
    const cam = this.cameras.main;
    cam.centerOn(Phaser.Math.Clamp(cx, VIEW_W / 2, LAYOUT.w - VIEW_W / 2), LAYOUT.h - VIEW_H / 2);
  }

  // ------------------------------------------------------------ HUD (resource bar like the reference, big launch button)
  private buildHud(result?: { credits: number; kills: number }) {
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
    c.add(this.add.text(14, VIEW_H - 22, `←→ walk  ·  ▲ / E use a station (or click its sign)  ·  F8 log issue  ·  F9 dashboard  ·  ${BUILD}`,
      { fontFamily: 'monospace', fontSize: '10px', color: '#c7b8a4' }).setResolution(3));
    if (result) {
      const t = this.add.text(VIEW_W / 2, 70, `Back from the Training Deck  ·  +${result.credits} credits  ·  ${result.kills} droids destroyed`,
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
      stations: () => LAYOUT.stations.map((s) => ({ id: s.id, x: s.x })),
      walkTo: (x: number) => { const b = scene.player.body; b.x = Math.round(x - b.w / 2); b.rx = 0; scene.render(); return scene.near; },
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
