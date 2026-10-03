export type LinearUnit = 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot' | 'usSurveyFoot' | 'yard' | 'chain' | 'link' | 'mile' | 'kilometer';

export const LINEAR_UNIT_OPTIONS: Array<{ value: LinearUnit; label: string; abbreviation: string }> = [
  { value: 'millimeter', label: 'Millimeter', abbreviation: 'mm' },
  { value: 'centimeter', label: 'Centimeter', abbreviation: 'cm' },
  { value: 'meter', label: 'Meter', abbreviation: 'm' },
  { value: 'inch', label: 'Inch', abbreviation: 'in' },
  { value: 'foot', label: 'Foot', abbreviation: 'ft' },
  { value: 'usSurveyFoot', label: 'US Survey Foot', abbreviation: 'us ft' },
  { value: 'yard', label: 'Yard', abbreviation: 'yd' },
  { value: 'chain', label: 'Chain', abbreviation: 'ch' },
  { value: 'link', label: 'Link', abbreviation: 'li' },
  { value: 'mile', label: 'Mile', abbreviation: 'mi' },
  { value: 'kilometer', label: 'Kilometer', abbreviation: 'km' },
];

const LINEAR_UNIT_TO_METERS: Record<LinearUnit, number> = {
  millimeter: 0.001,
  centimeter: 0.01,
  meter: 1,
  inch: 0.0254,
  foot: 0.3048,
  usSurveyFoot: 1200 / 3937,
  yard: 0.9144,
  chain: 20.1168,
  link: 0.201168,
  mile: 1609.344,
  kilometer: 1000,
};

export const getLinearUnitLabel = (unit: LinearUnit): string => (
  LINEAR_UNIT_OPTIONS.find(option => option.value === unit)?.label ?? unit
);

export const getLinearUnitAbbreviation = (unit: LinearUnit): string => (
  LINEAR_UNIT_OPTIONS.find(option => option.value === unit)?.abbreviation ?? unit
);

export const convertLinearUnits = (value: number, from: LinearUnit, to: LinearUnit): number => {
  if (from === to) return value;
  return value * LINEAR_UNIT_TO_METERS[from] / LINEAR_UNIT_TO_METERS[to];
};