import { TaxWrapper } from '../../tax';
import type { SalaryInput } from '../../tax/types';
import type { TaxCalculateInput, TaxCalculateResult } from '../../../types/tools';

const taxWrapper = new TaxWrapper();

/**
 * Execute tax calculation using existing TaxWrapper
 */
export function executeTaxCalculate(input: TaxCalculateInput): TaxCalculateResult {
  try {
    // Map to SalaryInput format expected by TaxWrapper
    const salaryInput: SalaryInput = {
      yearlySalary: input.yearlySalary,
      taxClass: input.taxClass,
      year: input.year,
      hasChildren: input.hasChildren ?? false,
      childCount: input.childCount ?? 0,
      churchTax: mapChurchTax(input.churchTax),
      state: input.state ?? 'west',
      healthInsuranceAddOn: input.healthInsuranceAddOn ?? 1.6,
      birthYear: input.birthYear,
    };

    const result = taxWrapper.calculate(salaryInput);

    return {
      success: true,
      netto: result.netto,
      taxes: result.taxes,
      socialSecurity: result.socialSecurity,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        field: 'calculation',
        error: error instanceof Error ? error.message : 'Unbekannter Berechnungsfehler',
        suggestion: 'Bitte ueberpruefe die Eingabewerte',
      },
    };
  }
}

function mapChurchTax(value?: string): 'none' | 'bayern' | 'baden_wuerttemberg' | 'common' {
  switch (value) {
    case 'church_tax_8':
      return 'bayern'; // 8% (Bayern, Baden-Wuerttemberg)
    case 'church_tax_9':
      return 'common'; // 9% (all other states)
    case 'none':
    default:
      return 'none';
  }
}
