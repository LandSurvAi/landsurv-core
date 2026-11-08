import type {
  A2UIPropertiesSpec,
  A2UIPropertyField,
  AnnotationCategoryStyle,
  AnnotationTextStyle,
  CanvasTextAnnotation,
  GisFeature,
  SurveyLine,
} from '../types.ts';
import { formatLeroySize, nearestLeroySize, resolveAnnotationMask, textBaseHeightPx } from './annotationSizing.ts';
import { gisFeaturesForSelectedLines, metadataEntries, metadataFeatureName } from './featureMetadata.ts';

const lineId = (line: SurveyLine): string => line.id || `${line.from}-${line.to}`;

const commonValue = <T,>(values: T[]): { value: T | undefined; mixed: boolean } => {
  if (values.length === 0) return { value: undefined, mixed: false };
  const first = values[0];
  return {
    value: values.every(value => value === first) ? first : undefined,
    mixed: !values.every(value => value === first),
  };
};

const field = (
  key: string,
  label: string,
  value: A2UIPropertyField['value'],
  options: Omit<A2UIPropertyField, 'key' | 'label' | 'value'> = {},
): A2UIPropertyField => ({ key, label, value, editable: true, ...options });

export interface BuildPropertiesA2UISpecInput {
  lines: SurveyLine[];
  selectedLineIds: string[];
  textAnnotations?: CanvasTextAnnotation[];
  selectedTextIds?: string[];
  textStyles?: AnnotationTextStyle[];
  categories?: AnnotationCategoryStyle[];
  availableLayers?: string[];
  availableLinetypes?: string[];
  /** Live GIS features whose generated linework is selected. */
  gisFeatures?: GisFeature[];
  /** Parcel summaries matched to selected parcel linework by parcel id. */
  parcelSummaries?: Array<{
    parcelId: string | null;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * One JSON-serializable property model for both the visual inspector and any
 * A2UI surface/agent. Values are already flattened, with mixed selections
 * marked explicitly instead of leaking ambiguous `undefined`s.
 */
export function buildPropertiesA2UISpec({
  lines,
  selectedLineIds,
  textAnnotations = [],
  selectedTextIds = [],
  textStyles = [],
  categories = [],
  availableLayers = [],
  availableLinetypes = [],
  gisFeatures = [],
  parcelSummaries = [],
}: BuildPropertiesA2UISpecInput): A2UIPropertiesSpec {
  const lineIds = new Set(selectedLineIds);
  const selectedLines = lines.filter(line => lineIds.has(lineId(line)));
  const textIds = new Set(selectedTextIds);
  const selectedText = textAnnotations.filter(annotation => textIds.has(annotation.id));
  const selectedGisFeatures = gisFeaturesForSelectedLines(gisFeatures, selectedLineIds);
  const selectedParcelIds = new Set(
    selectedLines.map(line => line.parcelId).filter((id): id is string => !!id),
  );
  const selectedParcels = parcelSummaries.filter(parcel =>
    !!parcel.parcelId && selectedParcelIds.has(parcel.parcelId),
  );
  const objectCount = selectedLines.length + selectedText.length;
  const objectTypes: string[] = [];
  if (selectedLines.length > 0) objectTypes.push(selectedLines.length === 1 ? 'Linework' : `Linework (${selectedLines.length})`);
  if (selectedText.length > 0) objectTypes.push(selectedText.length === 1 ? 'Text' : `Text (${selectedText.length})`);

  const fields: A2UIPropertyField[] = [];
  if (selectedLines.length > 0) {
    const layer = commonValue(selectedLines.map(line => line.layer ?? ''));
    const color = commonValue(selectedLines.map(line => line.color ?? 'ByLayer'));
    const linetype = commonValue(selectedLines.map(line => line.lineType ?? 'ByLayer'));
    const scale = commonValue(selectedLines.map(line => line.lineTypeScale ?? 1));
    const hidden = commonValue(selectedLines.map(line => Boolean(line.hidden)));
    fields.push(
      field('line.layer', 'Layer', layer.value ?? null, { type: 'select', options: availableLayers, mixed: layer.mixed, group: 'Linework' }),
      field('line.color', 'Color', color.value ?? null, { type: 'color', mixed: color.mixed, group: 'Linework' }),
      field('line.linetype', 'Linetype', linetype.value ?? null, { type: 'select', options: availableLinetypes, mixed: linetype.mixed, group: 'Linework' }),
      field('line.linetypeScale', 'Linetype scale', scale.value ?? null, { type: 'number', mixed: scale.mixed, group: 'Linework' }),
      field('line.hidden', 'Hidden', hidden.value ?? null, { type: 'boolean', mixed: hidden.mixed, group: 'Linework' }),
    );
  }

  for (const parcel of selectedParcels) {
    const group = `Parcel · ${parcel.parcelId ?? 'Unnamed'}`;
    for (const entry of metadataEntries(parcel.attributes)) {
      fields.push(field(
        `parcel.${parcel.parcelId}.${entry.key}`,
        entry.label,
        entry.value,
        { type: 'text', editable: false, group },
      ));
    }
  }

  for (const [index, feature] of selectedGisFeatures.entries()) {
    const group = `GIS · ${metadataFeatureName(feature, index)}`;
    for (const entry of metadataEntries(feature.properties)) {
      fields.push(field(
        `gis.${feature.id}.${entry.key}`,
        entry.label,
        entry.value,
        { type: 'text', editable: false, group },
      ));
    }
  }

  if (selectedText.length > 0) {
    const styleNames = textStyles.map(style => style.name);
    const categoryNames = categories.map(category => category.label);
    const styleFor = (annotation: CanvasTextAnnotation): AnnotationTextStyle | undefined =>
      textStyles.find(style => style.name === annotation.styleName) ?? textStyles[0];
    const categoryFor = (annotation: CanvasTextAnnotation): AnnotationCategoryStyle | undefined =>
      categories.find(category => category.id === (annotation.categoryId ?? 'manual-text'));
    const resolvedHeight = (annotation: CanvasTextAnnotation): number =>
      textBaseHeightPx(annotation, styleFor(annotation), categoryFor(annotation));
    const resolvedLeroy = (annotation: CanvasTextAnnotation): number => {
      if (annotation.leroySize) return annotation.leroySize;
      if (annotation.height) return nearestLeroySize(annotation.height);
      const style = styleFor(annotation);
      if (style?.leroySize) return style.leroySize;
      return nearestLeroySize(resolvedHeight(annotation));
    };
    const style = commonValue(selectedText.map(annotation => annotation.styleName ?? styleNames[0] ?? ''));
    const font = commonValue(selectedText.map(annotation =>
      annotation.fontFamily || styleFor(annotation)?.fontFamily || categoryFor(annotation)?.fontFamily || '',
    ));
    const height = commonValue(selectedText.map(resolvedHeight));
    const leroy = commonValue(selectedText.map(resolvedLeroy));
    const scale = commonValue(selectedText.map(annotation => annotation.scale ?? 1));
    const angle = commonValue(selectedText.map(annotation => annotation.angle));
    const color = commonValue(selectedText.map(annotation =>
      annotation.color || styleFor(annotation)?.color || categoryFor(annotation)?.color || '',
    ));
    const category = commonValue(selectedText.map(annotation => annotation.categoryId ?? 'manual-text'));
    const maskValues = selectedText.map(annotation => resolveAnnotationMask(annotation, categoryFor(annotation)));
    const mask = commonValue(maskValues.map(value => value.enabled));
    const maskPadding = commonValue(maskValues.map(value => value.padding));
    const maskColor = commonValue(maskValues.map(value => value.color ?? ''));
    const maskOpacity = commonValue(maskValues.map(value => value.opacity));
    const layer = commonValue(selectedText.map(annotation => annotation.layer ?? ''));
    const text = commonValue(selectedText.map(annotation => annotation.text));
    fields.push(
      field('text.content', 'Content', text.value ?? null, { type: 'text', mixed: text.mixed, editable: selectedText.length === 1, group: 'Text' }),
      field('text.category', 'Category', category.value ?? null, { type: 'select', options: categoryNames, mixed: category.mixed, group: 'Text' }),
      field('text.style', 'Style', style.value ?? null, { type: 'select', options: styleNames, mixed: style.mixed, group: 'Text' }),
      field('text.font', 'Font', font.value || null, { type: 'select', mixed: font.mixed, group: 'Text' }),
      field('text.leroy', 'Leroy', leroy.value == null ? null : formatLeroySize(leroy.value), { type: 'select', mixed: leroy.mixed, group: 'Text' }),
      field('text.height', 'Height', height.value, { type: 'number', unit: 'px', mixed: height.mixed, group: 'Text' }),
      field('text.scale', 'Scale', scale.value, { type: 'number', unit: '×', mixed: scale.mixed, group: 'Text' }),
      field('text.angle', 'Rotation', angle.value, { type: 'number', unit: '°', mixed: angle.mixed, group: 'Text' }),
      field('text.color', 'Color', color.value || null, { type: 'color', mixed: color.mixed, group: 'Text' }),
      field('text.layer', 'Layer', layer.value || null, { type: 'select', options: availableLayers, mixed: layer.mixed, group: 'Text' }),
      field('text.maskEnabled', 'Wipeout', mask.value, { type: 'boolean', mixed: mask.mixed, group: 'Wipeout' }),
      field('text.maskPadding', 'Wipeout padding', maskPadding.value, { type: 'number', unit: 'px', mixed: maskPadding.mixed, group: 'Wipeout' }),
      field('text.maskColor', 'Wipeout color', maskColor.value || null, { type: 'color', mixed: maskColor.mixed, group: 'Wipeout' }),
      field('text.maskOpacity', 'Wipeout opacity', maskOpacity.value, { type: 'number', unit: '0–1', mixed: maskOpacity.mixed, group: 'Wipeout' }),
    );
  }

  return {
    title: objectCount === 1 ? 'Selected object properties' : `${objectCount} selected object properties`,
    description: 'Live, schema-stable property snapshot. Agent and panel reads use the same field ids and values.',
    objectCount,
    objectTypes,
    fields,
  };
}
