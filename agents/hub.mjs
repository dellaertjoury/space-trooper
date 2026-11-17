// Cantina hub checks shared by the agents.
import { openGame, sleep } from './lib.mjs';

/** Developer: every station opens, every enabled button can really be clicked, buying works, launch + return work. */
export async function hubChecks(browser, url, rep) {
  const { page, consoleErrors } = await openGame(browser, url, { hub: true });
  const res = {};
  await page.evaluate(() => localStorage.removeItem('st.profile.v1'));
  await page.reload();
  await page.waitForFunction(() => window.__ST?.scene === 'cantina', null, { timeout: 30000 });
  res.loadsInCantina = true;
  const stations = await page.evaluate(() => __ST.stations().map((s) => s.id));
  res.stations = stations.length;
  for (const id of stations) {
    await page.evaluate((id) => __ST.open(id), id);
    await page.waitForSelector('#st-station .panel', { timeout: 10000 });
    // a button is usable only if the element at its centre is the button itself (nothing overlapping it)
    const blocked = await page.evaluate(() => [...document.querySelectorAll('#st-station button:not([disabled])')].filter((b) => {
      b.scrollIntoView({ block: 'center' }); // panels scroll on small screens; test what the player can reach
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return true;
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(el === b || b.contains(el));
    }).map((b) => b.textContent.trim()));
    const count = await page.locator('#st-station button').count();
    if (blocked.length) await rep.issue(page, { key: 'hub-blocked:' + id, severity: 'major', title: `Cantina ${id}: ${blocked.length} button(s) covered by other elements (${blocked.slice(0, 3).join(', ')})`, category: 'ui' });
    if (count < 2) await rep.issue(page, { key: 'hub-empty:' + id, severity: 'major', title: `Cantina ${id}: panel has no actions`, category: 'ui' });
    res[id] = { buttons: count, blocked: blocked.length };
    await page.keyboard.press('Escape');
    await sleep(200);
    if (await page.evaluate(() => __ST.isOpen())) await rep.issue(page, { key: 'hub-esc:' + id, severity: 'major', title: `Cantina ${id}: Escape does not close the panel`, category: 'ui' });
  }
  // buying deducts the price and is saved
  const before = await page.evaluate(() => __ST.profile());
  await page.evaluate(() => __ST.open('scrapper'));
  await page.click('[data-act="buy"][data-arg="shield"]', { timeout: 10000 });
  const after = await page.evaluate(() => __ST.profile());
  res.buy = after.res.credits === before.res.credits - 40 && after.nextRunShield === 25;
  if (!res.buy) await rep.issue(page, { key: 'hub-buy', severity: 'major', title: 'Scrapper purchase did not deduct credits or grant the overshield', category: 'economy' });
  await page.keyboard.press('Escape');
  // launch and come back through the exit door
  await page.evaluate(() => __ST.launch());
  await page.waitForFunction(() => window.__ST?.state, null, { timeout: 30000 }).catch(() => null);
  const run = await page.evaluate(() => window.__ST?.state?.());
  res.launch = !!run && run.loadout?.shield === 25;
  if (!res.launch) await rep.issue(page, { key: 'hub-launch', severity: 'blocker', title: 'Launching a mission from the Cantina failed or lost the loadout', category: 'flow' });
  if (run) {
    await page.evaluate(() => __ST.teleport(105, 26));
    await sleep(300);
    await page.keyboard.down('ArrowUp'); await sleep(150); await page.keyboard.up('ArrowUp');
    const back = await page.waitForFunction(() => window.__ST?.scene === 'cantina', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const prof = back ? await page.evaluate(() => __ST.profile()) : null;
    res.return = back && prof.runs === 1 && prof.nextRunShield === 0;
    if (!res.return) await rep.issue(page, { key: 'hub-return', severity: 'blocker', title: 'Exit door did not bring the Trooper back to the Cantina with the run banked', category: 'flow' });
  }
  for (const e of consoleErrors) await rep.issue(page, { key: 'hubconsole:' + e.slice(0, 80), severity: 'blocker', title: `Console error in the Cantina: ${e.slice(0, 90)}`, category: 'crash', screenshot: false });
  await page.close();
  return res;
}

/** Kid: mash everything in the Cantina for a while; the hub must survive and stay usable. */
export async function hubMash(browser, url, rep, r, seconds = 15) {
  const { page, consoleErrors } = await openGame(browser, url, { hub: true });
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyE', 'Enter', 'Escape', 'Space', 'KeyJ', 'KeyK', 'KeyQ', 'Tab'];
  const t0 = Date.now();
  let opened = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const k = r.pick(keys);
    await page.keyboard.down(k); await sleep(r.int(40, 600)); await page.keyboard.up(k);
    if (r.chance(0.15)) await page.mouse.click(r.int(50, 1200), r.int(50, 650));
    if (await page.evaluate(() => window.__ST?.isOpen?.())) opened++;
  }
  // whatever happened, Escape must get us back to walking (or we're in a run)
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(150); }
  const end = await page.evaluate(() => ({ scene: window.__ST?.scene ?? (window.__ST?.state ? 'run' : 'unknown'), open: window.__ST?.isOpen?.() ?? false }));
  if (end.open) await rep.issue(page, { key: 'hub-stuck-panel', severity: 'major', title: 'A Cantina panel stayed open after Escape', category: 'soft-lock' });
  if (end.scene === 'unknown') await rep.issue(page, { key: 'hub-lost', severity: 'blocker', title: 'Game lost its scene after button mashing in the Cantina', category: 'crash' });
  for (const e of consoleErrors) await rep.issue(page, { key: 'hubconsole:' + e.slice(0, 80), severity: 'blocker', title: `Console error in the Cantina: ${e.slice(0, 90)}`, category: 'crash', screenshot: false });
  await page.close();
  return { panelsSeenOpen: opened, endedIn: end.scene };
}
