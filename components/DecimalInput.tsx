import React, { useEffect, useRef, useState } from 'react';

export interface DecimalInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'
  > {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  'data-testid'?: string;
}

/** Allows intermediate text such as "", "-", ".", "0." while typing. */
const PARTIAL_DECIMAL = /^-?(?:\d*\.?\d*)$/;

/**
 * Number input that keeps a text draft while editing, so decimals can be typed
 * one character at a time instead of being clamped back to an integer on every
 * keystroke. The parsed value is clamped to min/max and committed live; blur
 * normalizes the displayed text.
 */
export const DecimalInput: React.FC<DecimalInputProps> = ({
  value,
  onValueChange,
  min,
  max,
  onFocus,
  onBlur,
  ...inputProps
}) => {
  const [text, setText] = useState(() => String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  const clamp = (next: number) => {
    let clamped = next;
    if (typeof min === 'number') clamped = Math.max(min, clamped);
    if (typeof max === 'number') clamped = Math.min(max, clamped);
    return clamped;
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.replace(/,/g, '.');
    if (!PARTIAL_DECIMAL.test(raw)) return;
    setText(raw);
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onValueChange(clamp(parsed));
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const trimmed = text.trim();
    const isPartial = trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.';
    const parsed = isPartial ? NaN : Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
    } else {
      const next = clamp(parsed);
      setText(String(next));
      if (next !== value) onValueChange(next);
    }
    onBlur?.(event);
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      onFocus={event => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};

export default DecimalInput;
