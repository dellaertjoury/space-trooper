/**
 * The player's save (kept in localStorage) + everything the Cantina sells, upgrades and builds.
 * A run never reads the profile directly: it gets a Loadout, which is part of the replay data.
 */

export type SaberColor = 'blue' | 'green' | 'red' | 'purple';
export type SaberForm = 'single' | 'dual';
export type GearSlot = 'chest' | 'shoulder' | 'gauntlet' | 'boots';
export type DroidKind = 'none' | 'turret' | 'medic';

export interface Resources { credits: number; crystals: number; rareCrystals: number; droidParts: number; ingots: number }

export interface Profile {
  version: 1;
  res: Resources;
  gear: Record<GearSlot, number>; // 0 = not crafted yet, max 5
  saber: { color: SaberColor; form: SaberForm; colors: SaberColor[]; forms: SaberForm[] };
  droids: DroidKind[]; // built
  droid: DroidKind; // deployed
  nextRunShield: number; // overshield bought at the Scrapper stall, used by the next run
  path: number; // -100 dark .. +100 light (Phase 5)
  runs: number;
  bestKills: number;
}

export const RES_LABEL: Record<keyof Resources, string> = {
  credits: 'Credits', crystals: 'Resonance crystals', rareCrystals: 'Rare crystals', droidParts: 'Droid parts', ingots: 'Vorr-steel ingots',
};
export const RES_ICON: Record<keyof Resources, string> = {
  credits: 'icon_credit', crystals: 'icon_crystal_blue', rareCrystals: 'icon_crystal_purple', droidParts: 'icon_droidpart', ingots: 'icon_ingot',
};

/** Testing build: start with enough to try every station. */
export function freshProfile(): Profile {
  return {
    version: 1,
    res: { credits: 400, crystals: 5, rareCrystals: 1, droidParts: 10, ingots: 6 },
    gear: { chest: 0, shoulder: 0, gauntlet: 0, boots: 0 },
    saber: { color: 'blue', form: 'single', colors: ['blue'], forms: ['single'] },
    droids: [],
    droid: 'none',
    nextRunShield: 0,
    path: 0,
    runs: 0,
    bestKills: 0,
  };
}

const KEY = 'st.profile.v1';
export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p && p.version === 1) return { ...freshProfile(), ...p, res: { ...freshProfile().res, ...p.res }, gear: { ...freshProfile().gear, ...p.gear }, saber: { ...freshProfile().saber, ...p.saber } };
  } catch { /* corrupt or blocked storage: start fresh */ }
  return freshProfile();
}
export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: the session still works */ }
}

export type Cost = Partial<Resources>;
export function canAfford(p: Profile, c: Cost) {
  return (Object.keys(c) as (keyof Resources)[]).every((k) => p.res[k] >= (c[k] ?? 0));
}
export function pay(p: Profile, c: Cost) {
  for (const k of Object.keys(c) as (keyof Resources)[]) p.res[k] -= c[k] ?? 0;
}
export function costText(c: Cost) {
  return (Object.keys(c) as (keyof Resources)[]).filter((k) => c[k]).map((k) => `${c[k]} ${RES_LABEL[k].toLowerCase()}`).join(' + ');
}

// ---------------------------------------------------------------- Scrapper stall
export interface StoreItem { id: string; name: string; desc: string; icon: string; cost: Cost; give?: Cost; shield?: number }
export const STORE: StoreItem[] = [
  { id: 'crystal', name: 'Resonance crystal', desc: 'Feeds the Saber Forge. Hums when you hold it.', icon: 'ui/icon_crystal_blue.png', cost: { credits: 60 }, give: { crystals: 1 } },
  { id: 'rare', name: 'Rare crystal', desc: 'Pulled from a Dominion wreck. No questions asked.', icon: 'ui/icon_crystal_purple.png', cost: { credits: 150 }, give: { rareCrystals: 1 } },
  { id: 'parts', name: 'Droid parts x3', desc: 'Servos, wiring and one suspicious motivator.', icon: 'ui/icon_droidpart.png', cost: { credits: 45 }, give: { droidParts: 3 } },
  { id: 'ingots', name: 'Vorr-steel ingots x2', desc: 'Iron Clan alloy for the Armoury.', icon: 'ui/icon_ingot.png', cost: { credits: 50 }, give: { ingots: 2 } },
  { id: 'shield', name: 'Overshield cell', desc: '+25 shield for your next run only.', icon: 'ui/icon_health.png', cost: { credits: 40 }, shield: 25 },
];

// ---------------------------------------------------------------- Armoury
export const GEAR: Record<GearSlot, { name: string; perLevel: string; img: string }> = {
  chest: { name: 'Vorr-steel chest plate', perLevel: '+15 max health', img: 'cantina/gear_chest.png' },
  shoulder: { name: 'Clan shoulder guard', perLevel: '+6% saber damage', img: 'cantina/gear_shoulder.png' },
  gauntlet: { name: 'Hunter gauntlets', perLevel: '+8% blaster damage', img: 'cantina/gear_gauntlet.png' },
  boots: { name: 'Trooper boots', perLevel: 'Roll recovers 1 frame faster', img: 'cantina/gear_boots.png' },
};
export const GEAR_MAX = 5;
export function gearCost(level: number): Cost {
  return { ingots: level + 1, credits: 40 * (level + 1) };
}

// ---------------------------------------------------------------- Droid Workshop
export const DROIDS: Record<Exclude<DroidKind, 'none'>, { name: string; desc: string; img: string; cost: Cost }> = {
  turret: { name: 'Turret drone', desc: 'Hovers behind you and fires at the nearest target every 1.5 s.', img: 'cantina/droid_turret.png', cost: { droidParts: 8 } },
  medic: { name: 'Medic droid', desc: 'Patches you up as you go: +20 max health.', img: 'cantina/droid_medic.png', cost: { droidParts: 6 } },
};

// ---------------------------------------------------------------- Saber Forge
export const SABER_COLORS: Record<SaberColor, { name: string; hex: number; css: string; cost: Cost; note: string }> = {
  blue: { name: 'Blue', hex: 0x46e6ff, css: '#46e6ff', cost: {}, note: 'Light Path favourite' },
  green: { name: 'Green', hex: 0x6cff8a, css: '#6cff8a', cost: { crystals: 2 }, note: 'Steady, calm' },
  red: { name: 'Red', hex: 0xff3b4a, css: '#ff3b4a', cost: { crystals: 3 }, note: 'Dark Path favourite' },
  purple: { name: 'Purple', hex: 0xc46bff, css: '#c46bff', cost: { rareCrystals: 1 }, note: 'Walks between both paths' },
};
export const SABER_FORMS: Record<SaberForm, { name: string; desc: string; cost: Cost }> = {
  single: { name: 'Single blade', desc: 'Full damage, classic three-hit combo.', cost: {} },
  dual: { name: 'Vibro-staff (dual blade)', desc: '20% faster swings, 15% less damage per hit, also hits behind you.', cost: { crystals: 3, rareCrystals: 1 } },
};

// ---------------------------------------------------------------- what a run gets
export interface Loadout {
  maxHp: number;
  shield: number;
  saberDmg: number; // multiplier
  blasterDmg: number;
  rollCooldown: number;
  dual: boolean;
  droid: DroidKind;
  saberColor: SaberColor;
}

export const DEFAULT_LOADOUT: Loadout = { maxHp: 100, shield: 0, saberDmg: 1, blasterDmg: 1, rollCooldown: 8, dual: false, droid: 'none', saberColor: 'blue' };

export function loadoutFrom(p: Profile): Loadout {
  return {
    maxHp: 100 + p.gear.chest * 15 + (p.droid === 'medic' ? 20 : 0),
    shield: p.nextRunShield,
    saberDmg: (1 + p.gear.shoulder * 0.06) * (p.saber.form === 'dual' ? 0.85 : 1),
    blasterDmg: 1 + p.gear.gauntlet * 0.08,
    rollCooldown: Math.max(3, 8 - p.gear.boots),
    dual: p.saber.form === 'dual',
    droid: p.droid,
    saberColor: p.saber.color,
  };
}
