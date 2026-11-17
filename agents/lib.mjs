// Shared harness for the test agents: browser, server, issue collection.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const BTN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, JUMP: 16, ATTACK: 32, ROLL: 64, SWAP: 128 };
export const T = 24;

/** Small deterministic RNG so agent runs are reproducible from their seed. */
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (a, b) => Math.floor(next() * (b - a + 1)) + a, pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
}

export function rle(frames) {
  const out = [];
  for (const m of frames) {
    if (out.length && out[out.length - 2] === m) out[out.length - 1]++;
    else out.push(m, 1);
  }
  return out;
}

/** Expand [[mask, frames], ...] into one mask per frame. */
export function expand(macros) {
  const out = [];
  for (const [m, n] of macros) for (let i = 0; i < n; i++) out.push(m);
  return out;
}

export async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop: () => {} };
  const port = 4173 + Math.floor(Math.random() * 500);
  const win = process.platform === 'win32';
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: win, detached: !win });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const stop = () => {
    try { if (win) spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']); else process.kill(-proc.pid, 'SIGTERM'); } catch { /* already gone */ }
  };
  process.on('exit', stop);
  return { url, stop };
}

export async function launch() {
  const local = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
  const executablePath = process.env.CHROME_PATH || (process.env.CI ? undefined : local);
  return chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
}

export async function openGame(browser, baseUrl, { test = true, seed = 1, hub = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const consoleErrors = [];
  const failed = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/agent-reports|GL Driver|Failed to load resource|ERR_TUNNEL/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const external = (u) => /fonts\.(googleapis|gstatic)\.com/.test(u); // web fonts: optional, fall back offline
  page.on('requestfailed', (r) => { if (!external(r.url())) failed.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('agent-reports')) failed.push(`${r.status()} ${r.url()}`); });
  const mode = hub ? '' : test ? 'test=1&' : 'scene=run&';
  await page.goto(`${baseUrl}?${mode}seed=${seed}`);
  await page.waitForFunction(() => window.__ST?.ready, null, { timeout: 30000 });
  return { page, consoleErrors, failed };
}

/** Collects issues; repeated findings with the same key are merged and counted. */
export class Report {
  constructor(source, build) {
    this.source = source;
    this.build = build;
    this.map = new Map();
    this.metrics = {};
    this.checks = [];
  }
  check(name, ok, detail = '') { this.checks.push({ name, ok, detail }); }
  metric(k, v) { this.metrics[k] = v; }
  async issue(page, { key, severity, title, note = '', category = '', repro = '', seed = 1, start, inputs, state, frame, screenshot = true }) {
    const k = key ?? title;
    const prev = this.map.get(k);
    if (prev) { prev.count++; return prev; }
    const id = `${this.source.toUpperCase().slice(0, 3)}-${createHash('sha1').update(this.source + k).digest('hex').slice(0, 8)}`;
    let shot;
    if (screenshot && page) {
      try { shot = 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 55, scale: 'css', clip: { x: 0, y: 0, width: 960, height: 540 } })).toString('base64'); } catch { /* page gone */ }
    }
    const it = {
      id, created: new Date().toISOString(), source: this.source, severity, title, note, status: 'open',
      build: this.build, seed, frame: frame ?? 0, category, repro, start, state,
      inputsFull: inputs ? rle(inputs) : undefined, screenshot: shot, count: 1,
    };
    this.map.set(k, it);
    return it;
  }
  get issues() { return [...this.map.values()]; }
  toJSON() { return { source: this.source, build: this.build, metrics: this.metrics, checks: this.checks, issues: this.issues }; }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
