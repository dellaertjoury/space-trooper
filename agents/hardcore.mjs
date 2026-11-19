// HARDCORE AGENT — plays like a speedrunner / exploit hunter, frame-perfect.
// Uses the game's headless simulator to search thousands of input sequences.
// Looks for: unreachable areas, wall clips, out-of-bounds, abusable tech, balance problems.
import { BTN, expand, openGame, Report, rng, T } from './lib.mjs';

const { LEFT: L, RIGHT: R, UP: U, DOWN: D, JUMP: J, ATTACK: A, ROLL: RO, SWAP: S } = BTN;
const ALPHABET = [R, L, R | J, L | J, J, R | RO, L | RO, U | J, D, 0, R | U, L | U];
// movement puzzles are about the level, so the route searches run without enemies
const CALM = { enemies: false };
const DUR = [1, 2, 4, 8, 12, 16, 24, 32];

/** Evolutionary search for an input sequence that brings the player into a goal rectangle (tiles). */
export async function search(page, { start, goal, prefix = [], gens = 70, pop = 80, seed = 1 }) {
  const r = rng(seed);
  const rnd = () => [r.pick(ALPHABET), r.pick(DUR)];
  let popn = Array.from({ length: pop }, () => Array.from({ length: r.int(1, 5) }, rnd));
  const gx0 = goal.x0 * T, gx1 = (goal.x1 + 1) * T, gy0 = goal.y0 * T, gy1 = (goal.y1 + 1) * T;
  const dist = (p) => {
    const cx = p.x + 10, fy = p.y + 56;
    const dx = cx < gx0 ? gx0 - cx : cx > gx1 ? cx - gx1 : 0;
    const dy = fy < gy0 ? gy0 - fy : fy > gy1 ? fy - gy1 : 0;
    return Math.hypot(dx, dy);
  };
  let best = { d: Infinity };
  for (let g = 0; g < gens; g++) {
    const jobs = popn.map((m) => ({ seed: 1, masks: [...prefix, ...expand(m)], start, opts: CALM }));
    const res = await page.evaluate((j) => __ST.simulateMany(j).map((x) => ({ trace: x.trace, violations: x.violations })), jobs);
    const scored = popn.map((m, i) => {
      let d = Infinity, hitF = -1;
      for (const p of res[i].trace) { if (p.f < prefix.length) continue; const dd = dist(p); if (dd < d) { d = dd; } if (dd === 0 && hitF < 0) { hitF = p.f; } }
      const frames = jobs[i].masks.length;
      return { m, d, hitF, frames, score: d + frames * 0.02 };
    }).sort((a, b) => (a.hitF >= 0 && b.hitF >= 0 ? a.hitF - b.hitF : a.score - b.score));
    if (scored[0].d < best.d || (scored[0].hitF >= 0 && (best.hitF < 0 || scored[0].hitF < best.hitF))) best = { ...scored[0], gen: g };
    if (best.hitF >= 0 && g > 12) break; // reached, spent a few generations shortening
    const elite = scored.slice(0, 16).map((x) => x.m);
    popn = [...elite];
    while (popn.length < pop) {
      const parent = r.pick(elite).map((x) => [...x]);
      const op = r.next();
      if (op < 0.45) parent.push(...Array.from({ length: r.int(1, 3) }, rnd));
      else if (op < 0.7 && parent.length) parent[r.int(0, parent.length - 1)] = rnd();
      else if (op < 0.85 && parent.length) parent[r.int(0, parent.length - 1)][1] = r.pick(DUR);
      else if (parent.length > 1) parent.splice(r.int(0, parent.length - 1), 1);
      popn.push(parent);
    }
  }
  return best;
}

/** Tiles where a body can stand next to something interesting (walls, edges, one-ways, low ceilings). */
function interestingStarts(level) {
  const { w, h, tiles } = level;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x]);
  const out = [];
  for (let y = 3; y < h; y++) for (let x = 2; x < w - 2; x++) {
    const stand = at(x, y) === 0 && at(x, y - 1) === 0 && at(x, y - 2) === 0 && (at(x, y + 1) === 1 || at(x, y + 1) === 2);
    if (!stand) continue;
    const near = at(x - 1, y) === 1 || at(x + 1, y) === 1 || at(x, y - 3) === 1 || at(x - 1, y + 1) === 0 || at(x + 1, y + 1) === 0 || at(x, y + 1) === 2;
    if (near) out.push({ tx: x, ty: y + 1 });
  }
  return out;
}

export async function runHardcore(browser, url, { seed = 11, fuzzPerStart = 24 } = {}) {
  const { page, consoleErrors } = await openGame(browser, url, { test: true });
  const build = await page.evaluate(() => __ST.build);
  const rep = new Report('hardcore', build);
  const sim = (masks, start, opts = CALM) => page.evaluate(([m, s, o]) => __ST.simulate(1, m, s, o), [masks, start, opts]);
  const showAndShoot = async (masks, start, uptoFrame) => {
    await page.evaluate(([m, s, n]) => { __ST.reset(1); if (s) __ST.teleport(s.tx, s.ty); __ST.run(m.slice(0, n)); }, [masks, start, uptoFrame ?? masks.length]);
  };

  // ---------------------------------------------------------------- 1. movement metrics
  const spawnY = (await sim([0, 0], undefined)).state.player.y;
  const full = await sim(expand([[0, 5], [J, 45]]));
  const hop = await sim(expand([[0, 5], [J, 1], [0, 40]]));
  const dbl = await sim(expand([[0, 5], [J, 12], [0, 2], [J, 45]]));
  const run = await sim(expand([[0, 5], [R, 40]])); // spawn is 11 tiles from the first step
  const roll = await sim(expand([[0, 10], [R | RO, 1], [R, 0], [0, 30]]));
  const roll0 = (await sim(expand([[0, 10]]))).state.player.x;
  const m = {
    jumpHeightPx: spawnY - full.minY, shortHopPx: spawnY - hop.minY, doubleJumpPx: spawnY - dbl.minY,
    runSpeedPxPerSec: Math.round(run.state.player.vx * 60), rollDistancePx: roll.state.player.x - roll0,
  };
  rep.metric('movement', m);
  const want = { jumpHeightPx: [80, 120], shortHopPx: [20, 50], doubleJumpPx: [150, 210], runSpeedPxPerSec: [180, 260], rollDistancePx: [110, 170] };
  for (const [k, [lo, hi]] of Object.entries(want)) {
    const ok = m[k] >= lo && m[k] <= hi;
    rep.check(`${k} in ${lo}-${hi}`, ok, String(m[k]));
    if (!ok) await rep.issue(page, { key: 'feel:' + k, severity: 'minor', title: `Movement feel: ${k} is ${m[k]} (target ${lo}-${hi})`, category: 'feel', screenshot: false });
  }

  // ---------------------------------------------------------------- 2. route challenges
  const routes = [
    { name: 'Climb the wall-jump shaft onto the right pillar', start: { tx: 61, ty: 26 }, goal: { x0: 70, x1: 71, y0: 10, y1: 10 } },
    { name: 'Roll under the hanging wall', start: { tx: 50, ty: 26 }, goal: { x0: 58, x1: 60, y0: 25, y1: 25 } },
    { name: 'Reach the high platform from the ledge block', start: { tx: 79, ty: 21 }, goal: { x0: 86, x1: 96, y0: 14, y1: 14 } },
    { name: 'Get over the low wall to the exit', start: { tx: 92, ty: 26 }, via: [{ x0: 97, x1: 99, y0: 18, y1: 18 }], goal: { x0: 101, x1: 107, y0: 25, y1: 25 } },
    { name: 'Climb out of the pit', start: { tx: 45, ty: 28 }, goal: { x0: 48, x1: 50, y0: 25, y1: 25 } },
    { name: 'Single-wall climb (right side of the pillar, no second wall)', start: { tx: 72, ty: 26 }, goal: { x0: 70, x1: 71, y0: 10, y1: 10 }, exploit: true },
  ];
  const routeResults = [];
  for (const [i, rt] of routes.entries()) {
    // chain through waypoints (straight-line distance alone gets stuck behind walls)
    let prefix = [], best;
    for (const [w, g] of [...(rt.via ?? []), rt.goal].entries()) {
      best = await search(page, { start: rt.start, goal: g, prefix, seed: seed + i * 10 + w });
      if (best.hitF < 0) break;
      prefix = [...prefix, ...expand(best.m)].slice(0, best.hitF + 1);
    }
    if (best.hitF >= 0) best = { ...best, m: [], full: prefix };
    const ok = best.hitF >= 0;
    routeResults.push({ route: rt.name, reached: ok, frames: ok ? best.hitF : null, seconds: ok ? +(best.hitF / 60).toFixed(2) : null, closestPx: Math.round(best.d) });
    if (rt.exploit) {
      if (ok) {
        const masks = best.full;
        await showAndShoot(masks, rt.start, best.hitF + 1);
        await rep.issue(page, { key: 'single-wall', severity: 'idea', title: 'A single wall can be climbed (wall jump + air control back + ledge grab)', note: `Reached the top of the 15-tile pillar in ${(best.hitF / 60).toFixed(1)} s using only its right face. Dead Cells allows similar tricks; decide if this is intended. If not: longer wall-jump lock or no wall-slide right after a wall jump on the same wall.`, category: 'exploit', start: rt.start, inputs: masks.slice(0, best.hitF + 1), repro: `start tile ${rt.start.tx},${rt.start.ty}; replay from the dashboard` });
      }
      continue;
    }
    rep.check(`route: ${rt.name}`, ok, ok ? `${(best.hitF / 60).toFixed(2)} s` : `closest ${Math.round(best.d)} px`);
    if (!ok) {
      await showAndShoot(expand(best.m), rt.start);
      await rep.issue(page, { key: 'route:' + rt.name, severity: 'major', title: `Could not complete: ${rt.name}`, note: `Best attempt ended ${Math.round(best.d)} px from the goal after a frame-perfect search. Either the gap is too big or a move is missing.`, category: 'level', start: rt.start, inputs: expand(best.m) });
    }
  }
  rep.metric('routes', routeResults);

  // full-course speedrun from the spawn, searched one waypoint at a time (inputs carry over between legs)
  const legs = [
    { x0: 40, x1: 43, y0: 25, y1: 25 }, { x0: 62, x1: 63, y0: 25, y1: 25 }, { x0: 70, x1: 71, y0: 10, y1: 10 },
    { x0: 78, x1: 81, y0: 20, y1: 20 }, { x0: 97, x1: 99, y0: 18, y1: 18 }, { x0: 101, x1: 107, y0: 25, y1: 25 },
  ];
  let prefix = [], srOk = true, closest = 0;
  for (const [i, goal] of legs.entries()) {
    const best = await search(page, { start: undefined, goal, prefix, gens: 90, pop: 70, seed: seed + 50 + i });
    if (best.hitF < 0) { srOk = false; closest = Math.round(best.d); break; }
    prefix = [...prefix, ...expand(best.m)].slice(0, best.hitF + 1);
  }
  rep.metric('speedrun', srOk ? { seconds: +(prefix.length / 60).toFixed(2), frames: prefix.length } : { reached: false, closestPx: closest });
  rep.check('full course is completable', srOk, srOk ? `${(prefix.length / 60).toFixed(2)} s from spawn` : `stuck ${closest} px from a waypoint`);
  if (srOk) rep.metric('speedrunInputs', prefix.length);

  // ---------------------------------------------------------------- 3. exploit hunt at every interesting corner
  const level = await page.evaluate(() => __ST.level());
  const starts = interestingStarts(level);
  const r = rng(seed + 5);
  const AGGRO = [R | RO, L | RO, R | J, L | J, J, D | J, U | J, R, L, D, D | RO, R | A, L | A, 0, R | J | RO, L | J | RO];
  let sims = 0;
  for (const st of starts) {
    const jobs = [];
    for (let k = 0; k < fuzzPerStart; k++) {
      const macros = Array.from({ length: r.int(4, 14) }, () => [r.pick(AGGRO), r.pick([1, 1, 2, 3, 5, 8, 12, 20])]);
      jobs.push({ seed: 1, masks: expand(macros), start: st });
    }
    sims += jobs.length;
    const res = await page.evaluate((j) => __ST.simulateMany(j).map((x) => x.violations), jobs);
    for (const [i, v] of res.entries()) {
      if (!v.length) continue;
      const msg = v[0].msgs[0];
      const kind = msg.replace(/[-\d.]+/g, '#');
      const masks = jobs[i].masks.slice(0, v[0].frame + 1);
      await showAndShoot(masks, st);
      await rep.issue(page, { key: 'clip:' + kind, severity: 'major', title: `Exploit/clip: ${msg}`, note: `Found by frame-perfect input near tile ${st.tx},${st.ty} after ${v[0].frame} frames.`, category: 'collision', start: st, inputs: masks, repro: `start tile ${st.tx},${st.ty}, ${masks.length} frames; use Replay` });
    }
  }
  rep.metric('exploitSearch', { startTiles: starts.length, sequences: sims });
  rep.check('no clips or out-of-bounds found', !rep.issues.some((i) => i.category === 'collision'));

  // ---------------------------------------------------------------- 4. balance
  // measured on test-only training targets (the game itself has none): a fixed target makes DPS comparable
  const nearDummy = { tx: 88, ty: 26 };
  const TARGETS = { enemies: false, dummies: true };
  const sab = await sim(expand(Array.from({ length: 50 }, () => [[A, 1], [0, 5]]).flat()), nearDummy, TARGETS);
  const blas = await sim(expand([[S, 1], [0, 2], [A, 300]]), nearDummy, TARGETS);
  const cancel = await sim(expand(Array.from({ length: 30 }, () => [[A, 1], [0, 10], [RO, 1], [0, 1]]).flat()), nearDummy, TARGETS);
  const sec = (x) => x.state.frame / 60;
  const dps = { saberCombo: Math.round(sab.state.stats.damage / sec(sab)), blaster: Math.round(blas.state.stats.damage / sec(blas)), saberRollCancel: Math.round(cancel.state.stats.damage / sec(cancel)) };
  rep.metric('dps', dps);
  if (dps.blaster > dps.saberCombo) await rep.issue(page, { key: 'bal:blaster', severity: 'idea', title: `Balance: blaster DPS (${dps.blaster}) beats the saber combo (${dps.saberCombo})`, note: 'The ranged weapon is safer, so it should usually deal less damage.', category: 'balance', screenshot: false });
  if (dps.saberRollCancel > dps.saberCombo * 0.9) await rep.issue(page, { key: 'bal:cancel', severity: 'idea', title: `Balance: roll-cancelling the first slash (${dps.saberRollCancel} DPS) is as strong as the full combo (${dps.saberCombo})`, note: 'Players will spam slash-roll instead of combos. Consider a longer roll cooldown after a cancel.', category: 'balance', screenshot: false });
  const spam = await sim(expand(Array.from({ length: 40 }, () => [[R | RO, 1], [R, 30]]).flat()));
  const invPct = Math.round((spam.invulnFrames / spam.state.frame) * 100);
  rep.metric('rollSpamInvulnerablePct', invPct);
  if (invPct > 60) await rep.issue(page, { key: 'bal:iframes', severity: 'minor', title: `Roll spam keeps you invulnerable ${invPct}% of the time`, category: 'balance', screenshot: false });

  // ---------------------------------------------------------------- 5. enemies: fair and beatable
  // a simple, honest fighter: walk up, slash, and roll away from a telegraphed wind-up
  const duel = {};
  for (const [name, idx, start] of [['raider', 0, { tx: 30, ty: 26 }], ['gunner', 2, { tx: 88, ty: 15 }]]) {
    duel[name] = await page.evaluate(([idx, start]) => {
      __ST.reset(1); __ST.teleport(start.tx, start.ty);
      let hits = 0, rolls = 0;
      for (let t = 0; t < 1800; t++) {
        const s = __ST.state(), p = s.player, e = s.enemies[idx];
        if (!e || e.state === 'dead' || p.state === 'dead') break;
        const dx = e.x + 11 - (p.x + 10), dir = dx > 0 ? 2 : 1;
        let m = 0;
        if (e.state === 'windup' && Math.abs(dx) < 70) { m = dir | 64; rolls++; }  // dodge through it
        else if (Math.abs(dx) > 34) m = dir;
        else if (t % 7 === 0) { m = 32; hits++; }
        __ST.step(1, m);
      }
      const s = __ST.state();
      return { enemyDown: s.enemies[idx].state === 'dead', hpLeft: s.player.hp, playerState: s.player.state, swings: hits, dodges: rolls, seconds: +(s.frame / 60).toFixed(1) };
    }, [idx, start]);
  }
  rep.metric('duels', duel);
  rep.check('a raider can be cut down with the saber', duel.raider.enemyDown, JSON.stringify(duel.raider));
  rep.check('a gunner can be cut down with the saber', duel.gunner.enemyDown, JSON.stringify(duel.gunner));
  for (const [k, d] of Object.entries(duel)) {
    if (d.enemyDown && d.hpLeft < 30) await rep.issue(page, { key: 'bal:duel:' + k, severity: 'minor', title: `Balance: face-tanking one ${k} costs ${100 - d.hpLeft} of 100 HP`, note: 'Holding attack without dodging should cost something, but one basic enemy taking most of your health feels unfair this early.', category: 'balance', screenshot: false });
  }

  for (const e of consoleErrors) await rep.issue(page, { key: 'console:' + e.slice(0, 80), severity: 'blocker', title: `Console error: ${e.slice(0, 90)}`, category: 'crash', screenshot: false });
  await page.close();
  return rep;
}
