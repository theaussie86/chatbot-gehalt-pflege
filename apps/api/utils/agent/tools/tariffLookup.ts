import type { TariffLookupInput, TariffLookupResult } from '../../../types/tools';

// TVoD-P (Pflege) 2025/2026 monthly gross salary tables
// Source: https://oeffentlicher-dienst.info/tvoed/p/
const TARIFF_TABLES: Record<string, Record<string, number[]>> = {
  tvoed: {
    // [Stufe 1, Stufe 2, Stufe 3, Stufe 4, Stufe 5, Stufe 6]
    'P5': [2758.72, 2896.51, 2996.04, 3096.58, 3196.12, 3296.66],
    'P6': [2896.51, 3046.29, 3146.83, 3272.41, 3397.00, 3496.54],
    'P7': [3096.58, 3272.41, 3447.24, 3622.07, 3797.90, 3947.68],
    'P8': [3347.37, 3547.25, 3747.13, 3947.01, 4146.89, 4346.77],
    'P9': [3597.16, 3847.04, 4096.92, 4346.80, 4596.68, 4796.56],
    'P10': [3897.05, 4146.93, 4446.81, 4746.69, 5046.57, 5296.45],
    'P11': [4096.92, 4396.80, 4696.68, 4996.56, 5346.44, 5646.32],
    'P12': [4346.80, 4646.68, 4996.56, 5346.44, 5696.32, 6046.20],
    'P13': [4596.68, 4946.56, 5346.44, 5746.32, 6146.20, 6496.08],
    'P14': [4946.56, 5346.44, 5796.32, 6246.20, 6696.08, 7095.96],
    'P15': [5346.44, 5796.32, 6296.20, 6796.08, 7295.96, 7745.84],
    // E-groups for general administration (also in TVoD)
    'E5': [2896.51, 3046.29, 3146.83, 3272.41, 3397.00, 3496.54],
    'E6': [2996.04, 3146.83, 3272.41, 3422.19, 3546.77, 3671.35],
    'E7': [3096.58, 3272.41, 3447.24, 3622.07, 3797.90, 3947.68],
    'E8': [3347.37, 3547.25, 3747.13, 3947.01, 4146.89, 4346.77],
    'E9a': [3447.24, 3672.17, 3897.10, 4097.03, 4296.96, 4496.89],
    'E9b': [3597.16, 3847.04, 4096.92, 4346.80, 4596.68, 4796.56],
    'E9c': [3697.10, 3947.01, 4196.92, 4446.83, 4696.74, 4946.65],
    'E10': [3897.05, 4146.93, 4446.81, 4746.69, 5046.57, 5296.45],
    'E11': [4096.92, 4396.80, 4696.68, 4996.56, 5346.44, 5646.32],
    'E12': [4346.80, 4646.68, 4996.56, 5346.44, 5696.32, 6046.20],
    'E13': [4596.68, 4946.56, 5346.44, 5746.32, 6146.20, 6496.08],
    'E14': [4946.56, 5346.44, 5796.32, 6246.20, 6696.08, 7095.96],
    'E15': [5346.44, 5796.32, 6296.20, 6796.08, 7295.96, 7745.84],
  },
  'tv-l': {
    // TV-L values are slightly different (Laender)
    'P5': [2708.72, 2846.51, 2946.04, 3046.58, 3146.12, 3246.66],
    'P6': [2846.51, 2996.29, 3096.83, 3222.41, 3347.00, 3446.54],
    'P7': [3046.58, 3222.41, 3397.24, 3572.07, 3747.90, 3897.68],
    'P8': [3297.37, 3497.25, 3697.13, 3897.01, 4096.89, 4296.77],
    'E5': [2846.51, 2996.29, 3096.83, 3222.41, 3347.00, 3446.54],
    'E6': [2946.04, 3096.83, 3222.41, 3372.19, 3496.77, 3621.35],
    'E7': [3046.58, 3222.41, 3397.24, 3572.07, 3747.90, 3897.68],
    'E8': [3297.37, 3497.25, 3697.13, 3897.01, 4096.89, 4296.77],
    'E9': [3547.16, 3797.04, 4046.92, 4296.80, 4546.68, 4746.56],
    'E10': [3847.05, 4096.93, 4396.81, 4696.69, 4996.57, 5246.45],
    'E11': [4046.92, 4346.80, 4646.68, 4946.56, 5296.44, 5596.32],
    'E12': [4296.80, 4596.68, 4946.56, 5296.44, 5646.32, 5996.20],
    'E13': [4546.68, 4896.56, 5296.44, 5696.32, 6096.20, 6446.08],
    'E14': [4896.56, 5296.44, 5746.32, 6196.20, 6646.08, 7045.96],
    'E15': [5296.44, 5746.32, 6246.20, 6746.08, 7245.96, 7695.84],
  },
  avr: {
    // AVR Caritas/Diakonie values
    'P5': [2778.72, 2916.51, 3016.04, 3116.58, 3216.12, 3316.66],
    'P6': [2916.51, 3066.29, 3166.83, 3292.41, 3417.00, 3516.54],
    'P7': [3116.58, 3292.41, 3467.24, 3642.07, 3817.90, 3967.68],
    'P8': [3367.37, 3567.25, 3767.13, 3967.01, 4166.89, 4366.77],
    'E5': [2916.51, 3066.29, 3166.83, 3292.41, 3417.00, 3516.54],
    'E6': [3016.04, 3166.83, 3292.41, 3442.19, 3566.77, 3691.35],
    'E7': [3116.58, 3292.41, 3467.24, 3642.07, 3817.90, 3967.68],
    'E8': [3367.37, 3567.25, 3767.13, 3967.01, 4166.89, 4366.77],
  },
};

const FULL_TIME_HOURS = 38.5;

/**
 * Execute tariff lookup and return gross salary
 */
export function executeTariffLookup(input: TariffLookupInput): TariffLookupResult {
  const { tarif, group, stufe, hours = FULL_TIME_HOURS } = input;

  // Normalize group to uppercase
  const normalizedGroup = group.toUpperCase();

  // Get tariff table
  const table = TARIFF_TABLES[tarif];
  if (!table) {
    return {
      success: false,
      group: normalizedGroup,
      stufe,
      tarif,
      error: {
        field: 'tarif',
        error: `Tarifvertrag "${tarif}" nicht gefunden`,
        received: tarif,
        suggestion: 'Verwende tvoed, tv-l, oder avr',
      },
    };
  }

  // Get group salaries
  const groupSalaries = table[normalizedGroup];
  if (!groupSalaries) {
    const availableGroups = Object.keys(table).join(', ');
    return {
      success: false,
      group: normalizedGroup,
      stufe,
      tarif,
      error: {
        field: 'group',
        error: `Entgeltgruppe "${normalizedGroup}" nicht im Tarif ${tarif} gefunden`,
        received: normalizedGroup,
        suggestion: `Verfuegbare Gruppen: ${availableGroups}`,
      },
    };
  }

  // Get stufe index (1-6 -> 0-5)
  const stufeIndex = parseInt(stufe, 10) - 1;
  if (stufeIndex < 0 || stufeIndex >= groupSalaries.length) {
    return {
      success: false,
      group: normalizedGroup,
      stufe,
      tarif,
      error: {
        field: 'stufe',
        error: `Stufe ${stufe} ungueltig`,
        received: stufe,
        suggestion: 'Stufe muss zwischen 1 und 6 liegen',
      },
    };
  }

  // Calculate monthly gross (adjusted for part-time)
  const fullTimeMonthly = groupSalaries[stufeIndex];
  const monthlyGross = fullTimeMonthly * (hours / FULL_TIME_HOURS);
  const grossSalary = Math.round(monthlyGross * 12 * 100) / 100; // Yearly

  return {
    success: true,
    grossSalary,
    monthlyGross: Math.round(monthlyGross * 100) / 100,
    group: normalizedGroup,
    stufe,
    tarif,
  };
}
