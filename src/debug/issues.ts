/**
 * Issue logger (F8) + dashboard (F9). Plain DOM on top of the game canvas.
 * Your issues live in localStorage; agent issues are loaded from agent-reports/latest.json.
 * Export gives one JSON file with everything needed to reproduce each issue.
 */
export type Source = 'player' | 'kid' | 'hardcore' | 'dev';
export type Severity = 'blocker' | 'major' | 'minor' | 'idea';
export type Status = 'open' | 'fixed' | 'wontfix';

export interface Issue {
  id: string;
  created: string;
  source: Source;
  severity: Severity;
  title: string;
  note: string;
  status: Status;
  build: string;
  seed: number;
  frame: number;
  category?: string;
  state?: unknown;
  inputsTail?: number[]; // run-length encoded masks, last ~10 s
  inputsFull?: number[]; // run-length encoded masks since the run started (for exact replay)
  screenshot?: string; // small JPEG data URL
  repro?: string;
  start?: { tx: number; ty: number }; // agents may start a test from a tile instead of the spawn
  count?: number; // agents merge duplicates
  env?: string;
}

export interface Host {
  build: string;
  pause(on: boolean): void;
  screenshot(): Promise<string | undefined>;
  context(): { seed: number; frame: number; state: unknown; inputsTail: number[]; inputsFull: number[] };
  replay(issue: Issue): void;
}

const KEY = 'st.issues.v1';
const STATUS_KEY = 'st.agentStatus.v1';
const SEV: Severity[] = ['blocker', 'major', 'minor', 'idea'];
const SEV_COLOR: Record<Severity, string> = { blocker: '#ff4a5a', major: '#ff9a3c', minor: '#46c8ff', idea: '#9a8cff' };
const SRC_LABEL: Record<Source, string> = { player: 'You', kid: 'Kid agent', hardcore: 'Hardcore agent', dev: 'Developer agent' };

export class IssueTracker {
  private mine: Issue[] = [];
  private agent: Issue[] = [];
  private agentMeta: { generated?: string; build?: string; summary?: Record<string, unknown> } = {};
  private agentStatus: Record<string, Status> = {};
  private root: HTMLDivElement;
  private open: 'none' | 'log' | 'dash' = 'none';
  private filters = { source: 'all', severity: 'all', status: 'open', q: '' };
  private toastEl: HTMLDivElement;

  setHost(h: Host) { this.host = h; }

  constructor(private host: Host) {
    try { this.mine = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { this.mine = []; }
    try { this.agentStatus = JSON.parse(localStorage.getItem(STATUS_KEY) ?? '{}'); } catch { this.agentStatus = {}; }
    this.root = document.createElement('div');
    this.root.id = 'st-overlay';
    document.body.appendChild(this.root);
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'st-toast';
    document.body.appendChild(this.toastEl);
    injectStyles();
    this.loadAgentReport();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F8') { e.preventDefault(); this.openLogger(); }
      else if (e.code === 'F9') { e.preventDefault(); this.toggleDashboard(); }
      else if (e.code === 'Escape' && this.open !== 'none') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
    if (location.hash === '#dashboard') setTimeout(() => this.toggleDashboard(), 300);
  }

  get isOpen() { return this.open !== 'none'; }

  all(): Issue[] {
    const agent = this.agent.map((i) => ({ ...i, status: this.agentStatus[i.id] ?? i.status }));
    return [...this.mine, ...agent].sort((a, b) => b.created.localeCompare(a.created));
  }

  /** Used by the agents (and the console) to add an issue without the UI. */
  add(partial: Partial<Issue> & { title: string }): Issue {
    const ctx = this.host.context();
    const issue: Issue = {
      id: 'P-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      created: new Date().toISOString(),
      source: 'player', severity: 'minor', note: '', status: 'open',
      build: this.host.build, seed: ctx.seed, frame: ctx.frame, state: ctx.state,
      inputsTail: ctx.inputsTail, inputsFull: ctx.inputsFull,
      env: navigator.userAgent,
      ...partial,
    };
    this.mine.push(issue);
    this.save();
    return issue;
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.mine));
    } catch {
      // storage full: drop screenshots from the oldest issues and retry
      for (const i of this.mine) { if (i.screenshot) { delete i.screenshot; break; } }
      try { localStorage.setItem(KEY, JSON.stringify(this.mine)); } catch { this.toast('Storage full: export and clear fixed issues'); }
    }
    localStorage.setItem(STATUS_KEY, JSON.stringify(this.agentStatus));
  }

  private async loadAgentReport() {
    try {
      const r = await fetch('agent-reports/latest.json', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      this.agent = (j.issues ?? []) as Issue[];
      this.agentMeta = { generated: j.generated, build: j.build, summary: j.summary };
      if (this.open === 'dash') this.renderDashboard();
    } catch { /* no report yet */ }
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout((this.toastEl as any)._t);
    (this.toastEl as any)._t = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  close() {
    this.open = 'none';
    this.root.innerHTML = '';
    this.root.className = '';
    this.host.pause(false);
  }

  // ------------------------------------------------------------ logger
  async openLogger() {
    if (this.open === 'log') return;
    this.host.pause(true);
    const shot = await this.host.screenshot();
    const ctx = this.host.context();
    const st: any = ctx.state;
    this.open = 'log';
    this.root.className = 'st-modal-wrap';
    this.root.innerHTML = `
      <div class="st-modal" role="dialog" aria-label="Log an issue">
        <div class="st-h">LOG AN ISSUE <span class="st-dim">frame ${ctx.frame} · ${st?.player?.state ?? ''} · tile ${st?.player?.tileX},${st?.player?.tileY}</span></div>
        ${shot ? `<img class="st-shot" src="${shot}" alt="screenshot">` : ''}
        <label>What happened?<input id="st-title" maxlength="120" placeholder="e.g. Got stuck in the wall after rolling" autocomplete="off"></label>
        <label>Details (optional)<textarea id="st-note" rows="3" placeholder="What did you press? What did you expect?"></textarea></label>
        <div class="st-sev">${SEV.map((s, i) => `<button data-sev="${s}" class="${i === 2 ? 'on' : ''}" style="--c:${SEV_COLOR[s]}">${s}</button>`).join('')}</div>
        <div class="st-row"><span class="st-dim">Saves position, seed, your last 10 s of inputs and a screenshot.</span>
          <button id="st-cancel" class="ghost">Cancel (Esc)</button><button id="st-save">Save (Enter)</button></div>
      </div>`;
    let sev: Severity = 'minor';
    this.root.querySelectorAll<HTMLButtonElement>('[data-sev]').forEach((b) => b.onclick = () => {
      sev = b.dataset.sev as Severity;
      this.root.querySelectorAll('[data-sev]').forEach((x) => x.classList.toggle('on', x === b));
    });
    const title = this.root.querySelector<HTMLInputElement>('#st-title')!;
    const note = this.root.querySelector<HTMLTextAreaElement>('#st-note')!;
    const save = () => {
      this.add({ title: title.value.trim() || 'Untitled issue', note: note.value.trim(), severity: sev, screenshot: shot });
      this.close();
      this.toast(`Issue saved (${this.mine.filter((i) => i.status === 'open').length} open) · F9 to view`);
    };
    this.root.querySelector<HTMLButtonElement>('#st-save')!.onclick = save;
    this.root.querySelector<HTMLButtonElement>('#st-cancel')!.onclick = () => this.close();
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } e.stopPropagation(); });
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); e.stopPropagation(); });
    setTimeout(() => title.focus(), 30);
  }

  // ------------------------------------------------------------ dashboard
  toggleDashboard() {
    if (this.open === 'dash') { this.close(); return; }
    this.host.pause(true);
    this.open = 'dash';
    this.loadAgentReport();
    this.renderDashboard();
  }

  private filtered(): Issue[] {
    const f = this.filters;
    return this.all().filter((i) =>
      (f.source === 'all' || i.source === f.source) &&
      (f.severity === 'all' || i.severity === f.severity) &&
      (f.status === 'all' || i.status === f.status) &&
      (!f.q || (i.title + ' ' + i.note + ' ' + (i.category ?? '')).toLowerCase().includes(f.q.toLowerCase())));
  }

  private renderDashboard() {
    const all = this.all();
    const list = this.filtered();
    const count = (pred: (i: Issue) => boolean) => all.filter(pred).length;
    const tiles = (['player', 'kid', 'hardcore', 'dev'] as Source[]).map((s) =>
      `<div class="st-tile"><b>${count((i) => i.source === s && i.status === 'open')}</b><span>${SRC_LABEL[s]}</span></div>`).join('');
    const opt = (name: string, vals: string[], cur: string) =>
      `<select data-f="${name}">${vals.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const sum = (this.agentMeta.summary ?? {}) as Record<string, { checks: number; failed: number }>;
    const checks = Object.entries(sum).map(([k, v]) => `${SRC_LABEL[k as Source] ?? k} ${v.checks - v.failed}/${v.checks} checks ${v.failed ? '✗' : '✓'}`).join(' · ');
    const meta = this.agentMeta.generated
      ? `Agent run: ${new Date(this.agentMeta.generated).toLocaleString()} · build ${this.agentMeta.build} · ${checks}`
      : 'No agent report loaded yet (run <code>npm run agents</code> or push to GitHub).';
    this.root.className = 'st-dash-wrap';
    this.root.innerHTML = `
      <div class="st-dash">
        <div class="st-top">
          <div class="st-h">ISSUE DASHBOARD <span class="st-dim">build ${this.host.build}</span></div>
          <div class="st-actions">
            <button id="st-copy" title="Markdown summary for pasting into a chat">Copy summary</button>
            <button id="st-export">Export JSON</button>
            <label class="st-import">Import<input id="st-import" type="file" accept=".json"></label>
            <button id="st-clear" class="ghost">Delete fixed (mine)</button>
            <button id="st-close" class="ghost">Close (F9 / Esc)</button>
          </div>
        </div>
        <div class="st-tiles">${tiles}<div class="st-tile"><b>${count((i) => i.status === 'fixed')}</b><span>Ticked off</span></div></div>
        <div class="st-dim st-meta">${meta}</div>
        <div class="st-filters">
          ${opt('source', ['all', 'player', 'kid', 'hardcore', 'dev'], this.filters.source)}
          ${opt('severity', ['all', ...SEV], this.filters.severity)}
          ${opt('status', ['all', 'open', 'fixed', 'wontfix'], this.filters.status)}
          <input data-f="q" placeholder="search" value="${esc(this.filters.q)}">
          <span class="st-dim">${list.length} shown</span>
        </div>
        <div class="st-list">
          ${list.length ? list.map((i) => this.row(i)).join('') : '<div class="st-empty">Nothing here. Press F8 while playing to log an issue.</div>'}
        </div>
      </div>`;
    this.root.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-f]').forEach((el) => {
      el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
        (this.filters as any)[el.dataset.f!] = el.value;
        const pos = el.tagName === 'INPUT' ? (el as HTMLInputElement).selectionStart : null;
        this.renderDashboard();
        if (pos !== null) { const q = this.root.querySelector<HTMLInputElement>('input[data-f="q"]')!; q.focus(); q.setSelectionRange(pos, pos); }
      });
      el.addEventListener('keydown', (e) => e.stopPropagation());
    });
    this.root.querySelector<HTMLButtonElement>('#st-close')!.onclick = () => this.close();
    this.root.querySelector<HTMLButtonElement>('#st-export')!.onclick = () => this.exportJson();
    this.root.querySelector<HTMLButtonElement>('#st-copy')!.onclick = () => this.copySummary();
    this.root.querySelector<HTMLButtonElement>('#st-clear')!.onclick = () => {
      this.mine = this.mine.filter((i) => i.status !== 'fixed'); this.save(); this.renderDashboard();
    };
    this.root.querySelector<HTMLInputElement>('#st-import')!.onchange = (e) => this.importJson((e.target as HTMLInputElement).files?.[0]);
    this.root.querySelectorAll<HTMLInputElement>('[data-tick]').forEach((cb) => cb.onchange = () => this.setStatus(cb.dataset.tick!, cb.checked ? 'fixed' : 'open'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-wont]').forEach((b) => b.onclick = () => this.setStatus(b.dataset.wont!, 'wontfix'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.onclick = () => {
      this.mine = this.mine.filter((i) => i.id !== b.dataset.del); this.save(); this.renderDashboard();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-replay]').forEach((b) => b.onclick = () => {
      const i = this.all().find((x) => x.id === b.dataset.replay);
      if (i) { this.close(); this.host.replay(i); }
    });
  }

  private row(i: Issue): string {
    const when = new Date(i.created).toLocaleString();
    const st: any = i.state;
    const where = st?.player ? `tile ${st.player.tileX},${st.player.tileY} · ${st.player.state}` : '';
    const canReplay = !!i.inputsFull?.length;
    return `
      <details class="st-item ${i.status}">
        <summary>
          <input type="checkbox" data-tick="${i.id}" ${i.status === 'fixed' ? 'checked' : ''} title="Tick off when fixed" onclick="event.stopPropagation()">
          <span class="st-badge" style="--c:${SEV_COLOR[i.severity]}">${i.severity}</span>
          <span class="st-src">${SRC_LABEL[i.source]}</span>
          <span class="st-title">${esc(i.title)}${i.count && i.count > 1 ? ` <span class="st-dim">×${i.count}</span>` : ''}</span>
          <span class="st-dim st-when">${when}</span>
        </summary>
        <div class="st-body">
          ${i.screenshot ? `<img class="st-shot" src="${i.screenshot}" alt="">` : ''}
          <div>
            ${i.note ? `<p>${esc(i.note)}</p>` : ''}
            ${i.repro ? `<p><b>Repro:</b> ${esc(i.repro)}</p>` : ''}
            <p class="st-dim">${i.category ? esc(i.category) + ' · ' : ''}${where} · seed ${i.seed} · frame ${i.frame} · build ${i.build} · ${i.id}</p>
            <div class="st-row">
              ${canReplay ? `<button data-replay="${i.id}">Replay</button>` : ''}
              <button class="ghost" data-wont="${i.id}">Won't fix</button>
              ${i.source === 'player' ? `<button class="ghost" data-del="${i.id}">Delete</button>` : ''}
            </div>
          </div>
        </div>
      </details>`;
  }

  private setStatus(id: string, s: Status) {
    const m = this.mine.find((i) => i.id === id);
    if (m) m.status = s; else this.agentStatus[id] = s;
    this.save();
    this.renderDashboard();
  }

  exportPayload(onlyFiltered = false) {
    const issues = onlyFiltered ? this.filtered() : this.all();
    return {
      game: 'space-trooper',
      build: this.host.build,
      exportedAt: new Date().toISOString(),
      agentRun: this.agentMeta,
      counts: { total: issues.length, open: issues.filter((i) => i.status === 'open').length },
      issues,
    };
  }

  private exportJson() {
    const blob = new Blob([JSON.stringify(this.exportPayload(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `space-trooper-issues-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('Exported. Send this file to Claude.');
  }

  private async copySummary() {
    const open = this.all().filter((i) => i.status === 'open');
    const lines = [`Space Trooper issues · build ${this.host.build} · ${open.length} open`, ''];
    for (const s of SEV) {
      const g = open.filter((i) => i.severity === s);
      if (!g.length) continue;
      lines.push(`## ${s} (${g.length})`);
      for (const i of g) {
        const st: any = i.state;
        lines.push(`- [${SRC_LABEL[i.source]}] ${i.title}${i.note ? ' — ' + i.note : ''} (seed ${i.seed}, frame ${i.frame}${st?.player ? `, tile ${st.player.tileX},${st.player.tileY}, ${st.player.state}` : ''}, id ${i.id})`);
      }
      lines.push('');
    }
    lines.push('Full details with input recordings: use Export JSON.');
    try { await navigator.clipboard.writeText(lines.join('\n')); this.toast('Summary copied'); }
    catch { this.toast('Clipboard blocked: use Export JSON'); }
  }

  private async importJson(file?: File) {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const incoming: Issue[] = j.issues ?? [];
      const have = new Set(this.mine.map((i) => i.id));
      let n = 0;
      for (const i of incoming) if (i.source === 'player' && !have.has(i.id)) { this.mine.push(i); n++; }
      this.save();
      this.toast(`Imported ${n} issues`);
      this.renderDashboard();
    } catch { this.toast('Not a valid issues file'); }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function injectStyles() {
  if (document.getElementById('st-style')) return;
  const s = document.createElement('style');
  s.id = 'st-style';
  s.textContent = `
  #st-overlay{font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#e8ecf6}
  #st-overlay button,#st-overlay .st-import{font:inherit;background:#46e6ff;color:#0b0a14;border:0;padding:6px 10px;border-radius:4px;cursor:pointer;font-weight:700}
  #st-overlay button.ghost,#st-overlay .st-import{background:#26304a;color:#e8ecf6}
  #st-overlay .st-import input{display:none}
  #st-overlay input,#st-overlay textarea,#st-overlay select{font:inherit;background:#0e1424;color:#e8ecf6;border:1px solid #33405e;border-radius:4px;padding:6px 8px}
  .st-modal-wrap,.st-dash-wrap{position:fixed;inset:0;background:rgba(5,6,12,.72);display:flex;align-items:center;justify-content:center;z-index:50}
  .st-modal{background:#141b2e;border:2px solid #b0843f;box-shadow:0 0 0 2px #140e1e;padding:16px;width:min(560px,92vw);display:flex;flex-direction:column;gap:10px}
  .st-modal label{display:flex;flex-direction:column;gap:4px}
  .st-h{font-weight:800;letter-spacing:.08em;color:#ffd58a}
  .st-dim{color:#8d97b3;font-weight:400}
  .st-shot{max-width:100%;border:1px solid #33405e;image-rendering:pixelated}
  .st-sev{display:flex;gap:6px}.st-sev button{background:#26304a!important;color:#e8ecf6!important;border:2px solid transparent!important;text-transform:uppercase}
  .st-sev button.on{border-color:var(--c)!important;color:var(--c)!important}
  .st-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.st-row .st-dim{flex:1}
  .st-dash{background:#10162a;border:2px solid #b0843f;width:min(1100px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;padding:14px;gap:10px}
  .st-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.st-actions{display:flex;gap:6px;flex-wrap:wrap}
  .st-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .st-tile{background:#172038;border:1px solid #2a3654;padding:8px 10px;display:flex;flex-direction:column}.st-tile b{font-size:22px;color:#46e6ff}
  .st-filters{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .st-list{overflow:auto;flex:1;display:flex;flex-direction:column;gap:4px;padding-right:4px}
  .st-item{background:#151d33;border:1px solid #26314f}.st-item.fixed{opacity:.55}.st-item.fixed .st-title{text-decoration:line-through}
  .st-item summary{display:flex;gap:10px;align-items:center;padding:7px 10px;cursor:pointer;list-style:none}
  .st-badge{color:var(--c);border:1px solid var(--c);padding:0 6px;border-radius:3px;text-transform:uppercase;font-size:11px;min-width:56px;text-align:center}
  .st-src{color:#ffd58a;min-width:120px}.st-title{flex:1}.st-when{font-size:11px}
  .st-body{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:12px;padding:0 10px 10px}
  .st-empty{padding:40px;text-align:center;color:#8d97b3}
  #st-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#141b2e;color:#ffd58a;border:1px solid #b0843f;padding:8px 14px;font:13px ui-monospace,monospace;opacity:0;transition:.2s;z-index:60;pointer-events:none}
  #st-toast.show{opacity:1;transform:translateX(-50%)}
  `;
  document.head.appendChild(s);
}
