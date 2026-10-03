import React, { useState, useCallback } from 'react';
import { Calculator, X, ChevronDown, ChevronUp } from 'lucide-react';

type ConversionType = 'distance' | 'area' | 'angle';

interface ConversionUnit {
  name: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

const CONVERSIONS: Record<ConversionType, { units: ConversionUnit[]; baseUnit: string }> = {
  distance: {
    baseUnit: 'feet',
    units: [
      { name: 'Feet', toBase: (v) => v, fromBase: (v) => v },
      { name: 'Meters', toBase: (v) => v * 3.28084, fromBase: (v) => v / 3.28084 },
      { name: 'Inches', toBase: (v) => v / 12, fromBase: (v) => v * 12 },
      { name: 'Yards', toBase: (v) => v * 3, fromBase: (v) => v / 3 },
      { name: 'Chains', toBase: (v) => v * 66, fromBase: (v) => v / 66 },
      { name: 'Rods', toBase: (v) => v * 16.5, fromBase: (v) => v / 16.5 },
      { name: 'Miles', toBase: (v) => v * 5280, fromBase: (v) => v / 5280 },
    ],
  },
  area: {
    baseUnit: 'sqft',
    units: [
      { name: 'Sq Feet', toBase: (v) => v, fromBase: (v) => v },
      { name: 'Sq Meters', toBase: (v) => v * 10.7639, fromBase: (v) => v / 10.7639 },
      { name: 'Acres', toBase: (v) => v * 43560, fromBase: (v) => v / 43560 },
      { name: 'Hectares', toBase: (v) => v * 107639.104, fromBase: (v) => v / 107639.104 },
      { name: 'Sq Yards', toBase: (v) => v * 9, fromBase: (v) => v / 9 },
      { name: 'Sq Miles', toBase: (v) => v * 27878400, fromBase: (v) => v / 27878400 },
    ],
  },
  angle: {
    baseUnit: 'degrees',
    units: [
      { name: 'Decimal°', toBase: (v) => v, fromBase: (v) => v },
      { name: 'Radians', toBase: (v) => v * (180 / Math.PI), fromBase: (v) => v * (Math.PI / 180) },
      { name: 'Gradians', toBase: (v) => v * 0.9, fromBase: (v) => v / 0.9 },
      { name: 'Mils', toBase: (v) => v * 0.05625, fromBase: (v) => v / 0.05625 },
    ],
  },
};

// DMS helper
const decimalToDMS = (decimal: number): string => {
  const sign = decimal < 0 ? '-' : '';
  decimal = Math.abs(decimal);
  const d = Math.floor(decimal);
  const mFloat = (decimal - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(2);
  return `${sign}${d}° ${m}' ${s}"`;
};

const dmsToDecimal = (dms: string): number | null => {
  // Parse formats like: 45° 30' 15.5" or 45-30-15.5 or 45 30 15.5
  const match = dms.match(/(-?\d+)[°\s-]+(\d+)['\s-]+(\d+\.?\d*)/);
  if (!match) return null;
  const [, d, m, s] = match;
  const decimal = Math.abs(parseFloat(d)) + parseFloat(m) / 60 + parseFloat(s) / 3600;
  return d.startsWith('-') ? -decimal : decimal;
};

export const QuickConverter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [convType, setConvType] = useState<ConversionType>('distance');
  const [inputValue, setInputValue] = useState('');
  const [fromUnit, setFromUnit] = useState(0);
  const [dmsInput, setDmsInput] = useState('');

  const units = CONVERSIONS[convType].units;

  const convertValue = useCallback((value: string, fromIdx: number) => {
    const num = parseFloat(value);
    if (isNaN(num)) return units.map(() => '');
    
    const baseValue = units[fromIdx].toBase(num);
    return units.map((unit) => {
      const converted = unit.fromBase(baseValue);
      // Smart formatting
      if (Math.abs(converted) < 0.001) return converted.toExponential(4);
      if (Math.abs(converted) >= 1000000) return converted.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return converted.toFixed(6).replace(/\.?0+$/, '');
    });
  }, [units]);

  const results = convertValue(inputValue, fromUnit);

  const handleDMSConvert = () => {
    const decimal = dmsToDecimal(dmsInput);
    if (decimal !== null) {
      setInputValue(decimal.toString());
      setFromUnit(0);
      setConvType('angle');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-gray-800/60 hover:bg-gray-700/80 text-gray-500 hover:text-gray-300 px-6 py-1 rounded-b-lg transition-all duration-200 border-x border-b border-gray-700/50"
      >
        <div className="w-8 h-0.5 bg-gray-600 rounded-full" />
      </button>
    );
  }

  return (
    <div className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-gray-700 border-t-0 rounded-b-xl shadow-2xl transition-all duration-200 ${isMinimized ? 'w-64' : 'w-80'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-b-xl rounded-t-none">
        <div className="flex items-center gap-2 text-white font-medium">
          <Calculator size={18} />
          <span>Quick Converter</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-white/80 hover:text-white p-1"
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/80 hover:text-white p-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-4 space-y-4">
          {/* Type selector */}
          <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
            {(['distance', 'area', 'angle'] as ConversionType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setConvType(type);
                  setFromUnit(0);
                  setInputValue('');
                }}
                className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-all ${
                  convType === type
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter value..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <select
                value={fromUnit}
                onChange={(e) => setFromUnit(parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {units.map((unit, idx) => (
                  <option key={unit.name} value={idx}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {units.map((unit, idx) => (
              <div
                key={unit.name}
                className={`flex justify-between items-center px-3 py-2 rounded-lg ${
                  idx === fromUnit ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-gray-800/50'
                }`}
              >
                <span className="text-gray-400 text-sm">{unit.name}</span>
                <span className="text-white font-mono text-sm">
                  {results[idx] || '—'}
                </span>
              </div>
            ))}
          </div>

          {/* DMS converter for angles */}
          {convType === 'angle' && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-500 mb-2">DMS ↔ Decimal</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dmsInput}
                  onChange={(e) => setDmsInput(e.target.value)}
                  placeholder="45° 30' 15.5&quot;"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleDMSConvert}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs"
                >
                  Convert
                </button>
              </div>
              {inputValue && convType === 'angle' && (
                <div className="mt-2 text-xs text-emerald-400 font-mono">
                  DMS: {decimalToDMS(parseFloat(inputValue) || 0)}
                </div>
              )}
            </div>
          )}

          {/* Quick reference */}
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
            <div className="flex justify-between">
              <span>1 Chain = 66 ft</span>
              <span>1 Rod = 16.5 ft</span>
            </div>
            <div className="flex justify-between">
              <span>1 Acre = 43,560 sq ft</span>
              <span>1 Mile = 5,280 ft</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickConverter;
