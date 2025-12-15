import { TaxWrapper } from './apps/api/utils/tax/TaxWrapper';
import { SalaryInput } from './apps/api/utils/tax/types';

const wrapper = new TaxWrapper();

const testCases: { name: string; input: SalaryInput }[] = [
  {
    name: 'Standard 50k Single 2025',
    input: {
      yearlySalary: 50000,
      taxClass: 1,
      hasChildren: false,
      childCount: 0,
      churchTax: 'none',
      state: 'west',
      year: 2025,
      healthInsuranceAddOn: 1.6,
      birthYear: 1990
    }
  },
  {
    name: 'High Income 100k Married 2025',
    input: {
      yearlySalary: 100000,
      taxClass: 3,
      hasChildren: true,
      childCount: 2,
      churchTax: 'none',
      state: 'west',
      year: 2025,
      healthInsuranceAddOn: 1.6,
      birthYear: 1985
    }
  },
  {
    name: 'Standard 50k Single 2026',
    input: {
      yearlySalary: 50000,
      taxClass: 1,
      hasChildren: false,
      childCount: 0,
      churchTax: 'none',
      state: 'west',
      year: 2026,
      healthInsuranceAddOn: 1.6,
      birthYear: 1990
    }
  }
];

testCases.forEach(test => {
  console.log(`\n--- ${test.name} ---`);
  try {
    const result = wrapper.calculate(test.input);
    console.log('Input:', JSON.stringify(test.input, null, 2));
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Basic checks
    if (result.netto < 0 || result.netto > test.input.yearlySalary / 12) {
      console.error('ERROR: Netto plausibility check failed!');
    } else {
      console.log('Plausibility: OK');
    }
  } catch (e) {
    console.error('ERROR during calculation:', e);
  }
});
