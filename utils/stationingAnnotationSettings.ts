import type { Centerline, Settings, StationingSettings } from '../types';

/**
 * A validated stationing-annotation change. Global display fields apply to
 * every baseline, including baselines created later. Offset and 180° rotation
 * can be scoped to one named baseline.
 */
export interface StationingAnnotationPatch {
  showStationLabels?: boolean;
  labelInterval?: number;
  pointInterval?: number;
  showStationPrefix?: boolean;
  stationPrefix?: string;
  stationSuffix?: string;
  stationLabelFormat?: 'hundreds' | 'decimal';
  stationPrecision?: 0 | 1 | 2;
  labelScale?: number;
  labelOffsetPx?: number;
  labelRotationDeg?: 0 | 180;
  showLabelBackground?: boolean;
  showGeometryLabels?: boolean;
  showPiLabels?: boolean;
  showPcPtLabels?: boolean;
  showEndpointLabels?: boolean;
  showStationPointLabels?: boolean;
  targetBaselineName?: string;
  resetBaselineOverrides?: boolean;
}

export interface StationingAnnotationApplyResult {
  ok: boolean;
  settings: Settings;
  centerline?: Centerline;
  summary: string[];
  error?: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'on', 'yes', 'show', 'shown', 'visible', 'enabled'].includes(normalized)) return true;
    if (['false', 'off', 'no', 'hide', 'hidden', 'disabled'].includes(normalized)) return false;
  }
  return undefined;
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const asText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, 24);
};

/** Resolve the requested baseline; undefined means every/global. */
export const resolveStationingTarget = (
  centerlines: Centerline[],
  name?: string,
): Centerline | null | undefined => {
  if (!name || !name.trim()) return undefined;
  const target = name.trim().toLowerCase();
  const exact = centerlines.find(centerline => centerline.name?.trim().toLowerCase() === target);
  if (exact) return exact;
  return (
    centerlines.find(centerline => {
      const actual = centerline.name?.trim().toLowerCase() ?? '';
      return actual.includes(target) || target.includes(actual);
    }) ?? null
  );
};

/** Validate an object emitted by the model or a CACP peer. */
export const normalizeStationingAnnotationPatch = (
  raw: unknown,
): StationingAnnotationPatch | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const patch: StationingAnnotationPatch = {};

  const readBoolean = (keys: string[]) => {
    for (const key of keys) {
      const parsed = asBoolean(value[key]);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  };

  const showStationLabels = readBoolean(['showStationLabels', 'showLabels', 'labels']);
  if (showStationLabels !== undefined) patch.showStationLabels = showStationLabels;

  const labelInterval = asNumber(value.labelInterval ?? value.labelSpacingFt);
  if (labelInterval !== undefined) patch.labelInterval = clamp(labelInterval, 1, 1000);

  const pointInterval = asNumber(value.pointInterval ?? value.stationPointInterval);
  if (pointInterval !== undefined) patch.pointInterval = clamp(pointInterval, 1, 1000);

  const showStationPrefix = readBoolean(['showStationPrefix', 'showPrefix']);
  if (showStationPrefix !== undefined) patch.showStationPrefix = showStationPrefix;

  const stationPrefix = value.stationPrefix ?? value.prefix;
  if (stationPrefix !== undefined) {
    const text = asText(stationPrefix);
    if (text !== undefined) {
      const normalized = text.toLowerCase();
      if (['none', 'off', 'no', 'false', 'nothing'].includes(normalized)) {
        patch.showStationPrefix = false;
        patch.stationPrefix = '';
      } else if (text) {
        patch.stationPrefix = text;
        patch.showStationPrefix = true;
      }
    }
  }

  const stationSuffix = value.stationSuffix ?? value.suffix;
  if (stationSuffix !== undefined) {
    const text = asText(stationSuffix);
    if (text !== undefined) {
      patch.stationSuffix = ['none', 'off', 'no', 'false', 'nothing'].includes(text.toLowerCase()) ? '' : text;
    }
  }

  const rawFormat = value.stationLabelFormat ?? value.format ?? value.stationFormat;
  if (typeof rawFormat === 'string') {
    const format = rawFormat.trim().toLowerCase();
    if (['decimal', 'decimal feet', 'feet', 'number'].includes(format)) {
      patch.stationLabelFormat = 'decimal';
    } else if (['hundreds', 'survey', 'station', '1+00', 'hundredths'].includes(format)) {
      patch.stationLabelFormat = 'hundreds';
    }
  }

  const precision = asNumber(value.stationPrecision ?? value.precision);
  if (precision !== undefined) {
    patch.stationPrecision = clamp(Math.round(precision), 0, 2) as 0 | 1 | 2;
  }

  const scale = asNumber(value.labelScale ?? value.textScale);
  if (scale !== undefined) patch.labelScale = clamp(scale, 0.25, 4);

  const offset = asNumber(value.labelOffsetPx ?? value.labelOffset ?? value.offsetPx);
  if (offset !== undefined) patch.labelOffsetPx = clamp(offset, -600, 600);

  const rotation = asNumber(value.labelRotationDeg ?? value.labelRotation ?? value.rotationDeg);
  if (rotation !== undefined) {
    patch.labelRotationDeg = ((rotation % 360) + 360) % 360 === 180 ? 180 : 0;
  } else if (value.flipLabels !== undefined) {
    const flip = asBoolean(value.flipLabels);
    if (flip !== undefined) patch.labelRotationDeg = flip ? 180 : 0;
  }

  const showLabelBackground = readBoolean(['showLabelBackground', 'labelBackground']);
  if (showLabelBackground !== undefined) patch.showLabelBackground = showLabelBackground;

  const showGeometryLabels = readBoolean(['showGeometryLabels', 'geometryTags']);
  if (showGeometryLabels !== undefined) patch.showGeometryLabels = showGeometryLabels;

  const showPiLabels = readBoolean(['showPiLabels', 'piLabels']);
  if (showPiLabels !== undefined) {
    patch.showPiLabels = showPiLabels;
    if (showPiLabels) patch.showGeometryLabels = true;
  }

  const showPcPtLabels = readBoolean(['showPcPtLabels', 'pcptLabels', 'pcPtLabels']);
  if (showPcPtLabels !== undefined) {
    patch.showPcPtLabels = showPcPtLabels;
    if (showPcPtLabels) patch.showGeometryLabels = true;
  }

  const showEndpointLabels = readBoolean(['showEndpointLabels', 'endpointLabels', 'bopEopLabels']);
  if (showEndpointLabels !== undefined) {
    patch.showEndpointLabels = showEndpointLabels;
    if (showEndpointLabels) patch.showGeometryLabels = true;
  }

  const showStationPointLabels = readBoolean(['showStationPointLabels', 'stationPointLabels']);
  if (showStationPointLabels !== undefined) patch.showStationPointLabels = showStationPointLabels;

  const targetBaselineName = asText(
    value.targetBaselineName ?? value.baselineName ?? value.centerlineName,
  );
  if (targetBaselineName) patch.targetBaselineName = targetBaselineName;

  const resetBaselineOverrides = readBoolean(['resetBaselineOverrides', 'resetOverrides']);
  if (resetBaselineOverrides !== undefined) patch.resetBaselineOverrides = resetBaselineOverrides;

  const meaningfulKeys = Object.keys(patch).filter(key => key !== 'targetBaselineName');
  return meaningfulKeys.length > 0 ? patch : null;
};

/** Human-readable confirmation for the chat and fieldbook. */
export const describeStationingAnnotationPatch = (
  patch: StationingAnnotationPatch,
  target?: Centerline,
): string[] => {
  const summary: string[] = [];
  const scope = target ? ` on ${target.name}` : ' on every baseline';

  if (patch.showStationLabels !== undefined) {
    summary.push(`Station labels ${patch.showStationLabels ? 'shown' : 'hidden'}${scope}.`);
  }
  if (patch.showStationPrefix !== undefined) {
    summary.push(
      patch.showStationPrefix
        ? `Station prefix shown as “${patch.stationPrefix?.trim() || 'STA'}”${scope}.`
        : `Station prefix hidden${scope}.`,
    );
  } else if (patch.stationPrefix !== undefined) {
    summary.push(`Station prefix set to “${patch.stationPrefix || 'none'}”${scope}.`);
  }
  if (patch.stationSuffix !== undefined) {
    summary.push(`Station suffix ${patch.stationSuffix ? `set to “${patch.stationSuffix}”` : 'removed'}${scope}.`);
  }
  if (patch.stationLabelFormat !== undefined) {
    summary.push(
      `Station format set to ${patch.stationLabelFormat === 'decimal' ? 'decimal feet' : 'survey hundreds (1+00)'}${scope}.`,
    );
  }
  if (patch.stationPrecision !== undefined) {
    summary.push(`Station precision set to ${patch.stationPrecision} decimal place${patch.stationPrecision === 1 ? '' : 's'}${scope}.`);
  }
  if (patch.labelInterval !== undefined) summary.push(`Station label interval set to ${patch.labelInterval} ft${scope}.`);
  if (patch.pointInterval !== undefined) summary.push(`Station point interval set to ${patch.pointInterval} ft${scope}.`);
  if (patch.labelScale !== undefined) summary.push(`Station label text scale set to ${patch.labelScale.toFixed(2)}×${scope}.`);
  if (patch.labelOffsetPx !== undefined) summary.push(`Station label offset set to ${patch.labelOffsetPx.toFixed(0)} px${scope}.`);
  if (patch.labelRotationDeg !== undefined) {
    summary.push(`Station labels ${patch.labelRotationDeg === 180 ? 'flipped 180°' : 'rotation reset'}${scope}.`);
  }
  if (patch.showLabelBackground !== undefined) {
    summary.push(`Station label background ${patch.showLabelBackground ? 'shown' : 'hidden'}${scope}.`);
  }
  if (patch.showGeometryLabels !== undefined) {
    summary.push(`Geometry tags ${patch.showGeometryLabels ? 'shown' : 'hidden'}${scope}.`);
  }
  if (patch.showPiLabels !== undefined) summary.push(`PI labels ${patch.showPiLabels ? 'shown' : 'hidden'}${scope}.`);
  if (patch.showPcPtLabels !== undefined) summary.push(`PC/PT labels ${patch.showPcPtLabels ? 'shown' : 'hidden'}${scope}.`);
  if (patch.showEndpointLabels !== undefined) summary.push(`BOP/EOP labels ${patch.showEndpointLabels ? 'shown' : 'hidden'}${scope}.`);
  if (patch.showStationPointLabels !== undefined) {
    summary.push(`CL STA point descriptions ${patch.showStationPointLabels ? 'shown' : 'hidden'}${scope}.`);
  }
  if (patch.resetBaselineOverrides) {
    summary.push(target ? `Cleared per-baseline label overrides for ${target.name}.` : 'Cleared all per-baseline label overrides.');
  }
  return summary;
};

export const applyStationingAnnotationPatch = (
  settings: Settings,
  centerlines: Centerline[],
  patch: StationingAnnotationPatch,
): StationingAnnotationApplyResult => {
  const target = resolveStationingTarget(centerlines, patch.targetBaselineName);
  if (target === null) {
    return {
      ok: false,
      settings,
      summary: [],
      error: `No baseline or centerline named “${patch.targetBaselineName}” is loaded.`,
    };
  }

  const next: StationingSettings = { ...(settings.stationing ?? ({} as StationingSettings)) };
  const offsets = { ...(next.labelOffsetPxByBaseline ?? {}) };
  const rotations = { ...(next.labelRotationByBaseline ?? {}) };

  if (patch.showStationLabels !== undefined) next.showStationLabels = patch.showStationLabels;
  if (patch.labelInterval !== undefined) next.labelInterval = patch.labelInterval;
  if (patch.pointInterval !== undefined) next.pointInterval = patch.pointInterval;
  if (patch.showStationPrefix !== undefined) next.showStationPrefix = patch.showStationPrefix;
  if (patch.stationPrefix !== undefined) next.stationPrefix = patch.stationPrefix;
  if (patch.stationSuffix !== undefined) next.stationSuffix = patch.stationSuffix;
  if (patch.stationLabelFormat !== undefined) next.stationLabelFormat = patch.stationLabelFormat;
  if (patch.stationPrecision !== undefined) next.stationPrecision = patch.stationPrecision;
  if (patch.labelScale !== undefined) next.labelScale = patch.labelScale;
  if (patch.showLabelBackground !== undefined) next.showLabelBackground = patch.showLabelBackground;
  if (patch.showGeometryLabels !== undefined) next.showGeometryLabels = patch.showGeometryLabels;
  if (patch.showPiLabels !== undefined) next.showPiLabels = patch.showPiLabels;
  if (patch.showPcPtLabels !== undefined) next.showPcPtLabels = patch.showPcPtLabels;
  if (patch.showEndpointLabels !== undefined) next.showEndpointLabels = patch.showEndpointLabels;
  if (patch.showStationPointLabels !== undefined) next.showStationPointLabels = patch.showStationPointLabels;

  if (patch.labelOffsetPx !== undefined) {
    if (target) {
      offsets[target.id] = patch.labelOffsetPx;
    } else {
      next.labelOffsetPx = patch.labelOffsetPx;
      for (const key of Object.keys(offsets)) delete offsets[key];
    }
  }

  if (patch.labelRotationDeg !== undefined) {
    if (target) {
      rotations[target.id] = patch.labelRotationDeg;
    } else {
      next.labelRotationDeg = patch.labelRotationDeg;
      for (const key of Object.keys(rotations)) delete rotations[key];
    }
  }

  if (patch.resetBaselineOverrides) {
    if (target) {
      delete offsets[target.id];
      delete rotations[target.id];
    } else {
      for (const key of Object.keys(offsets)) delete offsets[key];
      for (const key of Object.keys(rotations)) delete rotations[key];
    }
  }

  next.labelOffsetPxByBaseline = offsets;
  next.labelRotationByBaseline = rotations;

  return {
    ok: true,
    settings: { ...settings, stationing: next },
    centerline: target ?? undefined,
    summary: describeStationingAnnotationPatch(patch, target ?? undefined),
  };
};

const hasAnnotationCue = (text: string): boolean => {
  const lower = text.toLowerCase();
  const stationCue = /\b(?:station|baseline|centerline|alignment)\b/.test(lower);
  const labelCue =
    /\b(?:labels?|annotations?|prefix|suffix|geometry\s+tags?|pi\s+labels?|pc\s*\/?\s*pt|bop\s*\/?\s*eop|text\s+scale|label\s+background|station\s+format|decimal|hundreds)\b/.test(lower);
  return stationCue && labelCue;
};

/** Deterministic fallback for explicit annotation requests. */
export const parseStationingAnnotationIntent = (
  query: string,
  centerlines: Centerline[],
): StationingAnnotationPatch | null => {
  const text = query.replace(/\s+/g, ' ').trim();
  if (!text || !hasAnnotationCue(text)) return null;
  const lower = text.toLowerCase();
  const patch: StationingAnnotationPatch = {};
  let touched = false;

  const set = <K extends keyof StationingAnnotationPatch>(key: K, value: StationingAnnotationPatch[K]) => {
    patch[key] = value;
    touched = true;
  };

  // Resolve “on Baseline A” / “on this baseline” when the name is available.
  if (!/\b(?:all|every|each)\s+(?:baselines?|centerlines?|alignments?)\b/.test(lower)) {
    const named = [...centerlines]
      .filter(centerline => centerline.name?.trim())
      .sort((a, b) => b.name.length - a.name.length)
      .find(centerline => lower.includes(centerline.name.trim().toLowerCase()));
    if (named) {
      set('targetBaselineName', named.name);
    } else if (
      /\b(?:this|active|selected|current)\s+(?:baseline|centerline|alignment)\b/.test(lower) &&
      centerlines[0]
    ) {
      set('targetBaselineName', centerlines[0].name);
    }
  }

  const prefixRemoval =
    /\b(?:remove|drop|omit|hide|disable|turn\s+off)\b[^.]{0,40}\bprefix\b/.test(lower) ||
    /\b(?:no|without|don'?t|do\s+not)\b[^.]{0,30}\bprefix\b/.test(lower) ||
    /\bprefix\b[^.]{0,20}\b(?:off|hidden|removed)\b/.test(lower);
  if (prefixRemoval) {
    set('showStationPrefix', false);
    set('stationPrefix', '');
  } else {
    const prefixSet =
      text.match(/\b(?:set|change|use|make)\s+(?:the\s+)?(?:station\s+)?prefix\s+(?:to|as|of)\s*["“']?([^"”'\n,.;]+)/i) ||
      text.match(/\b(?:the\s+)?(?:station\s+)?prefix\s*[:=]\s*["“']?([^"”'\n,.;]+)/i) ||
      text.match(/\buse\s+["“']([^"”'\n]+)["”']\s+as\s+(?:the\s+)?(?:station\s+)?prefix/i);
    if (prefixSet) {
      const value = prefixSet[1].trim().replace(/[.]+$/, '');
      if (/(?:none|off|nothing|no\s+prefix)/i.test(value)) {
        set('showStationPrefix', false);
        set('stationPrefix', '');
      } else if (value) {
        set('stationPrefix', value.slice(0, 24));
        set('showStationPrefix', true);
      }
    } else if (/\b(?:add|show|include|display|turn\s+on)\b[^.]{0,25}\bprefix\b/.test(lower)) {
      set('showStationPrefix', true);
      if (!patch.stationPrefix) set('stationPrefix', 'STA');
    }
  }

  if (/\b(?:remove|drop|omit|hide|disable|turn\s+off|no)\b[^.]{0,25}\bsuffix\b/.test(lower)) {
    set('stationSuffix', '');
  } else {
    const suffixSet =
      text.match(/\b(?:set|change|use|make)\s+(?:the\s+)?(?:station\s+)?suffix\s+(?:to|as|of)\s*["“']?([^"”'\n,.;]+)/i) ||
      text.match(/\b(?:the\s+)?(?:station\s+)?suffix\s*[:=]\s*["“']?([^"”'\n,.;]+)/i);
    if (suffixSet?.[1]?.trim()) set('stationSuffix', suffixSet[1].trim().replace(/[.]+$/, '').slice(0, 24));
  }

  if (/\bdecimal\b/.test(lower) && /\b(?:station|label|format)\b/.test(lower)) {
    set('stationLabelFormat', 'decimal');
  } else if (/\b(?:hundreds|survey\s+format|1\+00)\b/.test(lower) && /\b(?:station|label|format)\b/.test(lower)) {
    set('stationLabelFormat', 'hundreds');
  }

  const precision = lower.match(/\b([012])\s*(?:decimal|decimals|decimal\s+places?|digits?)\b/);
  if (precision) set('stationPrecision', Number(precision[1]) as 0 | 1 | 2);
  else if (/\b(?:whole\s+(?:foot|feet)|no\s+decimals?|zero\s+decimals?)\b/.test(lower)) set('stationPrecision', 0);

  const labelInterval =
    lower.match(/\b(?:station\s+)?labels?\b[^.]{0,25}?\b(?:every|interval|spacing)\b[^.]{0,12}?(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/i) ||
    lower.match(/\b(?:every|interval|spacing)\b[^.]{0,12}?(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?[^.]{0,20}?\b(?:station\s+)?labels?\b/i);
  if (labelInterval) set('labelInterval', clamp(Number(labelInterval[1]), 1, 1000));

  if (/\b(?:station\s+points?|auto(?:matic)?\s+stations?|point\s+interval)\b/.test(lower)) {
    const pointInterval =
      lower.match(/\b(?:station\s+points?|auto(?:matic)?\s+stations?|point\s+interval)\b[^.]{0,25}?(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/i) ||
      lower.match(/\b(?:point\s+interval|station\s+points?)\b[^.]{0,10}?(\d+(?:\.\d+)?)/i);
    if (pointInterval) set('pointInterval', clamp(Number(pointInterval[1]), 1, 1000));
  }

  const scale =
    lower.match(/\b(?:label|text|annotation)\s*(?:scale|size)\b[^.]{0,15}?(\d+(?:\.\d+)?)\s*[x×]?/i) ||
    lower.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(?:labels?|text|annotations?)/i);
  if (scale) set('labelScale', clamp(Number(scale[1]), 0.25, 4));
  else if (/\bdouble\b[^.]{0,20}\b(?:labels?|text|annotations?)\b/.test(lower)) set('labelScale', 2);
  else if (/\bhalf\b[^.]{0,20}\b(?:labels?|text|annotations?)\b/.test(lower)) set('labelScale', 0.5);

  const offset =
    lower.match(/\b(?:move|offset|shift|push)\b[^.]{0,25}\b(?:station\s+)?labels?\b[^.]{0,25}?(-?\d+(?:\.\d+)?)\s*(?:px|pixels?)/i) ||
    lower.match(/\b(?:station\s+)?labels?\b[^.]{0,20}\b(?:offset|move|shift)\b[^.]{0,20}?(-?\d+(?:\.\d+)?)\s*(?:px|pixels?)/i);
  if (offset) {
    let value = Number(offset[1]);
    if (value > 0 && /\bleft\b/.test(lower)) value = -value;
    set('labelOffsetPx', clamp(value, -600, 600));
  }

  const rotation180 =
    /\b(?:rotate|flip|turn)\b[^.]{0,25}\b(?:labels?|annotations?)\b[^.]{0,25}\b180\b/.test(lower) ||
    (/\b180\s*(?:deg(?:rees)?|°)\b/.test(lower) && /\b(?:labels?|annotations?)\b/.test(lower));
  const rotationReset =
    /\b(?:reset|restore|unflip|unrotate|undo)\b[^.]{0,25}\b(?:rotation|flip|labels?)\b/.test(lower);
  if (rotation180) set('labelRotationDeg', 180);
  else if (rotationReset) set('labelRotationDeg', 0);

  if (/\b(?:hide|remove|turn\s+off|disable|suppress|no)\b[^.]{0,25}\blabel\s+background\b/.test(lower)) {
    set('showLabelBackground', false);
  } else if (/\b(?:show|add|turn\s+on|enable)\b[^.]{0,25}\blabel\s+background\b/.test(lower)) {
    set('showLabelBackground', true);
  }

  if (/\b(?:hide|remove|turn\s+off|disable|suppress)\b[^.]{0,25}\bgeometry\s+tags?\b/.test(lower) || /\bstations\s+only\b/.test(lower)) {
    set('showGeometryLabels', false);
    set('showPiLabels', false);
    set('showPcPtLabels', false);
    set('showEndpointLabels', false);
  } else if (/\b(?:show|display|turn\s+on|enable)\b[^.]{0,25}\bgeometry\s+tags?\b/.test(lower)) {
    set('showGeometryLabels', true);
  }

  const tagState = (pattern: RegExp): boolean | undefined => {
    if (!pattern.test(lower)) return undefined;
    return !/\b(?:hide|remove|turn\s+off|disable|suppress)\b/.test(lower);
  };
  const piState = tagState(/\bpi\s+labels?\b/);
  if (piState !== undefined) {
    set('showPiLabels', piState);
    if (piState) set('showGeometryLabels', true);
  }
  const pcptState = tagState(/\bpc\s*\/?\s*pt\s+labels?\b/);
  if (pcptState !== undefined) {
    set('showPcPtLabels', pcptState);
    if (pcptState) set('showGeometryLabels', true);
  }
  const endpointState = tagState(/\b(?:bop\s*\/?\s*eop|endpoint)\s+labels?\b/);
  if (endpointState !== undefined) {
    set('showEndpointLabels', endpointState);
    if (endpointState) set('showGeometryLabels', true);
  }

  if (/\b(?:hide|remove|turn\s+off|disable|suppress)\b[^.]{0,30}\b(?:cl\s+sta\s+point|station\s+point)\s+descriptions?\b/.test(lower)) {
    set('showStationPointLabels', false);
  } else if (/\b(?:show|display|turn\s+on|enable)\b[^.]{0,30}\b(?:cl\s+sta\s+point|station\s+point)\s+descriptions?\b/.test(lower)) {
    set('showStationPointLabels', true);
  }

  const hideLabels =
    /\b(?:hide|remove|turn\s+off|disable|suppress)\s+(?:the\s+|all\s+)?(?:station\s+|baseline\s+|centerline\s+)?labels?\b/.test(lower) ||
    /\b(?:station|baseline|centerline)\s+labels?\b[^.]{0,20}\b(?:off|hidden|removed)\b/.test(lower);
  const showLabels =
    /\b(?:show|display|turn\s+on|enable|add)\s+(?:the\s+|all\s+)?(?:station\s+|baseline\s+|centerline\s+)?labels?\b/.test(lower) ||
    /\b(?:station|baseline|centerline)\s+labels?\b[^.]{0,20}\b(?:on|visible|shown)\b/.test(lower);
  if (hideLabels) set('showStationLabels', false);
  else if (showLabels) set('showStationLabels', true);

  if (/\b(?:reset|clear)\b[^.]{0,25}\b(?:baseline|label)\s+(?:overrides?|offset|offsets|rotation)\b/.test(lower)) {
    set('resetBaselineOverrides', true);
  }

  return touched ? patch : null;
};
