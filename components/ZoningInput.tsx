import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Building2, ArrowLeft, Search, AlertCircle, Loader2, LocateFixed, Sparkles } from 'lucide-react';
import { reverseGeocodeViaCensus, getBrowserPosition } from '../utils/reverseGeocode';
import { loadCountiesForState, loadMunicipalitiesForState, useJurisdictionList, useMunicipalitiesForCounty } from '../utils/usJurisdictions';
import { knowledgeBase } from '../services/KnowledgeBase';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface ZoningInputProps {
  onZoningSearch: (searchData: ZoningSearchData) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
  /** Optional project metadata — used to silently prefill state/county/municipality
   *  when the user has already entered them in the Job Info dialog. */
  jobInfo?: {
    siteAddress?: string;
    siteMunicipality?: string;
    zoningDistrict?: string;
    desiredUse?: string;
  };
}

export interface ZoningSearchData {
  state: string;
  county: string;
  municipality: string;
  zoningDistrict?: string;
  desiredUse?: string;
}

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming','District of Columbia',
];

const ZoningInput: React.FC<ZoningInputProps> = ({ onZoningSearch, onGoBack, backButtonTitle = 'Go to Home Screen', jobInfo }) => {
  const [state, setState] = useState('');
  const [county, setCounty] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [zoningDistrict, setZoningDistrict] = useState('');
  const [desiredUse, setDesiredUse] = useState('');
  const [prefilling, setPrefilling] = useState(false);
  const [prefillSource, setPrefillSource] = useState<'jobInfo' | 'knowledgeBase' | 'geolocation' | null>(null);
  const { addNotification } = useAppState();

  const notifyError = (message: string) => {
    addNotification({ kind: 'zoning-input', severity: 'error', title: 'Zoning Agent', message });
  };

  // Free Census ACS lookups \u2014 fetch counties + municipalities for the chosen
  // state. Results are cached in localStorage forever so this is one HTTP
  // call per (state, kind) tuple across the whole session.
  const countyList    = useJurisdictionList(loadCountiesForState, state);
  const muniListState = useJurisdictionList(loadMunicipalitiesForState, state);
  // County-scoped municipality list — only meaningful when the typed county
  // exactly matches one of the known counties for the state. Otherwise the
  // hook returns an empty list and we fall back to the state-wide list.
  const countyMatch = state && county
    ? countyList.list.find(c => c.toLowerCase() === county.replace(/\s+(county|parish|borough)\s*$/i, '').trim().toLowerCase())
    : undefined;
  const muniListCounty = useMunicipalitiesForCounty(state, countyMatch);
  // Prefer the narrowed list when it returned results; otherwise fall back
  // to the full state-wide list.
  const useCountyScope = !!countyMatch && muniListCounty.list.length > 0;
  const muniList = useCountyScope
    ? { list: muniListCounty.list, loading: muniListCounty.loading, error: muniListCounty.error }
    : { list: muniListState.list,  loading: muniListState.loading || muniListCounty.loading, error: muniListState.error };
  // Elapsed-time counter for the Census loading status row, so users see
  // the seconds tick by instead of staring at a still spinner.
  const [censusElapsed, setCensusElapsed] = useState(0);
  useEffect(() => {
    const anyLoading = countyList.loading || muniList.loading;
    if (!anyLoading) { setCensusElapsed(0); return; }
    const startedAt = Date.now();
    setCensusElapsed(0);
    const id = window.setInterval(() => setCensusElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [countyList.loading, muniList.loading]);
  // --- Auto-prefill on mount from existing project data --------------------
  // Priority: 1) JobInfo (Job Info dialog) 2) KnowledgeBase parcel.gis facts.
  // Geolocation is opt-in (button click) since it triggers a browser permission prompt.
  useEffect(() => {
    if (state || county || municipality) return; // user already typed something
    let filled = false;

    if (jobInfo) {
      if (jobInfo.siteMunicipality) { setMunicipality(jobInfo.siteMunicipality); filled = true; }
      if (jobInfo.zoningDistrict)   { setZoningDistrict(jobInfo.zoningDistrict); filled = true; }
      if (jobInfo.desiredUse)       { setDesiredUse(jobInfo.desiredUse); filled = true; }
      // siteAddress sometimes contains ", <County> County, <State>" — best-effort parse.
      if (jobInfo.siteAddress) {
        const addr = jobInfo.siteAddress;
        const m = addr.match(/,\s*([A-Za-z .'-]+?)\s+County\s*,\s*([A-Za-z ]+?)(?:\s+\d{5})?\s*$/i);
        if (m) { setCounty(m[1].trim()); setState(stateNameOf(m[2].trim())); filled = true; }
      }
      if (filled) setPrefillSource('jobInfo');
    }

    if (!filled) {
      // Try the project KnowledgeBase — parcel.gis facts often carry jurisdiction info.
      try {
        const kb = knowledgeBase.queryFacts({ category: ['parcel.gis', 'deed.metadata', 'project'], limit: 100 });
        const find = (pred: string) => kb.find(f => f.predicate.toLowerCase() === pred.toLowerCase());
        const m = find('municipality') || find('city') || find('place');
        const c = find('county');
        const s = find('state');
        if (m && typeof m.value === 'string') { setMunicipality(m.value); filled = true; }
        if (c && typeof c.value === 'string') { setCounty(c.value); filled = true; }
        if (s && typeof s.value === 'string') { setState(stateNameOf(s.value)); filled = true; }
        if (filled) setPrefillSource('knowledgeBase');
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseMyLocation = async () => {
    setPrefilling(true);
    try {
      const pos = await getBrowserPosition();
      const r = await reverseGeocodeViaCensus(pos.coords.latitude, pos.coords.longitude);
      if (!r.state && !r.county && !r.place) throw new Error('No US-jurisdiction match for this location.');
      if (r.state) setState(r.state);
      if (r.county) setCounty(r.county);
      if (r.place) setMunicipality(r.place);
      setPrefillSource('geolocation');
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/denied|permission/i.test(msg)) notifyError('Location permission denied. Enter the jurisdiction manually or allow location access.');
      else if (/timeout/i.test(msg)) notifyError('Geolocation timed out. Try again or enter the jurisdiction manually.');
      else notifyError(`Could not autofill from location: ${msg}`);
    } finally {
      setPrefilling(false);
    }
  };

  const handleStart = () => {
    if (!state.trim()) { notifyError('Please select a state.'); return; }
    if (!county.trim()) { notifyError('Please enter a county.'); return; }
    if (!municipality.trim()) { notifyError('Please enter a municipality.'); return; }
    onZoningSearch({
      state: state.trim(),
      county: county.trim(),
      municipality: municipality.trim(),
      zoningDistrict: zoningDistrict.trim() || undefined,
      desiredUse: desiredUse.trim() || undefined,
    });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleStart();
  };

  const canStart = state.trim() && county.trim() && municipality.trim();

  // Auto-launch as soon as the user has *committed* to a county + municipality
  // (exact match against the Census list, case-insensitive). This stops the
  // research from firing on the first keystroke while the user is still
  // typing. When the Census list is unavailable we require the manual
  // Start button instead of guessing.
  const countyExact = county.trim()
    ? countyList.list.some(c => c.toLowerCase() === county.trim().replace(/\s+(county|parish|borough)\s*$/i, '').toLowerCase())
    : false;
  const muniExact = municipality.trim()
    ? muniList.list.some(m => m.toLowerCase() === municipality.trim().toLowerCase())
    : false;
  const canAutoStart = !!(state.trim() && countyExact && muniExact);

  // Guarded by a ref so we only fire once per mount and never re-fire after
  // the user returns to this form.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!canAutoStart) return;
    if (countyList.loading || muniList.loading || prefilling) return;
    autoStartedRef.current = true;
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoStart, countyList.loading, muniList.loading, prefilling]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-700/60 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="relative">
            <MapPin className="w-6 h-6 text-emerald-400" />
            <Building2 className="w-3.5 h-3.5 text-emerald-300 absolute -right-1 -bottom-1" />
          </div>
          <h2 className="text-xl font-bold text-gray-100 tracking-tight">Zoning Agent</h2>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 uppercase tracking-wider">CACP</span>
        </div>
        <p className="text-sm text-gray-400 ml-9">
          Research zoning requirements using live Google Search grounding.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

        {/* Autofill row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={prefilling}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-900/30 hover:bg-emerald-900/50 disabled:opacity-60 border border-emerald-700/50 hover:border-emerald-600 text-emerald-200 text-sm font-medium py-2.5 px-4 rounded-lg transition-all"
          >
            {prefilling
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Autofilling from location…</>
              : <><LocateFixed className="w-4 h-4" /> Use my location to autofill</>}
          </button>
          {prefillSource && !prefilling && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 px-2 py-1 rounded bg-emerald-900/30 border border-emerald-700/40">
              <Sparkles className="w-3 h-3" />
              prefilled from {prefillSource === 'jobInfo' ? 'project info' : prefillSource === 'knowledgeBase' ? 'project data' : 'GPS'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500 -mt-3">
          Free reverse geocoding via the US Census Geocoder. No API key, no tracking. You can also fill the form manually below.
        </p>

        {/* Jurisdiction — required */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Jurisdiction <span className="text-red-400">*</span></p>
          <div className="space-y-3">
            <div>
              <label htmlFor="z-state" className="block text-sm font-medium text-gray-300 mb-1.5">State</label>
              <select
                id="z-state"
                value={state}
                onChange={e => setState(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all text-sm"
                autoFocus
              >
                <option value="">— Select state —</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="z-county" className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  County
                  {countyList.loading && <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />}
                  {!countyList.loading && countyList.list.length > 0 && (
                    <span className="text-[10px] text-gray-500">({countyList.list.length})</span>
                  )}
                </label>
                <input
                  id="z-county"
                  type="text"
                  value={county}
                  onChange={e => setCounty(e.target.value)}
                  onKeyDown={handleKey}
                  list={countyList.list.length > 0 ? 'z-county-options' : undefined}
                  placeholder={state ? (countyList.loading ? 'Loading…' : 'Start typing…') : 'Pick a state first'}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all text-sm"
                />
                {countyList.list.length > 0 && (
                  <datalist id="z-county-options">
                    {countyList.list.map(c => <option key={c} value={c} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label htmlFor="z-muni" className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  Municipality
                  {muniList.loading && <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />}
                  {!muniList.loading && muniList.list.length > 0 && (
                    <span className="text-[10px] text-gray-500">
                      ({muniList.list.length}{useCountyScope ? ` in ${countyMatch}` : ''})
                    </span>
                  )}
                </label>
                <input
                  id="z-muni"
                  type="text"
                  value={municipality}
                  onChange={e => setMunicipality(e.target.value)}
                  onKeyDown={handleKey}
                  list={muniList.list.length > 0 ? 'z-muni-options' : undefined}
                  placeholder={state ? (muniList.loading ? 'Loading…' : 'Start typing…') : 'Pick a state first'}
                  autoComplete="off"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all text-sm"
                />
                {muniList.list.length > 0 && (
                  <datalist id="z-muni-options">
                    {muniList.list.map(m => <option key={m} value={m} />)}
                  </datalist>
                )}
              </div>
            </div>
            {(countyList.error || muniList.error) && (
              <p className="text-[10px] text-amber-300/70 -mt-2">
                Census lookup unavailable — typing still works.
              </p>
            )}

            {/* Census loading status — visible only while a lookup is in flight. */}
            {(countyList.loading || muniList.loading) && (
              <div className="-mt-2 rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs text-emerald-200">
                        Loading {countyList.loading && muniList.loading ? 'counties + municipalities' : countyList.loading ? 'counties' : 'municipalities'} for {state}…
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">{censusElapsed}s</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-slate-800/70">
                      <div className="h-full w-1/3 bg-gradient-to-r from-emerald-500/60 via-emerald-300 to-emerald-500/60 animate-pulse-slide" />
                    </div>
                    {censusElapsed >= 8 && (
                      <p className="text-[10px] text-gray-500 mt-1 italic">
                        Large states (TX, CA, NY) can take 10–20 seconds the first time. Results are cached locally after.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zoning context — optional */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Zoning Context <span className="text-gray-500">(optional)</span></p>
          <div className="space-y-3">
            <div>
              <label htmlFor="z-district" className="block text-sm font-medium text-gray-300 mb-1.5">Zoning District</label>
              <input
                id="z-district"
                type="text"
                value={zoningDistrict}
                onChange={e => setZoningDistrict(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g., R-1, C-2, I-3, A-P …"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all text-sm"
              />
            </div>
            <div>
              <label htmlFor="z-use" className="block text-sm font-medium text-gray-300 mb-1.5">Desired Use</label>
              <input
                id="z-use"
                type="text"
                value={desiredUse}
                onChange={e => setDesiredUse(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g., single-family residential, warehouse, retail …"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500 transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Search className="w-4 h-4" />
          Start Zoning Research
        </button>

        {/* Capability hints */}
        <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">What you can ask</p>
          {[
            'What are the setback requirements for R-1?',
            'Is a 40,000 sq ft warehouse permitted here?',
            'What is the maximum building height?',
            'What parking standards apply to retail uses?',
            'Are there any overlay or flood plain districts?',
          ].map(q => (
            <p key={q} className="text-xs text-gray-400 flex items-start gap-1.5">
              <span className="text-emerald-500 flex-shrink-0">›</span>{q}
            </p>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-900/15 border border-amber-700/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Results are AI-synthesized from live web search and are for <strong>preliminary research only</strong>. Always verify with the official municipal ordinance and consult a licensed professional before making decisions.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-700/50 flex-shrink-0">
        <button
          onClick={onGoBack}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          {backButtonTitle}
        </button>
      </div>
    </div>
  );
};

export default ZoningInput;

// ---------------------------------------------------------------------------
// Normalizer — accepts state name, USPS abbreviation, or BASENAME and returns
// the canonical full state name used in the <select> options. Falls back to
// the input if no match (the select will simply show '— Select state —').
// ---------------------------------------------------------------------------
const STATE_ABBREVIATIONS: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

function stateNameOf(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (US_STATES.includes(t)) return t;
  const up = t.toUpperCase();
  if (STATE_ABBREVIATIONS[up]) return STATE_ABBREVIATIONS[up];
  // case-insensitive full-name match
  const match = US_STATES.find(s => s.toLowerCase() === t.toLowerCase());
  return match || t;
}
