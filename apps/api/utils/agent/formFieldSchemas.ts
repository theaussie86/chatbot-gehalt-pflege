import { z } from 'zod';

/**
 * German number words for pre-processing user input
 * Converts spoken/written numbers to numeric values
 */
export const GERMAN_NUMBER_WORDS: Record<string, number> = {
  null: 0,
  keine: 0,
  kein: 0,
  nein: 0,
  eins: 1,
  ein: 1,
  eine: 1,
  zwei: 2,
  zwo: 2,
  drei: 3,
  vier: 4,
  fuenf: 5,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};

/**
 * Tariff system schema
 * Accepts variations: TVöD, TVÖD, tvöd, öffentlicher dienst, etc.
 */
export const tarifSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // TVöD variations
    if (
      str.includes('tvöd') ||
      str.includes('tvoed') ||
      str.includes('öffentlich') ||
      str.includes('oeffentlich')
    ) {
      return 'tvoed';
    }
    // TV-L variations
    if (str.includes('tv-l') || str.includes('tvl') || str.includes('länder') || str.includes('laender')) {
      return 'tv-l';
    }
    // AVR variations
    if (
      str.includes('avr') ||
      str.includes('kirchlich') ||
      str.includes('diakonie') ||
      str.includes('caritas')
    ) {
      return 'avr';
    }
    return val;
  },
  z
    .enum(['tvoed', 'tv-l', 'avr'], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_enum_value) {
          return {
            message: `Hmm, '${ctx.data}' kenne ich nicht als Tarifvertrag. Arbeitest du im öffentlichen Dienst (TVöD), bei den Ländern (TV-L), oder kirchlich (AVR)?`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .describe('Tarifvertrag: TVöD (öffentlicher Dienst), TV-L (Länder), oder AVR (kirchlich)')
);

/**
 * Entgeltgruppe schema
 * Validates format (P5-P15 or E5-E15)
 * NOTE: P vs E prefix logic is handled in FieldValidator.validate() with formState context
 */
export const groupSchema = z.preprocess(
  (val) => {
    const str = String(val).toUpperCase().trim();
    // Extract number from various formats
    const match = str.match(/([PE]?)(\d+)/);
    if (match) {
      const prefix = match[1] || '';
      const num = parseInt(match[2], 10);
      // German number words
      if (str in GERMAN_NUMBER_WORDS) {
        return String(GERMAN_NUMBER_WORDS[str]);
      }
      if (num >= 5 && num <= 15) {
        // Return with prefix if provided, otherwise just number
        return prefix ? `${prefix}${num}` : String(num);
      }
    }
    return val;
  },
  z
    .string()
    .regex(/^([PE])?([5-9]|1[0-5])$/, {
      message:
        "Die Entgeltgruppe '{input}' kenne ich nicht. Pflege ist meist P5-P15, andere Bereiche E5-E15.",
    })
    .describe('Entgeltgruppe (z.B. P5-P15 für Pflege oder E5-E15 für andere Bereiche)')
);

/**
 * Experience level schema (Stufe 1-6 or years)
 * Accepts: '1', 'Stufe 3', '5 Jahre', 'fuenf Jahre', etc.
 */
export const experienceSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // Check German number words first
    const words = str.split(/\s+/);
    for (const word of words) {
      if (word in GERMAN_NUMBER_WORDS) {
        return String(GERMAN_NUMBER_WORDS[word]);
      }
    }
    // Extract numeric value
    const match = str.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      // Map years to Stufe (approximate)
      if (str.includes('jahr')) {
        if (num <= 1) return '1';
        if (num <= 3) return '2';
        if (num <= 6) return '3';
        if (num <= 10) return '4';
        if (num <= 15) return '5';
        return '6';
      }
      // Direct Stufe mapping
      if (num >= 1 && num <= 6) {
        return String(num);
      }
    }
    return val;
  },
  z
    .enum(['1', '2', '3', '4', '5', '6'], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_enum_value) {
          return {
            message: `Die Erfahrungsstufe '${ctx.data}' verstehe ich nicht. Wie lange bist du schon dabei? (z.B. '3 Jahre' oder 'Stufe 2')`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .describe('Erfahrungsstufe 1-6 basierend auf Berufsjahren')
);

/**
 * Weekly hours schema
 * Accepts: 38.5, '38,5', 'Vollzeit', 'Teilzeit', etc.
 */
export const hoursSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // Handle German decimal separator
    const normalized = str.replace(',', '.');
    // Handle keywords
    if (normalized.includes('vollzeit') || normalized.includes('voll')) {
      return 38.5;
    }
    if (normalized.includes('teilzeit') || normalized.includes('teil')) {
      return 20;
    }
    // Parse number
    const num = parseFloat(normalized);
    if (!isNaN(num)) {
      return num;
    }
    return val;
  },
  z
    .number()
    .min(1, { message: 'Hmm, weniger als 1 Stunde pro Woche? Das klingt sehr ungewöhnlich.' })
    .max(48, {
      message: 'Hmm, {input} Stunden pro Woche? Das klingt ungewöhnlich. Vollzeit ist meist 38-40 Stunden.',
    })
    .describe('Wöchentliche Arbeitszeit in Stunden (z.B. 38.5 für Vollzeit)')
);

/**
 * German Bundesland schema
 * Accepts abbreviations and full names
 */
const BUNDESLAENDER_MAP: Record<string, string> = {
  bw: 'Baden-Württemberg',
  'baden-württemberg': 'Baden-Württemberg',
  bayern: 'Bayern',
  by: 'Bayern',
  berlin: 'Berlin',
  be: 'Berlin',
  brandenburg: 'Brandenburg',
  bb: 'Brandenburg',
  bremen: 'Bremen',
  hb: 'Bremen',
  hamburg: 'Hamburg',
  hh: 'Hamburg',
  hessen: 'Hessen',
  he: 'Hessen',
  'mecklenburg-vorpommern': 'Mecklenburg-Vorpommern',
  mv: 'Mecklenburg-Vorpommern',
  niedersachsen: 'Niedersachsen',
  ni: 'Niedersachsen',
  'nordrhein-westfalen': 'Nordrhein-Westfalen',
  nrw: 'Nordrhein-Westfalen',
  'rheinland-pfalz': 'Rheinland-Pfalz',
  rp: 'Rheinland-Pfalz',
  saarland: 'Saarland',
  sl: 'Saarland',
  sachsen: 'Sachsen',
  sn: 'Sachsen',
  'sachsen-anhalt': 'Sachsen-Anhalt',
  st: 'Sachsen-Anhalt',
  'schleswig-holstein': 'Schleswig-Holstein',
  sh: 'Schleswig-Holstein',
  thüringen: 'Thüringen',
  thueringen: 'Thüringen',
  th: 'Thüringen',
};

const VALID_BUNDESLAENDER = Object.values(BUNDESLAENDER_MAP);

export const stateSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    return BUNDESLAENDER_MAP[str] || val;
  },
  z
    .enum(VALID_BUNDESLAENDER as [string, ...string[]], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_enum_value) {
          // Find near-miss suggestion using Levenshtein distance
          const input = String(ctx.data).toLowerCase();
          let bestMatch = '';
          let bestDistance = Infinity;
          for (const state of VALID_BUNDESLAENDER) {
            const distance = levenshtein(input, state.toLowerCase());
            if (distance < bestDistance) {
              bestDistance = distance;
              bestMatch = state;
            }
          }
          const suggestion = bestDistance <= 3 ? ` Meinst du vielleicht ${bestMatch}?` : '';
          return {
            message: `'${ctx.data}' kenne ich nicht als Bundesland.${suggestion}`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .describe('Bundesland (z.B. Nordrhein-Westfalen, Bayern, Berlin)')
);

/**
 * Tax class schema (Steuerklasse 1-6)
 * Accepts: '1', 1, 'Klasse 1', 'eins', 'ledig', etc.
 */
export const taxClassSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // Check German number words
    if (str in GERMAN_NUMBER_WORDS) {
      return GERMAN_NUMBER_WORDS[str];
    }
    // Extract number from formats like "Klasse 1", "Steuerklasse 3"
    const match = str.match(/(\d)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    // Handle common keywords
    if (str.includes('ledig') || str.includes('unverheiratet')) {
      return 1;
    }
    if (str.includes('alleinerziehend')) {
      return 2;
    }
    // "verheiratet" is ambiguous - needs follow-up (3, 4, or 5)
    return val;
  },
  z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)], {
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_union) {
          return {
            message: `Steuerklasse '${ctx.data}' gibt es nicht — bitte wähle 1-6. Zum Beispiel: 1 (ledig), 3 (verheiratet, höheres Einkommen), oder 4 (verheiratet, gleich).`,
          };
        }
        return { message: ctx.defaultError };
      },
    })
    .describe('Steuerklasse 1-6')
);

/**
 * Church tax schema (Kirchensteuer)
 * Accepts: 'ja', 'nein', 'evangelisch', 'katholisch', 'konfessionslos', etc.
 */
export const churchTaxSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // True values
    if (
      str === 'ja' ||
      str === 'yes' ||
      str === 'true' ||
      str.includes('evangelisch') ||
      str.includes('katholisch') ||
      str.includes('kirche')
    ) {
      return true;
    }
    // False values
    if (
      str === 'nein' ||
      str === 'no' ||
      str === 'false' ||
      str.includes('konfessionslos') ||
      str.includes('ausgetreten') ||
      str.includes('keine')
    ) {
      return false;
    }
    return val;
  },
  z.boolean({
    errorMap: (issue, ctx) => {
      if (issue.code === z.ZodIssueCode.invalid_type) {
        return {
          message: `Bei der Kirchensteuer verstehe ich '${ctx.data}' nicht. Bist du Mitglied in einer Kirche? (ja/nein)`,
        };
      }
      return { message: ctx.defaultError };
    },
  }).describe('Kirchensteuerpflicht (ja/nein)')
);

/**
 * Number of children schema
 * Accepts: 0, '0', 'keine', 'null', 'nein', German number words, etc.
 */
export const numberOfChildrenSchema = z.preprocess(
  (val) => {
    const str = String(val).toLowerCase().trim();
    // Check German number words
    if (str in GERMAN_NUMBER_WORDS) {
      return GERMAN_NUMBER_WORDS[str];
    }
    // Parse numeric value
    const num = parseInt(str, 10);
    if (!isNaN(num)) {
      return num;
    }
    return val;
  },
  z
    .number()
    .int()
    .min(0, { message: 'Die Kinderanzahl kann nicht negativ sein.' })
    .max(10, {
      message:
        "Die Kinderanzahl '{input}' verstehe ich nicht. Wie viele Kinder hast du? (z.B. '2' oder 'keine')",
    })
    .describe('Anzahl der Kinder (0-10)')
);

/**
 * Simple Levenshtein distance for near-miss suggestions
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
