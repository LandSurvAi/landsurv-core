import { useEffect, useMemo, useRef, useState } from 'react';
import type { CameraTransform, CursorSample } from '../../utils/recording/types';
import { geometryBounds, type ReplayGeometry } from '../../utils/recording/replay';

interface ReplayCanvasProps {
  geometry: ReplayGeometry;
  camera: CameraTransform | null;
  cursor: CursorSample | null;
  className?: string;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const lineColor = (type: string | undefined, fallback: string | undefined): string => {
  switch (type) {
    case 'contour-minor': return '#475569';
    case 'contour-major': return '#64748b';
    case 'parcel': return '#fbbf24';
    case 'inclusion': return '#22d3ee';
    case 'flood': return '#38bdf8';
    case 'soils': return '#a3e635';
    case 'steep-slope': return '#fb7185';
    case 'road-paint': return '#e2e8f0';
    case 'baseline': return '#f472b6';
    default: return fallback || '#94a3b8';
  }
};

export const ReplayCanvas: React.FC<ReplayCanvasProps> = ({ geometry, camera, cursor, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => {
    const map = new Map<string, { easting: number; northing: number; label: string }>();
    for (const list of geometry.pointLists as Array<{
      points?: Array<{ pointNumber?: string; easting?: number; northing?: number; hidden?: boolean }>;
    }>) {
      for (const point of list.points ?? []) {
        if (point.hidden || !Number.isFinite(point.easting) || !Number.isFinite(point.northing)) continue;
        map.set(String(point.pointNumber ?? ''), {
          easting: point.easting as number,
          northing: point.northing as number,
          label: String(point.pointNumber ?? ''),
        });
      }
    }
    return map;
  }, [geometry.pointLists]);

  const isEmpty = geometry.pointLists.length === 0
    && geometry.lines.length === 0
    && geometry.centerlines.length === 0
    && geometry.textAnnotations.length === 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = size.width;
    const height = size.height;
    ctx.fillStyle = '#070c14';
    ctx.fillRect(0, 0, width, height);

    let view = camera;
    if (!view) {
      const bounds = geometryBounds(geometry);
      if (bounds) {
        const spanX = Math.max(1, bounds.maxE - bounds.minE);
        const spanY = Math.max(1, bounds.maxN - bounds.minN);
        const scale = Math.min(width / spanX, height / spanY) * 0.86;
        view = {
          scale,
          offsetX: width / 2 - ((bounds.minE + bounds.maxE) / 2) * scale,
          offsetY: height / 2 + ((bounds.minN + bounds.maxN) / 2) * scale,
        };
      } else {
        view = { scale: 1, offsetX: width / 2, offsetY: height / 2 };
      }
    }

    const scale = Number.isFinite(view.scale) && view.scale !== 0 ? view.scale : 1;
    const toScreen = (easting: number, northing: number): ScreenPoint => ({
      x: easting * scale + view.offsetX,
      y: -northing * scale + view.offsetY,
    });

    // Screen-space grid keeps pan/zoom legible without implying world units.
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const resolve = (line: {
      from?: string;
      to?: string;
      fromPt?: { x: number; y: number };
      toPt?: { x: number; y: number };
    }): [ScreenPoint, ScreenPoint] | null => {
      const from = line.fromPt
        ? { easting: line.fromPt.x, northing: line.fromPt.y }
        : points.get(String(line.from ?? ''));
      const to = line.toPt
        ? { easting: line.toPt.x, northing: line.toPt.y }
        : points.get(String(line.to ?? ''));
      if (!from || !to) return null;
      return [toScreen(from.easting, from.northing), toScreen(to.easting, to.northing)];
    };

    for (const line of geometry.lines as Array<{
      id?: string;
      type?: string;
      color?: string;
      from?: string;
      to?: string;
      fromPt?: { x: number; y: number };
      toPt?: { x: number; y: number };
    }>) {
      const segment = resolve(line);
      if (!segment) continue;
      ctx.beginPath();
      ctx.moveTo(segment[0].x, segment[0].y);
      ctx.lineTo(segment[1].x, segment[1].y);
      ctx.strokeStyle = lineColor(line.type, line.color);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = line.type?.startsWith('contour') ? 1 : 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const centerline of geometry.centerlines as Array<{
      pis?: Array<{ easting?: number; northing?: number; x?: number; y?: number }>;
    }>) {
      const pis = (centerline.pis ?? [])
        .map(pi => ({ easting: pi.easting ?? pi.x, northing: pi.northing ?? pi.y }))
        .filter((pi): pi is { easting: number; northing: number } =>
          Number.isFinite(pi.easting) && Number.isFinite(pi.northing));
      if (pis.length < 2) continue;
      ctx.beginPath();
      pis.forEach((pi, index) => {
        const screen = toScreen(pi.easting, pi.northing);
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const [key, point] of points) {
      const screen = toScreen(point.easting, point.northing);
      if (screen.x < -20 || screen.y < -20 || screen.x > width + 20 || screen.y > height + 20) continue;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = '#67e8f9';
      ctx.fill();
      if (scale > 0.35 && key) {
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(226, 232, 240, 0.82)';
        ctx.fillText(key, screen.x + 5, screen.y - 5);
      }
    }

    const drawLabel = (x: number, y: number, text: string, color: string, sizePx = 11) => {
      const screen = toScreen(x, y);
      if (screen.x < -40 || screen.y < -20 || screen.x > width + 80 || screen.y > height + 20) return;
      ctx.font = `600 ${sizePx}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(text, screen.x, screen.y);
    };

    for (const label of geometry.contourLabels as Array<{ x: number; y: number; text: string }>) {
      drawLabel(label.x, label.y, label.text, 'rgba(148, 163, 184, 0.9)', 10);
    }
    for (const text of geometry.textAnnotations as Array<{ x: number; y: number; text: string; angle?: number }>) {
      const screen = toScreen(text.x, text.y);
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-((text.angle ?? 0) * Math.PI) / 180);
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
      ctx.fillText(text.text, 0, 0);
      ctx.restore();
    }
    for (const label of geometry.parcelLabels as Array<{ x: number; y: number; owner?: string; parcelId?: string }>) {
      drawLabel(label.x, label.y, label.owner ? `N/F ${label.owner}` : label.parcelId ?? 'PARCEL', 'rgba(251, 191, 36, 0.86)', 10);
    }
    for (const label of geometry.areaLabels as Array<{ x: number; y: number; lines?: string[] }>) {
      const text = label.lines?.join(' / ') ?? '';
      if (text) drawLabel(label.x, label.y, text, 'rgba(56, 189, 248, 0.84)', 10);
    }

    if (cursor?.visible) {
      const x = cursor.x * width;
      const y = cursor.y * height;
      ctx.strokeStyle = cursor.kind === 'down' ? '#fbbf24' : '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, cursor.kind === 'down' ? 10 : 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
    }
  }, [geometry, camera, cursor, size, points]);

  return (
    <div ref={containerRef} className={className ?? 'absolute inset-0'}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Recorded project replay" />
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-slate-700/70 bg-slate-900/80 px-4 py-3 text-center text-sm text-slate-400">
            No canvas geometry was captured for this recording.
          </div>
        </div>
      )}
    </div>
  );
};
