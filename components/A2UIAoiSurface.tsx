import React, { useContext, useMemo, useState } from 'react';
import type { AoiBoundary } from '../types.ts';
import { A2UIHostContext } from './A2UISurface.tsx';

type AoiActionOutcome = { ok: boolean; message?: string } | void;

const chipClass =
  'flex w-full items-start gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2 text-left transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.06] disabled:cursor-not-allowed disabled:opacity-50';
const primaryChipClass =
  'flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/12 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50';

interface A2UIAoiSurfaceProps {
  /** Placement supplied by the standard A2UI surface chrome. */
  presentation?: 'inline' | 'floating' | 'docked';
}

/**
 * Area-of-Interest chips. This is deliberately a small A2UI surface rather
 * than another canvas panel: an AOI is a scope decision, so it belongs beside
 * the request that will consume it (parcels, soils, contours, Surveyors Eye).
 */
export const A2UIAoiSurface: React.FC<A2UIAoiSurfaceProps> = ({ presentation = 'inline' }) => {
  const host = useContext(A2UIHostContext);
  const [addressOpen, setAddressOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aois = host.aoiBoundaries ?? [];
  const inclusions = host.inclusionBoundaries ?? [];
  const boundaryFiles = host.boundaryDeedFiles ?? [];
  const activeAoi = useMemo(
    () => aois.find(boundary => boundary.id === host.activeAoiBoundaryId) ?? null,
    [aois, host.activeAoiBoundaryId],
  );
  const showTitle = presentation === 'inline';

  const run = async (key: string, action: () => AoiActionOutcome | Promise<AoiActionOutcome>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action() as { ok?: boolean; message?: string } | undefined;
      if (outcome && outcome.ok === false) {
        setError(outcome.message || 'Could not create that AOI.');
        return;
      }
      setNotice(outcome?.message || 'AOI updated.');
      setAddressOpen(false);
      setAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const drawAoi = () => {
    host.onStartAoiDraw?.();
    setNotice('AOI draw armed — click the canvas to start the boundary. Close the loop to hold it.');
    setError(null);
  };

  return (
    <div data-testid="a2ui-aoi-surface" className="space-y-3 p-3 text-slate-200">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 font-mono text-[11px] font-bold text-cyan-300">
            AOI
          </span>
          <div className="min-w-0">
            {showTitle && (
              <h2 className="text-[13px] font-semibold text-white">Area of Interest</h2>
            )}
            <p className="text-[10px] leading-snug text-slate-400">
              A held AOI clips parcels, soils, contours and other imports just like an inclusion boundary.
            </p>
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-[10px]">
          <span className="text-slate-500">Active: </span>
          <span className={activeAoi ? 'font-semibold text-cyan-200' : 'text-slate-300'}>
            {activeAoi?.name ?? 'None'}
          </span>
          {activeAoi && (
            <span className="ml-2 text-slate-500">
              {activeAoi.source === 'address'
                ? 'address envelope'
                : activeAoi.source === 'boundary'
                  ? 'deed boundary copy'
                  : activeAoi.source === 'inclusion'
                    ? 'inclusion copy'
                    : 'drawn'}
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          data-testid="aoi-draw-chip"
          className={primaryChipClass}
          onClick={drawAoi}
        >
          <span aria-hidden="true">✎</span>
          Draw AOI
        </button>
        <button
          type="button"
          data-testid="aoi-address-chip"
          className={primaryChipClass}
          onClick={() => {
            setAddressOpen(open => !open);
            setError(null);
          }}
        >
          <span aria-hidden="true">⌖</span>
          Use address
        </button>
      </div>

      {addressOpen && (
        <form
          className="space-y-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-2"
          onSubmit={event => {
            event.preventDefault();
            if (!address.trim()) {
              setError('Enter a street address or place.');
              return;
            }
            void run('address', async () => {
              const outcome = await host.onCreateAoiFromAddress?.(address.trim());
              if (!outcome) return { ok: false, message: 'Address lookup is not available.' };
              return outcome;
            });
          }}
        >
          <label htmlFor="aoi-address-input" className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-200/70">
            Address or place
          </label>
          <input
            id="aoi-address-input"
            data-no-drag
            autoFocus
            value={address}
            onChange={event => setAddress(event.target.value)}
            placeholder="123 Main St, Norristown, PA"
            className="w-full rounded-md border border-white/15 bg-[#060d17] px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            data-testid="aoi-address-submit"
            disabled={busy === 'address'}
            className={`${primaryChipClass} py-1.5`}
          >
            {busy === 'address' ? 'Creating AOI…' : 'Create AOI from address'}
          </button>
        </form>
      )}

      {(notice || error) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`rounded-md border px-2 py-1 text-[10px] leading-snug ${
            error
              ? 'border-rose-400/25 bg-rose-400/[0.06] text-rose-200'
              : 'border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200'
          }`}
        >
          {error || notice}
        </p>
      )}

      <section className="space-y-1.5" data-testid="aoi-inclusions">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Inclusions</h3>
          <span className="font-mono text-[9px] text-slate-600">{inclusions.length}</span>
        </div>
        {inclusions.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 px-2 py-1.5 text-[10px] text-slate-500">
            No inclusion boundaries yet. Draw one or use the address chip.
          </p>
        ) : (
          <div className="space-y-1">
            {inclusions.map(boundary => (
              <button
                key={boundary.id}
                type="button"
                data-testid={`aoi-use-inclusion-${boundary.id}`}
                disabled={Boolean(busy)}
                className={chipClass}
                onClick={() => void run(`inclusion:${boundary.id}`, () => host.onCreateAoiFromInclusion?.(boundary.id) ?? { ok: false, message: 'AOI service unavailable.' })}
              >
                <span className="mt-0.5 text-[11px] text-cyan-300">▱</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-slate-100">{boundary.name}</span>
                  <span className="block text-[9px] text-slate-500">Copy this inclusion into a held AOI</span>
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">Use →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5" data-testid="aoi-boundaries">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Deed boundaries</h3>
          <span className="font-mono text-[9px] text-slate-600">{boundaryFiles.length}</span>
        </div>
        {boundaryFiles.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 px-2 py-1.5 text-[10px] text-slate-500">
            No boundary files loaded. A recorded deed boundary can become the AOI.
          </p>
        ) : (
          <div className="space-y-1">
            {boundaryFiles.map(file => (
              <button
                key={file.id}
                type="button"
                data-testid={`aoi-use-boundary-${file.id}`}
                disabled={Boolean(busy)}
                className={chipClass}
                onClick={() => void run(`boundary:${file.id}`, () => host.onCreateAoiFromBoundaryFile?.(file.id) ?? { ok: false, message: 'AOI service unavailable.' })}
              >
                <span className="mt-0.5 text-[11px] text-amber-300">◇</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-slate-100">{file.name}</span>
                  <span className="block text-[9px] text-slate-500">Use the parcel boundary as the held AOI</span>
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">Use →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5" data-testid="aoi-held">
        <div className="flex items-center justify-between">
          <h3 className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Held AOIs</h3>
          <span className="font-mono text-[9px] text-slate-600">{aois.length}</span>
        </div>
        {aois.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 px-2 py-1.5 text-[10px] text-slate-500">
            No AOI held. Draw one, copy an inclusion, or use an address.
          </p>
        ) : (
          <div className="space-y-1">
            {aois.map((boundary: AoiBoundary) => {
              const isActive = boundary.id === host.activeAoiBoundaryId;
              return (
                <div
                  key={boundary.id}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                    isActive
                      ? 'border-cyan-400/35 bg-cyan-400/[0.07]'
                      : 'border-white/10 bg-white/[0.025]'
                  }`}
                >
                  <button
                    type="button"
                    data-testid={`aoi-activate-${boundary.id}`}
                    onClick={() => host.onSetActiveAoi?.(isActive ? null : boundary.id)}
                    className="min-w-0 flex-1 text-left"
                    title={isActive ? 'Release the active AOI' : 'Hold this AOI for clipping and Surveyors Eye'}
                  >
                    <span className={`block truncate text-[11px] font-semibold ${isActive ? 'text-cyan-100' : 'text-slate-200'}`}>
                      {boundary.name}
                    </span>
                    <span className="block text-[9px] text-slate-500">
                      {isActive ? 'Held · clips imports and sets Surveyors Eye extent' : 'Click to hold'}
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid={`aoi-delete-${boundary.id}`}
                    onClick={() => host.onDeleteAoi?.(boundary.id)}
                    className="shrink-0 rounded border border-rose-400/20 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/10"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="border-t border-white/[0.06] pt-2 text-[9.5px] leading-snug text-slate-500">
        An active AOI takes precedence over the inclusion boundary. Release it to return to normal inclusion clipping.
      </p>
    </div>
  );
};

export default A2UIAoiSurface;
