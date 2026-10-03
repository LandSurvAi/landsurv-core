/**
 * Survey code → domain classifier.
 *
 * Used to sanity-check alias mappings in the CAD Manager. If a surveyor's
 * alias term and the master code's description don't share a domain (water,
 * electric, sewer, etc.), the editor flags it so the user can review.
 *
 * Approach: tokenize input on `[\s/\-+,&_.]+`, then look up each token in a
 * static keyword lexicon. We collect every domain that matches any token and
 * return them as a set. A term is considered ambiguous when it lights up more
 * than one domain (e.g. "EC" → electric and concrete). A term is "generic"
 * when nothing matches — generic terms never conflict.
 */

export type CodeDomain =
    | 'water'
    | 'sewer'
    | 'storm'
    | 'electric'
    | 'gas'
    | 'comm'
    | 'paving'
    | 'concrete'
    | 'boundary'
    | 'control'
    | 'structure'
    | 'vegetation'
    | 'topo';

const LEXICON: Record<CodeDomain, string[]> = {
    water: [
        'WV', 'WM', 'WL', 'WTR', 'WAT', 'WATER', 'WATERLINE', 'WATERMAIN',
        'FH', 'HYD', 'HYDR', 'HYDRANT', 'PIV', 'BFP', 'IRR', 'IRRIG',
        'SPRINK', 'SPRINKLER', 'METER', 'WMH', 'WCO', 'BLOWOFF', 'BO',
    ],
    sewer: [
        'SS', 'SAN', 'SANITARY', 'SMH', 'SSMH', 'SCO', 'SEW', 'SEWER',
        'SEWERLINE', 'SSWR', 'MH-SAN', 'MHSAN', 'SANMH', 'INV', 'FM',
        'FORCEMAIN', 'LIFT', 'CLEANOUT',
    ],
    storm: [
        'SD', 'STM', 'STORM', 'STMH', 'STMSWR', 'STORMDRAIN', 'CB',
        'CATCHBASIN', 'INL', 'INLET', 'HW', 'HEADWALL', 'FES', 'DI',
        'YARDDRAIN', 'YD', 'AREA-DRAIN', 'RIM', 'DROP',
    ],
    electric: [
        'ELEC', 'ELECTRIC', 'EM', 'EB', 'EP', 'EV', 'EMH', 'JB', 'JBOX',
        'JUNCTION', 'XF', 'XFM', 'XFMR', 'XFRM', 'TRANS', 'TRANSFORMER',
        'TRANSF', 'MTR', 'LP', 'LIGHTPOLE', 'POLE', 'CABINET', 'CKT',
        'EHH', 'EOH', 'MV', 'KV', 'RISER', 'POWER', 'PWR', 'UTILITY-POLE',
        'UP', 'GUY', 'GUYWIRE', 'CONDUIT',
    ],
    gas: [
        'GV', 'GM', 'GAS', 'NGAS', 'NG', 'GASLINE', 'GASMAIN', 'GASVALVE',
        'GASMETER', 'GASPED', 'PROPANE', 'LPG',
    ],
    comm: [
        'COMM', 'TELE', 'TEL', 'TELCO', 'ATT', 'CATV', 'FOC', 'FIBER',
        'FBR', 'CABLE', 'CTV', 'CCOMM', 'CSTUB', 'PED', 'PEDESTAL',
        'PHONE', 'TWC', 'VERIZON', 'CENTURYLINK',
    ],
    paving: [
        'AC', 'ASPHALT', 'PVMT', 'PAVE', 'PAVEMENT', 'EOP', 'EOA',
        'ROAD', 'CURB', 'GTR', 'GUTTER', 'C&G', 'CG', 'STRIPE',
        'CROSSWALK', 'CW', 'PARKING', 'PARK',
    ],
    concrete: [
        'CONC', 'CONCRETE', 'EOC', 'EC', 'SLAB', 'SIDEWALK', 'SW',
        'WALK', 'STOOP', 'PORCH', 'STEPS', 'STEP', 'PATIO', 'APRON',
        'FLATWORK',
    ],
    boundary: [
        'BND', 'BL', 'PROP', 'PROPERTY', 'PIN', 'MON', 'MONUMENT', 'IRC',
        'IRF', 'IPF', 'REBAR', 'IRON', 'PK', 'PKNAIL', 'NAIL', 'CORNER',
        'CALC', 'CC', 'ROW', 'R/W', 'RIGHTOFWAY', 'EASE', 'EASEMENT',
    ],
    control: [
        'CTRL', 'CONTROL', 'BM', 'BENCHMARK', 'GPS', 'RTK', 'CP', 'GLO',
        'USGS', 'NGS', 'TBM', 'BASE', 'ROVER',
    ],
    structure: [
        'BLDG', 'BUILDING', 'WALL', 'STR', 'FNCE', 'FENCE', 'FENC',
        'GATE', 'SHED', 'CANOPY', 'AWNING', 'OVERHANG', 'COL', 'COLUMN',
        'FOUND', 'FDN', 'FOOTING',
    ],
    vegetation: [
        'TREE', 'TRE', 'BUSH', 'SHRUB', 'VEG', 'BRUSH', 'GRASS', 'HEDGE',
        'STUMP', 'LOG', 'DECID', 'CONIFER', 'PINE', 'OAK', 'MAPLE',
        'PALM', 'PLANTER',
    ],
    topo: [
        'G', 'GRD', 'GRND', 'GROUND', 'TP', 'TOP', 'TOE', 'TC', 'BC',
        'BREAK', 'BRKLN', 'BRK', 'BREAKLINE', 'SHOT', 'CHK', 'CHECK',
        'SPOT', 'CONTOUR', 'ELEV', 'ELEV-SHOT',
    ],
};

// Inverse index built once: token (uppercased) → set of domains it implies.
const TOKEN_INDEX: Map<string, Set<CodeDomain>> = (() => {
    const map = new Map<string, Set<CodeDomain>>();
    for (const domain of Object.keys(LEXICON) as CodeDomain[]) {
        for (const token of LEXICON[domain]) {
            const key = token.toUpperCase();
            let bucket = map.get(key);
            if (!bucket) { bucket = new Set(); map.set(key, bucket); }
            bucket.add(domain);
        }
    }
    return map;
})();

const TOKEN_SPLIT_RE = /[\s/\-+,&_.()"']+/;

/**
 * Tokenize and classify a free-text code/description into a set of domains.
 *
 * Wildcards (`*`) are stripped before lookup, so "CM*" still hits "CM".
 * Returns the matched domains and the tokens that triggered each one for
 * tooltip messaging.
 */
export function classifyText(text: string): {
    domains: Set<CodeDomain>;
    matched: { token: string; domains: CodeDomain[] }[];
    ambiguous: boolean;
    generic: boolean;
} {
    const domains = new Set<CodeDomain>();
    const matched: { token: string; domains: CodeDomain[] }[] = [];
    if (!text) return { domains, matched, ambiguous: false, generic: true };
    const stripped = text.replace(/\*/g, '').toUpperCase().trim();
    if (!stripped) return { domains, matched, ambiguous: false, generic: true };
    const tokens = stripped.split(TOKEN_SPLIT_RE).filter(Boolean);
    // Also try the un-split whole text in case lexicon entry contains a `-`.
    const fullKey = stripped;
    if (TOKEN_INDEX.has(fullKey)) tokens.push(fullKey);
    const seen = new Set<string>();
    for (const t of tokens) {
        if (seen.has(t)) continue;
        seen.add(t);
        const hits = TOKEN_INDEX.get(t);
        if (!hits) continue;
        const arr: CodeDomain[] = [];
        for (const d of hits) { domains.add(d); arr.push(d); }
        matched.push({ token: t, domains: arr });
    }
    return {
        domains,
        matched,
        ambiguous: domains.size > 1,
        generic: domains.size === 0,
    };
}

export interface AliasConflict {
    aliasTerm: string;
    aliasDomains: CodeDomain[];
    masterCode: string;
    masterDescription: string;
    masterDomains: CodeDomain[];
    reason: string;
}

/**
 * Compare an alias term against its target master code/description and return
 * a conflict descriptor if their domains don't overlap.
 *
 * A null return means the mapping passes the sniff test (either domains
 * overlap, or one side is generic enough that we can't claim a conflict).
 */
export function checkAliasConflict(
    aliasTerm: string,
    masterCode: string,
    masterDescription: string,
): AliasConflict | null {
    const alias = classifyText(aliasTerm);
    if (alias.generic) return null; // alias has no domain signal — don't flag

    // Combine code + description so e.g. master "SMH | Sanitary Manhole" maps
    // to sewer even if the description alone is generic.
    const master = classifyText(`${masterCode} ${masterDescription}`);
    if (master.generic) return null; // master has no domain signal — don't flag

    // Overlap = at least one shared domain → acceptable.
    for (const d of alias.domains) {
        if (master.domains.has(d)) return null;
    }

    const aliasArr = [...alias.domains];
    const masterArr = [...master.domains];
    return {
        aliasTerm,
        aliasDomains: aliasArr,
        masterCode,
        masterDescription,
        masterDomains: masterArr,
        reason: `"${aliasTerm}" reads as ${aliasArr.join(' / ')} but master code "${masterCode}" (${masterDescription}) is ${masterArr.join(' / ')}.`,
    };
}
