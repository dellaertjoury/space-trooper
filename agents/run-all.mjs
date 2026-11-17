// Runs the test agents and writes one report the in-game dashboard (F9) reads.
//   npm run agents            all three
//   npm run agent:kid         just one (kid | hardcore | dev)
// Options via env: BASE_URL (test a deployed build), KID_SECONDS, QUICK=1
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { launch, startServer } from './lib.mjs';
import { runKid } from './kid.mjs';
import { runHardcore } from './hardcore.mjs';
import { runDev } from './dev.mjs';

const which = process.argv[2] ? [process.argv[2]] : ['dev', 'hardcore', 'kid'];
const quick = !!process.env.QUICK;
const server = await startServer();
const browser = await launch();
const reports = {};
const started = Date.now();
try {
  for (const name of which) {
    const t = Date.now();
    process.stdout.write(`▶ ${name} agent… `);
    const rep =
      name === 'kid' ? await runKid(browser, server.url, { seconds: Number(process.env.KID_SECONDS ?? (quick ? 20 : 45)) }) :
      name === 'hardcore' ? await runHardcore(browser, server.url, { fuzzPerStart: quick ? 8 : 24 }) :
      await runDev(browser, server.url, { fuzzRuns: quick ? 10 : 40 });
    reports[name] = rep.toJSON();
    const failedChecks = rep.checks.filter((c) => !c.ok).length;
    console.log(`${rep.issues.length} issues, ${rep.checks.length - failedChecks}/${rep.checks.length} checks passed (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    for (const c of rep.checks) console.log(`   ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
    for (const i of rep.issues) console.log(`   • [${i.severity}] ${i.title}${i.count > 1 ? ` ×${i.count}` : ''}`);
  }
} finally {
  await browser.close();
  server.stop();
}

// merge with previous results of agents that did not run this time
const outDir = 'public/agent-reports';
await mkdir(outDir, { recursive: true });
let prev = {};
if (existsSync(`${outDir}/latest.json`)) {
  try { prev = JSON.parse(await readFile(`${outDir}/latest.json`, 'utf8')).agents ?? {}; } catch { /* ignore */ }
}
const agents = { ...prev, ...reports };
const issues = Object.values(agents).flatMap((r) => r.issues);
const out = {
  generated: new Date().toISOString(),
  build: Object.values(reports)[0]?.build ?? 'unknown',
  summary: Object.fromEntries(Object.entries(agents).map(([k, r]) => [k, { issues: r.issues.length, checks: r.checks.length, failed: r.checks.filter((c) => !c.ok).length, metrics: r.metrics }])),
  agents,
  issues,
};
await writeFile(`${outDir}/latest.json`, JSON.stringify(out));
if (existsSync('dist')) { await mkdir('dist/agent-reports', { recursive: true }); await writeFile('dist/agent-reports/latest.json', JSON.stringify(out)); }
console.log(`\nReport: ${outDir}/latest.json · ${issues.length} issues · ${((Date.now() - started) / 1000).toFixed(0)} s total. Open the game and press F9.`);
if (process.env.CI && issues.some((i) => i.severity === 'blocker')) process.exitCode = 1;
