import React from 'react';
import { List, MapPin, Plus, Tag, Upload, Wrench } from 'lucide-react';
import type { PointList } from '../types.ts';
import { ChipCard, CHIP_WIDE_ACTION_CLASS, chipButtonClass } from './common/SectionChip.tsx';

export interface A2UIPointToolsProps {
  pointLists: PointList[];
  nextAvailablePointNumber: string;
  onOpenCapture: () => void;
  onStartEmptySession: () => void;
  onOpenAddPoint: () => void;
  onOpenPointList: (view: 'text' | 'spreadsheet') => void;
  onOpenPointLabeling: () => void;
  onOpenWorkspace: () => void;
}

const Metric: React.FC<{ label: string; value: string | number; tone?: string }> = ({
  label,
  value,
  tone = 'text-slate-100',
}) => (
  <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
    <div className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
    <div className={`mt-0.5 font-mono text-[13px] font-semibold ${tone}`}>{value}</div>
  </div>
);

export const A2UIPointTools: React.FC<A2UIPointToolsProps> = ({
  pointLists,
  nextAvailablePointNumber,
  onOpenCapture,
  onStartEmptySession,
  onOpenAddPoint,
  onOpenPointList,
  onOpenPointLabeling,
  onOpenWorkspace,
}) => {
  const allPoints = pointLists.flatMap(list => list.points);
  const visiblePointCount = pointLists
    .filter(list => list.isVisible)
    .reduce((total, list) => total + list.points.length, 0);
  const unsavedPointCount = pointLists.find(list => list.id === 'working')?.points.length ?? 0;
  const listCount = pointLists.length;

  return (
    <div data-testid="a2ui-point-tools" className="space-y-2.5 p-3 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-white">Every point tool in one place</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            Capture, add, review, label, and manage survey points without leaving the conversation.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-200">
          {allPoints.length.toLocaleString()} points
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Metric label="Total" value={allPoints.length.toLocaleString()} />
        <Metric label="Visible" value={visiblePointCount.toLocaleString()} tone="text-cyan-200" />
        <Metric
          label="Unsaved"
          value={unsavedPointCount.toLocaleString()}
          tone={unsavedPointCount > 0 ? 'text-amber-200' : 'text-slate-300'}
        />
        <Metric label="Next PN" value={nextAvailablePointNumber || '—'} tone="text-emerald-200" />
      </div>

      <ChipCard
        color="cyan"
        title="Capture & Import"
        icon={<Upload className="h-3.5 w-3.5" />}
        aside={<span className="text-[9px] text-slate-500">{listCount} list{listCount === 1 ? '' : 's'}</span>}
      >
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          Import CSV or TXT point files, drop a whole folder, or start an empty session and key points in by hand.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="point-tools-open-capture"
            onClick={onOpenCapture}
            className={chipButtonClass('cyan')}
          >
            <Upload className="h-3 w-3" />
            Upload points
          </button>
          <button
            type="button"
            data-testid="point-tools-start-empty"
            onClick={onStartEmptySession}
            className={chipButtonClass('neutral')}
          >
            Start empty
          </button>
        </div>
      </ChipCard>

      <ChipCard
        color="emerald"
        title="Add Point"
        icon={<Plus className="h-3.5 w-3.5" />}
        aside={<span className="text-[9px] text-slate-500">Next {nextAvailablePointNumber || '—'}</span>}
      >
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          Enter coordinates or a Google Plus Code, or arm the canvas picker with the current number, elevation, and
          description.
        </p>
        <button
          type="button"
          data-testid="point-tools-open-add"
          onClick={onOpenAddPoint}
          className={CHIP_WIDE_ACTION_CLASS}
        >
          <MapPin className="h-3.5 w-3.5" />
          Open Add Point
        </button>
      </ChipCard>

      <ChipCard
        color="blue"
        title="Point List"
        icon={<List className="h-3.5 w-3.5" />}
        aside={
          <span className="text-[9px] text-slate-500">
            {allPoints.length.toLocaleString()} point{allPoints.length === 1 ? '' : 's'}
          </span>
        }
      >
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          Search, sort, and export every point record. Open it as text or as a searchable sheet with CSV and TSV
          copy.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="point-tools-open-list"
            onClick={() => onOpenPointList('text')}
            className={chipButtonClass('blue')}
          >
            <List className="h-3 w-3" />
            Open list
          </button>
          <button
            type="button"
            data-testid="point-tools-open-sheet"
            onClick={() => onOpenPointList('spreadsheet')}
            className={chipButtonClass('neutral')}
          >
            Open sheet
          </button>
        </div>
      </ChipCard>

      <ChipCard
        color="teal"
        title="Point Labeling"
        icon={<Tag className="h-3.5 w-3.5" />}
        aside={<span className="text-[9px] text-slate-500">Numbering</span>}
      >
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          Choose numeric or alphabetic numbering, set the point prefix, and control the next point number used by new
          points.
        </p>
        <button
          type="button"
          data-testid="point-tools-open-labeling"
          onClick={onOpenPointLabeling}
          className={`${chipButtonClass('emerald')} w-full`}
        >
          <Tag className="h-3.5 w-3.5" />
          Open point labeling
        </button>
      </ChipCard>

      <ChipCard
        color="violet"
        title="Point Workspace"
        icon={<Wrench className="h-3.5 w-3.5" />}
        aside={<span className="text-[9px] text-slate-500">{listCount} list{listCount === 1 ? '' : 's'}</span>}
      >
        <p className="text-[10.5px] leading-relaxed text-slate-400">
          Edit and group lists, attach photos, zoom or stake out a point, and sync with Civil 3D in the full Point
          Tools dock.
        </p>
        <button
          type="button"
          data-testid="point-tools-open-workspace"
          onClick={onOpenWorkspace}
          className={`${chipButtonClass('violet')} w-full`}
        >
          <Wrench className="h-3.5 w-3.5" />
          Open Point Tools
        </button>
      </ChipCard>
    </div>
  );
};

export default A2UIPointTools;
