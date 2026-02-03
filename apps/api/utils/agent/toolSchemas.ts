import { z } from 'zod';

/**
 * Zod schemas for function calling tools
 * Single source of truth for both TypeScript types AND Gemini function declarations
 * German descriptions help AI understand field context
 */

// Tariff Lookup Tool Schema
export const tariffLookupSchema = z.object({
  tarif: z
    .enum(['tvoed', 'tv-l', 'avr'])
    .describe(
      'Tarifvertrag: TVöD (öffentlicher Dienst), TV-L (Länder), oder AVR (kirchlich)'
    ),
  group: z
    .string()
    .describe(
      'Entgeltgruppe (z.B. P5, P6, P7, P8, P9 für Pflege oder E5-E15 für allgemein)'
    ),
  stufe: z
    .enum(['1', '2', '3', '4', '5', '6'])
    .describe('Erfahrungsstufe 1-6 basierend auf Berufsjahren'),
  hours: z
    .number()
    .min(1)
    .max(48)
    .optional()
    .describe('Wöchentliche Arbeitszeit in Stunden (Standard: 38.5 für Vollzeit)'),
  state: z
    .string()
    .optional()
    .describe('Bundesland für regionale Tarifunterschiede'),
});

// Tax Calculation Tool Schema
export const taxCalculateSchema = z.object({
  yearlySalary: z.number().positive().describe('Jahresbrutto in Euro'),
  taxClass: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ])
    .describe(
      'Steuerklasse: 1 (ledig), 2 (alleinerziehend), 3 (verheiratet, höheres Einkommen), 4 (verheiratet, gleich), 5 (verheiratet, geringer), 6 (Zweitjob)'
    ),
  year: z
    .union([z.literal(2025), z.literal(2026)])
    .describe('Steuerjahr für die Berechnung'),
  churchTax: z
    .enum(['none', 'church_tax_8', 'church_tax_9'])
    .default('none')
    .describe('Kirchensteuer: keine, 8% (Bayern/BW), oder 9% (übrige Länder)'),
  hasChildren: z
    .boolean()
    .default(false)
    .describe('Hat der Nutzer Kinder? Relevant für Kinderfreibetrag'),
  childCount: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(0)
    .describe('Anzahl der Kinder für Kinderfreibeträge'),
  state: z
    .enum(['west', 'east', 'sachsen'])
    .default('west')
    .describe('Region: West, Ost, oder Sachsen (für Pflegeversicherung)'),
  birthYear: z
    .number()
    .int()
    .min(1940)
    .max(2010)
    .optional()
    .describe('Geburtsjahr für Altersentlastungsbetrag'),
  healthInsuranceAddOn: z
    .number()
    .min(0)
    .max(5)
    .default(1.6)
    .describe('Zusatzbeitrag Krankenversicherung in Prozent (Standard ca. 1.6%)'),
});

// Tool names as constants
export const TOOL_NAMES = {
  TARIFF_LOOKUP: 'tariff_lookup',
  TAX_CALCULATE: 'tax_calculate',
} as const;

// Tool descriptions in German for Gemini function declarations
export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.TARIFF_LOOKUP]:
    'Schlägt das Bruttogehalt basierend auf Tarifvertrag, Entgeltgruppe und Erfahrungsstufe nach',
  [TOOL_NAMES.TAX_CALCULATE]:
    'Berechnet das Nettogehalt aus dem Bruttogehalt unter Berücksichtigung von Steuern und Sozialabgaben',
} as const;
