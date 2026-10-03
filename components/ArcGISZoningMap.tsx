/**
 * ArcGISZoningMap — native, in-app interactive rendering of a municipal
 * ArcGIS MapServer zoning service.
 *
 * Instead of iframing a third-party GIS viewer (usually blocked by
 * X-Frame-Options), we consume the service's public REST API the way it is
 * designed to be consumed:
 *   • OSM tiles as the basemap (Leaflet)
 *   • `<service>/export` dynamic-image overlay re-rendered on every pan/zoom
 *   • `<service>/identify` on click → district attributes in a popup
 *   • `<service>/legend` → collapsible legend panel
 *
 * The initial view is fit to the service's full extent; the extent is
 * projected to Web Mercator BY THE SERVER (an `export?f=json` echoes the
 * extent back in the requested imageSR), so we never need client-side
 * projection definitions for the service's native state-plane CRS.
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, List, X } from 'lucide-react';

interface LegendEntry {
  label: string;
  imageData: string;
  contentType: string;
  layerName: string;
}

/** Escape untrusted attribute values before injecting into popup HTML. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ArcGISZoningMap: React.FC<{
  serviceUrl: string;
  title?: string;
  /** Called when the service can't be rendered (CORS, no export, bad metadata)
   *  so the parent can fall back to another preview strategy. */
  onFailed?: () => void;
}> = ({ serviceUrl, title, onFailed }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [legend, setLegend] = useState<LegendEntry[]>([]);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const map = L.map(container, { zoomControl: true, minZoom: 3, maxZoom: 21 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 21,
      maxNativeZoom: 19,
    }).addTo(map);

    let overlay: L.ImageOverlay | null = null;
    let exportSeq = 0;

    const refreshOverlay = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;
      const b = map.getBounds();
      const sw = L.CRS.EPSG3857.project(b.getSouthWest());
      const ne = L.CRS.EPSG3857.project(b.getNorthEast());
      const seq = ++exportSeq;
      const url = `${serviceUrl}/export?bbox=${sw.x},${sw.y},${ne.x},${ne.y}&bboxSR=3857&imageSR=3857` +
        `&size=${size.x},${size.y}&dpi=96&format=png32&transparent=true&f=image`;
      // Preload so we only swap the overlay once the new frame is ready — this
      // avoids a white flash on every pan.
      const img = new Image();
      img.onload = () => {
        if (cancelled || seq !== exportSeq) return;
        if (overlay) {
          overlay.setUrl(url);
          overlay.setBounds(b);
        } else {
          overlay = L.imageOverlay(url, b, { opacity: 0.8, interactive: false }).addTo(map);
        }
      };
      img.src = url;
    };

    const identify = async (evt: L.LeafletMouseEvent) => {
      try {
        const size = map.getSize();
        const b = map.getBounds();
        const sw = L.CRS.EPSG3857.project(b.getSouthWest());
        const ne = L.CRS.EPSG3857.project(b.getNorthEast());
        const p = L.CRS.EPSG3857.project(evt.latlng);
        const params = new URLSearchParams({
          geometry: `${p.x},${p.y}`,
          geometryType: 'esriGeometryPoint',
          sr: '3857',
          layers: 'all',
          tolerance: '3',
          mapExtent: `${sw.x},${sw.y},${ne.x},${ne.y}`,
          imageDisplay: `${size.x},${size.y},96`,
          returnGeometry: 'false',
          f: 'json',
        });
        const r = await fetch(`${serviceUrl}/identify?${params}`, { signal: AbortSignal.timeout(10_000) });
        const j = await r.json();
        const results: any[] = Array.isArray(j?.results) ? j.results : [];
        if (!results.length || cancelled) return;
        const html = results.slice(0, 3).map(res => {
          const rows = Object.entries(res.attributes || {})
            .filter(([k, v]) => v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'null'
              && !/objectid|shape|globalid|st_area|st_length/i.test(k))
            .slice(0, 8)
            .map(([k, v]) => `<div style="display:flex;gap:6px;line-height:1.5"><span style="opacity:.6;white-space:nowrap">${esc(k)}:</span><b>${esc(String(v))}</b></div>`)
            .join('');
          return `<div style="margin-bottom:6px"><div style="font-weight:700;margin-bottom:2px">${esc(String(res.layerName || 'Layer'))}</div>${rows || '<i style="opacity:.6">no attributes</i>'}</div>`;
        }).join('');
        L.popup({ maxWidth: 300 })
          .setLatLng(evt.latlng)
          .setContent(`<div style="font-size:11px;max-height:220px;overflow:auto">${html}</div>`)
          .openOn(map);
      } catch { /* identify is best-effort */ }
    };

    (async () => {
      try {
        const metaRes = await fetch(`${serviceUrl}?f=json`, { signal: AbortSignal.timeout(15_000) });
        const meta = await metaRes.json();
        const ext = meta?.fullExtent || meta?.initialExtent;
        if (!ext || meta?.error) throw new Error('service metadata unavailable');
        const wkid = ext.spatialReference?.latestWkid || ext.spatialReference?.wkid || 4326;
        // Server-side reprojection of the extent to Web Mercator.
        const projRes = await fetch(
          `${serviceUrl}/export?bbox=${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}&bboxSR=${wkid}&imageSR=3857&size=16,16&format=png&f=json`,
          { signal: AbortSignal.timeout(15_000) },
        );
        const proj = await projRes.json();
        const pe = proj?.extent;
        if (!pe || !Number.isFinite(pe.xmin) || !Number.isFinite(pe.ymax)) throw new Error('extent projection failed');
        if (cancelled) return;
        const swLL = L.CRS.EPSG3857.unproject(L.point(pe.xmin, pe.ymin));
        const neLL = L.CRS.EPSG3857.unproject(L.point(pe.xmax, pe.ymax));
        map.fitBounds(L.latLngBounds(swLL, neLL), { padding: [10, 10] });
        map.on('moveend zoomend', refreshOverlay);
        map.on('click', identify);
        refreshOverlay();
        setStatus('ready');

        // Legend is decorative — never fail the map over it.
        fetch(`${serviceUrl}/legend?f=json`, { signal: AbortSignal.timeout(15_000) })
          .then(r => r.json())
          .then(lj => {
            if (cancelled) return;
            const entries: LegendEntry[] = [];
            for (const layer of (Array.isArray(lj?.layers) ? lj.layers : [])) {
              for (const item of (Array.isArray(layer?.legend) ? layer.legend : [])) {
                if (item?.imageData) {
                  entries.push({
                    label: String(item.label ?? '').trim() || String(layer.layerName ?? ''),
                    imageData: String(item.imageData),
                    contentType: String(item.contentType || 'image/png'),
                    layerName: String(layer.layerName ?? ''),
                  });
                }
                if (entries.length >= 60) break;
              }
              if (entries.length >= 60) break;
            }
            setLegend(entries);
          })
          .catch(() => { /* no legend — fine */ });
      } catch {
        if (!cancelled) {
          setStatus('failed');
          onFailedRef.current?.();
        }
      }
    })();

    const ro = new ResizeObserver(() => { try { map.invalidateSize(); } catch { /* detached */ } });
    ro.observe(container);
    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
    };
  }, [serviceUrl]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full z-0" aria-label={title || 'Interactive zoning map'} />
      {status === 'loading' && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-2 bg-slate-950/70">
          <Loader2 className="w-8 h-8 text-cyan-300 animate-spin" />
          <p className="text-xs text-cyan-100">Loading official zoning layers…</p>
        </div>
      )}
      {status === 'ready' && legend.length > 0 && (
        <div className="absolute top-2 right-2 z-[500] flex flex-col items-end">
          <button
            onClick={() => setLegendOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/85 hover:bg-slate-800 border border-cyan-500/40 text-[10px] font-semibold text-cyan-100 shadow-lg transition"
            title={legendOpen ? 'Hide legend' : 'Show legend'}
          >
            {legendOpen ? <X className="w-3 h-3" /> : <List className="w-3 h-3" />}
            Legend
          </button>
          {legendOpen && (
            <div className="mt-1.5 max-h-52 w-52 overflow-auto rounded-lg bg-slate-900/95 border border-cyan-500/30 shadow-xl p-2 space-y-1">
              {legend.map((e, i) => (
                <div key={i} className="flex items-center gap-2 min-w-0">
                  <img
                    src={`data:${e.contentType};base64,${e.imageData}`}
                    alt=""
                    className="w-4 h-4 flex-shrink-0 rounded-sm"
                  />
                  <span className="text-[10px] text-gray-200 truncate" title={e.label}>{e.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute bottom-0 left-0 z-[500] px-2 py-0.5 text-[9px] text-gray-300 bg-slate-950/70 rounded-tr-md pointer-events-none">
          Official zoning layers rendered live from the municipality's GIS service — click a parcel for district info
        </div>
      )}
    </div>
  );
};

export default ArcGISZoningMap;
