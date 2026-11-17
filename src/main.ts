import Phaser from 'phaser';
import { GameScene, VIEW_H, VIEW_W } from './scenes/GameScene';
import { CantinaScene } from './scenes/CantinaScene';

// Report crashes to the console in a form the Developer agent picks up.
window.addEventListener('error', (e) => console.error('[crash]', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', (e) => console.error('[crash] unhandled rejection', String(e.reason)));

// The game starts in the Cantina. Test agents (?test=1) and ?scene=run go straight into a run.
const q = new URLSearchParams(location.search);
const straightToRun = q.has('test') || q.get('scene') === 'run';

async function boot() {
  // signage font: wait briefly so the holo-signs render in it (falls back to Impact if offline)
  try { await Promise.race([document.fonts.load('700 20px Oswald'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* no font API */ }
  start();
}

function start() {
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // 1080p canvas; the world camera is zoomed 2x, so game logic still works in 960 x 540 units
  width: VIEW_W * 2,
  height: VIEW_H * 2,
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  backgroundColor: '#0b0a14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: true },
  fps: { target: 60 },
  render: { preserveDrawingBuffer: true }, // lets the issue logger take screenshots
  scene: straightToRun ? [GameScene, CantinaScene] : [CantinaScene, GameScene],
});
}

boot();
