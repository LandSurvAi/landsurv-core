import React from 'react';

export type ScoutPose = 'stride' | 'climb' | 'vault' | 'stumble' | 'tap';

interface ScoutFigureProps {
  /** Direction of travel; the figure faces left by default. */
  direction?: 'left' | 'right';
  pose?: ScoutPose;
  className?: string;
  /** Optional aria-label override for the surrounding scene. */
  label?: string;
}

/**
 * Scout, redrawn as a field surveyor rather than a hiker: ANSI high-vis vest,
 * hard hat, work boots, a GNSS rover on a carbon pole, and a data collector.
 *
 * The rig is intentionally grouped by joint so the CSS walk cycle can rotate
 * hips, knees, shoulders, and elbows independently. All geometry is inline SVG;
 * there is no raster asset and no external font.
 */
export const ScoutFigure: React.FC<ScoutFigureProps> = ({
  direction = 'left',
  pose = 'stride',
  className = '',
  label = 'Scout, a field surveyor with a GNSS rover',
}) => (
  <svg
    data-testid="scout-figure"
    viewBox="0 0 140 220"
    role="img"
    aria-label={label}
    data-scout-figure={pose}
    className={`scout-figure ${className}`.trim()}
    style={{ transform: direction === 'right' ? 'scaleX(-1)' : undefined }}
  >
    <defs>
      <linearGradient id="scout-vest-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="scout-shirt-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#243449" />
        <stop offset="100%" stopColor="#15202f" />
      </linearGradient>
      <linearGradient id="scout-pants-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a3f45" />
        <stop offset="100%" stopColor="#22262b" />
      </linearGradient>
    </defs>

    <ellipse cx="68" cy="211" rx="30" ry="4" fill="#020617" opacity="0.48" />

    {/* Back leg */}
    <g className="scout-leg scout-leg-back">
      <path d="M64 143 L58 172 L55 197" fill="none" stroke="#2c3137" strokeWidth="11" strokeLinecap="round" />
      <path d="M55 195 L47 203 L43 209 L60 209 L64 201 Z" fill="#5b3a1b" stroke="#3f2813" strokeWidth="1.4" />
      <path d="M46 206 H59" stroke="#2b1a0c" strokeWidth="2" />
    </g>

    {/* Back arm */}
    <g className="scout-arm scout-arm-back">
      <path d="M56 112 L47 137 L43 156" fill="none" stroke="#1b2838" strokeWidth="9" strokeLinecap="round" />
      <circle cx="42" cy="158" r="4.6" fill="#e8b98d" />
    </g>

    {/* Torso and vest */}
    <path d="M53 101 Q68 95 83 101 L88 149 Q68 155 48 149 Z" fill="url(#scout-shirt-fill)" stroke="#0b1220" strokeWidth="2" />
    <path d="M52 108 Q68 103 84 108 L87 144 Q68 150 49 144 Z" fill="url(#scout-vest-fill)" stroke="#b45309" strokeWidth="1.4" />
    <path d="M52 108 Q68 103 84 108" fill="none" stroke="#fef3c7" strokeWidth="2.6" strokeLinecap="round" opacity="0.8" />
    <g stroke="#67e8f9" strokeWidth="3.2" strokeLinecap="round" opacity="0.95">
      <path d="M52.5 120 H83.2" />
      <path d="M51.4 132 H84.2" />
      <path d="M58 108 L56 144" opacity="0.7" />
      <path d="M78 108 L80 144" opacity="0.7" />
    </g>
    <path d="M53 108 L48 117 L52 126 L56 119 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
    <path d="M83 108 L88 117 L84 126 L80 119 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
    <path d="M63 118 H73 L72 130 H64 Z" fill="#1f2937" opacity="0.85" />
    <circle cx="68" cy="123" r="1.4" fill="#67e8f9" />

    {/* Belt and pouches */}
    <path d="M51 145 Q68 151 85 145" fill="none" stroke="#111827" strokeWidth="5" />
    <rect x="78" y="145" width="9" height="13" rx="2" fill="#334155" stroke="#0b1220" strokeWidth="1" />
    <rect x="49" y="145" width="8" height="10" rx="2" fill="#334155" stroke="#0b1220" strokeWidth="1" />

    {/* Head and hard hat */}
    <g className="scout-head">
      <rect x="64" y="92" width="8" height="10" fill="#e8b98d" />
      <circle cx="68" cy="83" r="12" fill="#e8b98d" stroke="#0b1220" strokeWidth="1.6" />
      <path d="M58 86 Q68 89 78 86" fill="none" stroke="#b98a62" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="63" cy="82" r="1.2" fill="#0b1220" />
      <circle cx="73" cy="82" r="1.2" fill="#0b1220" />
      <path d="M64 88 Q68 90 72 88" fill="none" stroke="#8a5a3a" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M55 77 Q55 66 68 65 Q81 66 81 77 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.6" />
      <path d="M50 77 Q68 82 86 77 Q85 73 80 73 H56 Q51 73 50 77 Z" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.6" />
      <path d="M55 73 Q68 70 81 73" fill="none" stroke="#67e8f9" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="64" y="64" width="8" height="3" rx="1.4" fill="#67e8f9" opacity="0.85" />
    </g>

    {/* Front leg */}
    <g className="scout-leg scout-leg-front">
      <path d="M72 144 L78 172 L82 197" fill="none" stroke="#40464d" strokeWidth="11" strokeLinecap="round" />
      <path d="M82 195 L76 203 L73 209 L91 209 L95 202 Z" fill="#6b4423" stroke="#3f2813" strokeWidth="1.4" />
      <path d="M75 206 H91" stroke="#2b1a0c" strokeWidth="2" />
      <path d="M72 144 L78 172" fill="none" stroke="#4b5158" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
    </g>

    {/* Front arm holding the data collector */}
    <g className="scout-arm scout-arm-front">
      <path d="M82 113 L95 133 L101 148" fill="none" stroke="#243449" strokeWidth="9" strokeLinecap="round" />
      <rect x="96" y="143" width="13" height="18" rx="2.5" fill="#0f172a" stroke="#67e8f9" strokeWidth="1.2" />
      <rect x="98.5" y="146" width="8" height="8" rx="1" fill="#67e8f9" opacity="0.75" />
      <circle cx="102" cy="158" r="1.2" fill="#67e8f9" />
      <circle cx="98" cy="151" r="4.4" fill="#e8b98d" />
    </g>

    {/* GNSS rover */}
    <g className="scout-pole">
      <line x1="111" y1="30" x2="111" y2="208" stroke="#cbd5e1" strokeWidth="2.6" strokeLinecap="round" />
      <line x1="111" y1="30" x2="111" y2="46" stroke="#64748b" strokeWidth="3.8" strokeLinecap="round" />
      <rect x="104" y="18" width="14" height="13" rx="3" fill="#fbbf24" stroke="#92400e" strokeWidth="1.2" />
      <rect x="107" y="14" width="8" height="5" rx="1.6" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      <circle cx="111" cy="24" r="2.2" fill="#67e8f9" className="scout-fix-light" />
      <path d="M111 46 L104 60 M111 46 L118 60" stroke="#94a3b8" strokeWidth="1.2" />
      <circle cx="101" cy="149" r="3.4" fill="#e8b98d" />
    </g>

    {/* Pose flourishes */}
    {pose === 'climb' && (
      <g className="scout-pose-mark" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <path d="M36 176 L44 168" />
        <path d="M34 188 L46 182" />
      </g>
    )}
    {pose === 'stumble' && (
      <g className="scout-pose-mark" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" opacity="0.8">
        <path d="M30 196 Q24 188 30 180" />
        <path d="M23 199 Q15 190 22 181" />
      </g>
    )}
    {pose === 'tap' && (
      <g className="scout-pose-mark" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <path d="M118 154 Q124 150 120 144" />
        <path d="M126 158 Q133 152 128 145" />
      </g>
    )}
  </svg>
);

export default ScoutFigure;
