/**
 * The Cantina as a three-floor platformer, at the same scale as the run (24 px tiles, Trooper ~78 px).
 *   Ground floor : entrance, Scrapper Stall, the bar
 *   Middle floor : Saber Forge, lounge, Armoury
 *   Top floor    : Droid Workshop, Mission Table + hangar door
 * Floors are one-way decks: jump up through them, Down + Jump to drop. Step platforms link the floors.
 */
import { T, Tile, TileMap } from '../core/tilemap';
import type { StationId } from '../art/cantina';

export const HUB_W = 56, HUB_H = 34;
export const FLOOR = { ground: 31 * T, mid: 22 * T, top: 13 * T }; // y of each floor's walking surface

export interface Prop {
  key: string;          // texture (hub/ or cantina/ asset)
  x: number;            // centre x
  y: number;            // bottom y (what it stands on), or anchor y for hanging things
  h: number;            // display height in world px
  flip?: boolean;
  front?: boolean;      // drawn in front of the Trooper
  hang?: boolean;       // anchored at the top (lamps)
  glow?: number;        // additive glow colour
  bob?: boolean;        // gentle hover
}

export interface HubStation { id: StationId; label: string; x0: number; x1: number; floor: number; signY: number }

export function hubMap(): TileMap {
  const m = new TileMap(HUB_W, HUB_H);
  const S = Tile.Solid, O = Tile.OneWay;
  m.fill(0, 0, HUB_W - 1, 1, S);                 // ceiling
  m.fill(0, 0, 1, HUB_H - 1, S);                 // walls
  m.fill(HUB_W - 2, 0, HUB_W - 1, HUB_H - 1, S);
  m.fill(0, 31, HUB_W - 1, HUB_H - 1, S);        // ground
  m.fill(2, 22, HUB_W - 3, 22, O);               // middle deck
  m.fill(2, 13, HUB_W - 3, 13, O);               // top deck
  // steps: ground -> middle (right), middle -> top (centre-left)
  m.fill(43, 28, 46, 28, O);
  m.fill(48, 25, 51, 25, O);
  m.fill(19, 19, 22, 19, O);
  m.fill(24, 16, 27, 16, O);
  return m;
}

export const HUB_SPAWN = { x: 27 * T, y: FLOOR.ground - 56 };

export const HUB_STATIONS: HubStation[] = [
  { id: 'scrapper', label: 'Scrapper Stall', x0: 6 * T, x1: 16 * T, floor: FLOOR.ground, signY: FLOOR.ground - 128 },
  { id: 'forge', label: 'Saber Forge', x0: 4 * T, x1: 15 * T, floor: FLOOR.mid, signY: FLOOR.mid - 136 },
  { id: 'armoury', label: 'Armoury', x0: 36 * T, x1: 48 * T, floor: FLOOR.mid, signY: FLOOR.mid - 150 },
  { id: 'workshop', label: 'Droid Workshop', x0: 4 * T, x1: 16 * T, floor: FLOOR.top, signY: FLOOR.top - 140 },
  { id: 'mission', label: 'Mission Table', x0: 36 * T, x1: 50 * T, floor: FLOOR.top, signY: FLOOR.top - 150 },
];

const G = FLOOR.ground, M = FLOOR.mid, P = FLOOR.top;
const UNDER = 16; // the deck slab's underside, where lamps hang

export const HUB_PROPS: Prop[] = [
  // ---- ground floor: Scrapper Stall
  { key: 'crate_brown_big', x: 190, y: G, h: 32 },
  { key: 'crate_wood', x: 196, y: G - 32, h: 22 },
  { key: 'crate_brown', x: 226, y: G, h: 26 },
  { key: 'crate_grey_open', x: 336, y: G, h: 26 },
  { key: 'crate_green', x: 368, y: G, h: 24 },
  { key: 'crate_green_flat', x: 362, y: G - 24, h: 18 },
  { key: 'scrapper_b', x: 156, y: G, h: 60, flip: true },
  { key: 'scrapper_a', x: 284, y: G, h: 60 },
  { key: 'cell_green', x: 250, y: G - 26, h: 16, glow: 0x6cff9a },
  // ---- ground floor: the bar
  { key: 'droid_tall', x: 650, y: G - 6, h: 68 },                 // bartender (behind the counter)
  { key: 'barCounter', x: 650, y: G, h: 48, front: true },
  { key: 'droid_olive_side', x: 545, y: G, h: 62, front: true },  // a regular
  { key: 'crate_blue', x: 1110, y: G, h: 26 },
  { key: 'crate_blue_flat', x: 1144, y: G, h: 22 },
  { key: 'crate_purple', x: 1126, y: G - 22, h: 22 },
  { key: 'panel_tall', x: 960, y: G - 14, h: 50 },
  { key: 'lamp_hang', x: 300, y: M + UNDER, h: 26, hang: true, glow: 0xffb070 },
  { key: 'lamp_hang', x: 650, y: M + UNDER, h: 26, hang: true, glow: 0xffb070 },
  { key: 'lamp_hang', x: 1000, y: M + UNDER, h: 26, hang: true, glow: 0xffb070 },
  // ---- middle floor: Saber Forge
  { key: 'bench_press', x: 190, y: M, h: 54 },
  { key: 'holoTable', x: 318, y: M, h: 30 },
  { key: 'holo_sabers', x: 318, y: M - 58, h: 32, glow: 0x80e8ff, bob: true },
  { key: 'cell_blue', x: 100, y: M, h: 26, glow: 0x46c8ff },
  { key: 'cell_rack', x: 128, y: M - 34, h: 22 },
  { key: 'sign_forge', x: 230, y: M - 76, h: 22 },
  // ---- middle floor: lounge
  { key: 'kiosk', x: 590, y: M, h: 46 },
  { key: 'wall_panel', x: 690, y: M - 26, h: 34 },
  { key: 'crate_grey', x: 760, y: M, h: 26 },
  { key: 'holo_orb', x: 760, y: M - 30, h: 20, glow: 0xff7a9a, bob: true },
  // ---- middle floor: Armoury
  { key: 'armouryRack', x: 1010, y: M, h: 92 },
  { key: 'gear_chest', x: 985, y: M - 52, h: 24 },
  { key: 'gear_shoulder', x: 1040, y: M - 54, h: 18 },
  { key: 'gear_gauntlet', x: 985, y: M - 12, h: 22 },
  { key: 'gear_boots', x: 1040, y: M - 12, h: 20 },
  { key: 'crate_white', x: 1120, y: M, h: 26 },
  { key: 'crate_white_open', x: 1154, y: M, h: 30 },
  { key: 'panel_small', x: 880, y: M - 40, h: 24 },
  { key: 'lamp_ceiling', x: 300, y: P + UNDER, h: 12, hang: true, glow: 0xffe0a0 },
  { key: 'lamp_ceiling', x: 650, y: P + UNDER, h: 12, hang: true, glow: 0xffe0a0 },
  { key: 'lamp_ceiling', x: 1010, y: P + UNDER, h: 12, hang: true, glow: 0xffe0a0 },
  // ---- top floor: Droid Workshop
  { key: 'bench_tools', x: 228, y: P, h: 54 },
  { key: 'droid_tall_side', x: 112, y: P, h: 64 },
  { key: 'droid_olive', x: 350, y: P, h: 60 },
  { key: 'toolkit', x: 214, y: P - 30, h: 14 },
  { key: 'droid_turret', x: 300, y: P - 70, h: 26, bob: true },
  { key: 'sign_maintenance_ok', x: 230, y: P - 84, h: 26 },
  // ---- top floor: Mission Table + hangar
  { key: 'holo_globe', x: 900, y: P, h: 74, glow: 0x70e0ff },
  { key: 'bench_nav', x: 1030, y: P, h: 60 },
  { key: 'holo_planet', x: 1150, y: P - 70, h: 30, glow: 0x80c8ff, bob: true },
  { key: 'sign_mission', x: 1030, y: P - 96, h: 20 },
  { key: 'lamp_tube', x: 560, y: P - 52, h: 22, glow: 0xffe0a0 },
  { key: 'lamp_tube', x: 760, y: P - 52, h: 22, glow: 0xffe0a0 },
  { key: 'monitor', x: 660, y: P - 40, h: 24 },
  { key: 'crate_brown_small', x: 650, y: P, h: 24 },
  { key: 'laptop', x: 650, y: P - 24, h: 16 },
];
