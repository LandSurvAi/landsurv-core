import React, { useMemo } from 'react';
import type {
  AnnotationCategoryStyle,
  AnnotationTextStyle,
  CanvasTextAnnotation,
} from '../types.ts';
import {
  LEROY_STANDARD_SIZES,
  formatLeroySize,
  leroyToScreenPx,
  nearestLeroySize,
  resolveAnnotationMask,
} from '../utils/annotationSizing.ts';
import { ANNOTATION_FONT_OPTIONS } from '../utils/annotationFonts.ts';

export interface TextPropertiesSectionProps {
  annotations: CanvasTextAnnotation[];
  styles: AnnotationTextStyle[];
  categories: AnnotationCategoryStyle[];
  availableLayers?: string[];
  onUpdate: (ids: string[], patch: Partial<CanvasTextAnnotation>) => void;
  onDelete: (ids: string[]) => void;
}

const fieldClass =
  'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 font-mono text-cyan-200 outline-none focus:border-cyan-500';
const labelClass = 'mb-1 block text-[10px] uppercase tracking-wider text-gray-400';

const common = <T,>(values: T[]): { value: T | undefined; mixed: boolean } => {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  const same = values.every(value => value === first);
  return { value: same ? first : undefined, mixed: !same };
};

const styleHeight = (
  annotation: CanvasTextAnnotation,
  styles: AnnotationTextStyle[],
  categories: AnnotationCategoryStyle[],
): number => {
  if (Number.isFinite(annotation.height) && (annotation.height ?? 0) > 0) return annotation.height as number;
  const style = styles.find(item => item.name === annotation.styleName) ?? styles[0];
  if (style?.height) return style.height;
  const category = categories.find(item => item.id === (annotation.categoryId ?? 'manual-text'));
  return category?.heightPx ?? leroyToScreenPx(80);
};

/**
 * Text half of the shared Properties panel. It accepts an array of ids so
 * multi-object selection can use the same component and patch path as the
 * linework section.
 */
export const TextPropertiesSection: React.FC<TextPropertiesSectionProps> = ({
  annotations,
  styles,
  categories,
  availableLayers = [],
  onUpdate,
  onDelete,
}) => {
  const ids = useMemo(() => annotations.map(annotation => annotation.id), [annotations]);
  const idSet = new Set(ids);
  if (ids.length === 0) return null;

  const count = annotations.length;
  const single = count === 1 ? annotations[0] : null;
  const styleValue = common(annotations.map(annotation => annotation.styleName ?? ''));
  const categoryValue = common(annotations.map(annotation => annotation.categoryId ?? 'manual-text'));
  const fontValue = common(annotations.map(annotation => annotation.fontFamily ?? ''));
  const heightValue = common(annotations.map(annotation => styleHeight(annotation, styles, categories)));
  const leroyValue = common(annotations.map(annotation => {
    if (annotation.leroySize) return annotation.leroySize;
    if (annotation.height) return nearestLeroySize(annotation.height);
    return null;
  }));
  const scaleValue = common(annotations.map(annotation => annotation.scale ?? 1));
  const angleValue = common(annotations.map(annotation => annotation.angle));
  const colorValue = common(annotations.map(annotation => annotation.color ?? ''));
  const layerValue = common(annotations.map(annotation => annotation.layer ?? ''));
  const hiddenValue = common(annotations.map(annotation => annotation.hidden === true));
  const maskEnabledValue = common(annotations.map(annotation => resolveAnnotationMask(annotation, categories.find(category => category.id === (annotation.categoryId ?? 'manual-text'))).enabled));
  const maskPaddingValue = common(annotations.map(annotation => resolveAnnotationMask(annotation, categories.find(category => category.id === (annotation.categoryId ?? 'manual-text'))).padding));
  const maskColorValue = common(annotations.map(annotation => resolveAnnotationMask(annotation, categories.find(category => category.id === (annotation.categoryId ?? 'manual-text'))).color ?? ''));
  const maskOpacityValue = common(annotations.map(annotation => resolveAnnotationMask(annotation, categories.find(category => category.id === (annotation.categoryId ?? 'manual-text'))).opacity));
  const contentValue = common(annotations.map(annotation => annotation.text));

  const mixed = <span className="text-amber-300/90">(mixed)</span>;

  return (
    <div data-testid="properties-text-section" className="space-y-3 rounded-lg border border-cyan-700/40 bg-cyan-950/10 p-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-400">Text</div>
          <div className="font-semibold text-gray-100">
            {count === 1 ? '1 text object' : `${count} text objects`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(ids)}
          className="rounded border border-red-700/60 bg-red-950/50 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-900/50"
        >
          Delete text
        </button>
      </div>

      {single ? (
        <div className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded border border-gray-700/60 bg-gray-900/70 px-2 py-1.5 font-mono text-[10px] text-gray-300">
          {contentValue.value || '(empty)'}
        </div>
      ) : (
        <div className="text-[10px] text-gray-400">Editing shared typography for the selected text objects. Content stays unchanged.</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Style</span>
          <select
            aria-label="Text style"
            value={styleValue.value ?? '__mixed__'}
            onChange={event => {
              if (event.target.value !== '__mixed__') onUpdate(ids, { styleName: event.target.value });
            }}
            className={fieldClass}
          >
            {styleValue.mixed && <option value="__mixed__" disabled>(mixed)</option>}
            <option value="">Active style</option>
            {styles.map(style => <option key={style.id} value={style.name}>{style.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Category</span>
          <select
            aria-label="Text category"
            value={categoryValue.value ?? '__mixed__'}
            onChange={event => {
              if (event.target.value !== '__mixed__') onUpdate(ids, { categoryId: event.target.value });
            }}
            className={fieldClass}
          >
            {categoryValue.mixed && <option value="__mixed__" disabled>(mixed)</option>}
            {categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Font</span>
          <input
            aria-label="Text font"
            list="properties-text-font-options"
            value={fontValue.value ?? ''}
            placeholder={fontValue.mixed ? 'mixed' : 'Style font'}
            onChange={event => onUpdate(ids, { fontFamily: event.target.value || undefined })}
            className={fieldClass}
          />
          <datalist id="properties-text-font-options">
            {ANNOTATION_FONT_OPTIONS.map(font => <option key={font} value={font} />)}
          </datalist>
        </label>
        <label className="block">
          <span className={labelClass}>Leroy reference</span>
          <select
            aria-label="Leroy text size"
            value={leroyValue.value ?? ''}
            onChange={event => {
              const leroy = Number(event.target.value);
              if (Number.isFinite(leroy) && leroy > 0) {
                onUpdate(ids, { height: leroyToScreenPx(leroy), leroySize: leroy });
              }
            }}
            className={fieldClass}
          >
            <option value="">{leroyValue.mixed ? '(mixed)' : 'Custom / style'}</option>
            {LEROY_STANDARD_SIZES.map(size => (
              <option key={size} value={size}>{formatLeroySize(size)} · {leroyToScreenPx(size)} px</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className={labelClass}>Height px</span>
          <input
            aria-label="Text height"
            type="number"
            min={4}
            max={96}
            step={0.1}
            value={heightValue.value ?? ''}
            placeholder={heightValue.mixed ? 'mixed' : '9.6'}
            onChange={event => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) {
                onUpdate(ids, { height: value, leroySize: nearestLeroySize(value) });
              }
            }}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Scale</span>
          <input
            aria-label="Text scale"
            type="number"
            min={0.1}
            max={5}
            step={0.05}
            value={scaleValue.value ?? ''}
            placeholder={scaleValue.mixed ? 'mixed' : '1'}
            onChange={event => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) onUpdate(ids, { scale: value });
            }}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Rotation°</span>
          <input
            aria-label="Text rotation"
            type="number"
            step={1}
            value={angleValue.value ?? ''}
            placeholder={angleValue.mixed ? 'mixed' : '0'}
            onChange={event => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) onUpdate(ids, { angle: value });
            }}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Color</span>
          <div className="flex items-center gap-1">
            <input
              aria-label="Text color"
              type="color"
              value={colorValue.value || '#e2e8f0'}
              onChange={event => onUpdate(ids, { color: event.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-gray-600 bg-gray-800 p-0.5"
            />
            <button
              type="button"
              onClick={() => onUpdate(ids, { color: undefined })}
              className={`rounded border px-1.5 py-1 text-[10px] ${!colorValue.value ? 'border-cyan-500/60 bg-cyan-950/50 text-cyan-200' : 'border-gray-600 text-gray-300 hover:bg-gray-800'}`}
              title="Use the text style color"
            >
              ByStyle
            </button>
          </div>
        </label>
        <label className="block">
          <span className={labelClass}>Layer</span>
          <select
            aria-label="Text layer"
            value={layerValue.value ?? '__mixed__'}
            onChange={event => {
              if (event.target.value !== '__mixed__') onUpdate(ids, { layer: event.target.value || undefined });
            }}
            className={fieldClass}
          >
            {layerValue.mixed && <option value="__mixed__" disabled>(mixed)</option>}
            <option value="">(no layer)</option>
            {Array.from(new Set([...availableLayers, layerValue.value].filter(Boolean) as string[]))
              .sort((a, b) => a.localeCompare(b))
              .map(layer => <option key={layer} value={layer}>{layer}</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-2 rounded border border-gray-700/60 bg-gray-900/60 p-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">Background wipeout</span>
          <input
            aria-label="Text background wipeout"
            type="checkbox"
            checked={maskEnabledValue.value === true}
            ref={element => {
              if (element) element.indeterminate = maskEnabledValue.mixed;
            }}
            onChange={event => onUpdate(ids, { maskEnabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-cyan-400"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className={labelClass}>Pad px</span>
            <input
              aria-label="Wipeout padding"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={maskPaddingValue.value ?? ''}
              placeholder={maskPaddingValue.mixed ? 'mixed' : '2'}
              onChange={event => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 0) onUpdate(ids, { maskPadding: value });
              }}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Opacity</span>
            <input
              aria-label="Wipeout opacity"
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={maskOpacityValue.value ?? ''}
              placeholder={maskOpacityValue.mixed ? 'mixed' : '0.88'}
              onChange={event => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0 && value <= 1) onUpdate(ids, { maskOpacity: value });
              }}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Color</span>
            <div className="flex items-center gap-1">
              <input
                aria-label="Wipeout color"
                type="color"
                value={maskColorValue.value || '#0b1220'}
                onChange={event => onUpdate(ids, { maskColor: event.target.value })}
                className="h-8 w-8 cursor-pointer rounded border border-gray-600 bg-gray-800 p-0.5"
              />
              <button
                type="button"
                onClick={() => onUpdate(ids, { maskColor: undefined })}
                className="rounded border border-gray-600 px-1 py-1 text-[9px] text-gray-300 hover:bg-gray-800"
              >
                Auto
              </button>
            </div>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-700/60 pt-2">
        <button
          type="button"
          onClick={() => onUpdate(ids, { hidden: !(hiddenValue.value ?? false) })}
          className="rounded border border-gray-600 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-800"
        >
          {hiddenValue.value ? 'Show text' : 'Hide text'}
        </button>
        {hiddenValue.mixed && <span className="text-[10px] text-gray-500">Visibility mixed</span>}
        {single && <span className="ml-auto font-mono text-[9px] text-gray-500">{single.id.slice(0, 18)}</span>}
      </div>
    </div>
  );
};

export default TextPropertiesSection;
