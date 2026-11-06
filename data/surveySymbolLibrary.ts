/**
 * Survey Symbol Library
 *
 * Industry-standard planimetric CAD blocks and point symbols for land surveying
 * following NCS (National CAD Standard), FGDC, and AutoCAD Civil 3D conventions.
 * All symbols are centered on insertion point (12,12) in a 24x24 viewBox.
 *
 * Categories:
 * - Control & Monuments: IPF, IPS, IRS, IRF, REBAR, RBC, CM, CP, BM, MAG, PK, SEC, QTR, BS, GPS, HUB, STAKE
 * - Property & Boundary: PC, FP, ROW
 * - Utilities - Storm: MH, SDMH, SSMH, CB, CI, CO, HW, GT
 * - Utilities - Water: FH, WV, WM, BO, PIV, BFP
 * - Utilities - Gas: GV, GM
 * - Utilities - Electric: PP, LP, ELEC, GUY, EH, TS
 * - Utilities - Telecom: TEL, CH, FO
 * - Topographic: TREE, SHRUB, STUMP, SPOT, EP, SHOT, SB, MW
 * - Structures: BLDG, WL, SGN, BOL, MB, ADA
 */

import { SymbolDefinition, SymbolTextElement } from '../contexts/types/CadManager.types';

export type { SymbolTextElement };

export interface LibrarySymbol {
  id: string;
  name: string;
  description: string;
  category: string;
  svgPath: string;
  fillPath?: string;
  /** First-class CAD/SVG text elements (rendered as real text, never approximated with paths). */
  texts?: SymbolTextElement[];
  viewBox: string;
  tags: string[];  // For search & natural-language resolution
}

/**
 * Standard Survey Symbol Library
 * Professional planimetric CAD blocks following NCS / FGDC / Civil 3D conventions.
 */
export const SURVEY_SYMBOL_LIBRARY: LibrarySymbol[] = [
  // ============ CONTROL & MONUMENTS ============
  {
    id: 'ipf',
    name: 'Iron Pipe Found',
    description: 'Circle with cardinal ticks and solid center dot - found iron pipe monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 12 2.5 V 4 M 12 20 V 21.5 M 2.5 12 H 4 M 20 12 H 21.5',
    fillPath: 'M 14.2 12 A 2.2 2.2 0 1 0 9.8 12 A 2.2 2.2 0 1 0 14.2 12 Z',
    viewBox: '0 0 24 24',
    tags: ['iron', 'pipe', 'found', 'monument', 'boundary', 'ipf', 'iron_pipe_found'],
  },
  {
    id: 'ips',
    name: 'Iron Pipe Set',
    description: 'Double concentric circle with cardinal ticks - set iron pipe monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 16 12 A 4 4 0 1 0 8 12 A 4 4 0 1 0 16 12 Z M 12 2.5 V 4 M 12 20 V 21.5 M 2.5 12 H 4 M 20 12 H 21.5',
    viewBox: '0 0 24 24',
    tags: ['iron', 'pipe', 'set', 'monument', 'boundary', 'ips', 'iron_pipe_set'],
  },
  {
    id: 'irs',
    name: 'Iron Rod Set',
    description: 'Circle with diagonal crosshairs extending beyond rim - set iron rod monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 5 5 L 19 19 M 19 5 L 5 19',
    viewBox: '0 0 24 24',
    tags: ['iron', 'rod', 'pin', 'set', 'monument', 'boundary', 'irs', 'ips', 'iron_rod_set'],
  },
  {
    id: 'irf',
    name: 'Iron Rod Found',
    description: 'Circle with diagonal X and solid center dot - found iron rod/pin monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 6.3 6.3 L 17.7 17.7 M 17.7 6.3 L 6.3 17.7',
    fillPath: 'M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['iron', 'rod', 'pin', 'found', 'monument', 'boundary', 'irf', 'ipn', 'iron_rod_found'],
  },
  {
    id: 'rebar',
    name: 'Rebar',
    description: 'Outer monument ring with solid filled inner core - rebar monument',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z',
    fillPath: 'M 16.5 12 A 4.5 4.5 0 1 0 7.5 12 A 4.5 4.5 0 1 0 16.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['rebar', 'found', 'monument', 'rbcf', 'rbc', 'rebar_found', 'rebar_set'],
  },
  {
    id: 'rebar-cap',
    name: 'Rebar with Cap',
    description: 'Diamond cap over circle with center dot - capped rebar monument',
    category: 'Control & Monuments',
    svgPath: 'M 12 3 L 21 12 L 12 21 L 3 12 Z M 17.5 12 A 5.5 5.5 0 1 0 6.5 12 A 5.5 5.5 0 1 0 17.5 12 Z',
    fillPath: 'M 13.8 12 A 1.8 1.8 0 1 0 10.2 12 A 1.8 1.8 0 1 0 13.8 12 Z',
    viewBox: '0 0 24 24',
    tags: ['rebar', 'cap', 'capped', 'rbcf', 'rbcs', 'rebar_cap_found', 'rebar_cap_set'],
  },
  {
    id: 'concrete',
    name: 'Concrete Monument',
    description: 'Square monument with inscribed circle and center dot - concrete monument',
    category: 'Control & Monuments',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z M 15.5 12 A 3.5 3.5 0 1 0 8.5 12 A 3.5 3.5 0 1 0 15.5 12 Z',
    fillPath: 'M 13.5 12 A 1.5 1.5 0 1 0 10.5 12 A 1.5 1.5 0 1 0 13.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['concrete', 'monument', 'cm', 'conc', 'concrete_monument_found', 'cmon'],
  },
  {
    id: 'control',
    name: 'Control Point',
    description: 'Equilateral triangle with precision crosshairs and center dot - survey control station',
    category: 'Control & Monuments',
    svgPath: 'M 12 3 L 20.5 18.5 H 3.5 Z M 12 8.5 V 17.5 M 7.5 13 H 16.5',
    fillPath: 'M 13.6 13 A 1.6 1.6 0 1 0 10.4 13 A 1.6 1.6 0 1 0 13.6 13 Z',
    viewBox: '0 0 24 24',
    tags: ['control', 'point', 'cp', 'traverse', 'triangulation', 'control_point'],
  },
  {
    id: 'benchmark',
    name: 'Benchmark',
    description: 'USGS-style circular tablet with inscribed triangle and BM label - elevation benchmark',
    category: 'Control & Monuments',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 12 4.2 L 18.8 16.2 H 5.2 Z M 12 2 V 3.5 M 12 20.5 V 22 M 2 12 H 3.5 M 20.5 12 H 22',
    texts: [{ text: 'BM', x: 12, y: 13.2, fontSize: 5.0, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['benchmark', 'bm', 'control', 'elevation', 'datum', 'tbm'],
  },
  {
    id: 'mag-nail',
    name: 'Mag Nail',
    description: 'Diamond with cardinal crosshairs and center dot - magnetic survey nail',
    category: 'Control & Monuments',
    svgPath: 'M 12 3 L 21 12 L 12 21 L 3 12 Z M 12 3 V 7 M 12 17 V 21 M 3 12 H 7 M 17 12 H 21',
    fillPath: 'M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['mag', 'nail', 'pk', 'set', 'mnf', 'mns', 'mag_nail_set', 'mag_nail_found'],
  },
  {
    id: 'pk-nail',
    name: 'PK Nail',
    description: 'Circle inscribed in diamond with diagonal crosshairs - Parker-Kalon survey nail',
    category: 'Control & Monuments',
    svgPath: 'M 12 2.5 L 21.5 12 L 12 21.5 L 2.5 12 Z M 18 12 A 6 6 0 1 0 6 12 A 6 6 0 1 0 18 12 Z M 7.8 7.8 L 16.2 16.2 M 16.2 7.8 L 7.8 16.2',
    viewBox: '0 0 24 24',
    tags: ['pk', 'nail', 'pkn', 'pkf', 'pks', 'pk_nail_set', 'pk_nail_found'],
  },
  {
    id: 'section-corner',
    name: 'Section Corner',
    description: 'Circle with full cardinal crosshairs and diagonal quadrant ticks - PLSS section corner',
    category: 'Control & Monuments',
    svgPath: 'M 19.5 12 A 7.5 7.5 0 1 0 4.5 12 A 7.5 7.5 0 1 0 19.5 12 Z M 12 2 V 22 M 2 12 H 22 M 6.7 6.7 L 8.8 8.8 M 17.3 6.7 L 15.2 8.8 M 6.7 17.3 L 8.8 15.2 M 17.3 17.3 L 15.2 15.2',
    fillPath: 'M 13.8 12 A 1.8 1.8 0 1 0 10.2 12 A 1.8 1.8 0 1 0 13.8 12 Z',
    viewBox: '0 0 24 24',
    tags: ['section', 'corner', 'plss', 'sec', 'section_corner_found'],
  },
  {
    id: 'quarter-corner',
    name: 'Quarter Corner',
    description: 'Diamond with full cardinal crosshairs - PLSS quarter-section corner',
    category: 'Control & Monuments',
    svgPath: 'M 12 3.5 L 20.5 12 L 12 20.5 L 3.5 12 Z M 12 2 V 22 M 2 12 H 22',
    fillPath: 'M 13.6 12 A 1.6 1.6 0 1 0 10.4 12 A 1.6 1.6 0 1 0 13.6 12 Z',
    viewBox: '0 0 24 24',
    tags: ['quarter', 'corner', 'plss', 'qtr', 'quarter_corner_found'],
  },
  {
    id: 'backsight',
    name: 'Backsight Target',
    description: 'Survey target ring with crosshairs and opposing filled quadrants - backsight/prism',
    category: 'Control & Monuments',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 16.5 12 A 4.5 4.5 0 1 0 7.5 12 A 4.5 4.5 0 1 0 16.5 12 Z M 12 2 V 22 M 2 12 H 22',
    fillPath: 'M 12 12 L 16.5 12 A 4.5 4.5 0 0 0 12 7.5 Z M 12 12 L 7.5 12 A 4.5 4.5 0 0 0 12 16.5 Z',
    viewBox: '0 0 24 24',
    tags: ['backsight', 'target', 'bs', 'prism', 'backsight_target'],
  },
  {
    id: 'gps-base',
    name: 'GPS Base Station',
    description: 'Control triangle with inner receiver ring and cardinal antenna ticks - GNSS base station',
    category: 'Control & Monuments',
    svgPath: 'M 12 2.5 L 21 19.5 H 3 Z M 15.5 13.5 A 3.5 3.5 0 1 0 8.5 13.5 A 3.5 3.5 0 1 0 15.5 13.5 Z M 12 8.5 V 18.5 M 7 13.5 H 17',
    fillPath: 'M 13.3 13.5 A 1.3 1.3 0 1 0 10.7 13.5 A 1.3 1.3 0 1 0 13.3 13.5 Z',
    viewBox: '0 0 24 24',
    tags: ['gps', 'gnss', 'base', 'station', 'rtk', 'gps_base_station'],
  },
  {
    id: 'wood-hub',
    name: 'Wood Hub',
    description: 'Square survey hub with tack ring and center dot - wood hub & tack',
    category: 'Control & Monuments',
    svgPath: 'M 6 6 H 18 V 18 H 6 Z M 6 6 L 9 9 M 18 6 L 15 9 M 6 18 L 9 15 M 18 18 L 15 15',
    fillPath: 'M 13.8 12 A 1.8 1.8 0 1 0 10.2 12 A 1.8 1.8 0 1 0 13.8 12 Z',
    viewBox: '0 0 24 24',
    tags: ['wood', 'hub', 'tack', 'wh', 'staking', 'wood_hub'],
  },
  {
    id: 'wood-stake',
    name: 'Wood Stake / Lath',
    description: 'Diamond stake with survey flagging pennant - wood stake or lath',
    category: 'Control & Monuments',
    svgPath: 'M 12 5 L 17.5 12 L 12 19 L 6.5 12 Z M 12 5 V 2.5 L 18.5 4.5 L 12 6.5',
    fillPath: 'M 13.3 12 A 1.3 1.3 0 1 0 10.7 12 A 1.3 1.3 0 1 0 13.3 12 Z',
    viewBox: '0 0 24 24',
    tags: ['wood', 'stake', 'lath', 'flagged', 'wstk', 'wood_stake', 'lath_flagged'],
  },

  // ============ PROPERTY & BOUNDARY ============
  {
    id: 'property-corner',
    name: 'Property Corner',
    description: 'Square monument frame with diagonal X and inscribed ring - property/lot corner',
    category: 'Property & Boundary',
    svgPath: 'M 5 5 H 19 V 19 H 5 Z M 5 5 L 19 19 M 19 5 L 5 19 M 16.5 12 A 4.5 4.5 0 1 0 7.5 12 A 4.5 4.5 0 1 0 16.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['property', 'corner', 'pc', 'pl', 'lot', 'property_corner_found', 'lot_corner_found'],
  },
  {
    id: 'fence-post',
    name: 'Fence Post',
    description: 'Square post with inline fence line attachment ticks - fence post/corner',
    category: 'Property & Boundary',
    svgPath: 'M 8 8 H 16 V 16 H 8 Z M 3 12 H 8 M 16 12 H 21',
    fillPath: 'M 13.5 12 A 1.5 1.5 0 1 0 10.5 12 A 1.5 1.5 0 1 0 13.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['fence', 'post', 'fp', 'fnc'],
  },
  {
    id: 'right-of-way',
    name: 'Right of Way',
    description: 'Diamond monument with R/W designation - right-of-way marker',
    category: 'Property & Boundary',
    svgPath: 'M 12 2.5 L 21.5 12 L 12 21.5 L 2.5 12 Z M 12 2.5 V 4.5 M 12 19.5 V 21.5 M 2.5 12 H 4.5 M 19.5 12 H 21.5',
    texts: [{ text: 'R/W', x: 12, y: 12, fontSize: 5.2, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['row', 'right', 'way', 'easement', 'rw_marker'],
  },

  // ============ UTILITIES - STORM ============
  {
    id: 'manhole',
    name: 'Manhole',
    description: 'Double-ring manhole cover with rim lugs and MH designation - utility manhole',
    category: 'Utilities - Storm',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.8 12 A 6.8 6.8 0 1 0 5.2 12 A 6.8 6.8 0 1 0 18.8 12 Z M 12 2 V 3.5 M 12 20.5 V 22 M 2 12 H 3.5 M 20.5 12 H 22',
    texts: [{ text: 'MH', x: 12, y: 12, fontSize: 6.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['manhole', 'mh', 'smh', 'storm', 'sewer', 'catch', 'basin', 'cb', 'storm_mh', 'sewer_mh'],
  },
  {
    id: 'storm-drain-vault',
    name: 'Storm Drain Structure',
    description: 'Double-ring structure cover with SD designation - storm drainage structure',
    category: 'Utilities - Storm',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.8 12 A 6.8 6.8 0 1 0 5.2 12 A 6.8 6.8 0 1 0 18.8 12 Z M 5.2 6.8 L 3.8 5.4 M 18.8 6.8 L 20.2 5.4 M 5.2 17.2 L 3.8 18.6 M 18.8 17.2 L 20.2 18.6',
    texts: [{ text: 'SD', x: 12, y: 12, fontSize: 6.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['sdmh', 'drainage', 'vault', 'culvert'],
  },
  {
    id: 'sewer-vault',
    name: 'Sewer Structure',
    description: 'Double-ring structure cover with SS designation - wastewater sewer structure',
    category: 'Utilities - Storm',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.8 12 A 6.8 6.8 0 1 0 5.2 12 A 6.8 6.8 0 1 0 18.8 12 Z M 12 2 V 3.5 M 12 20.5 V 22',
    texts: [{ text: 'SS', x: 12, y: 12, fontSize: 6.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['ssmh', 'wastewater', 'effluent'],
  },
  {
    id: 'catch-basin',
    name: 'Catch Basin / Grate Inlet',
    description: 'Square drainage basin with parallel grate bars - catch basin / drop inlet',
    category: 'Utilities - Storm',
    svgPath: 'M 4.5 4.5 H 19.5 V 19.5 H 4.5 Z M 6 6 H 18 V 18 H 6 Z M 9 6 V 18 M 12 6 V 18 M 15 6 V 18',
    viewBox: '0 0 24 24',
    tags: ['grate', 'drop', 'di', 'cb_inlet'],
  },
  {
    id: 'curb-inlet',
    name: 'Curb Inlet',
    description: 'Planimetric curb inlet box with back-of-curb hood and throat opening',
    category: 'Utilities - Storm',
    svgPath: 'M 3.5 6.5 H 20.5 V 16 H 3.5 Z M 2.5 6.5 H 21.5 M 3.5 9.2 H 20.5 M 7.5 16 V 19.5 M 16.5 16 V 19.5 M 7.5 19.5 H 16.5',
    texts: [{ text: 'CI', x: 12, y: 12.8, fontSize: 5.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['curb', 'inlet', 'ci', 'drain', 'storm', 'curb_inlet'],
  },
  {
    id: 'cleanout',
    name: 'Cleanout',
    description: 'Circle with pipe flange ticks and CO designation - sewer/drain cleanout',
    category: 'Utilities - Storm',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 12 2.5 V 4 M 10 2.5 H 14 M 12 20 V 21.5 M 10 21.5 H 14',
    texts: [{ text: 'CO', x: 12, y: 12, fontSize: 7.2, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['cleanout', 'co', 'sewer', 'access'],
  },
  {
    id: 'headwall',
    name: 'Culvert Headwall / FES',
    description: 'Planimetric culvert barrel with flared wingwalls - headwall or flared end section',
    category: 'Utilities - Storm',
    svgPath: 'M 4 5.5 L 8.5 10 H 15.5 L 20 5.5 M 8.5 10 V 18.5 H 15.5 V 10 M 6.5 18.5 H 17.5',
    viewBox: '0 0 24 24',
    tags: ['headwall', 'fes', 'flared', 'culvert', 'outfall', 'hw'],
  },
  {
    id: 'grease-trap',
    name: 'Grease Trap',
    description: 'Circular interceptor with baffle lines and GT designation - grease trap',
    category: 'Utilities - Storm',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 6 7.5 H 18 M 6 16.5 H 18',
    texts: [{ text: 'GT', x: 12, y: 12, fontSize: 6.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['grease', 'trap', 'interceptor', 'gt', 'fog'],
  },

  // ============ UTILITIES - WATER ============
  {
    id: 'fire-hydrant',
    name: 'Fire Hydrant',
    description: 'Planimetric hydrant barrel with two side hose nozzles, top steamer nozzle, and operating nut',
    category: 'Utilities - Water',
    svgPath: 'M 18 12 A 6 6 0 1 0 6 12 A 6 6 0 1 0 18 12 Z M 6 12 H 2.5 M 2.5 9.2 V 14.8 M 18 12 H 21.5 M 21.5 9.2 V 14.8 M 12 6 V 2.5 M 9 2.5 H 15 M 12 18 V 20.5',
    fillPath: 'M 14 12 A 2 2 0 1 0 10 12 A 2 2 0 1 0 14 12 Z',
    viewBox: '0 0 24 24',
    tags: ['fire', 'hydrant', 'fh', 'water', 'fire_hydrant'],
  },
  {
    id: 'water-valve',
    name: 'Water Valve',
    description: 'Valve circle with inline pipe flanges and WV designation - water gate/butterfly valve',
    category: 'Utilities - Water',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 1.8 12 H 3.5 M 20.5 12 H 22.2 M 1.8 9.5 V 14.5 M 22.2 9.5 V 14.5',
    texts: [{ text: 'WV', x: 12, y: 12, fontSize: 7.0, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['water', 'valve', 'wv', 'shutoff', 'water_valve'],
  },
  {
    id: 'water-meter',
    name: 'Water Meter',
    description: 'Double-ring meter housing with union stubs and WM designation - water meter',
    category: 'Utilities - Water',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.8 12 A 6.8 6.8 0 1 0 5.2 12 A 6.8 6.8 0 1 0 18.8 12 Z M 1.8 12 H 3.5 M 20.5 12 H 22.2',
    texts: [{ text: 'WM', x: 12, y: 12, fontSize: 6.2, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['water', 'meter', 'wm', 'water_meter'],
  },
  {
    id: 'blowoff-valve',
    name: 'Blow-Off Assembly',
    description: 'Circle with discharge arrow and BO designation - blow-off assembly',
    category: 'Utilities - Water',
    svgPath: 'M 20 13 A 8 8 0 1 0 4 13 A 8 8 0 1 0 20 13 Z M 12 5 V 1.5 M 9.5 3.8 L 12 1.5 L 14.5 3.8',
    texts: [{ text: 'BO', x: 12, y: 13, fontSize: 6.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['blowoff', 'blow-off', 'bo', 'flush', 'hydrant-blowoff'],
  },
  {
    id: 'post-indicator-valve',
    name: 'Post Indicator Valve',
    description: 'Circular post housing with target lugs and PIV designation - fire protection PIV',
    category: 'Utilities - Water',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 12 2 V 3.5 M 12 20.5 V 22 M 2 12 H 3.5 M 20.5 12 H 22',
    texts: [{ text: 'PIV', x: 12, y: 12, fontSize: 5.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['piv', 'post-indicator', 'indicator', 'sprinkler'],
  },
  {
    id: 'backflow-preventer',
    name: 'Backflow Preventer',
    description: 'Vault enclosure with dual check-valve triangles - backflow preventer assembly',
    category: 'Utilities - Water',
    svgPath: 'M 3 6.5 H 21 V 17.5 H 3 Z M 6 15 L 11.2 12 L 6 9 Z M 12.8 15 L 18 12 L 12.8 9 Z M 1.5 12 H 3 M 21 12 H 22.5',
    viewBox: '0 0 24 24',
    tags: ['backflow', 'preventer', 'bfp', 'rpz', 'dcva'],
  },

  // ============ UTILITIES - GAS ============
  {
    id: 'gas-valve',
    name: 'Gas Valve',
    description: 'Valve circle with inline pipe flanges and GV designation - gas shutoff valve',
    category: 'Utilities - Gas',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 1.8 12 H 3.5 M 20.5 12 H 22.2 M 1.8 9.5 V 14.5 M 22.2 9.5 V 14.5',
    texts: [{ text: 'GV', x: 12, y: 12, fontSize: 7.0, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['gas', 'valve', 'gv', 'gas_valve'],
  },
  {
    id: 'gas-meter',
    name: 'Gas Meter',
    description: 'Rectangular meter case with top union risers and GM designation - gas meter',
    category: 'Utilities - Gas',
    svgPath: 'M 4.5 6.5 H 19.5 V 18.5 H 4.5 Z M 8 6.5 V 3.5 M 6.2 3.5 H 9.8 M 16 6.5 V 3.5 M 14.2 3.5 H 17.8',
    texts: [{ text: 'GM', x: 12, y: 12.6, fontSize: 6.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['gas', 'meter', 'gm', 'gas_meter'],
  },

  // ============ UTILITIES - ELECTRIC ============
  {
    id: 'power-pole',
    name: 'Power Pole',
    description: 'Utility pole circle with tangent crossarm and 45° diagonal cross - power/utility pole',
    category: 'Utilities - Electric',
    svgPath: 'M 18.5 12 A 6.5 6.5 0 1 0 5.5 12 A 6.5 6.5 0 1 0 18.5 12 Z M 2.5 12 H 21.5 M 2.5 9.8 V 14.2 M 21.5 9.8 V 14.2 M 7.4 7.4 L 16.6 16.6 M 16.6 7.4 L 7.4 16.6',
    viewBox: '0 0 24 24',
    tags: ['power', 'pole', 'pp', 'up', 'utility', 'electric', 'power_pole'],
  },
  {
    id: 'light-pole',
    name: 'Light Pole',
    description: 'Pole standard with mast arm, luminaire head, and radiating light rays - street light',
    category: 'Utilities - Electric',
    svgPath: 'M 12.5 12 A 4.5 4.5 0 1 0 3.5 12 A 4.5 4.5 0 1 0 12.5 12 Z M 12.5 12 H 16.5 M 16.5 9.2 L 19.8 12 L 16.5 14.8 Z M 19.8 8.2 L 22 6.5 M 20.8 12 H 23 M 19.8 15.8 L 22 17.5',
    fillPath: 'M 9.6 12 A 1.6 1.6 0 1 0 6.4 12 A 1.6 1.6 0 1 0 9.6 12 Z',
    viewBox: '0 0 24 24',
    tags: ['light', 'pole', 'lp', 'street', 'lamp', 'luminaire', 'light_pole'],
  },
  {
    id: 'electric-box',
    name: 'Electric Box/Transformer',
    description: 'Double-framed square transformer pad with E designation - electrical transformer/cabinet',
    category: 'Utilities - Electric',
    svgPath: 'M 4.5 4.5 H 19.5 V 19.5 H 4.5 Z M 6.3 6.3 H 17.7 V 17.7 H 6.3 Z',
    texts: [{ text: 'E', x: 12, y: 12, fontSize: 8.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['electric', 'transformer', 'box', 'elec', 'pad', 'tx'],
  },
  {
    id: 'guy-anchor',
    name: 'Guy Wire / Anchor',
    description: 'Attachment ring with guy wire arrow and anchor crossbar - utility guy anchor',
    category: 'Utilities - Electric',
    svgPath: 'M 8 12 A 2.5 2.5 0 1 0 3 12 A 2.5 2.5 0 1 0 8 12 Z M 8 12 H 19.5 M 14 8 L 19.5 12 L 14 16 M 19.5 6.5 V 17.5',
    fillPath: 'M 6.5 12 A 1 1 0 1 0 4.5 12 A 1 1 0 1 0 6.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['guy', 'anchor', 'wire', 'down-guy', 'ga'],
  },
  {
    id: 'handhole-electric',
    name: 'Electric Handhole / Pull Box',
    description: 'Rectangular underground vault cover with EH designation - electrical pull box',
    category: 'Utilities - Electric',
    svgPath: 'M 3.5 6.5 H 20.5 V 17.5 H 3.5 Z M 5 8 H 19 V 16 H 5 Z',
    texts: [{ text: 'EH', x: 12, y: 12, fontSize: 6.2, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['handhole', 'pullbox', 'eh', 'electric-vault', 'jbox'],
  },
  {
    id: 'traffic-signal',
    name: 'Traffic Signal',
    description: 'Signal pole circle with mast lugs and TS designation - traffic signal standard/controller',
    category: 'Utilities - Electric',
    svgPath: 'M 20 12 A 8 8 0 1 0 4 12 A 8 8 0 1 0 20 12 Z M 12 2 V 4 M 12 20 V 22 M 2 12 H 4 M 20 12 H 22',
    texts: [{ text: 'TS', x: 12, y: 12, fontSize: 6.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['signal', 'ts', 'signal-pole', 'controller'],
  },

  // ============ UTILITIES - TELECOM ============
  {
    id: 'telecom-ped',
    name: 'Telecom Pedestal',
    description: 'Double-ring communications housing with T designation - telephone/telecom pedestal',
    category: 'Utilities - Telecom',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.7 12 A 6.7 6.7 0 1 0 5.3 12 A 6.7 6.7 0 1 0 18.7 12 Z',
    texts: [{ text: 'T', x: 12, y: 12, fontSize: 8.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['telecom', 'telephone', 'tel', 'communications', 'ped', 'pedestal'],
  },
  {
    id: 'handhole-telecom',
    name: 'Communications Handhole / Vault',
    description: 'Rectangular underground vault cover with C designation - communications pull box',
    category: 'Utilities - Telecom',
    svgPath: 'M 3.5 6.5 H 20.5 V 17.5 H 3.5 Z M 5 8 H 19 V 16 H 5 Z',
    texts: [{ text: 'C', x: 12, y: 12, fontSize: 7.2, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['comm-vault', 'catv', 'ch', 'comm-box'],
  },
  {
    id: 'fiber-marker',
    name: 'Fiber Optic Marker',
    description: 'Circle with inscribed diamond and FO designation - fiber optic marker/post',
    category: 'Utilities - Telecom',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 12 3.5 L 20.5 12 L 12 20.5 L 3.5 12 Z',
    texts: [{ text: 'FO', x: 12, y: 12, fontSize: 5.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['fiber', 'optic', 'fo', 'fom'],
  },

  // ============ TOPOGRAPHIC ============
  {
    id: 'tree-deciduous',
    name: 'Tree (Deciduous)',
    description: 'Planimetric 8-lobe scalloped canopy with trunk crosshair - deciduous shade tree',
    category: 'Topographic',
    svgPath: 'M 20 12 A 3.3 3.3 0 0 1 17.7 17.7 A 3.3 3.3 0 0 1 12 20 A 3.3 3.3 0 0 1 6.3 17.7 A 3.3 3.3 0 0 1 4 12 A 3.3 3.3 0 0 1 6.3 6.3 A 3.3 3.3 0 0 1 12 4 A 3.3 3.3 0 0 1 17.7 6.3 A 3.3 3.3 0 0 1 20 12 Z M 10 12 H 14 M 12 10 V 14',
    fillPath: 'M 13 12 A 1 1 0 1 0 11 12 A 1 1 0 1 0 13 12 Z',
    viewBox: '0 0 24 24',
    tags: ['tree', 'deciduous', 'oak', 'maple', 'vegetation', 'tree_deciduous'],
  },
  {
    id: 'tree-conifer',
    name: 'Tree (Conifer)',
    description: 'Planimetric 12-point evergreen star rosette crown with trunk ring - coniferous/pine tree',
    category: 'Topographic',
    svgPath: 'M 12 2.5 L 13.8 6.8 L 16.8 3.7 L 16.5 8.2 L 20.3 7.2 L 18.2 10.8 L 21.5 12 L 18.2 13.2 L 20.3 16.8 L 16.5 15.8 L 16.8 20.3 L 13.8 17.2 L 12 21.5 L 10.2 17.2 L 7.2 20.3 L 7.5 15.8 L 3.7 16.8 L 5.8 13.2 L 2.5 12 L 5.8 10.8 L 3.7 7.2 L 7.5 8.2 L 7.2 3.7 L 10.2 6.8 Z M 14.2 12 A 2.2 2.2 0 1 0 9.8 12 A 2.2 2.2 0 1 0 14.2 12 Z M 10.6 12 H 13.4 M 12 10.6 V 13.4',
    viewBox: '0 0 24 24',
    tags: ['tree', 'conifer', 'evergreen', 'pine', 'spruce', 'tree_conifer'],
  },
  {
    id: 'shrub',
    name: 'Shrub / Bush',
    description: 'Planimetric 6-lobe scalloped foliage cluster with center stem dot - shrub or bush',
    category: 'Topographic',
    svgPath: 'M 18.5 12 A 3 3 0 0 1 15.2 17.6 A 3 3 0 0 1 8.8 17.6 A 3 3 0 0 1 5.5 12 A 3 3 0 0 1 8.8 6.4 A 3 3 0 0 1 15.2 6.4 A 3 3 0 0 1 18.5 12 Z M 10.5 12 H 13.5 M 12 10.5 V 13.5',
    fillPath: 'M 13.2 12 A 1.2 1.2 0 1 0 10.8 12 A 1.2 1.2 0 1 0 13.2 12 Z',
    viewBox: '0 0 24 24',
    tags: ['shrub', 'bush', 'hedge', 'landscaping'],
  },
  {
    id: 'stump',
    name: 'Stump',
    description: 'Trunk circle with root buttress flares and diagonal cut X - stump',
    category: 'Topographic',
    svgPath: 'M 18.5 12 A 6.5 6.5 0 1 0 5.5 12 A 6.5 6.5 0 1 0 18.5 12 Z M 7.8 7.8 L 16.2 16.2 M 16.2 7.8 L 7.8 16.2 M 12 5.5 L 11 3.2 M 12 18.5 L 13 20.8 M 5.5 12 L 3.2 11 M 18.5 12 L 20.8 13',
    viewBox: '0 0 24 24',
    tags: ['stump', 'stmp', 'cut-trunk'],
  },
  {
    id: 'spot-elevation',
    name: 'Spot Elevation',
    description: 'Precision diagonal X cross with center point dot - spot elevation shot',
    category: 'Topographic',
    svgPath: 'M 5.5 5.5 L 18.5 18.5 M 18.5 5.5 L 5.5 18.5',
    fillPath: 'M 13.3 12 A 1.3 1.3 0 1 0 10.7 12 A 1.3 1.3 0 1 0 13.3 12 Z',
    viewBox: '0 0 24 24',
    tags: ['spot', 'elevation', 'x', 'topo', 'grade'],
  },
  {
    id: 'edge-pavement',
    name: 'Edge of Pavement',
    description: 'Cardinal crosshairs with center target ring - edge of pavement marker',
    category: 'Topographic',
    svgPath: 'M 12 4 V 20 M 4 12 H 20 M 14.5 12 A 2.5 2.5 0 1 0 9.5 12 A 2.5 2.5 0 1 0 14.5 12 Z',
    viewBox: '0 0 24 24',
    tags: ['edge', 'pavement', 'ep', 'road', 'asphalt'],
  },
  {
    id: 'contour-point',
    name: 'Contour/Topo Shot',
    description: 'Target ring with solid center dot - general topographic ground shot',
    category: 'Topographic',
    svgPath: 'M 16.5 12 A 4.5 4.5 0 1 0 7.5 12 A 4.5 4.5 0 1 0 16.5 12 Z',
    fillPath: 'M 13.8 12 A 1.8 1.8 0 1 0 10.2 12 A 1.8 1.8 0 1 0 13.8 12 Z',
    viewBox: '0 0 24 24',
    tags: ['contour', 'topo', 'shot', 'point', 'ground'],
  },
  {
    id: 'soil-boring',
    name: 'Soil Boring / Test Pit',
    description: 'Geotechnical target circle with crosshairs and opposing filled quadrants - soil boring',
    category: 'Topographic',
    svgPath: 'M 19.5 12 A 7.5 7.5 0 1 0 4.5 12 A 7.5 7.5 0 1 0 19.5 12 Z M 12 2.5 V 21.5 M 2.5 12 H 21.5',
    fillPath: 'M 12 12 L 19.5 12 A 7.5 7.5 0 0 0 12 4.5 Z M 12 12 L 4.5 12 A 7.5 7.5 0 0 0 12 19.5 Z',
    viewBox: '0 0 24 24',
    tags: ['soil', 'boring', 'geotech', 'test-pit', 'sb'],
  },
  {
    id: 'monitoring-well',
    name: 'Monitoring Well',
    description: 'Outer casing circle with inscribed triangle and MW designation - environmental monitoring well',
    category: 'Topographic',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 12 4.2 L 18.8 16.2 H 5.2 Z',
    texts: [{ text: 'MW', x: 12, y: 13.2, fontSize: 4.8, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['monitoring', 'piezometer', 'mw', 'groundwater'],
  },

  // ============ STRUCTURES ============
  {
    id: 'building-corner',
    name: 'Building Corner',
    description: 'Planimetric right-angle architectural wall corner centered on vertex (12,12)',
    category: 'Structures',
    svgPath: 'M 4 12 H 12 V 4 H 16.5 V 16.5 H 4 Z M 12 12 L 16.5 16.5 M 8 12 L 12 16.5 M 12 8 L 16.5 12',
    fillPath: 'M 13.6 12 A 1.6 1.6 0 1 0 10.4 12 A 1.6 1.6 0 1 0 13.6 12 Z',
    viewBox: '0 0 24 24',
    tags: ['building', 'corner', 'bldg', 'bc', 'structure', 'bldgcor'],
  },
  {
    id: 'well',
    name: 'Well',
    description: 'Double-ring well casing with W designation - water/irrigation well',
    category: 'Structures',
    svgPath: 'M 20.5 12 A 8.5 8.5 0 1 0 3.5 12 A 8.5 8.5 0 1 0 20.5 12 Z M 18.2 12 A 6.2 6.2 0 1 0 5.8 12 A 6.2 6.2 0 1 0 18.2 12 Z',
    texts: [{ text: 'W', x: 12, y: 12, fontSize: 7.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['well', 'water', 'wl', 'irrigation'],
  },
  {
    id: 'sign',
    name: 'Sign',
    description: 'Planimetric double-post circles connected by sign panel blade - traffic/site sign',
    category: 'Structures',
    svgPath: 'M 8.5 12 A 2.5 2.5 0 1 0 3.5 12 A 2.5 2.5 0 1 0 8.5 12 Z M 20.5 12 A 2.5 2.5 0 1 0 15.5 12 A 2.5 2.5 0 1 0 20.5 12 Z M 8.5 12 H 15.5 M 3.5 9.5 H 20.5 M 3.5 14.5 H 20.5',
    fillPath: 'M 7 12 A 1 1 0 1 0 5 12 A 1 1 0 1 0 7 12 Z M 19 12 A 1 1 0 1 0 17 12 A 1 1 0 1 0 19 12 Z',
    viewBox: '0 0 24 24',
    tags: ['sign', 'sgn', 'post', 'traffic'],
  },
  {
    id: 'bollard',
    name: 'Bollard',
    description: 'Heavy double-ring protective post with solid inner core and cardinal ticks - bollard',
    category: 'Structures',
    svgPath: 'M 18.5 12 A 6.5 6.5 0 1 0 5.5 12 A 6.5 6.5 0 1 0 18.5 12 Z M 12 3.8 V 5.5 M 12 18.5 V 20.2 M 3.8 12 H 5.5 M 18.5 12 H 20.2',
    fillPath: 'M 15.8 12 A 3.8 3.8 0 1 0 8.2 12 A 3.8 3.8 0 1 0 15.8 12 Z',
    viewBox: '0 0 24 24',
    tags: ['bollard', 'post', 'barrier', 'bol'],
  },
  {
    id: 'mailbox',
    name: 'Mailbox',
    description: 'Planimetric square housing with front door flange and MB designation - mailbox',
    category: 'Structures',
    svgPath: 'M 5.5 5.5 H 18.5 V 17.5 H 5.5 Z M 4 17.5 H 20 M 4 15.5 V 19.5 M 20 15.5 V 19.5',
    texts: [{ text: 'MB', x: 12, y: 11.5, fontSize: 6.5, fontWeight: 'bold' }],
    viewBox: '0 0 24 24',
    tags: ['mailbox', 'mb', 'mail', 'postal'],
  },
  {
    id: 'handicap',
    name: 'ADA Accessible Symbol',
    description: 'International Symbol of Access (ISA) line-art block - ADA parking/ramp marker',
    category: 'Structures',
    svgPath: 'M 14.8 15.5 A 4.8 4.8 0 1 1 9.5 9.2 M 11 5.8 V 12.5 H 16.2 L 18.5 17 M 11 9.5 H 15.2',
    fillPath: 'M 12.6 4.2 A 1.6 1.6 0 1 0 9.4 4.2 A 1.6 1.6 0 1 0 12.6 4.2 Z',
    viewBox: '0 0 24 24',
    tags: ['handicap', 'ada', 'accessible', 'wheelchair', 'hc'],
  },
];

/**
 * Get all unique categories from the library
 */
export const getSymbolCategories = (): string[] => {
  const categories = new Set(SURVEY_SYMBOL_LIBRARY.map(s => s.category));
  return Array.from(categories).sort();
};

/**
 * Search symbols by query (searches name, description, and tags)
 */
export const searchSymbols = (query: string): LibrarySymbol[] => {
  const q = query.toLowerCase().trim();
  if (!q) return SURVEY_SYMBOL_LIBRARY;
  
  return SURVEY_SYMBOL_LIBRARY.filter(symbol => 
    symbol.name.toLowerCase().includes(q) ||
    symbol.description.toLowerCase().includes(q) ||
    symbol.tags.some(tag => tag.includes(q)) ||
    symbol.id.includes(q)
  );
};

/**
 * Get symbols by category
 */
export const getSymbolsByCategory = (category: string): LibrarySymbol[] => {
  if (category === 'all') return SURVEY_SYMBOL_LIBRARY;
  return SURVEY_SYMBOL_LIBRARY.filter(s => s.category === category);
};

/**
 * Convert LibrarySymbol to SymbolDefinition
 */
export const libraryToSymbolDefinition = (
  libSymbol: LibrarySymbol,
  codeName?: string
): SymbolDefinition => ({
  name: codeName || libSymbol.name,
  svgPath: libSymbol.svgPath,
  fillPath: libSymbol.fillPath,
  ...(libSymbol.texts && libSymbol.texts.length > 0 ? { texts: libSymbol.texts } : {}),
  viewBox: libSymbol.viewBox,
  source: 'library',
  createdAt: new Date().toISOString(),
  description: libSymbol.description,
});

/**
 * Canonical block-name aliases used by CAD Standards tables (e.g., IRON_PIPE_FOUND,
 * STORM_MH, CL_MON_FOUND) mapped to SURVEY_SYMBOL_LIBRARY ids.
 */
const BLOCK_NAME_ALIAS_TO_ID: Record<string, string> = {
  IRON_PIPE_FOUND: 'ipf',
  IRON_PIPE_SET: 'ips',
  IRON_ROD_SET: 'irs',
  IRON_ROD_FOUND: 'irf',
  REBAR_FOUND: 'rebar',
  REBAR_SET: 'rebar',
  REBAR_CAP_FOUND: 'rebar-cap',
  REBAR_CAP_SET: 'rebar-cap',
  CONCRETE_MONUMENT_FOUND: 'concrete',
  CONCRETE_MONUMENT: 'concrete',
  CL_MON_FOUND: 'control',
  CONTROL_POINT: 'control',
  BENCHMARK: 'benchmark',
  MAG_NAIL_SET: 'mag-nail',
  MAG_NAIL_FOUND: 'mag-nail',
  PK_NAIL_SET: 'pk-nail',
  PK_NAIL_FOUND: 'pk-nail',
  SECTION_CORNER_FOUND: 'section-corner',
  QUARTER_CORNER_FOUND: 'quarter-corner',
  BACKSIGHT_TARGET: 'backsight',
  GPS_BASE_STATION: 'gps-base',
  WOOD_HUB: 'wood-hub',
  WOOD_STAKE: 'wood-stake',
  LATH: 'wood-stake',
  LATH_FLAGGED: 'wood-stake',
  PROPERTY_CORNER_FOUND: 'property-corner',
  LOT_CORNER_FOUND: 'property-corner',
  FENCE_POST: 'fence-post',
  RW_MARKER: 'right-of-way',
  RIGHT_OF_WAY: 'right-of-way',
  MANHOLE: 'manhole',
  STORM_MH: 'storm-drain-vault',
  SEWER_MH: 'sewer-vault',
  CATCH_BASIN: 'catch-basin',
  CURB_INLET: 'curb-inlet',
  CLEANOUT: 'cleanout',
  HEADWALL: 'headwall',
  GREASE_TRAP: 'grease-trap',
  FIRE_HYDRANT: 'fire-hydrant',
  WATER_VALVE: 'water-valve',
  WATER_METER: 'water-meter',
  BLOWOFF_VALVE: 'blowoff-valve',
  POST_INDICATOR_VALVE: 'post-indicator-valve',
  BACKFLOW_PREVENTER: 'backflow-preventer',
  GAS_VALVE: 'gas-valve',
  GAS_METER: 'gas-meter',
  POWER_POLE: 'power-pole',
  UTILITY_POLE: 'power-pole',
  LIGHT_POLE: 'light-pole',
  ELECTRIC_BOX: 'electric-box',
  GUY_ANCHOR: 'guy-anchor',
  ELECTRIC_HANDHOLE: 'handhole-electric',
  TRAFFIC_SIGNAL: 'traffic-signal',
  TELECOM_PED: 'telecom-ped',
  TELECOM_HANDHOLE: 'handhole-telecom',
  FIBER_MARKER: 'fiber-marker',
  TREE_DECIDUOUS: 'tree-deciduous',
  TREE_CONIFER: 'tree-conifer',
  TREE: 'tree-deciduous',
  SHRUB: 'shrub',
  STUMP: 'stump',
  SPOT_ELEVATION: 'spot-elevation',
  X: 'spot-elevation',
  EDGE_PAVEMENT: 'edge-pavement',
  CROSS: 'edge-pavement',
  POINT: 'contour-point',
  CIRCLE: 'ipf',
  SQUARE: 'concrete',
  TRIANGLE: 'control',
  DIAMOND: 'right-of-way',
  SOIL_BORING: 'soil-boring',
  MONITORING_WELL: 'monitoring-well',
  BUILDING_CORNER: 'building-corner',
  WELL: 'well',
  SIGN: 'sign',
  BOLLARD: 'bollard',
  MAILBOX: 'mailbox',
  HANDICAP: 'handicap',
};

/**
 * Find best matching library symbol for a code or block name
 */
export const findMatchingSymbol = (
  code: string,
  description?: string
): LibrarySymbol | null => {
  const cleanCode = (code ?? '').trim();
  if (!cleanCode && !description) return null;

  // Check canonical block name alias first (e.g., "IRON_PIPE_FOUND", "STORM_MH")
  const normalizedBlockKey = cleanCode.toUpperCase().replace(/[\s-]+/g, '_');
  const aliasId = BLOCK_NAME_ALIAS_TO_ID[normalizedBlockKey];
  if (aliasId) {
    const direct = SURVEY_SYMBOL_LIBRARY.find(s => s.id === aliasId);
    if (direct) return direct;
  }

  const lowerCode = cleanCode.toLowerCase();
  const searchTerms = [cleanCode, description].filter(Boolean).join(' ').toLowerCase();
  const tokenizedTerms = new Set(
    searchTerms.replace(/[^a-z0-9_]+/g, ' ').split(/\s+/).filter(Boolean)
  );
  
  // Score each symbol
  let bestMatch: LibrarySymbol | null = null;
  let bestScore = 0;
  
  for (const symbol of SURVEY_SYMBOL_LIBRARY) {
    let score = 0;
    
    // Exact ID or name match
    if (symbol.id === lowerCode || symbol.name.toLowerCase() === lowerCode) score += 100;
    
    // Tag matches
    for (const tag of symbol.tags) {
      if (tag === lowerCode) {
        score += 60;
      } else if (tokenizedTerms.has(tag)) {
        score += 25;
      } else if (searchTerms.includes(tag)) {
        score += 10;
      }
      if (lowerCode.includes(tag)) score += 20;
    }
    
    // Name/description match
    if (lowerCode && symbol.name.toLowerCase().includes(lowerCode)) score += 15;
    if (description && symbol.description.toLowerCase().includes(description.toLowerCase())) score += 5;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = symbol;
    }
  }
  
  return bestScore >= 10 ? bestMatch : null;
};

// Ultra-generic tags that must never, on their own, select a symbol group.
// Without this, "draw all points" or "show set monuments" would sweep in
// unrelated symbols. These only participate in matching when paired with a
// more specific word (via the intersection pass below).
const GENERIC_TAGS = new Set([
  'point', 'set', 'found', 'topo', 'grade', 'ground', 'access',
  'pad', 'box', 'shutoff', 'utility', 'traffic', 'monument',
]);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'all', 'every', 'each', 'any', 'some', 'these', 'those',
  'my', 'our', 'please', 'symbol', 'symbols', 'point', 'points', 'marker',
  'markers', 'glyph', 'glyphs', 'on', 'off', 'and', 'or', 'of', 'for', 'to',
]);

/** Strip a trailing plural so "trees" → "tree", "manholes" → "manhole". */
const singularize = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
};

/** Does a single (already-singularized) word match this library symbol? */
const wordMatchesSymbol = (word: string, symbol: LibrarySymbol): boolean => {
  if (symbol.id === word || symbol.id.includes(word)) return true;
  if (symbol.tags.some(t => t === word || singularize(t) === word)) return true;
  if (symbol.name.toLowerCase().includes(word)) return true;
  return false;
};

/**
 * Resolve a natural-language noun phrase (e.g. "trees", "sanitary manholes",
 * "water valves") to every library symbol the user plausibly meant.
 *
 * Unlike findMatchingSymbol (single best), this returns the whole group so
 * "trees" enables BOTH deciduous and conifer. Strategy: match each content
 * word to a set of symbols, then intersect the per-word sets (so "water
 * valve" → just the water valve, not every water/valve symbol). If the
 * intersection is empty (e.g. a qualifier like "sanitary" matched nothing),
 * fall back to the union of whatever words did match.
 */
export const findMatchingSymbols = (query: string): LibrarySymbol[] => {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(singularize);

  if (words.length === 0) return [];

  const perWordMatches: LibrarySymbol[][] = [];
  const specificWordMatches: LibrarySymbol[][] = [];

  for (const word of words) {
    const matches = SURVEY_SYMBOL_LIBRARY.filter(s => wordMatchesSymbol(word, s));
    if (matches.length === 0) continue;
    perWordMatches.push(matches);
    // A word is "specific" if it isn't a purely generic tag word. Generic
    // words still help narrow an intersection but can't stand alone.
    if (!GENERIC_TAGS.has(word)) specificWordMatches.push(matches);
  }

  const effective = specificWordMatches.length > 0 ? specificWordMatches : perWordMatches;
  if (effective.length === 0) return [];

  // Intersection across all matched words.
  const idCounts = new Map<string, number>();
  for (const set of effective) {
    const seen = new Set<string>();
    for (const s of set) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1);
    }
  }
  const intersectionIds = new Set(
    [...idCounts.entries()].filter(([, c]) => c === effective.length).map(([id]) => id)
  );

  const chosenIds = intersectionIds.size > 0
    ? intersectionIds
    : new Set(idCounts.keys()); // union fallback

  return SURVEY_SYMBOL_LIBRARY.filter(s => chosenIds.has(s.id));
};
