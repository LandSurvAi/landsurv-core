import React from 'react';
import type { SymbolTextElement } from '../../contexts/types/CadManager.types';

export interface SymbolSvgProps {
  svgPath: string;
  fillPath?: string;
  texts?: SymbolTextElement[];
  viewBox?: string;
  size?: number | string;
  className?: string;
  strokeWidth?: number;
}

/**
 * Shared SVG renderer for CAD blocks / survey symbols.
 * Renders:
 * 1. `svgPath` as crisp stroked CAD linework
 * 2. `fillPath` as solid filled geometry (evenodd rule for compound holes)
 * 3. `texts` as true SVG <text> typography (no path approximations)
 */
export const SymbolSvg: React.FC<SymbolSvgProps> = ({
  svgPath,
  fillPath,
  texts,
  viewBox = '0 0 24 24',
  size,
  className = '',
  strokeWidth = 1.5,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox || '0 0 24 24'}
      className={className}
    >
      {svgPath && (
        <path
          d={svgPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {fillPath && (
        <path
          d={fillPath}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
        />
      )}
      {texts && texts.map((t, idx) => (
        <text
          key={idx}
          x={t.x}
          y={t.y}
          fontSize={t.fontSize}
          fontWeight={t.fontWeight || 'bold'}
          fontFamily={t.fontFamily || "'Arial', 'Helvetica Neue', sans-serif"}
          textAnchor={t.anchor || 'middle'}
          dominantBaseline="central"
          fill="currentColor"
          stroke="none"
          style={{ userSelect: 'none', letterSpacing: '-0.02em' }}
          transform={t.rotation ? `rotate(${t.rotation} ${t.x} ${t.y})` : undefined}
        >
          {t.text}
        </text>
      ))}
    </svg>
  );
};

export default SymbolSvg;
