/**
 * StandardsBuilder Component
 * 
 * AI-powered chat interface for generating CAD standards files.
 * Users can describe their requirements in natural language:
 * - Firm type (subdivision, commercial, municipal)
 * - Standard references (NCS, company-specific)
 * - Patterns (annotation layers, prefixes)
 * - Categories of work
 * 
 * The AI generates a complete markdown standards table.
 * 
 * v1.58.1: Refactored to use client-side Gemini API instead of backend
 */

import React, { useState, useRef, useEffect } from 'react';
import { StandardDefinition, CodeDefinition } from '../../contexts/types/CadManager.types';
import { StandardsEditor } from './StandardsEditor';
import { startGeminiChat } from '../../services/geminiService';
import { useSettings, AgentType, type Chat, type Settings } from '../../types';
import { parseMarkdownToStandard, extractMarkdownTable, generateLinetypesFromCodes } from '../../utils/markdownTableParser';
import { LightbulbIcon } from '../icons';
import { validateStandardLayers, type ValidationSummary } from '../../utils/aecLayerValidation';

// Export the Message interface for external use
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// Internal alias for backwards compatibility
type Message = ChatMessage;

interface StandardsBuilderProps {
  onStandardGenerated: (standard: StandardDefinition, markdownContent: string) => void;
  isLoading?: boolean;
  /** Initial chat history to restore a session */
  initialChatHistory?: ChatMessage[];
  /** Callback when chat history changes */
  onChatHistoryChange?: (messages: ChatMessage[]) => void;
}

/**
 * Fun rambling messages shown while AI is thinking
 */
const THINKING_MESSAGES = [
  "Consulting CAD standards documentation...",
  "Checking layer naming conventions...",
  "Cross-referencing NCS specifications...",
  "Reviewing point code categories...",
  "Organizing layers by discipline...",
  "Making sure EP and EC don't get confused...",
  "Adding monument codes systematically...",
  "Organizing utility codes by category...",
  "Double-checking storm vs sanitary prefixes...",
  "Sorting annotation layers...",
  "Reviewing linetype assignments...",
  "Checking color standards...",
  "Formatting output tables...",
  "Validating layer structure...",
  "Processing code descriptions...",
];

/**
 * Thinking Animation Component with rotating rambling messages
 */
const ThinkingAnimation: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    // Rotate messages every 2.5 seconds
    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % THINKING_MESSAGES.length);
    }, 2500);

    // Animate dots
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);

    return () => {
      clearInterval(messageInterval);
      clearInterval(dotInterval);
    };
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-gradient-to-r from-indigo-900/50 via-purple-900/50 to-pink-900/50 border border-indigo-500/30 rounded-xl px-5 py-4 max-w-md shadow-lg shadow-indigo-500/10">
        {/* Animated gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 rounded-full mb-3 overflow-hidden">
          <div className="h-full w-1/3 bg-white/40 rounded-full animate-shimmer" />
        </div>
        
        {/* Spinner and status */}
        <div className="flex items-center gap-3 mb-2">
          <div className="relative">
            <div className="w-6 h-6 border-2 border-indigo-400/30 rounded-full"></div>
            <div className="absolute inset-0 w-6 h-6 border-2 border-transparent border-t-cyan-400 border-r-indigo-500 rounded-full animate-spin"></div>
          </div>
          <span className="text-sm font-medium bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
            AI Thinking{dots}
          </span>
        </div>

        {/* Rambling message */}
        <p className="text-sm text-gray-300 italic transition-all duration-300">
          "{THINKING_MESSAGES[messageIndex]}"
        </p>

        {/* Pulsing orbs */}
        <div className="flex gap-1.5 mt-3 justify-center">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '450ms' }}></div>
        </div>
      </div>
    </div>
  );
};

const STARTER_PROMPTS = [
  "Texas residential subdivision firm, A/E/C layers with _A annotation suffix",
  "Municipal infrastructure project, full utility codes with rim/invert annotations",
  "Commercial site development with ALTA survey requirements",
  "Federal/DoD infrastructure project, full A/E/C CAD Standard compliance",
  "Full topographic survey standards with all monument types (found/set)",
];

/**
 * Empty standards template - user must generate or upload standards
 * The app starts EMPTY - no preloaded data
 */
const EMPTY_STANDARDS: StandardDefinition = {
  name: 'New Standards',
  version: '1.0',
  description: 'Use AI Build or Upload to create your standards',
  lastUpdated: new Date().toISOString(),
  source: 'User-Created',
  codes: [],
};

const SYSTEM_MESSAGE = `You are a Civil CAD Standards Assistant specialized in generating description key sets and layer standards for land surveying and civil engineering projects.

## KNOWLEDGE BASE:
- A/E/C CAD Standard (USACE/DoD) Release 6.2 - NCS-compliant layer naming conventions
- Layer format: Discipline-Major-Minor-Status (e.g., C-TOPO-MAJR-MINR, V-SURV-CTRL)
- Discipline Designators: A (Architectural), C (Civil), E (Electrical), F (Fire Protection), G (General), H (Hazardous Materials), I (Interiors), L (Landscape), M (Mechanical), P (Plumbing), Q (Equipment), S (Structural), V (Survey/Mapping), X (Other), Z (Contractor/Shop)
- Status Fields: -N (New), -E (Existing), -D (Demo), -F (Future), -T (Temporary), -M (Move/Relocate)
- ALTA/NSPS survey standards and title company requirements
- Municipal, county, and utility district CAD requirements
- Civil 3D Field-to-Finish (F2F) description key sets with linework codes
- Point file formats (PNEZD, CSV, FBK, RW5, TDS, Carlson)
- Linework codes, figure prefixes, and special linework commands

## YOUR MISSION:
Generate comprehensive, production-ready description key standards that a survey crew can use in the field. Build complete code lists covering all standard categories. When in doubt, ADD MORE CODES.

**ABSOLUTE MINIMUM: 150 codes. Target: 200+ codes for comprehensive coverage.**

## MANDATORY CATEGORIES - YOU MUST INCLUDE ALL OF THESE:

### 1. CONTROL & MONUMENTS (25-40 codes REQUIRED)
You MUST include ALL of these monument types with FOUND and SET variants:
- NGS monuments (horizontal, vertical, 3D), brass caps, aluminum caps
- Benchmarks (USGS, city, county, temporary)
- Iron pipes (1/2", 3/4", 1"), iron rods (1/2", 5/8")
- Rebar (various sizes: #4, #5 with caps)
- Mag nails, PK nails, railroad spikes, cut "X"
- Concrete monuments, stone monuments
- Property corners, lot corners, boundary corners
- Control points, traverse points, GPS base stations, backsight targets
- Section corners, quarter corners, sixteenth corners
- Witness corners, meander corners, reference monuments
- Right-of-way monuments, centerline monuments, offset monuments
- Wood stakes, wood hubs, lath (with and without flagging)
Example: IPF (Iron Pipe Found), IPS (Iron Pipe Set), RBCF (Rebar Cap Found), MNF (Mag Nail Found), MNS (Mag Nail Set), CP (Control Point), TRV (Traverse Point), BM (Benchmark), etc.

### 2. TOPOGRAPHIC FEATURES (50-80 codes REQUIRED)
Ground shots for EVERY surface type:
- GS (general), GRS (grass), DIRT, GRVL (gravel), ASP (asphalt), CONC (concrete)
- ROCK, SAND, MULCH, PAVER, BRICK
Elevation features:
- SPOT (spot elevation), GB (grade break), TC (top of curb), FL (flow line)
- TW (top of wall), BW (bottom of wall), FW (face of wall)
- TS (top of slope), BS (bottom of slope), TOE (toe of slope), CREST
- RIDGE, VALLEY, SWALE, BERM, DITCH (top, bottom, flow)
Curb types (EACH with separate code):
- CRB (generic curb), VCURB (vertical), RCURB (rolled), MCURB (mountable)
- VG (valley gutter), CRBGUT (curb & gutter), VCRBFL (vertical curb flow line)
Pavement features:
- EP (edge pavement), EOP (edge of pavement), EG (edge gravel), EC (edge concrete)
- EOA (edge asphalt), CL (centerline road), PVMT, STPBAR (stop bar)
- XWALK (crosswalk), STRIP (striping), ARROWS, HNDCAP (handicap)
Pedestrian features:
- SW (sidewalk), SWALK, CURBRAMP, ADARAMP, DETPAV (detectable pavers)
- DW (driveway), DWRES (residential driveway), DWCOM (commercial)
- PATH, TRAIL, STEPS, LANDING

### 3. UTILITIES - STORM DRAINAGE (25-35 codes REQUIRED)
Inlets (EVERY type):
- CI (curb inlet), GI (grate inlet), COMB (combination), AD (area drain)
- DI (drop inlet), YDINL (yard inlet), TI (trench inlet), SLOTDR
Manholes and structures:
- SMH (storm manhole), JB (junction box), STBOX (storm box)
- RIM (rim elevation), INV (invert), INVN/INVS/INVE/INVW (directional inverts)
Pipes and conveyance:
- STP (storm pipe), STPL (storm pipe line), CULV (culvert)
- PIPE12, PIPE18, PIPE24, PIPE36, etc. (by diameter)
- HW (headwall), FES (flared end section), OUTF (outfall), APRON
Detention/retention:
- DET (detention), RET (retention), POND, PONDEL (pond elevation)
- WEIR, ORIF (orifice), SPILLWY, BERM

### 4. UTILITIES - SANITARY SEWER (20-30 codes REQUIRED)
- SSMH (sanitary manhole), CO (cleanout), DCCO (double cleanout)
- LS (lift station), WETWELL, DRYWELL
- SS (sanitary sewer), SSL (sanitary sewer line), SSTAP (tap)
- FM (force main), FML (force main line), FMVLT (force main vault)
- GT (grease trap), OWS (oil/water separator), SEPT (septic tank)
- SSRIM, SSINV (sanitary inverts)
- LAT (lateral), LATCO (lateral cleanout)

### 5. UTILITIES - WATER (25-35 codes REQUIRED)
Valves (EVERY type):
- GV (gate valve), BFV (butterfly valve), PRV (pressure reducing valve)
- ARV (air release valve), BLOFF (blow-off), SV (service valve)
- MV (main valve), PVGV (post indicator gate valve)
Fire protection:
- FH (fire hydrant), FHPRI (private hydrant), PIV (post indicator valve)
- FDC (fire department connection), FPBOX
Meters and services:
- WM (water meter), WMBOX (water meter box), WS (water service)
- WT (water tap), IRRIG (irrigation meter)
Structures:
- WMH (water manhole), WVLT (water vault), BFP (backflow preventer)
- PUMP, TANK, SAMPL (sampling station)
Mains:
- WL (water line), WML (water main line), HYD (hydrant line)

### 6. UTILITIES - GAS (15-20 codes REQUIRED)
- GV (gas valve), GM (gas meter), GREG (gas regulator)
- GRISER (gas riser), GVENT (gas vent), GTEST (gas test station)
- GL (gas line), GML (gas main line), GSL (gas service line)
- GMARK (gas marker), GPED (gas pedestal)

### 7. UTILITIES - ELECTRIC (20-30 codes REQUIRED)
Poles and structures:
- PP (power pole), LP (light pole), STLT (street light)
- BOLLRD (bollard light), PEDLT (pedestrian light)
- TRF (transformer), TRFPAD (pad-mount transformer), TRFPOL (pole-mount)
Underground:
- EJBOX (electric junction box), EPED (electric pedestal), EMTR (electric meter)
- EPNL (electric panel), SWGR (switchgear), PULL (pull box)
- EL (electric line), EUG (electric underground)
Overhead:
- GUY (guy wire), ANCHOR, EOH (electric overhead), SPAN

### 8. UTILITIES - TELECOM/CABLE/FIBER (15-25 codes REQUIRED)
- TPED (telecom pedestal), CPED (cable pedestal), FPED (fiber pedestal)
- THH (telecom handhole), FHH (fiber handhole), TVT (telecom vault)
- RISER, DEMRC (demarc), ONT (optical network terminal)
- TEL (telephone line), CAB (cable line), FIB (fiber line)
- FMKR (fiber marker), TMKR (telecom marker)

### 9. TRAFFIC & SIGNAGE (15-25 codes REQUIRED)
Signals:
- SIG (signal), SIGPOL (signal pole), SIGBOX (signal box), SIGCAB (signal cabinet)
- LOOP (detection loop), SENSOR, CAMERA
Signs:
- SS (stop sign), SIGN, SIGNPOL, RGS (regulatory sign), WS (warning sign)
- GS (guide sign), PARK (parking sign), HNDCPS (handicap sign)
Striping:
- CL (centerline), EDGE, STRIP, DBY (double yellow), DW (double white)
- ARROW, XWALK, STPBAR, WORD (pavement word)

### 10. VEGETATION & LANDSCAPE (25-35 codes REQUIRED)
Trees (with SIZE variants):
- TREE, TREED (deciduous), TREEC (conifer), TREEP (palm), TREEOR (ornamental)
- TREE6, TREE12, TREE24, TREE36 (by caliper in inches)
- TRLN (tree line), DRIP (drip line), STUMP, ROOTBALL
Shrubs and beds:
- SHRB (shrub), HEDGE, HEDGEL (hedge line), PLBED (planting bed)
- MULCH, GPLT (ground plantings), VINE
Irrigation:
- IRRHD (irrigation head), ROTARY, SPRAY, DRIP
- IRRV (irrigation valve), IRRCNT (controller), IRRBOX, IRRLINE
- IRBFP (irrigation backflow)

### 11. STRUCTURES & BUILDINGS (20-30 codes REQUIRED)
Building features:
- BLD (building), BLDC (building corner), BF (building face), FNDTN (foundation)
- OHANG (overhang), EAVE, RIDGE, DOWNSP (downspout)
- COLUMN, PILLAR, PIER, DECK, PORCH, STOOP, STAIRS
- ACUNIT (AC unit), MECH (mechanical equipment), PAD (equipment pad)
Fences (EVERY type with LINE codes):
- FNC (fence), FNCW (wood fence), FNCCL (chain link), FNCV (vinyl)
- FNCWI (wrought iron), FNCEL (electric), POST, GATE
- FNCL (fence line), GATL (gate line)
Walls:
- WALL, RWALL (retaining wall), BWALL (block wall), SWALL (stone wall)
- BRKWALL (brick wall), FLWALL (flood wall)
- TWRL (top of retaining wall line), BWRL (bottom of retaining wall line)

### 12. PARKING & SITE FEATURES (15-20 codes REQUIRED)
- PKSP (parking space), PKHC (handicap space), PKNP (no parking)
- PKISL (parking island), PKBUMP (bumper), WHEEL (wheel stop)
- BOLLRD (bollard), TRASHENC, DUMP (dumpster)
- BIKE (bike rack), BENCH, PLNTR (planter)

### 13. WATER FEATURES & DRAINAGE (15-20 codes REQUIRED)
- POND, LAKE, STREAM, CREEK, RIVER
- EWAT (edge water), WATEDGE, WATEL (water elevation)
- OHWM (ordinary high water mark), HWM (high water mark)
- WETL (wetland), WETLD (wetland delineation)
- SWALE, DITCH, CANAL, FLOODWY

### 14. BOUNDARY & LEGAL (15-20 codes REQUIRED)
- PL (property line), PLL (property line), LL (lot line)
- ROW (right-of-way), ROWL (ROW line), CL (centerline)
- UE (utility easement), UEL (utility easement line)
- DE (drainage easement), AE (access easement), CE (conservation easement)
- SBL (setback line), BL (building line)
- TRACT, LOT, BLOCK, PARCEL

### 15. MISCELLANEOUS & CATCH-ALL (5-10 codes REQUIRED)
- MISC, UNK (unknown), OTHER, EXIST (existing), PROP (proposed)
- PHOTO (photo point), TOPO, SHOT

## OUTPUT FORMAT:
Generate a markdown table with these EXACT columns:
| Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |

## SYMBOL COLUMN RULES (CRITICAL):
**ONLY assign symbols to POINT CODES** - codes where you place a physical point/marker.

**CODES THAT GET SYMBOLS:**
- Monuments/corners (IPF, IPS, RBCF, etc) → IRON_PIPE_FOUND, REBAR_SET, etc.
- Structures (SMH, CI, FH, WV) → STORM_MH, CURB_INLET, FIRE_HYDRANT, etc.
- Trees (TREE, TREE6, TREE12) → TREE_DECIDUOUS, TREE_CONIFER, etc.
- Point features (LP, PP, SIGN, BLDGCOR) → LIGHT_POLE, POWER_POLE, etc.
- Utilities at single points (WM, GM, CLEANOUT) → WATER_METER, GAS_METER, etc.

**CODES THAT DO NOT GET SYMBOLS (use "-" for Symbol):**
- Linework codes (EP, TC, FL, BC, GB) → These draw lines, not place symbols
- Edge codes (EWAT, WATEDGE, EOW) → Trace water edges, no point symbol
- Flowlines (FL, FLST, FLSS) → Line feature, no symbol
- Contour/breaklines (GB, BRK, BRKL) → Surface data lines
- Boundary traces (PL, ROW, ESMT) → Draw boundary lines
- Any code where Point Layer = Line Layer → It's a linework code

**Test:** If a surveyor would draw a LINE between multiple shots of this code, it's a linework code → no symbol.
If they place a SINGLE SHOT to mark a feature location, it gets a symbol.

Use these linetypes:
- CONTINUOUS (default for most features)
- FENCELINE (for fences)
- DASHED (for hidden/underground utilities)
- HIDDEN (for proposed or invisible features)
- CENTER (for centerlines)
- PHANTOM (for phantom lines)
- Use specific text linetypes like WATER, SEWER, GAS, ELECTRIC for utility lines
- Use REGULATED_WATERS for wetland boundaries
- Use "-" if no specific linetype needed (defaults to CONTINUOUS)

## LAYER NAMING RULES (MANDATORY):
- Follow NCS 6.0 format: Discipline-Major-Minor (e.g., C-TOPO-SPOT, V-SURV-CTRL)
- Discipline prefixes you MUST use:
  * V-SURV-xxxx (survey/control)
  * C-TOPO-xxxx (topographic)
  * C-STRM-xxxx (storm drainage)
  * C-SSWR-xxxx (sanitary sewer)
  * C-WATR-xxxx (water)
  * C-UTIL-xxxx (general utilities)
  * C-ELEC-xxxx (electrical)
  * C-COMM-xxxx (communications)
  * L-PLNT-xxxx (landscape/planting)
  * A-FLOR-xxxx (building/architectural)
  * C-ROAD-xxxx (roadway)
  * C-PROP-xxxx (property/boundary)
- Include annotation layers with _A suffix (e.g., C-STRM-SSMH_A for labeled manholes)
- Line layers should match point layers where linework connects points
- Use "-" for Line Layer if code is point-only (no linework)

## EXISTING VS PROPOSED FEATURES:
When the user requests separate existing layers:
- Use -E suffix for existing feature layers (e.g., C-STRM-STRC-E for existing storm structures)
- Create matching codes: SMH (proposed) and SMHE or EX_SMH (existing)
- For EXISTING feature linetypes with text (like GAS, WATER, SEWER text linetypes), note in Symbol column as ITALIC_25 or similar to indicate the text should be italicized at 25% oblique angle
- Existing feature symbols should also use italic text style, noted as SYMBOL_NAME_ITALIC_25

## SPECIAL LAYER TYPES:
When requested, include:
- **CALC LAYERS**: C-CALC-GRAD (grading calcs), C-CALC-VOL (volume calcs), C-CALC-AREA (area calcs)
- **SURFACE LAYERS**: C-TOPO-INCL (inclusion boundaries), C-TOPO-EXCL (exclusion boundaries), C-TOPO-BRKL (breaklines)
- **INDIVIDUAL SYMBOL LAYERS**: Each symbol type on its own layer (e.g., V-SURV-IPF-SYM)
- **INDIVIDUAL ANNOTATION LAYERS**: Separate _A layers for each structure type

## CRITICAL REQUIREMENTS - FAILURE TO MEET THESE = REJECTION:
1. **MINIMUM 150 CODES** - No exceptions. Count them. If under 150, add more.
2. **EVERY category above MUST have codes** - Skip nothing
3. **FOUND and SET variants** for ALL monument types (IPF/IPS, RBCF/RBCS, MNF/MNS, etc.)
4. **TOP and BOTTOM codes** for walls, slopes, curbs, ditches, banks
5. **RIM and INVERT codes** for EVERY manhole/structure type
6. **Size variants** for trees (6", 12", 24", 36") and pipes (12", 18", 24", 36")
7. **Line codes** for features that create linework (fences, walls, curbs, edges)
8. **Annotation layer** for every structure that gets labeled
9. **MISC/UNK catch-all codes** included
10. Symbol names must be DESCRIPTIVE (IRON_PIPE_FOUND not just IPF)
11. **LINEWORK CODES GET "-" FOR SYMBOL** - Edge, flowline, top/bottom, breakline codes have no symbol

## EXAMPLE OUTPUT SNIPPET (showing correct symbol vs no-symbol patterns):
| Code | Description | Point Layer | Line Layer | Linetype | Symbol | Category |
|------|-------------|-------------|------------|----------|--------|----------|
| IPF | Iron Pipe Found | V-SURV-BNDRY | - | - | IRON_PIPE_FOUND | Control |
| IPS | Iron Pipe Set | V-SURV-BNDRY | - | - | IRON_PIPE_SET | Control |
| SMH | Storm Manhole | C-STRM-STRC | - | - | STORM_MH | Storm |
| FH | Fire Hydrant | C-WATR-FIRE | - | - | FIRE_HYDRANT | Utility |
| LP | Light Pole | C-LITE-POLE | - | - | LIGHT_POLE | Utility |
| TREE24 | Tree 24" Caliper | L-PLNT-TREE | - | - | TREE_DECIDUOUS | Vegetation |
| EP | Edge Pavement | C-TOPO-PVMT | C-TOPO-PVMT | CONTINUOUS | - | Topo |
| TC | Top of Curb | C-ROAD-CURB | C-ROAD-CURB | CONTINUOUS | - | Topo |
| FL | Flowline | C-ROAD-CURB | C-ROAD-CURB | CONTINUOUS | - | Topo |
| EWAT | Edge Water | C-TOPO-WATR | C-TOPO-WATR | CONTINUOUS | - | Water Feature |
| GB | Grade Break | C-TOPO-BRKL | C-TOPO-BRKL | CONTINUOUS | - | Topo |
| TW | Top of Wall | C-SITE-WALL | C-SITE-WALL | CONTINUOUS | - | Site |
| BW | Bottom of Wall | C-SITE-WALL | C-SITE-WALL | CONTINUOUS | - | Site |
| FNC | Fence Line | C-SITE-FNCE | C-SITE-FNCE | FENCELINE | - | Site |
| WTR | Water Line | C-WATR-MAIN | C-WATR-MAIN | WATER | - | Utility |
| WM | Water Meter | C-WATR-STRC | - | - | WATER_METER | Utility |
| CI | Curb Inlet | C-STRM-STRC | - | - | CURB_INLET | Storm |
| SS | Sanitary Sewer | C-SSWR-MAIN | C-SSWR-MAIN | SEWER | SEWER_MH | Utility |
| RW | Regulated Waters | C-WETL-BNDRY | C-WETL-BNDRY | REGULATED_WATERS | RW_MARKER | Environmental |

Remember: A survey crew should NEVER have to make up a code on the fly. If it exists in the real world, it should have a code. BE EXHAUSTIVE.`;

const PRIMARY_STANDARDS_MODELS = ['gemini-3.7-flash'] as const;
const TURBO_STANDARDS_MODELS = ['gemini-3.7-flash'] as const;

const FALLBACK_ERROR_HINTS = [
  '404',
  'not found',
  'no longer available',
  'publisher model',
  'model unavailable',
  'permission',
  'forbidden',
];

const shouldFallbackToAlternateModel = (error: unknown): boolean => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const normalized = message.toLowerCase();

  return FALLBACK_ERROR_HINTS.some(hint => normalized.includes(hint));
};

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: `👋 **CAD Standards Builder** — I generate production-ready Civil 3D description key standards based on industry specifications.

**Tell me about your firm & projects:**
- Project types (subdivision, commercial, municipal, DOT, ALTA)
- Standards you follow (A/E/C CAD Standard, company-specific)
- Layer patterns (discipline prefixes, annotation suffixes like _A)
- Special requirements (state plane, utility districts, client specs)

**Standards are built using:**
- **A/E/C CAD Standard** — USACE/DoD Release 6.2, NCS-compliant
- **Civil 3D Description Key Sets** — Autodesk documentation
- **ALTA/NSPS standards** — Survey boundary requirements
- **Layer Format:** Discipline-Major-Minor-Status (C-TOPO-SPOT, V-SURV-CTRL-E)

**Typical output includes:**
✓ **25-40 Monument codes** (IPF/IPS, RBCF/RBCS, MNF/MNS variants)
✓ **50-80 Topo codes** (surface types, curbs, slope positions)
✓ **100+ Utility codes** (storm, sanitary, water, gas, electric, telecom)
✓ **Rim/invert annotation codes** for structure types
✓ **Trees by caliper** (6", 12", 24", 36")
✓ **Fence, wall, boundary & easement codes** with proper layers

**Example prompt:** *"Texas residential subdivision firm. Need A/E/C CAD Standard layers, annotation layers with _A suffix, and comprehensive utility codes."*`,
  timestamp: new Date(),
};

export const StandardsBuilder: React.FC<StandardsBuilderProps> = ({
  onStandardGenerated,
  isLoading: externalLoading = false,
  initialChatHistory,
  onChatHistoryChange,
}) => {
  // Access settings for API key
  const { settings } = useSettings();
  
  const [messages, setMessages] = useState<Message[]>(
    initialChatHistory && initialChatHistory.length > 0 
      ? initialChatHistory 
      : [WELCOME_MESSAGE]
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSpreadsheet, setShowSpreadsheet] = useState(false);
  const [previewStandard, setPreviewStandard] = useState<StandardDefinition | null>(null);
  const [turboMode, setTurboMode] = useState(false); // Turbo mode keeps Gemini 3.7 Flash with higher-reasoning UX hints
  const [showSuggestions, setShowSuggestions] = useState(false); // Hidden by default like main chat
  const [showQuestionnaire, setShowQuestionnaire] = useState(false); // Standards questionnaire
  
  // Standards configuration questionnaire state
  const [stdConfig, setStdConfig] = useState({
    // Layer organization
    calcLayers: false,           // Include calc/design layers
    surfaceLayers: false,        // Include surface layers (inclusion, exclusion, breaklines)
    individualSymbolLayers: false, // Separate layer per symbol type
    individualAnnoLayers: true,   // Separate annotation layers (_A suffix)
    annotationSuffix: '_A',       // Suffix for annotation layers
    
    // Existing vs Proposed with customizable prefix/suffix
    existingItalicized: true,     // Existing feature text italicized
    existingItalicPercent: 25,    // Percentage of italicization (typically 25%)
    separateExistingLayers: true, // Separate layers for existing vs proposed
    existingModifier: 'suffix' as 'prefix' | 'suffix',  // Existing uses prefix or suffix
    existingValue: '-E',          // The actual prefix/suffix value (e.g., "-E", "E-", "-EXIST")
    separateDesignLayers: false,  // Separate layers for design/proposed
    designModifier: 'suffix' as 'prefix' | 'suffix',    // Design uses prefix or suffix
    designValue: '-P',            // The actual prefix/suffix value (e.g., "-P", "P-", "-PROP")
    
    // Project type
    projectType: 'subdivision' as 'subdivision' | 'commercial' | 'municipal' | 'dot' | 'alta' | 'mixed',
    standardsFramework: 'aec' as 'aec' | 'custom',
    
    // Utilities
    includeStorm: true,
    includeSanitary: true,
    includeWater: true,
    includeGas: true,
    includeElectric: true,
    includeTelecom: true,
    includeFiber: true,
    
    // Special features
    includeWetlands: false,
    includeFloodplain: false,
    includeTrees: true,
    treeCaliberSizes: [6, 12, 24, 36] as number[],
    
    // Line Drafting Controls (from F2F)
    lineDrafting: {
      beginLine: 'B',
      endLine: 'E',
      closeLine: 'C',
      startCurve: 'PC',
      endCurve: 'PT',
      caseSensitive: false,
    },
    
    // Wildcard patterns for code matching (from F2F)
    wildcardEnabled: true,
    wildcardNumericSuffix: true,   // EP1, EP2, TC99
    wildcardAlphaSuffix: true,     // EPA, EPB, TCZ
    wildcardUnderscore: false,     // _EP, _TC
    
    // Surface line settings (from F2F)
    autoDetectBreaklines: false,
    breaklineElevationThreshold: 0.5,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Gemini chat instance for conversation continuity
  const chatRef = useRef<Chat | null>(null);
  const chatModelRef = useRef<string>('gemini-3.7-flash'); // Track which model the chat is using

  const loading = isLoading || externalLoading;

  // Track if we're syncing from parent to prevent loops
  const isSyncingFromParent = useRef(false);
  const lastSyncedHistoryRef = useRef<string>('');

  // Sync messages when initialChatHistory changes (session load)
  useEffect(() => {
    if (initialChatHistory && initialChatHistory.length > 0) {
      // Only sync if it's actually different (avoid loops)
      const historyKey = JSON.stringify(initialChatHistory.map(m => m.id));
      if (historyKey !== lastSyncedHistoryRef.current) {
        isSyncingFromParent.current = true;
        lastSyncedHistoryRef.current = historyKey;
        setMessages(initialChatHistory);
        // Reset flag after state update
        setTimeout(() => { isSyncingFromParent.current = false; }, 0);
      }
    }
  }, [initialChatHistory]);

  // Notify parent when messages change (but not when syncing from parent)
  useEffect(() => {
    if (onChatHistoryChange && !isSyncingFromParent.current) {
      onChatHistoryChange(messages);
    }
  }, [messages, onChatHistoryChange]);

  // Auto-scroll to bottom - but only after user interaction (not on welcome message)
  useEffect(() => {
    // Don't auto-scroll on initial welcome message - let user read the intro
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Generate unique ID
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Merge new AI-generated codes with existing codes, respecting user edits.
   * User-edited fields (locked) will NOT be overwritten by AI suggestions.
   */
  const mergeWithUserEdits = (
    existingCodes: CodeDefinition[],
    newCodes: CodeDefinition[]
  ): CodeDefinition[] => {
    const result: CodeDefinition[] = [];
    const existingByCode = new Map(existingCodes.map(c => [c.code, c]));
    
    // Process new codes
    for (const newCode of newCodes) {
      const existing = existingByCode.get(newCode.code);
      
      if (existing && existing.userEdits) {
        // This code has user edits - preserve locked fields
        const mergedCode: CodeDefinition = { ...newCode };
        
        // For each field that was user-edited, keep the existing value
        for (const [field, editInfo] of Object.entries(existing.userEdits)) {
          (mergedCode as any)[field] = (existing as any)[field];
        }
        
        // Preserve the userEdits tracking
        mergedCode.userEdits = { ...existing.userEdits };
        
        result.push(mergedCode);
        existingByCode.delete(newCode.code);
      } else if (existing) {
        // Code exists but no user edits - use new AI version
        result.push(newCode);
        existingByCode.delete(newCode.code);
      } else {
        // New code - add it
        result.push(newCode);
      }
    }
    
    // Keep any existing codes that weren't in the new set (if they have user edits)
    for (const [code, existing] of existingByCode) {
      if (existing.userEdits && Object.keys(existing.userEdits).length > 0) {
        result.push(existing);
      }
    }
    
    return result;
  };

  /**
   * Send message to AI and get response
   * Uses client-side Gemini API directly instead of backend
   * @param overrideMessage - Optional message to send instead of input state
   */
  const handleSendMessage = async (overrideMessage?: string) => {
    const messageToSend = (overrideMessage || input.trim()).toString();
    if (!messageToSend || messageToSend.length === 0 || loading) return;

    // Ensure message is a valid non-empty string
    console.log('[StandardsBuilder] Message to send:', messageToSend.substring(0, 100) + '...');

    // Only add user message if not using override (Quick Generate adds its own)
    if (!overrideMessage) {
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: messageToSend,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
    }
    setInput('');
    setIsLoading(true);

    try {
      const modelSequence = turboMode ? TURBO_STANDARDS_MODELS : PRIMARY_STANDARDS_MODELS;
      const assistantMessageId = generateId();

      // Create placeholder for the response once, then fill it with whichever
      // model succeeds. This keeps retries transparent to the user.
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

      const sendWithModel = async (modelToUse: string): Promise<string> => {
        console.log(`[StandardsBuilder] Initializing Gemini chat with model: ${modelToUse}`);
        chatRef.current = startGeminiChat(
          AgentType.CAD_MANAGER,
          SYSTEM_MESSAGE,
          modelToUse,
          settings
        );
        chatModelRef.current = modelToUse;

        console.log('[StandardsBuilder] Sending message to Gemini...');

        let fullResponse = '';

        try {
          const responseStream = await chatRef.current.sendMessageStream({
            message: messageToSend,
          });

          for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            fullResponse += chunkText;

            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.id === assistantMessageId) {
                lastMessage.content = fullResponse;
              }
              return newMessages;
            });
          }

          return fullResponse;
        } catch (streamError) {
          const errorStr = streamError instanceof Error ? streamError.message : String(streamError);
          if (errorStr.includes('data') || errorStr.includes('parts') || errorStr.includes('oneof')) {
            console.warn('[StandardsBuilder] Streaming failed, trying non-streaming:', errorStr);
            chatRef.current = startGeminiChat(
              AgentType.CAD_MANAGER,
              SYSTEM_MESSAGE,
              modelToUse,
              settings
            );
            const response = await chatRef.current.sendMessage({ message: messageToSend });
            fullResponse = response.text || '';

            setMessages(prev => {
              const newMessages = [...prev];
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.id === assistantMessageId) {
                lastMessage.content = fullResponse;
              }
              return newMessages;
            });

            return fullResponse;
          }

          throw streamError;
        }
      };

      let fullResponse = '';
      let lastError: unknown = null;

      for (const modelToUse of modelSequence) {
        try {
          fullResponse = await sendWithModel(modelToUse);
          break;
        } catch (error) {
          lastError = error;
          const canFallback = modelSequence[modelSequence.length - 1] !== modelToUse && shouldFallbackToAlternateModel(error);

          console.warn(
            `[StandardsBuilder] Model ${modelToUse} failed${canFallback ? ', trying fallback model' : ''}:`,
            error
          );

          if (!canFallback) {
            throw error;
          }
        }
      }

      if (!fullResponse) {
        throw lastError instanceof Error ? lastError : new Error('No response was generated from any Gemini model.');
      }

      console.log('[StandardsBuilder] Response complete, length:', fullResponse.length);
      
      // Log first 300 chars to debug formatting
      console.log('[StandardsBuilder] Response preview:', fullResponse.substring(0, 300));

      // Check if response contains a markdown table
      const markdownTable = extractMarkdownTable(fullResponse);
      if (markdownTable) {
        console.log('[StandardsBuilder] Found markdown table in response');
        // Log first 500 chars to see header
        console.log('[StandardsBuilder] Table preview (first 500 chars):', markdownTable.substring(0, 500));
        setGeneratedMarkdown(markdownTable);
        
        // Automatically parse and apply the standards (same as Auto-Generate behavior)
        try {
          const parsedStandard = parseMarkdownToStandard(markdownTable, 'AI-Generated-Standards.md');
          console.log(`[StandardsBuilder] Auto-parsed ${parsedStandard.codes.length} codes from response`);
          if (parsedStandard.linetypes) {
            console.log(`[StandardsBuilder] Auto-generated ${parsedStandard.linetypes.length} linetypes`);
          }
          
          // Merge with existing if there are user edits
          let finalStandard = parsedStandard;
          if (previewStandard && previewStandard.codes.some(c => c.userEdits)) {
            const mergedCodes = mergeWithUserEdits(previewStandard.codes, parsedStandard.codes);
            finalStandard = {
              ...parsedStandard,
              codes: mergedCodes,
            };
          }
          
          setPreviewStandard(finalStandard);
          onStandardGenerated(finalStandard, markdownTable);
          
          // Add a success message showing what was generated
          const categories = [...new Set(finalStandard.codes.map(c => c.category || 'Uncategorized'))];
          const lineworkCodes = finalStandard.codes.filter(c => c.lineLayer && c.lineLayer !== '-').length;
          const linetypeCount = finalStandard.linetypes?.length || 0;
          
          // Validate layers against A/E/C CAD Standard
          const validation = validateStandardLayers(finalStandard.codes);
          const complianceEmoji = validation.compliancePercentage >= 95 ? '🟢' : 
                                  validation.compliancePercentage >= 80 ? '🟡' : '🔴';
          const complianceLabel = validation.compliancePercentage >= 95 ? 'Excellent' :
                                  validation.compliancePercentage >= 80 ? 'Good' : 'Needs Review';
          
          let validationSummary = `\n\n**A/E/C CAD Standard Compliance:** ${complianceEmoji} ${validation.compliancePercentage}% (${complianceLabel})`;
          validationSummary += `\n- Valid layers: ${validation.validLayers}/${validation.totalLayers}`;
          validationSummary += `\n- Disciplines used: ${validation.uniqueDisciplines.join(', ') || 'None detected'}`;
          
          if (validation.invalidLayers > 0 && validation.invalidLayers <= 5) {
            validationSummary += `\n- ⚠️ Invalid layers: ${validation.results.filter(r => !r.isValid).map(r => r.layerName).join(', ')}`;
          } else if (validation.invalidLayers > 5) {
            validationSummary += `\n- ⚠️ ${validation.invalidLayers} layers need review`;
          }
          
          const successMessage: Message = {
            id: generateId(),
            role: 'assistant',
            content: `✅ **Generated ${finalStandard.codes.length} Codes!**

**Categories:** ${categories.join(', ')}
**Linework codes:** ${lineworkCodes}
**Point-only codes:** ${finalStandard.codes.length - lineworkCodes}${linetypeCount > 0 ? `\n**Auto-generated linetypes:** ${linetypeCount}` : ''}${validationSummary}

Click **"📊 Spreadsheet"** to review and edit, or continue chatting to refine the standards.`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMessage]);
        } catch (parseError) {
          console.error('[StandardsBuilder] Failed to auto-parse markdown:', parseError);
          setShowPreview(true); // Fall back to showing preview
        }
      } else {
        // No markdown table found - log for debugging
        console.warn('[StandardsBuilder] No markdown table found in response');
        console.warn('[StandardsBuilder] Response contains pipes:', fullResponse.includes('|'));
        console.warn('[StandardsBuilder] Response contains literal \\n:', fullResponse.includes('\\n'));
        
        // Check if response has pipe-delimited content that could be converted
        if (fullResponse.includes('|') && (fullResponse.includes('Code') || fullResponse.includes('code'))) {
          console.log('[StandardsBuilder] Response appears to have tabular data but not in proper markdown format');
          
          // Try a more aggressive conversion
          const lines = fullResponse.split(/\\n|\n/).filter(l => l.includes('|'));
          if (lines.length > 2) {
            console.log('[StandardsBuilder] Found', lines.length, 'pipe-delimited lines');
          }
        }
      }

    } catch (error) {
      console.error('[StandardsBuilder] Error:', error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `❌ Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Reset chat on error so it can be re-initialized
      chatRef.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Enter key press
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /**
   * Use a starter prompt
   */
  const handleStarterPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  /**
   * Apply the generated standard
   * If there's already a standard with user edits, merge them
   * Uses client-side markdown parser instead of backend API
   */
  const handleApplyStandard = async () => {
    if (!generatedMarkdown) return;

    setIsLoading(true);
    try {
      // Parse the markdown using client-side parser
      console.log('[StandardsBuilder] Parsing markdown with client-side parser...');
      const newStandard = parseMarkdownToStandard(generatedMarkdown, 'AI-Generated-Standards.md');
      
      console.log(`[StandardsBuilder] Parsed ${newStandard.codes.length} codes`);
      
      // Merge with existing standard to preserve user edits
      let finalStandard = newStandard;
      if (previewStandard && previewStandard.codes.some(c => c.userEdits)) {
        const mergedCodes = mergeWithUserEdits(previewStandard.codes, newStandard.codes);
        finalStandard = {
          ...newStandard,
          codes: mergedCodes,
        };
        
        const lockedCount = mergedCodes.filter(c => c.userEdits).length;
        if (lockedCount > 0) {
          console.log(`[StandardsBuilder] Preserved ${lockedCount} codes with user edits`);
        }
      }
      
      onStandardGenerated(finalStandard, generatedMarkdown);

      // Add confirmation message
      const confirmMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `✅ **Standards Applied!** 

I've loaded ${finalStandard.codes.length} codes into CAD Manager. You can now:
- Upload survey codes to match against these standards
- Export to Civil 3D via the C3DMCP plugin
- Make adjustments by continuing our conversation`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, confirmMessage]);
      setShowPreview(false);
    } catch (error) {
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `❌ Failed to apply standards: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Copy markdown to clipboard
   */
  const handleCopyMarkdown = () => {
    if (generatedMarkdown) {
      navigator.clipboard.writeText(generatedMarkdown);
    }
  };

  /**
   * Download markdown file
   */
  const handleDownloadMarkdown = () => {
    if (!generatedMarkdown) return;
    
    const blob = new Blob([generatedMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CAD-Standards.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Open spreadsheet view - parse markdown and show editor
   * Uses client-side markdown parser instead of backend API
   */
  const handleOpenSpreadsheet = async () => {
    if (!generatedMarkdown) return;
    
    setIsLoading(true);
    try {
      // Parse the markdown using client-side parser
      console.log('[StandardsBuilder] Parsing markdown for spreadsheet...');
      const standard = parseMarkdownToStandard(generatedMarkdown, 'AI-Generated-Standards.md');
      
      console.log(`[StandardsBuilder] Parsed ${standard.codes.length} codes for spreadsheet`);
      setPreviewStandard(standard);
      setShowSpreadsheet(true);
    } catch (error) {
      console.error('Failed to parse for spreadsheet:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle save from spreadsheet editor
   */
  const handleSpreadsheetSave = (updatedStandard: StandardDefinition) => {
    setPreviewStandard(updatedStandard);
    // Also apply it immediately
    onStandardGenerated(updatedStandard, generatedMarkdown || '');
    setShowSpreadsheet(false);
    setShowPreview(false);
    
    // Count locked cells
    const lockedCount = updatedStandard.codes.reduce((count, code) => {
      return count + (code.userEdits ? Object.keys(code.userEdits).length : 0);
    }, 0);
    
    // Add confirmation message
    const confirmMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: `✅ **Standards Saved!** 

I've loaded ${updatedStandard.codes.length} codes into CAD Manager from the spreadsheet editor.${lockedCount > 0 ? `

🔒 **${lockedCount} locked fields** - Your manual edits are protected and won't be overwritten if you regenerate standards with AI.` : ''}

You can now:
- Upload survey codes to match against these standards
- Export to Civil 3D via the C3DMCP plugin
- Re-open the spreadsheet editor to make adjustments`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, confirmMessage]);
  };

  /**
   * Build configuration-aware prompt from questionnaire settings
   */
  const buildConfiguredPrompt = (): string => {
    const parts: string[] = [];
    
    // Project type context
    const projectTypeNames: Record<string, string> = {
      subdivision: 'residential subdivision',
      commercial: 'commercial site development',
      municipal: 'municipal/public works',
      dot: 'DOT/highway',
      alta: 'ALTA/NSPS boundary survey',
      mixed: 'mixed-use development',
    };
    parts.push(`Generate a comprehensive ${projectTypeNames[stdConfig.projectType]} survey code set with 150+ codes.`);
    
    // Standards framework
    if (stdConfig.standardsFramework === 'aec') {
      parts.push('Use A/E/C CAD Standard (USACE/DoD Release 6.2) layer naming conventions. Format: Discipline-Major-Minor-Status. Disciplines: V (Survey/Mapping), C (Civil), L (Landscape), etc. Status: -E (Existing), -N (New), -D (Demo). Examples: V-SURV-CTRL, C-TOPO-MAJR, C-STRM-PIPE-E.');
    }
    
    // Core categories
    parts.push('Include: control & monuments (found/set variants), topographic features.');
    
    // Utilities based on config
    const utilities: string[] = [];
    if (stdConfig.includeStorm) utilities.push('storm drainage (inlets, manholes, pipes)');
    if (stdConfig.includeSanitary) utilities.push('sanitary sewer');
    if (stdConfig.includeWater) utilities.push('water utilities');
    if (stdConfig.includeGas) utilities.push('gas');
    if (stdConfig.includeElectric) utilities.push('electric');
    if (stdConfig.includeTelecom) utilities.push('telecom');
    if (stdConfig.includeFiber) utilities.push('fiber optic');
    if (utilities.length > 0) {
      parts.push(`Utilities: ${utilities.join(', ')}.`);
    }
    
    // Site features
    parts.push('Site features: fences, walls, miscellaneous.');
    
    // Trees
    if (stdConfig.includeTrees) {
      parts.push(`Vegetation: trees by caliper (${stdConfig.treeCaliberSizes.join('", ')}").`);
    }
    
    // Calc layers
    if (stdConfig.calcLayers) {
      parts.push('INCLUDE CALCULATION LAYERS: C-CALC-xxxx for design calculations, grade computations, and volume calculations.');
    }
    
    // Surface layers
    if (stdConfig.surfaceLayers) {
      parts.push('INCLUDE SURFACE LAYERS: Separate layers for surface inclusion boundaries (C-TOPO-INCL), exclusion boundaries (C-TOPO-EXCL), and breaklines (C-TOPO-BRKL). Include codes for TIN surface shots, inclusion polyline, exclusion polyline, and hard/soft breaklines.');
    }
    
    // Individual symbol layers
    if (stdConfig.individualSymbolLayers) {
      parts.push('CREATE SEPARATE SYMBOL LAYERS: Each symbol type gets its own layer (e.g., V-SURV-IPF for iron pipe found symbols, C-WATR-FH-SYM for fire hydrant symbols).');
    }
    
    // Annotation layers with configurable suffix
    if (stdConfig.individualAnnoLayers) {
      parts.push(`CREATE ANNOTATION LAYERS: Add "${stdConfig.annotationSuffix}" suffix layers for text/labels (e.g., C-STRM-STRC${stdConfig.annotationSuffix} for storm manhole labels, C-WATR-MAIN${stdConfig.annotationSuffix} for water main labels).`);
    }
    
    // Existing layers with configurable prefix/suffix
    if (stdConfig.separateExistingLayers) {
      const existingExample = stdConfig.existingModifier === 'suffix' 
        ? `C-STRM-STRC${stdConfig.existingValue}`
        : `${stdConfig.existingValue}C-STRM-STRC`;
      parts.push(`SEPARATE EXISTING LAYERS: Create parallel layer structure for existing features using ${stdConfig.existingModifier} "${stdConfig.existingValue}" (e.g., ${existingExample} for existing storm structures vs C-STRM-STRC for proposed).`);
    }
    
    // Design/proposed layers with configurable prefix/suffix
    if (stdConfig.separateDesignLayers) {
      const designExample = stdConfig.designModifier === 'suffix'
        ? `C-STRM-STRC${stdConfig.designValue}`
        : `${stdConfig.designValue}C-STRM-STRC`;
      parts.push(`SEPARATE DESIGN LAYERS: Create separate layer structure for design/proposed features using ${stdConfig.designModifier} "${stdConfig.designValue}" (e.g., ${designExample} for proposed storm structures).`);
    }
    
    // Italicized text for existing
    if (stdConfig.existingItalicized) {
      parts.push(`EXISTING FEATURE TEXT STYLE: For existing feature linetypes with text (like gas line, water line) and symbols, the text should be italicized at ${stdConfig.existingItalicPercent}% oblique angle. Note this in the Symbol column as "ITALIC_${stdConfig.existingItalicPercent}" suffix for existing feature symbols.`);
    }
    
    // Environmental
    if (stdConfig.includeWetlands) {
      parts.push('Include wetland delineation codes (WETL, OHWM, RW boundary).');
    }
    if (stdConfig.includeFloodplain) {
      parts.push('Include floodplain codes (100YR, 500YR, BFE).');
    }
    
    // F2F Line drafting controls
    parts.push(`LINE DRAFTING CONTROLS: Use "${stdConfig.lineDrafting.beginLine}" to begin line, "${stdConfig.lineDrafting.endLine}" to end, "${stdConfig.lineDrafting.closeLine}" to close polygon, "${stdConfig.lineDrafting.startCurve}" for point of curve, "${stdConfig.lineDrafting.endCurve}" for point of tangent.${stdConfig.lineDrafting.caseSensitive ? ' Controls are case-sensitive.' : ' Controls are NOT case-sensitive.'}`);
    
    // Wildcard patterns
    if (stdConfig.wildcardEnabled) {
      const wildcards: string[] = [];
      if (stdConfig.wildcardNumericSuffix) wildcards.push('numeric suffix (EP1, EP2)');
      if (stdConfig.wildcardAlphaSuffix) wildcards.push('alpha suffix (EPA, EPB)');
      if (stdConfig.wildcardUnderscore) wildcards.push('underscore prefix (_EP)');
      if (wildcards.length > 0) {
        parts.push(`WILDCARD PATTERNS SUPPORTED: ${wildcards.join(', ')}. All code variants should match base code.`);
      }
    }
    
    // Surface settings
    if (stdConfig.autoDetectBreaklines) {
      parts.push(`AUTO-DETECT BREAKLINES: Codes with elevation changes greater than ${stdConfig.breaklineElevationThreshold}ft should be flagged as potential breaklines.`);
    }
    
    return parts.join(' ');
  };

  /**
   * Quick Generate - uses AI to generate comprehensive standards
   * Uses questionnaire configuration for customized output
   */
  const handleQuickGenerate = async () => {
    if (loading) return;
    
    // Build prompt from configuration
    const quickPrompt = buildConfiguredPrompt();
    
    // Add the prompt as a user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: `⚡ **Quick Generate** (configured): ${quickPrompt}`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Close questionnaire if open
    setShowQuestionnaire(false);
    
    // Trigger the AI generation
    await handleSendMessage(quickPrompt);
  };

  /**
   * Open spreadsheet to edit the current standards
   * If no standards exist, show a helpful message
   */
  const handleEditSpreadsheet = () => {
    if (previewStandard && previewStandard.codes.length > 0) {
      setShowSpreadsheet(true);
    } else {
      // No standards loaded - show a message
      const helpMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `📋 **No Standards Loaded Yet**

To edit standards in the spreadsheet, you first need to create some:

1. **Quick Generate** - Click "⚡ Quick Generate" to have AI create 150+ comprehensive codes
2. **Custom Request** - Describe your specific needs in the chat below
3. **Upload** - Switch to the "Upload" tab to load existing standards files

Once you have standards, click the spreadsheet button to edit them.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, helpMessage]);
    }
  };

  return (
    <div className="standards-builder flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-700 bg-gradient-to-r from-indigo-900 to-purple-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🤖</span> AI Standards Builder
            </h2>
            <p className="text-indigo-300 text-sm">Describe your needs or use Quick Generate</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowQuestionnaire(!showQuestionnaire)}
              className={`px-3 py-1.5 ${showQuestionnaire ? 'bg-purple-600' : 'bg-gray-700'} hover:bg-purple-700 text-white text-sm rounded-lg font-medium transition-colors`}
              title="Configure standards generation options"
            >
              ⚙️ Configure
            </button>
            <button
              onClick={handleQuickGenerate}
              disabled={loading}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors"
              title="Generate 150+ comprehensive codes via AI"
            >
              {loading ? '⏳ Generating...' : '⚡ Quick Generate'}
            </button>
            <button
              onClick={handleEditSpreadsheet}
              disabled={!previewStandard || previewStandard.codes.length === 0}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors"
              title={previewStandard && previewStandard.codes.length > 0 ? "Edit codes in spreadsheet view" : "Generate standards first"}
            >
              📊 Spreadsheet
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Questionnaire Panel */}
      {showQuestionnaire && (
        <div className="flex-shrink-0 border-b border-gray-700 bg-gray-800/80 max-h-[50vh] overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">⚙️ Standards Configuration</h3>
              <button
                onClick={() => setShowQuestionnaire(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Project Type */}
              <div className="space-y-3">
                <h4 className="font-semibold text-purple-400 text-sm uppercase tracking-wide">Project Type</h4>
                <select
                  value={stdConfig.projectType}
                  onChange={(e) => setStdConfig(prev => ({ ...prev, projectType: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                >
                  <option value="subdivision">Residential Subdivision</option>
                  <option value="commercial">Commercial Site</option>
                  <option value="municipal">Municipal/Public Works</option>
                  <option value="dot">DOT/Highway</option>
                  <option value="alta">ALTA/NSPS Boundary</option>
                  <option value="mixed">Mixed-Use Development</option>
                </select>
                
                <h4 className="font-semibold text-purple-400 text-sm uppercase tracking-wide mt-4">Standards Framework</h4>
                <select
                  value={stdConfig.standardsFramework}
                  onChange={(e) => setStdConfig(prev => ({ ...prev, standardsFramework: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                >
                  <option value="aec">A/E/C CAD Standard (USACE/DoD 6.2)</option>
                  <option value="custom">Custom/Other</option>
                </select>
              </div>
              
              {/* Layer Organization */}
              <div className="space-y-3">
                <h4 className="font-semibold text-cyan-400 text-sm uppercase tracking-wide">Layer Organization</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.calcLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, calcLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Include Calc Layers</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">C-CALC-xxxx for design computations</p>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.surfaceLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, surfaceLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Include Surface Layers</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Inclusion, exclusion, breaklines</p>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.individualSymbolLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, individualSymbolLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Individual Symbol Layers</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Separate layer per symbol type</p>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.individualAnnoLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, individualAnnoLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Annotation Layers</span>
                </label>
                {stdConfig.individualAnnoLayers && (
                  <div className="ml-6 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Suffix:</span>
                    <input
                      type="text"
                      value={stdConfig.annotationSuffix}
                      onChange={(e) => setStdConfig(prev => ({ ...prev, annotationSuffix: e.target.value || '_A' }))}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="_A"
                    />
                  </div>
                )}
                <p className="text-xs text-gray-500 ml-6">Text/label layers for structures</p>
              </div>
              
              {/* Existing vs Proposed */}
              <div className="space-y-3">
                <h4 className="font-semibold text-orange-400 text-sm uppercase tracking-wide">Existing Features</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.separateExistingLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, separateExistingLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Separate Existing Layers</span>
                </label>
                {stdConfig.separateExistingLayers && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={stdConfig.existingModifier}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, existingModifier: e.target.value as 'prefix' | 'suffix' }))}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs"
                      >
                        <option value="suffix">Suffix</option>
                        <option value="prefix">Prefix</option>
                      </select>
                      <input
                        type="text"
                        value={stdConfig.existingValue}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, existingValue: e.target.value || '-E' }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                        placeholder="-E"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Example: C-STRM-STRC{stdConfig.existingModifier === 'suffix' ? stdConfig.existingValue : ''}{stdConfig.existingModifier === 'prefix' ? ` → ${stdConfig.existingValue}C-STRM-STRC` : ''}
                    </p>
                  </div>
                )}
                
                <label className="flex items-center gap-2 cursor-pointer group mt-3">
                  <input
                    type="checkbox"
                    checked={stdConfig.separateDesignLayers}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, separateDesignLayers: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Separate Design/Proposed Layers</span>
                </label>
                {stdConfig.separateDesignLayers && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={stdConfig.designModifier}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, designModifier: e.target.value as 'prefix' | 'suffix' }))}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs"
                      >
                        <option value="suffix">Suffix</option>
                        <option value="prefix">Prefix</option>
                      </select>
                      <input
                        type="text"
                        value={stdConfig.designValue}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, designValue: e.target.value || '-P' }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                        placeholder="-P"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Example: C-STRM-STRC{stdConfig.designModifier === 'suffix' ? stdConfig.designValue : ''}{stdConfig.designModifier === 'prefix' ? ` → ${stdConfig.designValue}C-STRM-STRC` : ''}
                    </p>
                  </div>
                )}
                
                <label className="flex items-center gap-2 cursor-pointer group mt-3">
                  <input
                    type="checkbox"
                    checked={stdConfig.existingItalicized}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, existingItalicized: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Italicize Existing Text</span>
                </label>
                {stdConfig.existingItalicized && (
                  <div className="ml-6 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Oblique angle:</span>
                    <input
                      type="number"
                      value={stdConfig.existingItalicPercent}
                      onChange={(e) => setStdConfig(prev => ({ ...prev, existingItalicPercent: parseInt(e.target.value) || 25 }))}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                      min={0}
                      max={45}
                    />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 ml-6">
                  <em style={{ fontStyle: 'oblique' }}>Italic text</em> for linetype text & symbols
                </p>
              </div>
              
              {/* Utilities */}
              <div className="space-y-3">
                <h4 className="font-semibold text-green-400 text-sm uppercase tracking-wide">Utilities to Include</h4>
                
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'includeStorm', label: 'Storm Drainage' },
                    { key: 'includeSanitary', label: 'Sanitary Sewer' },
                    { key: 'includeWater', label: 'Water' },
                    { key: 'includeGas', label: 'Gas' },
                    { key: 'includeElectric', label: 'Electric' },
                    { key: 'includeTelecom', label: 'Telecom' },
                    { key: 'includeFiber', label: 'Fiber Optic' },
                  ].map(util => (
                    <label key={util.key} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={(stdConfig as any)[util.key]}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, [util.key]: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-green-500"
                      />
                      <span className="text-xs text-gray-300 group-hover:text-white">{util.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Vegetation */}
              <div className="space-y-3">
                <h4 className="font-semibold text-lime-400 text-sm uppercase tracking-wide">Vegetation</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.includeTrees}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, includeTrees: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-lime-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Include Trees</span>
                </label>
                
                {stdConfig.includeTrees && (
                  <div className="ml-6 space-y-1">
                    <span className="text-xs text-gray-500">Caliper sizes (inches):</span>
                    <input
                      type="text"
                      value={stdConfig.treeCaliberSizes.join(', ')}
                      onChange={(e) => {
                        const sizes = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                        setStdConfig(prev => ({ ...prev, treeCaliberSizes: sizes.length > 0 ? sizes : [6, 12, 24, 36] }));
                      }}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                      placeholder="6, 12, 24, 36"
                    />
                  </div>
                )}
              </div>
              
              {/* Environmental */}
              <div className="space-y-3">
                <h4 className="font-semibold text-blue-400 text-sm uppercase tracking-wide">Environmental</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.includeWetlands}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, includeWetlands: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Wetlands/Waters</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">OHWM, regulated waters, wetland delineation</p>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.includeFloodplain}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, includeFloodplain: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Floodplain</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">100-yr, 500-yr, base flood elevation</p>
              </div>
              
              {/* Line Drafting Controls (F2F) */}
              <div className="space-y-3">
                <h4 className="font-semibold text-pink-400 text-sm uppercase tracking-wide">Line Drafting (F2F)</h4>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Begin Line</label>
                    <input
                      type="text"
                      value={stdConfig.lineDrafting.beginLine}
                      onChange={(e) => setStdConfig(prev => ({ 
                        ...prev, 
                        lineDrafting: { ...prev.lineDrafting, beginLine: e.target.value || 'B' }
                      }))}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="B"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">End Line</label>
                    <input
                      type="text"
                      value={stdConfig.lineDrafting.endLine}
                      onChange={(e) => setStdConfig(prev => ({ 
                        ...prev, 
                        lineDrafting: { ...prev.lineDrafting, endLine: e.target.value || 'E' }
                      }))}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="E"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Close Polygon</label>
                    <input
                      type="text"
                      value={stdConfig.lineDrafting.closeLine}
                      onChange={(e) => setStdConfig(prev => ({ 
                        ...prev, 
                        lineDrafting: { ...prev.lineDrafting, closeLine: e.target.value || 'C' }
                      }))}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="C"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Start Curve (PC)</label>
                    <input
                      type="text"
                      value={stdConfig.lineDrafting.startCurve}
                      onChange={(e) => setStdConfig(prev => ({ 
                        ...prev, 
                        lineDrafting: { ...prev.lineDrafting, startCurve: e.target.value || 'PC' }
                      }))}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="PC"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">End Curve (PT)</label>
                    <input
                      type="text"
                      value={stdConfig.lineDrafting.endCurve}
                      onChange={(e) => setStdConfig(prev => ({ 
                        ...prev, 
                        lineDrafting: { ...prev.lineDrafting, endCurve: e.target.value || 'PT' }
                      }))}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm font-mono"
                      placeholder="PT"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stdConfig.lineDrafting.caseSensitive}
                        onChange={(e) => setStdConfig(prev => ({ 
                          ...prev, 
                          lineDrafting: { ...prev.lineDrafting, caseSensitive: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500"
                      />
                      <span className="text-xs text-gray-300">Case Sensitive</span>
                    </label>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Field codes: EP {stdConfig.lineDrafting.beginLine} (begin), EP {stdConfig.lineDrafting.endLine} (end), EP {stdConfig.lineDrafting.closeLine} (close)</p>
              </div>
              
              {/* Wildcards (F2F) */}
              <div className="space-y-3">
                <h4 className="font-semibold text-violet-400 text-sm uppercase tracking-wide">Wildcards (F2F)</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.wildcardEnabled}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, wildcardEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-violet-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Enable Wildcards</span>
                </label>
                
                {stdConfig.wildcardEnabled && (
                  <div className="ml-6 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stdConfig.wildcardNumericSuffix}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, wildcardNumericSuffix: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-violet-500"
                      />
                      <span className="text-xs text-gray-300 group-hover:text-white">Numeric suffix (EP1, EP2, TC99)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stdConfig.wildcardAlphaSuffix}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, wildcardAlphaSuffix: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-violet-500"
                      />
                      <span className="text-xs text-gray-300 group-hover:text-white">Alpha suffix (EPA, EPB, TCZ)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stdConfig.wildcardUnderscore}
                        onChange={(e) => setStdConfig(prev => ({ ...prev, wildcardUnderscore: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-violet-500"
                      />
                      <span className="text-xs text-gray-300 group-hover:text-white">Underscore prefix (_EP, _TC)</span>
                    </label>
                  </div>
                )}
              </div>
              
              {/* Surface Settings (F2F) */}
              <div className="space-y-3">
                <h4 className="font-semibold text-teal-400 text-sm uppercase tracking-wide">Surface Settings</h4>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stdConfig.autoDetectBreaklines}
                    onChange={(e) => setStdConfig(prev => ({ ...prev, autoDetectBreaklines: e.target.checked }))}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-teal-500"
                  />
                  <span className="text-sm text-gray-300 group-hover:text-white">Auto-detect Breaklines</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Automatically identify breakline codes</p>
                
                {stdConfig.autoDetectBreaklines && (
                  <div className="ml-6 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Elevation threshold:</span>
                    <input
                      type="number"
                      value={stdConfig.breaklineElevationThreshold}
                      onChange={(e) => setStdConfig(prev => ({ ...prev, breaklineElevationThreshold: parseFloat(e.target.value) || 0.5 }))}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                      step={0.1}
                      min={0}
                    />
                    <span className="text-xs text-gray-500">ft</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Generate Button */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowQuestionnaire(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickGenerate}
                disabled={loading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium"
              >
                {loading ? '⏳ Generating...' : '⚡ Generate with These Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4 bg-gray-900/50" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-200 border border-gray-700'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ 
                  __html: message.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\n/g, '<br/>')
                }}
              />
            </div>
          </div>
        ))}

        {/* Loading indicator with rambling messages */}
        {loading && <ThinkingAnimation />}

        <div ref={messagesEndRef} />
      </div>

      {/* Starter Prompts - collapsible, toggled by lightbulb */}
      {showSuggestions && (
        <div className="flex-shrink-0 px-4 pb-4 bg-gray-900/50">
          <div className="flex items-center gap-2 mb-3">
            <LightbulbIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-400 text-sm">Suggested prompts:</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STARTER_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => { handleStarterPrompt(prompt); setShowSuggestions(false); }}
                className="p-3 text-left text-gray-300 bg-gray-900/50 rounded-lg transition-colors duration-200 border border-gray-700 hover:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              >
                <p className="font-medium">"{prompt}"</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview Panel */}
      {showPreview && generatedMarkdown && (
        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-800/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-200">📄 Generated Standards</h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopyMarkdown}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
              <button
                onClick={handleDownloadMarkdown}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title="Download .md file"
              >
                ⬇️ Download
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                ✕ Close
              </button>
            </div>
          </div>
          <div className="bg-gray-950 text-gray-100 p-3 rounded text-xs font-mono max-h-48 overflow-y-auto scrollbar-hide border border-gray-700" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <pre className="whitespace-pre-wrap">{generatedMarkdown}</pre>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleApplyStandard}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-600"
            >
              ✓ Apply These Standards
            </button>
            <button
              onClick={handleOpenSpreadsheet}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-600"
              title="View and edit as spreadsheet"
            >
              📊 View Spreadsheet
            </button>
            <button
              onClick={() => {
                setInput("Let's modify this - ");
                inputRef.current?.focus();
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors"
            >
              ✏️ Modify
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800/30">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your CAD standards requirements..."
              disabled={loading}
              rows={2}
              className="w-full px-4 py-2 pr-12 bg-gray-900 border border-gray-700 text-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-800 placeholder-gray-500"
            />
            {/* Lightbulb button - always available */}
            <button
              onClick={() => setShowSuggestions(p => !p)}
              className={`absolute right-3 top-3 p-1.5 text-yellow-400 hover:bg-yellow-500/10 rounded-full transition-colors ${showSuggestions ? 'bg-yellow-500/20' : ''}`}
              title="Suggested Prompts"
            >
              <LightbulbIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || loading}
              className={`px-6 py-2 ${turboMode ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-lg font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed`}
            >
              {turboMode ? '⚡ Send' : 'Send'}
            </button>
            <button
              onClick={() => setTurboMode(!turboMode)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                turboMode 
                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/50 text-amber-300 hover:from-amber-500/30 hover:to-orange-500/30' 
                  : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
              title={turboMode ? 'Turbo Mode ON: Using Gemini 3.7 Flash (deeper reasoning profile)' : 'Turbo Mode OFF: Using Gemini 3.7 Flash (balanced profile)'}
            >
              {turboMode ? '⚡ TURBO' : '💤 Normal'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line • {turboMode ? '⚡ Turbo: Gemini 3.7 Flash (deeper reasoning profile)' : '💤 Normal: Gemini 3.7 Flash (balanced profile)'}
        </p>
      </div>

      {/* Spreadsheet Editor Modal */}
      {showSpreadsheet && previewStandard && (
        <StandardsEditor
          standard={previewStandard}
          onSave={handleSpreadsheetSave}
          onClose={() => setShowSpreadsheet(false)}
        />
      )}
    </div>
  );
};
