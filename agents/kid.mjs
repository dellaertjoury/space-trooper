// KID AGENT — plays like a young child: real key presses in real time, button mashing,
// walking into walls, holding everything at once, spamming pause and the weapon swap.
// Looks for: crashes, soft-locks, stuck states, phantom input after pausing.
import { openGame, Report, rng, sleep } from './lib.mjs';
import { hubMash } from './hub.mjs';

// the real keyboard layout: arrows move, Up jumps, Down rolls, Space attacks, A swaps
const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', jump: 'ArrowUp', attack: 'Space', roll: 'ArrowDown', swap: 'KeyA', pause: 'Escape', help: 'KeyH' };

export async function runKid(browser, url, { seconds = 45, seed = 7 } = {}) {
  const { page, consoleErrors } = await openGame(browser, url, { test: false });
  const build = await page.evaluate(() => __ST.build);
  const rep = new Report('kid', build);
  const r = rng(seed);
  const held = new Set();
  const down = async (k) => { if (!held.has(k)) { held.add(k); await page.keyboard.down(KEYS[k]); } };
  const up = async (k) => { if (held.has(k)) { held.delete(k); await page.keyboard.up(KEYS[k]); } };
  const releaseAll = async () => { for (const k of [...held]) await up(k); };
  const tap = async (k, ms = 60) => { await down(k); await sleep(ms); await up(k); };

  const behaviours = {
    // run one way for a long time (usually into a wall)
    async runAway() { const d = r.pick(['left', 'right']); await down(d); await sleep(r.int(800, 3500)); await up(d); },
    // mash jump while running
    async jumpMash() { const d = r.pick(['left', 'right']); await down(d); for (let i = 0; i < r.int(4, 10); i++) await tap('jump', r.int(30, 120)); await up(d); },
    async attackMash() { for (let i = 0; i < r.int(5, 15); i++) await tap('attack', r.int(20, 80)); },
    async swapSpam() { for (let i = 0; i < r.int(3, 9); i++) { await tap('swap', 40); await tap('attack', 40); } },
    async rollSpam() { const d = r.pick(['left', 'right']); await down(d); for (let i = 0; i < r.int(3, 8); i++) await tap('roll', r.int(30, 90)); await up(d); },
    // squash every key at once
    async everything() { for (const k of ['left', 'right', 'up', 'down', 'jump', 'attack', 'roll']) await down(k); await sleep(r.int(300, 1200)); await releaseAll(); },
    async oppositeDirections() { await down('left'); await down('right'); await tap('jump'); await sleep(600); await releaseAll(); },
    async idle() { await sleep(r.int(800, 2500)); },
    // pause spam, sometimes while holding a direction (classic stuck-key bug)
    async pauseSpam() { const d = r.pick(['left', 'right']); await down(d); for (let i = 0; i < r.int(2, 6); i++) await tap('pause', 50); await up(d); await sleep(150); if (await page.evaluate(() => __ST.paused())) await tap('pause'); },
    async helpToggle() { await tap('help'); await sleep(400); await tap('help'); },
    async climbAttempt() { const d = r.pick(['left', 'right']); await down(d); await down('jump'); await sleep(r.int(300, 700)); await up('jump'); await sleep(200); await tap('jump'); await tap('up'); await sleep(500); await releaseAll(); },
    async dropThrough() { await tap('down', 80); await sleep(400); },
  };
  const weights = [['runAway', 5], ['jumpMash', 5], ['attackMash', 3], ['swapSpam', 2], ['rollSpam', 3], ['everything', 2], ['oppositeDirections', 1], ['idle', 2], ['pauseSpam', 2], ['helpToggle', 1], ['climbAttempt', 3], ['dropThrough', 2]];
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const pickBehaviour = () => { let x = r.next() * total; for (const [n, w] of weights) { if ((x -= w) < 0) return n; } return 'idle'; };

  const t0 = Date.now();
  let lastPos = null, sameSince = Date.now(), stateSince = Date.now(), lastState = '';
  const visited = new Set();
  const played = {};
  let deaths = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const name = pickBehaviour();
    played[name] = (played[name] ?? 0) + 1;
    try { await behaviours[name](); } catch (e) { consoleErrors.push('agent: ' + e.message); }

    // ---- the kid got beaten by a raider: the game sends them to the Cantina; go again
    if (await page.evaluate(() => window.__ST?.scene === 'cantina')) {
      deaths++;
      await releaseAll();
      await page.evaluate(() => __ST.launch());
      await page.waitForFunction(() => !!window.__ST?.state, null, { timeout: 20000 }).catch(() => null);
      lastPos = null; continue;
    }
    if (!(await page.evaluate(() => !!window.__ST?.state))) { await sleep(500); continue; } // mid scene change
    // ---- observations after each behaviour
    const s = await page.evaluate(() => ({ st: __ST.state(), inv: __ST.invariants(), paused: __ST.paused() }));
    const p = s.st.player;
    visited.add(`${p.tileX},${p.tileY}`);
    if (s.inv.length) await rep.issue(page, { key: 'inv:' + s.inv[0], severity: 'major', title: `Game rule broken: ${s.inv[0]}`, note: `After the kid did "${name}".`, category: 'invariant', state: s.st, frame: s.st.frame });
    const pos = `${p.x},${p.y}`;
    if (pos !== lastPos) { lastPos = pos; sameSince = Date.now(); }
    if (p.state !== lastState) { lastState = p.state; stateSince = Date.now(); }
    if (!s.paused && Date.now() - sameSince > 9000 && name !== 'idle') {
      await rep.issue(page, { key: 'stuck:' + p.tileX + ',' + p.tileY, severity: 'major', title: `Stuck: no movement for 9 s at tile ${p.tileX},${p.tileY}`, note: `State "${p.state}". The kid kept pressing keys (last: ${name}).`, category: 'soft-lock', state: s.st, frame: s.st.frame });
      sameSince = Date.now();
    }
    if (!s.paused && ['roll', 'climb', 'hurt'].includes(p.state) && Date.now() - stateSince > 4000) {
      await rep.issue(page, { key: 'state:' + p.state, severity: 'major', title: `Stuck in "${p.state}" for 4+ seconds`, category: 'soft-lock', state: s.st, frame: s.st.frame });
    }
    // phantom input: everything released, the trooper should come to rest
    if (r.chance(0.25)) {
      await releaseAll();
      await sleep(700);
      if (!(await page.evaluate(() => !!window.__ST?.state))) continue;
      const q = await page.evaluate(() => ({ st: __ST.state(), paused: __ST.paused() }));
      if (q.paused) { await tap('pause'); await sleep(300); }
      else if (q.st.player.state === 'ground' && Math.abs(q.st.player.vx) > 0.5) {
        await rep.issue(page, { key: 'phantom', severity: 'major', title: 'Trooper keeps moving with no keys held', note: 'Likely a key stuck "down" after pause or focus change.', category: 'input', state: q.st, frame: q.st.frame });
      }
    }
  }
  await releaseAll();

  for (const e of consoleErrors) await rep.issue(page, { key: 'console:' + e.slice(0, 80), severity: 'blocker', title: `Console error: ${e.slice(0, 90)}`, category: 'crash', screenshot: false });
  rep.metric('seconds', seconds);
  rep.metric('behaviours', played);
  rep.metric('deaths', deaths);
  rep.metric('tilesVisited', visited.size);
  rep.metric('fps', await page.evaluate(() => __ST.fps()));
  rep.check('no crashes', consoleErrors.length === 0);
  rep.check('no stuck states', !rep.issues.some((i) => i.category === 'soft-lock'));
  await page.close(); // free the (software) GPU before the next page

  // the Cantina: mash everything, the hub must survive
  const hub = await hubMash(browser, url, rep, r, 15);
  rep.metric('cantina', hub);
  rep.check('Cantina survives button mashing', !rep.issues.some((i) => /Cantina/.test(i.title)) && hub.endedIn !== 'unknown', hub.endedIn);
  return rep;
}
