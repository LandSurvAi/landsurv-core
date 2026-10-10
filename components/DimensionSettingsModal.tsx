import React, { useState } from 'react';
import { XMarkIcon, UndoIcon } from './icons.tsx';

export interface DimensionStyleSettings {
    /** Overall scale multiplier for dimensions */
    scale: number;
    /** Text height in world units relative to scale */
    textHeight: number;
    /** Arrowhead size */
    arrowSize: number;
    /** Extension beyond dimension line */
    extensionLength: number;
    /** Gap from feature point to extension line origin */
    offsetFromOrigin: number;
    /** Precision of decimal values displayed (0-4) */
    precision: number;
    /** Primary dimension color (hex) */
    color: string;
    /** Arrowhead style */
    arrowStyle: 'closed' | 'open' | 'tick' | 'dot';
    /** Dimension text position relative to line */
    textPlacement: 'above' | 'centered';
    /** Suffix to append to linear distances (e.g. ', ft, m) */
    linearSuffix: string;
    /** Text sizing behavior: 'world' = fixed in world units (zoom in to enlarge), 'screen' = constant screen size */
    scalingMode: 'world' | 'screen';
}

export const DEFAULT_DIMENSION_SETTINGS: DimensionStyleSettings = {
    scale: 1.0,
    textHeight: 2.5,
    arrowSize: 8.0,
    extensionLength: 4.0,
    offsetFromOrigin: 1.5,
    precision: 2,
    color: '#00E5FF',
    arrowStyle: 'closed',
    textPlacement: 'centered',
    linearSuffix: '',
    scalingMode: 'world',
};

type HotspotParamKey = keyof DimensionStyleSettings;

interface HotspotDefinition {
    id: HotspotParamKey;
    label: string;
    description: string;
    cx: number;
    cy: number;
    r: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    options?: { label: string; value: any }[];
}

const HOTSPOTS: HotspotDefinition[] = [
    {
        id: 'textHeight',
        label: 'Text Height',
        description: 'Height of dimension text in world coordinate units.',
        cx: 300,
        cy: 90,
        r: 16,
        min: 1.0,
        max: 8.0,
        step: 0.1,
        unit: 'ft',
    },
    {
        id: 'scalingMode',
        label: 'Text Sizing Behavior',
        description: 'Fixed World Size allows you to zoom in on dimension text like CAD drawings. Constant Screen Size keeps it fixed in pixels.',
        cx: 300,
        cy: 145,
        r: 15,
        min: 0,
        max: 1,
        step: 1,
        options: [
            { label: 'Fixed World Size (Zoomable)', value: 'world' },
            { label: 'Constant Screen Pixels', value: 'screen' },
        ],
    },
    {
        id: 'textPlacement',
        label: 'Text Placement',
        description: 'Position of text relative to the dimension line (centered breaks line, above sits on top).',
        cx: 300,
        cy: 55,
        r: 14,
        min: 0,
        max: 1,
        step: 1,
        options: [
            { label: 'Centered (Breaks line)', value: 'centered' },
            { label: 'Above Line', value: 'above' },
        ],
    },
    {
        id: 'arrowSize',
        label: 'Arrowhead Size',
        description: 'Length/width of arrowheads or tick marks at dimension line termination.',
        cx: 142,
        cy: 110,
        r: 14,
        min: 3.0,
        max: 20.0,
        step: 0.5,
        unit: 'px',
    },
    {
        id: 'arrowStyle',
        label: 'Arrowhead Style',
        description: 'Type of dimension termination symbol (Standard closed arrow, architectural tick, etc).',
        cx: 458,
        cy: 110,
        r: 14,
        min: 0,
        max: 3,
        step: 1,
        options: [
            { label: 'Closed Filled', value: 'closed' },
            { label: 'Open Arrow', value: 'open' },
            { label: 'Architectural Tick', value: 'tick' },
            { label: 'Datum Dot', value: 'dot' },
        ],
    },
    {
        id: 'extensionLength',
        label: 'Extension Beyond Line',
        description: 'Overshoot distance of witness lines beyond the dimension line.',
        cx: 120,
        cy: 70,
        r: 14,
        min: 1.0,
        max: 15.0,
        step: 0.5,
        unit: 'ft',
    },
    {
        id: 'offsetFromOrigin',
        label: 'Offset from Origin',
        description: 'Gap distance between measured survey point and witness line start.',
        cx: 120,
        cy: 220,
        r: 15,
        min: 0.0,
        max: 10.0,
        step: 0.5,
        unit: 'ft',
    },
    {
        id: 'precision',
        label: 'Decimal Precision',
        description: 'Number of decimal places displayed for measured distances.',
        cx: 345,
        cy: 90,
        r: 13,
        min: 0,
        max: 4,
        step: 1,
        options: [
            { label: '0 (e.g. 125)', value: 0 },
            { label: '1 (e.g. 125.4)', value: 1 },
            { label: '2 (e.g. 125.40)', value: 2 },
            { label: '3 (e.g. 125.400)', value: 3 },
            { label: '4 (e.g. 125.4000)', value: 4 },
        ],
    },
    {
        id: 'color',
        label: 'Dimension Color',
        description: 'Primary CAD display and export color for dimension entities.',
        cx: 230,
        cy: 110,
        r: 14,
        min: 0,
        max: 0,
        step: 0,
        options: [
            { label: 'Cyan', value: '#00E5FF' },
            { label: 'Yellow', value: '#FACC15' },
            { label: 'Green', value: '#4ADE80' },
            { label: 'White', value: '#FFFFFF' },
            { label: 'Orange', value: '#FB923C' },
            { label: 'Magenta', value: '#E879F9' },
        ],
    },
];

interface DimensionSettingsModalProps {
    settings: DimensionStyleSettings;
    onChange: (settings: DimensionStyleSettings) => void;
    onClose: () => void;
}

export const DimensionSettingsModal: React.FC<DimensionSettingsModalProps> = ({
    settings,
    onChange,
    onClose,
}) => {
    const [activeParam, setActiveParam] = useState<HotspotParamKey>('textHeight');
    const [hoveredHotspot, setHoveredHotspot] = useState<HotspotParamKey | null>(null);

    const activeDef = HOTSPOTS.find(h => h.id === activeParam) || HOTSPOTS[0];

    const handleValueChange = (val: any) => {
        onChange({
            ...settings,
            [activeParam]: val,
        });
    };

    const sampleValue = (125.4038).toFixed(settings.precision) + (settings.linearSuffix ? settings.linearSuffix : "'");

    const renderArrow = (cx: number, cy: number, dir: 'left' | 'right') => {
        const size = Math.max(6, Math.min(18, settings.arrowSize));
        const color = settings.color;
        if (settings.arrowStyle === 'tick') {
            return (
                <line
                    x1={cx - size * 0.5}
                    y1={cy + size * 0.7}
                    x2={cx + size * 0.5}
                    y2={cy - size * 0.7}
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                />
            );
        }
        if (settings.arrowStyle === 'dot') {
            return (
                <circle
                    cx={cx}
                    cy={cy}
                    r={size * 0.35}
                    fill={color}
                />
            );
        }
        if (settings.arrowStyle === 'open') {
            const tipX = dir === 'left' ? cx : cx;
            const backX = dir === 'left' ? cx + size : cx - size;
            return (
                <polyline
                    points={`${backX},${cy - size * 0.35} ${tipX},${cy} ${backX},${cy + size * 0.35}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            );
        }
        // 'closed'
        const tipX = dir === 'left' ? cx : cx;
        const backX = dir === 'left' ? cx + size : cx - size;
        return (
            <polygon
                points={`${tipX},${cy} ${backX},${cy - size * 0.35} ${backX},${cy + size * 0.35}`}
                fill={color}
            />
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-gray-900 border border-cyan-500/50 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-5 py-3.5 bg-gray-950/80 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <line x1="3" y1="19" x2="21" y2="19"/>
                                <line x1="3" y1="14" x2="3" y2="24" strokeWidth="2"/><line x1="21" y1="14" x2="21" y2="24" strokeWidth="2"/>
                                <line x1="3" y1="8" x2="21" y2="8" strokeDasharray="3,2"/>
                                <line x1="6" y1="19" x2="6" y2="8" strokeOpacity="0.5"/>
                                <line x1="18" y1="19" x2="18" y2="8" strokeOpacity="0.5"/>
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide">Dimension Style &amp; Settings</h3>
                            <p className="text-[11px] text-gray-400">Interactive CAD style editor with live callout hotspots</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onChange(DEFAULT_DIMENSION_SETTINGS)}
                            className="px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 flex items-center gap-1.5 transition-colors"
                            title="Reset all settings to defaults"
                        >
                            <UndoIcon className="w-3.5 h-3.5" />
                            Defaults
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Main Content: Interactive SVG Viewport */}
                <div className="p-5 flex-1 overflow-y-auto space-y-4">
                    <div className="relative bg-gray-950 rounded-xl border border-gray-800 p-2 shadow-inner flex flex-col items-center">
                        <div className="w-full flex justify-between items-center px-2 py-1 text-[11px] text-gray-400 border-b border-gray-800/80 mb-1">
                            <span className="font-mono text-cyan-400">Click any hotspot ◉ to configure parameter</span>
                            <span className="text-gray-500">AutoCAD / Civil 3D Dimension Style</span>
                        </div>

                        {/* Interactive Dimension SVG */}
                        <svg
                            viewBox="0 0 600 270"
                            className="w-full max-w-[560px] h-auto select-none overflow-visible"
                        >
                            <defs>
                                <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                                <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                    <circle cx="2" cy="2" r="0.8" fill="#1e293b" />
                                </pattern>
                            </defs>

                            <rect width="600" height="270" fill="url(#cad-grid)" rx="8" />

                            {/* Measured Feature Point P1 and P2 */}
                            <circle cx="120" cy="240" r="4.5" fill="#10B981" />
                            <text x="105" y="258" fill="#10B981" fontSize="11" fontFamily="sans-serif" textAnchor="end">P1 (Origin)</text>

                            <circle cx="480" cy="240" r="4.5" fill="#10B981" />
                            <text x="495" y="258" fill="#10B981" fontSize="11" fontFamily="sans-serif" textAnchor="start">P2 (Target)</text>

                            {/* Measured Feature Line (Reference) */}
                            <line x1="120" y1="240" x2="480" y2="240" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />

                            {/* Witness Line 1 */}
                            {/* Origin gap: from 240 up to 240 - gap */}
                            <line
                                x1="120"
                                y1={240 - Math.min(25, settings.offsetFromOrigin * 7)}
                                x2="120"
                                y2={110 - Math.min(30, settings.extensionLength * 5)}
                                stroke={settings.color}
                                strokeWidth="1.5"
                            />

                            {/* Witness Line 2 */}
                            <line
                                x1="480"
                                y1={240 - Math.min(25, settings.offsetFromOrigin * 7)}
                                x2="480"
                                y2={110 - Math.min(30, settings.extensionLength * 5)}
                                stroke={settings.color}
                                strokeWidth="1.5"
                            />

                            {/* Dimension Line */}
                            {settings.textPlacement === 'centered' ? (
                                <>
                                    <line x1="120" y1="110" x2="240" y2="110" stroke={settings.color} strokeWidth="1.8" />
                                    <line x1="360" y1="110" x2="480" y2="110" stroke={settings.color} strokeWidth="1.8" />
                                </>
                            ) : (
                                <line x1="120" y1="110" x2="480" y2="110" stroke={settings.color} strokeWidth="1.8" />
                            )}

                            {/* Left Arrowhead */}
                            {renderArrow(120, 110, 'left')}

                            {/* Right Arrowhead */}
                            {renderArrow(480, 110, 'right')}

                            {/* Dimension Text Card */}
                            <g transform={`translate(300, ${settings.textPlacement === 'centered' ? 110 : 88})`}>
                                <rect
                                    x="-65"
                                    y="-14"
                                    width="130"
                                    height="28"
                                    fill="#090d16"
                                    stroke={activeParam === 'textHeight' || activeParam === 'precision' ? '#00E5FF' : '#1e293b'}
                                    strokeWidth="1.5"
                                    rx="5"
                                />
                                <text
                                    x="0"
                                    y="5"
                                    textAnchor="middle"
                                    fill={settings.color}
                                    fontSize={Math.max(12, Math.min(22, 12 * (settings.textHeight / 2.5)))}
                                    fontWeight="bold"
                                    fontFamily="monospace"
                                >
                                    {sampleValue}
                                </text>
                            </g>

                            {/* Dynamic Hotspots Overlay */}
                            {HOTSPOTS.map(h => {
                                const isSelected = activeParam === h.id;
                                const isHovered = hoveredHotspot === h.id;
                                return (
                                    <g
                                        key={h.id}
                                        className="cursor-pointer transition-all"
                                        onClick={() => setActiveParam(h.id)}
                                        onMouseEnter={() => setHoveredHotspot(h.id)}
                                        onMouseLeave={() => setHoveredHotspot(null)}
                                    >
                                        {/* Outer pulse circle when selected */}
                                        {isSelected && (
                                            <circle
                                                cx={h.cx}
                                                cy={h.cy}
                                                r={h.r + 7}
                                                fill="none"
                                                stroke="#00E5FF"
                                                strokeWidth="1.8"
                                                strokeDasharray="3 3"
                                                className="animate-spin"
                                                style={{ animationDuration: '6s' }}
                                            />
                                        )}
                                        {/* Hotspot hit circle */}
                                        <circle
                                            cx={h.cx}
                                            cy={h.cy}
                                            r={h.r}
                                            fill={isSelected ? 'rgba(0, 229, 255, 0.35)' : isHovered ? 'rgba(245, 158, 11, 0.4)' : 'rgba(30, 41, 59, 0.7)'}
                                            stroke={isSelected ? '#00E5FF' : isHovered ? '#F59E0B' : 'rgba(148, 163, 184, 0.6)'}
                                            strokeWidth={isSelected ? 2.2 : 1.4}
                                        />
                                        {/* Inner marker */}
                                        <circle
                                            cx={h.cx}
                                            cy={h.cy}
                                            r="3.5"
                                            fill={isSelected ? '#00E5FF' : isHovered ? '#F59E0B' : '#94A3B8'}
                                        />
                                        {/* Tooltip callout badge */}
                                        <g transform={`translate(${h.cx}, ${h.cy - h.r - 8})`}>
                                            <rect
                                                x="-35"
                                                y="-16"
                                                width="70"
                                                height="18"
                                                fill={isSelected ? '#00E5FF' : '#1e293b'}
                                                rx="4"
                                                opacity={isSelected || isHovered ? 1 : 0.85}
                                            />
                                            <text
                                                x="0"
                                                y="-4"
                                                textAnchor="middle"
                                                fill={isSelected ? '#090d16' : '#f1f5f9'}
                                                fontSize="9"
                                                fontWeight="600"
                                                fontFamily="sans-serif"
                                            >
                                                {h.label.split(' ')[0]}
                                            </text>
                                        </g>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    {/* Active Parameter Quick-Edit Card */}
                    <div className="bg-gray-800/80 rounded-xl border border-gray-700/80 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-700/60 pb-2">
                            <div>
                                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Active Parameter</span>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    {activeDef.label}
                                    <span className="text-xs font-mono text-cyan-300 bg-gray-900 px-2 py-0.5 rounded border border-gray-700">
                                        Current: {String(settings[activeParam])}{activeDef.unit ? ` ${activeDef.unit}` : ''}
                                    </span>
                                </h4>
                            </div>
                            <span className="text-xs text-gray-400 max-w-[240px] text-right">{activeDef.description}</span>
                        </div>

                        {/* Control widget based on parameter type */}
                        {activeDef.options ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {activeDef.options.map(opt => (
                                    <button
                                        key={String(opt.value)}
                                        type="button"
                                        onClick={() => handleValueChange(opt.value)}
                                        className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                                            settings[activeParam] === opt.value
                                                ? 'bg-cyan-600 border-cyan-400 text-white shadow-md'
                                                : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-700'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        ) : activeParam === 'color' ? (
                            <div className="flex items-center gap-3">
                                {['#00E5FF', '#FACC15', '#4ADE80', '#FFFFFF', '#FB923C', '#E879F9'].map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => handleValueChange(c)}
                                        style={{ backgroundColor: c }}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform ${
                                            settings.color === c ? 'scale-110 border-white ring-2 ring-cyan-500' : 'border-transparent hover:scale-105'
                                        }`}
                                    />
                                ))}
                                <input
                                    type="color"
                                    value={settings.color}
                                    onChange={e => handleValueChange(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min={activeDef.min}
                                        max={activeDef.max}
                                        step={activeDef.step}
                                        value={Number(settings[activeParam])}
                                        onChange={e => handleValueChange(parseFloat(e.target.value))}
                                        className="flex-1 accent-cyan-400 cursor-pointer h-2 bg-gray-700 rounded-lg"
                                    />
                                    <div className="flex items-center gap-1 w-24">
                                        <input
                                            type="number"
                                            min={activeDef.min}
                                            max={activeDef.max}
                                            step={activeDef.step}
                                            value={Number(settings[activeParam])}
                                            onChange={e => handleValueChange(parseFloat(e.target.value) || 0)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono text-right focus:outline-none focus:border-cyan-400"
                                        />
                                        <span className="text-xs text-gray-400 font-mono">{activeDef.unit || ''}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Overall Scale Multiplier slider */}
                        <div className="pt-2 border-t border-gray-700/60 flex items-center justify-between text-xs text-gray-300">
                            <span className="font-medium text-gray-400">Master Dimension Scale:</span>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0.25"
                                    max="5.0"
                                    step="0.05"
                                    value={settings.scale}
                                    onChange={e => onChange({ ...settings, scale: parseFloat(e.target.value) })}
                                    className="w-36 accent-cyan-400 cursor-pointer h-1.5 bg-gray-700 rounded"
                                />
                                <span className="font-mono text-cyan-300 w-12 text-right">{settings.scale.toFixed(2)}x</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-950/80 border-t border-gray-800 flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">Settings automatically saved and applied to all dimensions.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-md"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
