// ---------------------------------------------------------------------------
// Annotation resolver — shared logic for matching a description / field code
// to an AnnotationRule (leader-line + note).
//
// Mirrors utils/symbolResolver.ts: associatedTerms with wildcards, longest /
// non-wildcard terms first, isDefault fallback.
// ---------------------------------------------------------------------------

import type { AnnotationRule, SurveyPoint } from '../types';

export interface AnnotationMatcher {
    regex: RegExp;
    rule: AnnotationRule;
}

export interface AnnotationResolution {
    rule: AnnotationRule | null;
    source: 'name-exact' | 'fuzzy-term' | 'default' | 'none';
    matchedTerm?: string;
    confidence: number;
}

export function buildAnnotationMatchers(library: AnnotationRule[]): AnnotationMatcher[] {
    const allTerms: { term: string; rule: AnnotationRule }[] = [];
    library.forEach(rule => {
        if (rule.isDefault) return;
        if (!rule.associatedTerms || rule.associatedTerms.length === 0) return;
        rule.associatedTerms.forEach(term => {
            const t = (term ?? '').trim();
            if (t) allTerms.push({ term: t, rule });
        });
    });

    allTerms.sort((a, b) => {
        if (b.term.length !== a.term.length) return b.term.length - a.term.length;
        const aWild = a.term.includes('*');
        const bWild = b.term.includes('*');
        if (aWild && !bWild) return 1;
        if (!aWild && bWild) return -1;
        return 0;
    });

    return allTerms.map(({ term, rule }) => {
        const lower = term.toLowerCase();
        const pattern = lower
            .split(/\s+/)
            .map(part => {
                let p = part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
                p = p.replace(/\*/g, '\\S*');
                return p;
            })
            .join('\\s+');
        return { regex: new RegExp(`\\b${pattern}\\b`, 'i'), rule };
    });
}

export function resolveAnnotation(
    codeOrDescription: string,
    library: AnnotationRule[],
    matchers?: AnnotationMatcher[],
): AnnotationResolution {
    const text = (codeOrDescription ?? '').trim();
    if (!text) return { rule: null, source: 'none', confidence: 0 };

    const lower = text.toLowerCase();

    const exact = library.find(r => !r.isDefault && r.name.toLowerCase() === lower);
    if (exact) return { rule: exact, source: 'name-exact', confidence: 1.0 };

    const ms = matchers ?? buildAnnotationMatchers(library);
    for (const m of ms) {
        if (m.regex.test(lower)) {
            return { rule: m.rule, source: 'fuzzy-term', matchedTerm: m.regex.source, confidence: 0.8 };
        }
    }

    const def = library.find(r => r.isDefault);
    if (def) return { rule: def, source: 'default', confidence: 0.3 };

    return { rule: null, source: 'none', confidence: 0 };
}

/**
 * Substitute {placeholder} tokens in a template with values from a SurveyPoint.
 * Supported tokens: pointNumber, description, elevation, northing, easting, layer.
 * Unknown tokens are left in place. \n literal is converted to newline.
 */
export function renderAnnotationTemplate(template: string, point: SurveyPoint): string {
    const elevStr = point.elevation !== undefined && point.elevation !== null
        ? point.elevation.toFixed(2)
        : '';
    const subs: Record<string, string> = {
        pointNumber: point.pointNumber ?? '',
        description: point.description ?? '',
        elevation: elevStr,
        northing: point.northing !== undefined ? point.northing.toFixed(2) : '',
        easting: point.easting !== undefined ? point.easting.toFixed(2) : '',
        layer: point.layer ?? '',
    };
    return (template ?? '')
        .replace(/\{(\w+)\}/g, (full, key) => (key in subs ? subs[key] : full))
        .replace(/\\n/g, '\n');
}
