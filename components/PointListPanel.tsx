import React, { useState, useRef, useCallback, useEffect } from 'react';
import { type SurveyPoint, type PointList } from '../types.ts';
import { XMarkIcon, ChevronUpIcon, ChevronDownIcon, MapPinIcon, ZoomToPointIcon, CpuChipIcon, EyeIcon, EyeSlashIcon } from './icons.tsx';

interface PointListPanelProps {
    pointLists: PointList[];
    onClose: () => void;
    onZoomToPoint: (point: SurveyPoint) => void;
    onToggleContext?: (listId: string) => void;
}

interface DragState {
    dragging: boolean;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
}

function getDefaultPos(): { x: number; y: number } {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: Math.max(0, w - 460), y: Math.max(0, h - 500) };
}

export const PointListPanel: React.FC<PointListPanelProps & { onTogglePointListVisibility?: (listId: string) => void }> = ({ pointLists, onClose, onZoomToPoint, onToggleContext, onTogglePointListVisibility }) => {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedListIds, setExpandedListIds] = useState<Set<string>>(new Set(['working']));
    const dragState = useRef<DragState>({ dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

    const currentPos = pos || getDefaultPos();

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragState.current = {
            dragging: true,
            startX: e.clientX,
            startY: e.clientY,
            startPosX: currentPos.x,
            startPosY: currentPos.y,
        };
        const onMove = (ev: MouseEvent) => {
            if (!dragState.current.dragging) return;
            setPos({
                x: dragState.current.startPosX + (ev.clientX - dragState.current.startX),
                y: dragState.current.startPosY + (ev.clientY - dragState.current.startY),
            });
        };
        const onUp = () => {
            dragState.current.dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [currentPos]);

    // All points flattened, filtered by search
    const allPoints = pointLists.flatMap(l => l.points.map(p => ({ ...p, _listName: l.name, _listId: l.id })));
    const q = search.trim().toLowerCase();
    const filteredPoints = q
        ? allPoints.filter(p =>
            p.pointNumber.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.layer || '').toLowerCase().includes(q)
          )
        : null; // null = show per-list view

    const totalCount = allPoints.length;

    return (
        <div
            className="fixed z-30 bg-gray-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-2xl"
            style={{ left: currentPos.x, top: currentPos.y, width: 440 }}
        >
            {/* Header / drag handle */}
            <div
                className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none border-b border-cyan-500/20 rounded-t-xl"
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-2">
                    <MapPinIcon className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-cyan-300 text-sm">Point List</span>
                    <span className="text-xs text-gray-400">{totalCount} points</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsExpanded(p => !p)} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white" title={isExpanded ? 'Collapse' : 'Expand'}>
                        {isExpanded ? <ChevronUpIcon className="w-4 h-4"/> : <ChevronDownIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white" title="Close">
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="flex flex-col" style={{ maxHeight: 400 }}>
                    {/* Search bar */}
                    <div className="p-2 border-b border-gray-700/50">
                        <input
                            type="text"
                            placeholder="Search by PN, description, layer…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                        />
                    </div>

                    <div className="overflow-y-auto flex-1">
                        {filteredPoints ? (
                            /* Search results: flat list */
                            filteredPoints.length === 0 ? (
                                <p className="p-4 text-xs text-gray-500 text-center">No points match "{search}"</p>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-gray-800 text-gray-400 uppercase">
                                        <tr>
                                            <th className="px-3 py-1.5 text-left">PN</th>
                                            <th className="px-3 py-1.5 text-left">N</th>
                                            <th className="px-3 py-1.5 text-left">E</th>
                                            <th className="px-3 py-1.5 text-left">Z</th>
                                            <th className="px-3 py-1.5 text-left">Desc / Layer</th>
                                            <th className="px-3 py-1.5"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPoints.map(p => (
                                            <PointRow key={`${p._listId}-${p.pointNumber}`} point={p} onZoomToPoint={onZoomToPoint} />
                                        ))}
                                    </tbody>
                                </table>
                            )
                        ) : (
                            /* Normal view: per-list sections */
                            pointLists.map(list => {
                                const isOpen = expandedListIds.has(list.id);
                                return (
                                    <div key={list.id} className="border-b border-gray-700/40 last:border-0">
                                        <button
                                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/50 text-left"
                                            onClick={() => setExpandedListIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(list.id)) next.delete(list.id); else next.add(list.id);
                                                return next;
                                            })}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-gray-200">{list.name}</span>
                                                <span className="text-[10px] text-gray-500">{list.points.length} pts</span>
                                                {typeof list.isVisible !== 'undefined' && onTogglePointListVisibility && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); onTogglePointListVisibility(list.id); }}
                                                        className="ml-1 p-1 rounded-full hover:bg-gray-800/60"
                                                        title={list.isVisible ? 'Hide list' : 'Show list'}
                                                    >
                                                        {list.isVisible ? (
                                                            <EyeIcon className="w-4 h-4 text-cyan-400" />
                                                        ) : (
                                                            <EyeSlashIcon className="w-4 h-4 text-gray-500" />
                                                        )}
                                                    </button>
                                                )}
                                                {!list.isVisible && <span className="text-[10px] text-yellow-500">(hidden)</span>}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {onToggleContext && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); onToggleContext(list.id); }}
                                                        className={`p-1 rounded-full ${list.includeInContext !== false ? 'text-cyan-400' : 'text-gray-600'} hover:bg-cyan-900/40`}
                                                        title={list.includeInContext !== false ? 'In agent context (click to exclude)' : 'Excluded from agent context (click to include)'}
                                                    >
                                                        <CpuChipIcon className="w-3 h-3"/>
                                                    </button>
                                                )}
                                                {isOpen ? <ChevronUpIcon className="w-3.5 h-3.5 text-gray-500"/> : <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500"/>}
                                            </div>
                                        </button>
                                        {isOpen && list.points.length > 0 && (
                                            <table className="w-full text-xs border-t border-gray-700/30">
                                                <thead className="bg-gray-800/50 text-gray-500 uppercase text-[10px]">
                                                    <tr>
                                                        <th className="px-3 py-1 text-left">PN</th>
                                                        <th className="px-3 py-1 text-left">Northing</th>
                                                        <th className="px-3 py-1 text-left">Easting</th>
                                                        <th className="px-3 py-1 text-left">Z</th>
                                                        <th className="px-3 py-1 text-left">Desc</th>
                                                        <th className="px-3 py-1"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {list.points.map(p => (
                                                        <PointRow key={p.pointNumber} point={p} onZoomToPoint={onZoomToPoint} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                        {isOpen && list.points.length === 0 && (
                                            <p className="px-3 py-2 text-[11px] text-gray-600">No points in this list.</p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const PointRow: React.FC<{ point: SurveyPoint; onZoomToPoint: (p: SurveyPoint) => void }> = ({ point, onZoomToPoint }) => (
    <tr className="border-b border-gray-700/30 hover:bg-gray-800/40">
        <td className="px-3 py-1.5 font-mono font-bold text-gray-200">{point.pointNumber}</td>
        <td className="px-3 py-1.5 font-mono text-gray-300">{point.northing.toFixed(2)}</td>
        <td className="px-3 py-1.5 font-mono text-gray-300">{point.easting.toFixed(2)}</td>
        <td className="px-3 py-1.5 font-mono text-gray-400">{(point.elevation ?? 0).toFixed(2)}</td>
        <td className="px-3 py-1.5 max-w-[120px]">
            {point.description && <span className="text-gray-300 truncate block">{point.description}</span>}
            {point.layer && <span className="text-[10px] font-mono text-cyan-500 bg-cyan-900/30 px-1 rounded">{point.layer}</span>}
        </td>
        <td className="px-2 py-1.5">
            {/* Only show zoom icon, removed old eye icon */}
            <button onClick={() => onZoomToPoint(point)} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-cyan-400" title="Zoom to point">
                <ZoomToPointIcon className="w-3.5 h-3.5"/>
            </button>
        </td>
    </tr>
);
