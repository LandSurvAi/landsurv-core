// ---------------------------------------------------------------------------
// Symbol resolver — shared logic for matching a description / field code to a
// CustomSymbol from the live symbol library.
//
// Used by:
//   • DrawingCanvas (render-time symbol picking)
//   • CAD Manager CACP skill `cad_resolve_symbol_for_code`
//   • CAD Standards view (bulk "Auto-Apply Symbols" preview)
//
// Matching strategy (in priority order):
//   1. exact match on CustomSymbol.name (case-insensitive)
//   2. fuzzy associatedTerms match — same regex/wildcard logic the canvas
//      has always used (longer / non-wildcard terms preferred)
//   3. no match — caller renders a plain point marker
// ---------------------------------------------------------------------------

import type { CustomSymbol } from '../types';

export interface SymbolMatcher {
    regex: RegExp;
    symbol: CustomSymbol;
}

export interface SymbolResolution {
    symbol: CustomSymbol | null;
    source: 'name-exact' | 'fuzzy-term' | 'none';
    matchedTerm?: string;
    confidence: number;          // 0–1
}

/** Build the sorted regex matcher list once per symbol-library change. */
export function buildSymbolMatchers(library: CustomSymbol[]): SymbolMatcher[] {
    const allTerms: { term: string; symbol: CustomSymbol }[] = [];
    library.forEach(symbol => {
        if (symbol.isDefault) return;
        if (!symbol.associatedTerms || symbol.associatedTerms.length === 0) return;
        symbol.associatedTerms.forEach(term => {
            const t = (term ?? '').trim();
            if (t) allTerms.push({ term: t, symbol });
        });
    });

    // Longer terms first; non-wildcard before wildcard at equal length.
    allTerms.sort((a, b) => {
        if (b.term.length !== a.term.length) return b.term.length - a.term.length;
        const aWild = a.term.includes('*');
        const bWild = b.term.includes('*');
        if (aWild && !bWild) return 1;
        if (!aWild && bWild) return -1;
        return 0;
    });

    return allTerms.map(({ term, symbol }) => {
        const lower = term.toLowerCase();
        const pattern = lower
            .split(/\s+/)
            .map(part => {
                let p = part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
                p = p.replace(/\*/g, '\\S*');
                return p;
            })
            .join('\\s+');
        return { regex: new RegExp(`\\b${pattern}\\b`, 'i'), symbol };
    });
}

/**
 * Resolve a single code/description against the library.
 * Pass pre-built matchers from `buildSymbolMatchers` when calling repeatedly
 * to avoid rebuilding regexes per call.
 */
export function resolveSymbol(
    codeOrDescription: string,
    library: CustomSymbol[],
    matchers?: SymbolMatcher[],
): SymbolResolution {
    const text = (codeOrDescription ?? '').trim();
    if (!text) return { symbol: null, source: 'none', confidence: 0 };

    const lower = text.toLowerCase();

    // (1) Exact name match.
    const exact = library.find(s => !s.isDefault && s.name.toLowerCase() === lower);
    if (exact) return { symbol: exact, source: 'name-exact', confidence: 1.0 };

    // (2) Fuzzy associatedTerms match.
    const ms = matchers ?? buildSymbolMatchers(library);
    for (const m of ms) {
        if (m.regex.test(lower)) {
            return { symbol: m.symbol, source: 'fuzzy-term', matchedTerm: m.regex.source, confidence: 0.8 };
        }
    }

    return { symbol: null, source: 'none', confidence: 0 };
}

/** Batch helper — resolves many codes against a library, building matchers once. */
export function resolveSymbolsBatch(
    codes: string[],
    library: CustomSymbol[],
): Array<{ code: string } & SymbolResolution> {
    const matchers = buildSymbolMatchers(library);
    return codes.map(code => ({ code, ...resolveSymbol(code, library, matchers) }));
}
