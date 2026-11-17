/**
 * Station panels for the Cantina: Scrapper Stall, Armoury, Droid Workshop, Saber Forge, Mission Control.
 * Plain DOM over the canvas (crisp text, mouse + keyboard + gamepad).
 */
import {
  canAfford, costText, DROIDS, DroidKind, GEAR, GEAR_MAX, gearCost, GearSlot, loadoutFrom, pay, Profile, RES_ICON, RES_LABEL,
  Resources, SABER_COLORS, SABER_FORMS, SaberColor, SaberForm, saveProfile, STORE,
} from '../game/profile';
import type { StationId } from '../art/cantina';

export interface StationHost {
  profile: Profile;
  changed(): void;            // profile changed: save + refresh the Cantina (saber colour, resources)
  launch(mission: string): void;
  close(): void;
}

const TITLES: Record<StationId, [string, string]> = {
  scrapper: ['Scrapper Stall', '"Kesha-ba! Good scrap, good price! Mostly good."'],
  armoury: ['Armoury', 'Vorr-steel plates from the Iron Clans. Upgrade with ingots.'],
  workshop: ['Droid Workshop', 'Build a companion from droid parts. One can join each run.'],
  forge: ['Saber Forge', 'Tune your vibro-saber: blade colour and form.'],
  mission: ['Mission Control', 'Pick a mission. Your loadout comes with you.'],
};

const MISSIONS = [
  { id: 'training', name: 'Training Deck', desc: 'Practice moves and weapons against training droids. Destroyed droids pay 15 credits.', open: true },
  { id: 'outpost', name: 'Desert Outpost', desc: 'Dune Raiders have taken the water plant. (Phase 3-4)', open: false },
  { id: 'wreck', name: 'Dominion Wreck', desc: 'A crashed star destroyer, still guarded. (Phase 4)', open: false },
];

let root: HTMLDivElement | null = null;
let current: StationId | null = null;
let host: StationHost | null = null;

export function isStationOpen() { return !!current; }
export function currentStation() { return current; }

export function openStation(id: StationId, h: StationHost) {
  injectStyles();
  host = h;
  current = id;
  if (!root) { root = document.createElement('div'); root.id = 'st-station'; document.body.appendChild(root); }
  render();
  setTimeout(() => root?.querySelector<HTMLButtonElement>('button:not([disabled]).primary, button:not([disabled])')?.focus(), 30);
}

export function closeStation() {
  if (!root) return;
  root.innerHTML = '';
  root.className = '';
  current = null;
}

/** Gamepad / arrow navigation inside a panel: move focus between buttons, A/Enter clicks. */
export function navigate(dir: 'next' | 'prev' | 'click' | 'close') {
  if (!root || !current) return;
  if (dir === 'close') { host?.close(); return; }
  const btns = [...root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
  if (!btns.length) return;
  const i = btns.indexOf(document.activeElement as HTMLButtonElement);
  if (dir === 'click') { (i >= 0 ? btns[i] : btns[0]).click(); return; }
  const n = i < 0 ? 0 : (i + (dir === 'next' ? 1 : -1) + btns.length) % btns.length;
  btns[n].focus();
}

// ------------------------------------------------------------------ rendering
const img = (src: string, cls = '') => `<img class="${cls}" src="assets/${src}" alt="">`;
const chip = (k: keyof Resources, v: number) => `<span class="chip" title="${RES_LABEL[k]}">${img(`ui/${RES_ICON[k]}.png`)}<b>${v}</b></span>`;

function costHtml(p: Profile, c: Partial<Resources>) {
  const parts = (Object.keys(c) as (keyof Resources)[]).filter((k) => c[k]).map((k) =>
    `<span class="cost ${p.res[k] >= (c[k] ?? 0) ? '' : 'short'}">${img(`ui/${RES_ICON[k]}.png`)}${c[k]}</span>`);
  return parts.length ? parts.join('') : '<span class="cost">free</span>';
}

function render() {
  if (!root || !current || !host) return;
  const p = host.profile;
  const [title, sub] = TITLES[current];
  const res = (Object.keys(p.res) as (keyof Resources)[]).map((k) => chip(k, p.res[k])).join('');
  root.className = 'open';
  root.innerHTML = `
    <div class="panel" role="dialog" aria-label="${title}">
      <header>
        <div><h2>${title}</h2><p>${sub}</p></div>
        <div class="res">${res}</div>
        <button class="x" data-act="close" aria-label="Close">✕</button>
      </header>
      <div class="body">${BODY[current](p)}</div>
      <footer>Esc / B close · arrows or d-pad move · Enter / A select</footer>
    </div>`;
  root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.onclick = () => act(b.dataset.act!, b.dataset.arg ?? ''));
}

function flash(msg: string, ok = true) {
  const t = document.createElement('div');
  t.className = 'st-pop ' + (ok ? 'ok' : 'bad');
  t.textContent = msg;
  root?.querySelector('.panel')?.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

function act(a: string, arg: string) {
  if (!host) return;
  const p = host.profile;
  const done = (msg: string) => { saveProfile(p); host!.changed(); render(); flash(msg); };
  switch (a) {
    case 'close': host.close(); return;
    case 'buy': {
      const it = STORE.find((s) => s.id === arg)!;
      if (!canAfford(p, it.cost)) return flash('Not enough credits', false);
      pay(p, it.cost);
      if (it.give) for (const k of Object.keys(it.give) as (keyof Resources)[]) p.res[k] += it.give[k] ?? 0;
      if (it.shield) p.nextRunShield += it.shield;
      return done(`Bought ${it.name}`);
    }
    case 'upgrade': {
      const slot = arg as GearSlot, lvl = p.gear[slot];
      if (lvl >= GEAR_MAX) return;
      const c = gearCost(lvl);
      if (!canAfford(p, c)) return flash('Need ' + costText(c), false);
      pay(p, c); p.gear[slot] = lvl + 1;
      return done(`${GEAR[slot].name} → level ${lvl + 1}`);
    }
    case 'build': {
      const k = arg as Exclude<DroidKind, 'none'>;
      if (!canAfford(p, DROIDS[k].cost)) return flash('Need ' + costText(DROIDS[k].cost), false);
      pay(p, DROIDS[k].cost); p.droids.push(k); p.droid = k;
      return done(`${DROIDS[k].name} built and deployed`);
    }
    case 'deploy': p.droid = arg as DroidKind; return done(arg === 'none' ? 'No droid this run' : `${DROIDS[arg as 'turret'].name} deployed`);
    case 'color': {
      const c = arg as SaberColor;
      if (!p.saber.colors.includes(c)) {
        if (!canAfford(p, SABER_COLORS[c].cost)) return flash('Need ' + costText(SABER_COLORS[c].cost), false);
        pay(p, SABER_COLORS[c].cost); p.saber.colors.push(c);
      }
      p.saber.color = c;
      return done(`${SABER_COLORS[c].name} crystal attuned`);
    }
    case 'form': {
      const f = arg as SaberForm;
      if (!p.saber.forms.includes(f)) {
        if (!canAfford(p, SABER_FORMS[f].cost)) return flash('Need ' + costText(SABER_FORMS[f].cost), false);
        pay(p, SABER_FORMS[f].cost); p.saber.forms.push(f);
      }
      p.saber.form = f;
      return done(`${SABER_FORMS[f].name} equipped`);
    }
    case 'launch': host.launch(arg); return;
  }
}

const BODY: Record<StationId, (p: Profile) => string> = {
  scrapper: (p) => `
    <div class="grid">${STORE.map((it) => `
      <div class="card">
        ${img(it.icon, 'icon')}
        <div class="txt"><h3>${it.name}</h3><p>${it.desc}</p>${it.shield && p.nextRunShield ? `<p class="note">Next run: +${p.nextRunShield} shield</p>` : ''}</div>
        <div class="buy">${costHtml(p, it.cost)}<button data-act="buy" data-arg="${it.id}" ${canAfford(p, it.cost) ? '' : 'disabled'}>Buy</button></div>
      </div>`).join('')}
    </div>
    <img class="npc" src="assets/hub/droid_tall_side.png" alt="">`,

  armoury: (p) => {
    const lo = loadoutFrom(p);
    return `
    <div class="split">
      <div class="grid">${(Object.keys(GEAR) as GearSlot[]).map((s) => {
        const g = GEAR[s], lvl = p.gear[s], c = gearCost(lvl), max = lvl >= GEAR_MAX;
        return `<div class="card gear">
          ${img(g.img, 'gearimg')}
          <div class="txt"><h3>${g.name}</h3><p>${g.perLevel} per level</p>
            <div class="pips">${Array.from({ length: GEAR_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
          <div class="buy">${max ? '<span class="cost">max</span>' : costHtml(p, c)}
            <button data-act="upgrade" data-arg="${s}" ${!max && canAfford(p, c) ? '' : 'disabled'}>${lvl ? 'Upgrade' : 'Craft'}</button></div>
        </div>`;
      }).join('')}</div>
      <div class="stats"><h3>Your Trooper</h3>
        <dl>
          <dt>Max health</dt><dd>${lo.maxHp}</dd>
          <dt>Saber damage</dt><dd>${Math.round(lo.saberDmg * 100)}%</dd>
          <dt>Blaster damage</dt><dd>${Math.round(lo.blasterDmg * 100)}%</dd>
          <dt>Roll recovery</dt><dd>${lo.rollCooldown} frames</dd>
          <dt>Overshield</dt><dd>${lo.shield || '—'}</dd>
          <dt>Runs</dt><dd>${p.runs}</dd>
        </dl>
        <img class="hero" src="assets/cantina/gear_chest.png" alt="">
      </div>
    </div>`;
  },

  workshop: (p) => `
    <div class="grid two">${(Object.keys(DROIDS) as Exclude<DroidKind, 'none'>[]).map((k) => {
      const d = DROIDS[k], built = p.droids.includes(k), active = p.droid === k;
      return `<div class="card droid ${active ? 'active' : ''}">
        ${img(d.img, 'droidimg')}
        <div class="txt"><h3>${d.name}</h3><p>${d.desc}</p>${active ? '<p class="note">Deployed for the next run</p>' : ''}</div>
        <div class="buy">${built
          ? `<button data-act="deploy" data-arg="${active ? 'none' : k}">${active ? 'Stand down' : 'Deploy'}</button>`
          : `${costHtml(p, d.cost)}<button data-act="build" data-arg="${k}" ${canAfford(p, d.cost) ? '' : 'disabled'}>Build</button>`}</div>
      </div>`;
    }).join('')}</div>`,

  forge: (p) => {
    const c = p.saber.color, f = p.saber.form;
    return `
    <div class="split">
      <div class="preview" style="--glow:${SABER_COLORS[c].css}">
        ${img(`cantina/${f === 'dual' ? 'staff' : 'saber'}_${c}.png`, 'blade')}
        <h3>${SABER_COLORS[c].name} ${SABER_FORMS[f].name.toLowerCase()}</h3><p>${SABER_FORMS[f].desc}</p>
      </div>
      <div>
        <h4>Crystal</h4>
        <div class="swatches">${(Object.keys(SABER_COLORS) as SaberColor[]).map((k) => {
          const s = SABER_COLORS[k], owned = p.saber.colors.includes(k);
          return `<button class="swatch ${k === c ? 'sel' : ''}" style="--c:${s.css}" data-act="color" data-arg="${k}" ${owned || canAfford(p, s.cost) ? '' : 'disabled'}>
            <i></i><span>${s.name}</span><small>${owned ? s.note : costText(s.cost)}</small></button>`;
        }).join('')}</div>
        <h4>Form</h4>
        <div class="forms">${(Object.keys(SABER_FORMS) as SaberForm[]).map((k) => {
          const s = SABER_FORMS[k], owned = p.saber.forms.includes(k);
          return `<button class="form ${k === f ? 'sel' : ''}" data-act="form" data-arg="${k}" ${owned || canAfford(p, s.cost) ? '' : 'disabled'}>
            ${img(`cantina/${k === 'dual' ? 'staff' : 'saber'}_${c}.png`)}<span>${s.name}</span><small>${owned ? s.desc : costText(s.cost)}</small></button>`;
        }).join('')}</div>
      </div>
    </div>`;
  },

  mission: (p) => {
    const lo = loadoutFrom(p);
    const droid = lo.droid === 'none' ? 'none' : DROIDS[lo.droid].name;
    return `
    <div class="split">
      <div class="missions">${MISSIONS.map((m) => `
        <div class="card mission ${m.open ? '' : 'locked'}">
          <div class="txt"><h3>${m.name}</h3><p>${m.desc}</p></div>
          <div class="buy"><button class="${m.open ? 'primary' : ''}" data-act="launch" data-arg="${m.id}" ${m.open ? '' : 'disabled'}>${m.open ? 'Launch' : 'Locked'}</button></div>
        </div>`).join('')}</div>
      <div class="stats"><h3>Loadout</h3>
        <dl>
          <dt>Saber</dt><dd style="color:${SABER_COLORS[lo.saberColor].css}">${SABER_COLORS[lo.saberColor].name} ${lo.dual ? 'staff' : 'blade'}</dd>
          <dt>Blaster</dt><dd>${Math.round(lo.blasterDmg * 100)}% damage</dd>
          <dt>Health</dt><dd>${lo.maxHp}${lo.shield ? ` + ${lo.shield} shield` : ''}</dd>
          <dt>Droid</dt><dd>${droid}</dd>
          <dt>Path</dt><dd>${p.path === 0 ? 'Undecided' : p.path > 0 ? 'Light' : 'Dark'}</dd>
        </dl>
      </div>
    </div>`;
  },
};

function injectStyles() {
  if (document.getElementById('st-station-style')) return;
  const s = document.createElement('style');
  s.id = 'st-station-style';
  s.textContent = `
  #st-station{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:40;font:14px/1.4 'Inter',system-ui,sans-serif;color:#efe8dc}
  #st-station.open{display:flex;background:radial-gradient(ellipse at center,rgba(8,6,12,.55),rgba(8,6,12,.85))}
  #st-station .panel{position:relative;width:min(980px,94vw);max-height:90vh;display:flex;flex-direction:column;background:linear-gradient(#1b1420,#120d16);border:3px solid #b0843f;outline:3px solid #140e1e;box-shadow:0 0 0 6px rgba(176,132,63,.18),0 20px 60px rgba(0,0,0,.6);border-radius:10px;overflow:hidden}
  #st-station header{display:flex;gap:16px;align-items:center;padding:14px 18px;background:linear-gradient(#2a1d22,#1d1419);border-bottom:2px solid #b0843f}
  #st-station header>div:first-child{flex:1}
  #st-station h2{margin:0;font:700 30px/1 Oswald,Impact,sans-serif;letter-spacing:.02em;color:#fff;text-shadow:0 2px 0 #140e1e,0 0 14px rgba(70,230,255,.45)}
  #st-station header p{margin:4px 0 0;color:#c7b8a4;font-style:italic}
  #st-station .res{display:flex;gap:6px;flex-wrap:wrap}
  #st-station .chip{display:flex;align-items:center;gap:4px;background:#140e1e;border:1px solid #5a4630;border-radius:20px;padding:2px 9px 2px 4px}
  #st-station .chip img{height:20px}#st-station .chip b{font:600 14px Oswald,sans-serif}
  #st-station .x{background:#2a1d22;border:2px solid #b0843f;color:#ffd58a;width:36px;height:36px;border-radius:8px;font-size:16px;cursor:pointer}
  #st-station .body{padding:16px 18px;overflow:auto;position:relative}
  #st-station footer{padding:8px 18px;color:#8d7f6d;font-size:12px;border-top:1px solid #3a2c26}
  #st-station .grid{display:grid;grid-template-columns:1fr;gap:10px}
  #st-station .grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
  #st-station .split{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px}
  #st-station .card{min-width:0;overflow:hidden;display:flex;gap:12px;align-items:center;background:#211820;border:2px solid #3e2e2a;border-radius:10px;padding:10px 12px}
  #st-station .card.active{border-color:#46e6ff;box-shadow:0 0 14px rgba(70,230,255,.25)}
  #st-station .card.locked{opacity:.5}
  #st-station .card .txt{flex:1;min-width:0}#st-station .buy,#st-station .card>img{flex-shrink:0}#st-station h3{margin:0 0 3px;font:600 18px Oswald,sans-serif;color:#fff}
  #st-station .card p{margin:0;color:#c7b8a4}#st-station .note{color:#46e6ff!important;margin-top:4px!important}
  #st-station .icon{height:44px;width:44px;object-fit:contain}
  #st-station .gearimg{height:64px;width:64px;object-fit:contain;background:#140e1e;border-radius:8px;padding:4px}
  #st-station .droidimg{height:100px;width:100px;object-fit:contain}
  #st-station .buy{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:96px}
  #st-station .cost{display:inline-flex;align-items:center;gap:3px;font:600 15px Oswald,sans-serif;margin-left:6px}
  #st-station .cost img{height:18px}#st-station .cost.short{color:#ff6b6b}
  #st-station button{font:600 15px Oswald,sans-serif;letter-spacing:.03em;cursor:pointer;border-radius:8px;border:2px solid #140e1e;padding:7px 16px;background:linear-gradient(#ffd58a,#d79b3f);color:#2a1408;box-shadow:inset 0 -3px 0 rgba(0,0,0,.2)}
  #st-station button.primary{background:linear-gradient(#8dff7a,#3fbf3a);font-size:18px;padding:9px 26px}
  #st-station button:disabled{background:#3a2f2c;color:#7d6f62;cursor:not-allowed;box-shadow:none}
  #st-station button:focus-visible{outline:3px solid #46e6ff;outline-offset:2px}
  #st-station .pips{display:flex;gap:4px;margin-top:6px}#st-station .pips i{width:16px;height:8px;border-radius:3px;background:#3a2c26;border:1px solid #140e1e}#st-station .pips i.on{background:#ffb347}
  #st-station .stats{background:#191219;border:2px solid #3e2e2a;border-radius:10px;padding:12px 14px;position:relative;overflow:hidden}
  #st-station dl{display:grid;grid-template-columns:auto auto;gap:6px 12px;margin:8px 0 0}#st-station dt{color:#c7b8a4}#st-station dd{margin:0;text-align:right;font:600 16px Oswald,sans-serif}
  #st-station .hero{position:absolute;right:-20px;bottom:-26px;height:120px;opacity:.18}
  #st-station .npc{position:absolute;right:12px;bottom:6px;height:150px;pointer-events:none;opacity:.95;filter:drop-shadow(0 6px 10px rgba(0,0,0,.6))}
  #st-station .grid:has(+ .npc){padding-right:110px}
  #st-station .preview{background:radial-gradient(ellipse at center,color-mix(in srgb,var(--glow) 22%,transparent),transparent 70%),#140e1e;border:2px solid #3e2e2a;border-radius:10px;padding:16px;text-align:center}
  #st-station .preview .blade{width:100%;max-height:190px;object-fit:contain;filter:drop-shadow(0 0 14px var(--glow))}
  #st-station h4{margin:4px 0 8px;font:600 14px Oswald,sans-serif;color:#ffd58a;letter-spacing:.06em;text-transform:uppercase}
  #st-station .swatches{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
  #st-station .swatch,#st-station .form{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;gap:0 10px;align-items:center;text-align:left;background:#211820!important;color:#efe8dc!important;border:2px solid #3e2e2a!important;padding:8px 10px!important}
  #st-station .swatch i{grid-row:span 2;width:22px;height:22px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c);border:2px solid #140e1e}
  #st-station .swatch small,#st-station .form small{color:#a89886;font:12px system-ui,sans-serif}
  #st-station .swatch.sel,#st-station .form.sel{border-color:#ffd58a!important;box-shadow:0 0 12px rgba(255,213,138,.3)}
  #st-station .forms{display:grid;gap:8px}#st-station .form img{grid-row:span 2;width:90px;height:34px;object-fit:contain}
  #st-station .missions{display:grid;gap:10px}
  #st-station .st-pop{position:absolute;left:50%;top:70px;transform:translateX(-50%);padding:8px 16px;border-radius:8px;font:600 15px Oswald,sans-serif;animation:stpop 1.4s forwards;pointer-events:none;z-index:2}
  #st-station .st-pop.ok{background:#1d3a24;color:#8dff7a;border:2px solid #3fbf3a}#st-station .st-pop.bad{background:#3a1d1d;color:#ff8a8a;border:2px solid #bf3a3a}
  @keyframes stpop{0%{opacity:0;transform:translate(-50%,8px)}12%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0}}
  @media(max-width:720px){#st-station .split,#st-station .grid.two{grid-template-columns:1fr}#st-station header{flex-wrap:wrap}}
  `;
  document.head.appendChild(s);
}
