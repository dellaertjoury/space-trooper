// DEVELOPER AGENT — a QA engineer: checks the game's rules every frame under heavy random input,
// proves replays are deterministic, watches errors, assets, frame rate and memory/object leaks,
// and tests the issue logger + dashboard themselves.
import { BTN, expand, openGame, Report, rng, sleep } from './lib.mjs';
import { hubChecks } from './hub.mjs';

const { LEFT: L, RIGHT: R, UP: U, DOWN: D, JUMP: J, ATTACK: A, ROLL: RO, SWAP: S } = BTN;

/** Human-like random input: held directions, taps, occasional chords. */
function humanish(r, frames) {
  const out = [];
  let dir = 0;
  while (out.length < frames) {
    if (r.chance(0.2)) dir = r.pick([0, L, R, R]);
    let m = dir;
    if (r.chance(0.35)) m |= J;
    if (r.chance(0.25)) m |= A;
    if (r.chance(0.08)) m |= RO;
    if (r.chance(0.03)) m |= S;
    if (r.chance(0.06)) m |= r.pick([U, D]);
    const n = r.int(1, 20);
    for (let i = 0; i < n; i++) out.push(i < 3 ? m : m & ~(J | A | RO | S) | (m & J && r.chance(0.6) ? J : 0));
  }
  return out.slice(0, frames);
}

export async function runDev(browser, url, { seed = 23, fuzzRuns = 40, fuzzFrames = 4000 } = {}) {
  const { page, consoleErrors, failed } = await openGame(browser, url, { test: true });
  const build = await page.evaluate(() => __ST.build);
  const rep = new Report('dev', build);
  const r = rng(seed);
  const log = (m) => process.env.VERBOSE && console.log('   [dev]', m);

  log('1. load health');
  // ---------------------------------------------------------------- 1. load health
  await sleep(500);
  const tex = await page.evaluate(() => __ST.textures());
  const missing = tex.filter(([, ok]) => !ok).map(([k]) => k);
  rep.check('all textures loaded', !missing.length, missing.join(', '));
  if (missing.length) await rep.issue(page, { key: 'tex', severity: 'blocker', title: `Missing textures: ${missing.join(', ')}`, category: 'assets' });
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const g = c && (c.getContext('webgl2') || c.getContext('webgl'));
    const ext = g && g.getExtension('WEBGL_debug_renderer_info');
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'canvas/unknown';
  });
  rep.metric('renderer', gl);

  log('2. determinism');
  // ---------------------------------------------------------------- 2. determinism
  const masks = humanish(r, 3000);
  const [a, b] = await page.evaluate((m) => [__ST.simulate(5, m).hash, __ST.simulate(5, m).hash], masks);
  rep.check('same inputs give the same result (headless)', a === b, `${a} vs ${b}`);
  if (a !== b) await rep.issue(page, { key: 'det1', severity: 'blocker', title: 'Simulation is not deterministic: replays will not match', category: 'determinism', screenshot: false });
  // the real scene (with rendering + effects) must match the headless simulator
  const live = await page.evaluate((m) => { __ST.reset(5); __ST.run(m); return __ST.hash(); }, masks);
  rep.check('rendered game matches headless simulator', live === a, `${live} vs ${a}`);
  if (live !== a) await rep.issue(page, { key: 'det2', severity: 'major', title: 'Rendered game diverges from the headless simulator (replays of your issues may drift)', category: 'determinism', inputs: masks, seed: 5 });

  log('3. invariant fuzzing');
  // ---------------------------------------------------------------- 3. invariant fuzzing (headless, every frame)
  let frames = 0, violations = 0;
  for (let k = 0; k < fuzzRuns; k++) {
    const m = humanish(r, fuzzFrames);
    const res = await page.evaluate((mm) => __ST.simulate(1, mm), m);
    frames += m.length;
    if (res.violations.length) {
      violations++;
      const v = res.violations[0];
      const kind = v.msgs[0].replace(/[-\d.]+/g, '#');
      const cut = m.slice(0, v.frame + 1);
      await page.evaluate((mm) => { __ST.reset(1); __ST.run(mm); }, cut);
      await rep.issue(page, { key: 'fuzz:' + kind, severity: 'major', title: `Rule broken under random input: ${v.msgs[0]}`, note: `Fuzz run ${k}, frame ${v.frame}. Replay reproduces it exactly.`, category: 'invariant', inputs: cut, frame: v.frame, state: res.state });
    }
  }
  rep.metric('fuzz', { runs: fuzzRuns, frames, runsWithViolations: violations });
  rep.check('no rule violations during fuzzing', violations === 0, `${frames} frames`);

  log('4. real-time performance');
  // ---------------------------------------------------------------- 4. real-time performance + leaks
  await page.goto(url + '?scene=run&seed=1');
  await page.waitForFunction(() => window.__ST?.ready);
  await sleep(800);
  const before = await page.evaluate(() => ({ o: __ST.objects(), t: __ST.tweens(), heap: performance.memory?.usedJSHeapSize ?? 0 }));
  // 12 s of heavy combat effects: shoot + slash + jump near the droids
  await page.evaluate(() => __ST.teleport(88, 26));
  const t0 = Date.now();
  let tick = 0;
  while (Date.now() - t0 < 12000) {
    const keys = tick % 4 === 0 ? ['KeyJ'] : tick % 4 === 1 ? ['Space'] : tick % 4 === 2 ? ['KeyJ', 'ArrowRight'] : ['KeyQ'];
    for (const k of keys) await page.keyboard.down(k);
    await sleep(70);
    for (const k of keys) await page.keyboard.up(k);
    await sleep(40);
    tick++;
  }
  await sleep(1500); // let effects finish
  const after = await page.evaluate(() => ({ o: __ST.objects(), t: __ST.tweens(), heap: performance.memory?.usedJSHeapSize ?? 0, fps: __ST.fps() }));
  rep.metric('performance', { fps: after.fps, objectsBefore: before.o, objectsAfter: after.o, tweensAfter: after.t, heapGrowthMB: +((after.heap - before.heap) / 1048576).toFixed(1) });
  const software = /SwiftShader|llvmpipe|software/i.test(gl);
  rep.check('frame rate', after.fps >= 55 || software, `${after.fps} fps${software ? ' (software renderer: not judged)' : ''}`);
  if (after.fps < 55 && !software) await rep.issue(page, { key: 'fps', severity: 'major', title: `Low frame rate in combat: ${after.fps} fps`, category: 'performance' });
  const leak = after.o - before.o;
  rep.check('no game-object leak', leak < 40, `${before.o} → ${after.o}`);
  if (leak >= 40) await rep.issue(page, { key: 'leak', severity: 'major', title: `Game objects leak: ${before.o} → ${after.o} after 12 s of combat`, category: 'performance' });

  log('5. issue logger');
  // ---------------------------------------------------------------- 5. issue logger + dashboard self-test
  const tracker = {};
  await page.keyboard.press('F8');
  await page.waitForSelector('#st-title', { timeout: 20000 }).then(() => (tracker.logger = true)).catch(() => (tracker.logger = false));
  if (tracker.logger) {
    await page.fill('#st-title', 'dev-agent self test');
    await page.press('#st-title', 'Enter');
    await sleep(300);
    tracker.paused = !(await page.evaluate(() => __ST.paused()));
    await page.keyboard.press('F9');
    tracker.dashboard = await page.waitForSelector('.st-dash', { timeout: 20000 }).then(() => true).catch(() => false);
    tracker.listed = await page.evaluate(() => [...document.querySelectorAll('.st-title')].some((e) => e.textContent.includes('dev-agent self test')));
    const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.click('#st-export').catch(() => {});
    const d = await dl;
    tracker.export = !!d;
    if (d) {
      const p = await d.path();
      const { readFile } = await import('node:fs/promises');
      const j = JSON.parse(await readFile(p, 'utf8'));
      const mine = j.issues.find((i) => i.title === 'dev-agent self test');
      tracker.exportHasReplay = !!mine?.inputsFull?.length && typeof mine.seed === 'number' && !!mine.state;
      tracker.exportHasScreenshot = !!mine?.screenshot;
    }
    await page.keyboard.press('Escape');
  }
  rep.metric('issueTooling', tracker);
  for (const [k, v] of Object.entries(tracker)) {
    rep.check(`issue tool: ${k}`, !!v);
    if (!v) await rep.issue(page, { key: 'tool:' + k, severity: 'major', title: `Issue logger/dashboard check failed: ${k}`, category: 'tooling' });
  }

  log('6. errors seen');
  // ---------------------------------------------------------------- 7. Cantina hub
  log('7. cantina');
  const hub = await hubChecks(browser, url, rep);
  rep.metric('cantina', hub);
  rep.check('Cantina: all stations usable', hub.stations === 5 && ['scrapper', 'forge', 'armoury', 'workshop', 'mission'].every((k) => hub[k] && hub[k].blocked === 0));
  rep.check('Cantina: buying works', !!hub.buy);
  rep.check('Cantina: both floors joined by the stairs (and only the stairs)', !!hub.floorsReachable, JSON.stringify(hub.climb));
  rep.check('Cantina: launch + return through the exit door (Space)', !!hub.launch && !!hub.return);

  // ---------------------------------------------------------------- 6. errors seen along the way
  for (const e of consoleErrors) await rep.issue(page, { key: 'console:' + e.slice(0, 80), severity: 'blocker', title: `Console error: ${e.slice(0, 90)}`, category: 'crash', screenshot: false });
  for (const f of failed) await rep.issue(page, { key: 'net:' + f, severity: 'major', title: `Failed request: ${f.slice(0, 100)}`, category: 'assets', screenshot: false });
  rep.check('no console errors', consoleErrors.length === 0);
  await page.close();
  return rep;
}
