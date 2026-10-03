// BearingDmsInput.tsx
// Compact composite bearing entry: quadrant pickers + D / M / S boxes.
// Emits a canonical "N DD MM SS E" string compatible with parseBearingToRadians.

import React, { useEffect, useRef, useState } from 'react';

export interface BearingDmsValue {
    ns: 'N' | 'S';
    d: string;
    m: string;
    s: string;
    ew: 'E' | 'W';
}

/** Parse a stored bearing string back into DMS parts. Returns blanks when unparseable. */
export function decomposeBearing(str: string | undefined | null): BearingDmsValue {
    const empty: BearingDmsValue = { ns: 'N', d: '', m: '', s: '', ew: 'E' };
    if (!str) return empty;
    const cleaned = str.replace(/["'“”‘’°]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    // Accept either spaced ("N 37 46 00 E") or glued ("N37 46 00E") inputs.
    const m = cleaned.match(/^([NS])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*([EW])$/);
    if (!m) return empty;
    return {
        ns: m[1] as 'N' | 'S',
        d: m[2],
        m: m[3],
        s: m[4],
        ew: m[5] as 'E' | 'W',
    };
}

/** Build the canonical bearing string the COGO parser expects. */
export function composeBearing(v: BearingDmsValue): string {
    const d = (v.d ?? '').trim();
    const m = (v.m ?? '').trim();
    const s = (v.s ?? '').trim();
    if (d === '' && m === '' && s === '') return '';
    const dN = d === '' ? 0 : parseFloat(d);
    const mN = m === '' ? 0 : parseFloat(m);
    const sN = s === '' ? 0 : parseFloat(s);
    if (!isFinite(dN) || !isFinite(mN) || !isFinite(sN)) return '';
    return `${v.ns} ${dN} ${mN} ${sN} ${v.ew}`;
}

interface Props {
    /** Stored canonical bearing string. */
    value: string;
    onCommit: (canonical: string) => void;
    /** Optional ref bag for focus management. */
    inputRefs?: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
    /** Unique row id used to scope inputRefs keys. */
    rowKey?: string;
}

const num = /^-?\d{0,3}(?:\.\d{0,4})?$/;

const BearingDmsInput: React.FC<Props> = ({ value, onCommit, inputRefs, rowKey }) => {
    const [local, setLocal] = useState<BearingDmsValue>(() => decomposeBearing(value));
    const dRef = useRef<HTMLInputElement | null>(null);
    const mRef = useRef<HTMLInputElement | null>(null);
    const sRef = useRef<HTMLInputElement | null>(null);

    // Re-sync when external value changes and we're not actively editing.
    useEffect(() => {
        const composed = composeBearing(local);
        if (composed !== value) setLocal(decomposeBearing(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const commit = (next: BearingDmsValue) => {
        setLocal(next);
        onCommit(composeBearing(next));
    };

    const setField = (field: keyof BearingDmsValue, raw: string) => {
        if (field === 'ns' || field === 'ew') {
            commit({ ...local, [field]: raw as any });
            return;
        }
        if (raw !== '' && !num.test(raw)) return;
        commit({ ...local, [field]: raw });
    };

    const toggleNs = () => commit({ ...local, ns: local.ns === 'N' ? 'S' : 'N' });
    const toggleEw = () => commit({ ...local, ew: local.ew === 'E' ? 'W' : 'E' });

    const advance = (e: React.KeyboardEvent<HTMLInputElement>, next: HTMLInputElement | null) => {
        if (e.key === ' ' || e.key === '.' || e.key === 'Tab') {
            e.preventDefault();
            next?.focus();
            next?.select();
        }
    };

    const baseInput = 'w-7 bg-gray-800 border border-gray-600 rounded px-0.5 py-0.5 font-mono text-[11px] text-gray-200 text-center focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500';
    const quadBtn = (active: boolean, color: 'rose' | 'cyan') =>
        `w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold font-mono transition-colors ${
            active
                ? color === 'rose'
                    ? 'bg-rose-600/80 text-white'
                    : 'bg-cyan-600/80 text-white'
                : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600'
        }`;

    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                onClick={toggleNs}
                className={quadBtn(true, local.ns === 'N' ? 'cyan' : 'rose')}
                title="Toggle N/S"
            >
                {local.ns}
            </button>
            <input
                ref={el => { dRef.current = el; if (inputRefs && rowKey) inputRefs.current[`${rowKey}.bearing.d`] = el; }}
                value={local.d}
                onChange={e => setField('d', e.target.value)}
                onKeyDown={e => advance(e, mRef.current)}
                onFocus={e => e.target.select()}
                className={baseInput}
                placeholder="00"
                spellCheck={false}
                inputMode="decimal"
            />
            <span className="text-gray-500 text-[10px]">°</span>
            <input
                ref={mRef}
                value={local.m}
                onChange={e => setField('m', e.target.value)}
                onKeyDown={e => advance(e, sRef.current)}
                onFocus={e => e.target.select()}
                className={baseInput}
                placeholder="00"
                spellCheck={false}
                inputMode="decimal"
            />
            <span className="text-gray-500 text-[10px]">'</span>
            <input
                ref={sRef}
                value={local.s}
                onChange={e => setField('s', e.target.value)}
                onFocus={e => e.target.select()}
                className={baseInput}
                placeholder="00"
                spellCheck={false}
                inputMode="decimal"
            />
            <span className="text-gray-500 text-[10px]">"</span>
            <button
                type="button"
                onClick={toggleEw}
                className={quadBtn(true, local.ew === 'E' ? 'cyan' : 'rose')}
                title="Toggle E/W"
            >
                {local.ew}
            </button>
        </div>
    );
};

export default BearingDmsInput;
