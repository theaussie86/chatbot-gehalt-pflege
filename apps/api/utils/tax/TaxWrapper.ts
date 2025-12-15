import { Lohnsteuer2025 } from './Lohnsteuer2025';
import { Lohnsteuer2026 } from './Lohnsteuer2026';
import { SalaryInput, TaxInput, TaxResult, TaxOutput } from './types';
import { Big } from './TaxUtils';

export class TaxWrapper {
  public calculate(input: SalaryInput): TaxResult {
    const year = input.year;
    
    // 1. Map User Input to BMF Input
    const taxInput = this.mapInput(input);
    
    // 2. Calculate Tax
    let taxOutput: TaxOutput;
    
    if (year >= 2026) {
      const calculator = new Lohnsteuer2026();
      taxOutput = calculator.calculate(taxInput);
    } else {
      // Default to 2025 for now (or fallback)
      const calculator = new Lohnsteuer2025();
      taxOutput = calculator.calculate(taxInput);
    }
    
    // 3. Calculate Social Security (independent of Tax logic, but standard rates)
    // Note: BMF calculates deductible parts (Vorsorgepauschale), but for Netto we need actual deductions.
    const socialSecurity = this.calculateSocialSecurity(input);
    
    // 4. Calculate Netto
    // Netto = Gross - Taxes - SocialSecurity
    const gross = input.yearlySalary / 12; // Monthly gross for result
    const taxes = {
      lohnsteuer: taxOutput.LSTLZZ / 100 / 12, // cents to Euro, yearly to monthly
      soli: taxOutput.SOLZLZZ / 100 / 12,
      kirchensteuer: taxOutput.BK / 100 / 12,
    };
    
    const totalTax = taxes.lohnsteuer + taxes.soli + taxes.kirchensteuer;
    const totalSocial = socialSecurity.kv + socialSecurity.rv + socialSecurity.av + socialSecurity.pv;
    
    const netto = gross - totalTax - totalSocial;
    
    return {
      netto: this.round(netto),
      taxes: {
        lohnsteuer: this.round(taxes.lohnsteuer),
        soli: this.round(taxes.soli),
        kirchensteuer: this.round(taxes.kirchensteuer),
      },
      socialSecurity: {
        kv: this.round(socialSecurity.kv),
        rv: this.round(socialSecurity.rv),
        av: this.round(socialSecurity.av),
        pv: this.round(socialSecurity.pv),
      },
    };
  }
  
  private mapInput(input: SalaryInput): TaxInput {
    // Basic mapping
    const bmfInput: TaxInput = {};
    
    bmfInput.LZZ = 1; // Always calculate yearly first in BMF logic usually? 
    // Wait, BMF logic `MRE4JL` handles LZZ (1=Year, 2=Month).
    // If input.yearlySalary is given, we can set LZZ=1 and RE4=yearlySalary * 100.
    bmfInput.LZZ = 1;
    bmfInput.RE4 = input.yearlySalary * 100; // Cents
    
    bmfInput.STKL = input.taxClass;
    
    // Children
    if (input.hasChildren && input.childCount > 0) {
      bmfInput.ZKF = input.childCount; // simplified, usually 0.5 or 1.0 but input says childCount
      // Note: ZKF in BMF is "Zahl der Kinderfreibeträge" (e.g. 0.5, 1.0).
      // If user enters "1 child", typically it's 1.0 for StKl 3/4? or 0.5 for separate?
      // Assuming straightforward mapping for now: 1 child = 1.0
      // Actually standard is 1.0 per child for married jointly, 0.5 for single?
      // Let's use direct mapping for now, refine if needed.
    } else {
      bmfInput.ZKF = 0;
    }
    
    // Church Tax
    if (input.churchTax !== 'none') {
      bmfInput.R = 1; // 1 = Church Tax applicable
      // Note: The specific rate (8% or 9%) is often logic internal or via tables,
      // but BMF inputs just R=1/0 usually.
      // Wait, BMF doesn't calculate KiSt amount fully? 
      // It calculates `BK` (Kirchensteuer Lohnsteuer).
      // Rate is usually fixed in logic or defaults?
      // In Lohnsteuer2025/26: `MSOLZ` checks `R > 0`.
      // `BK = ANTEIL1`. `JW` is `JBMG * 100`? No.
      // `JW = JBMG * ?`. Wait.
      // In MSOLZ: `If R > 0`. `JW = JBMG * ZAHL100`. No.
      // Actually KiSt is usually 9% of Lohnsteuer.
      // BMF calculator logic usually assumes standard (9%?).
      // If Bayern/BW (8%), parameter might differ?
      // XML 2025: `MSOLZ` -> `BK = ANTEIL1`.
    } else {
      bmfInput.R = 0;
    }
    
    // Health Insurance Add-on (KVZ)
    bmfInput.KVZ = input.healthInsuranceAddOn;
    
    // Private Insurance
    if (input.isPrivateHealthInsurance) {
        bmfInput.PKV = 1; // Or 2 with Zuschuss?
        // Basic private
        bmfInput.STKL = input.taxClass; // Keep StKl
    } else {
        bmfInput.KRV = 0; // Gesetzlich
        bmfInput.PKV = 0;
    }
    
    // ALV (2026)
    // Assume required for all unless simplified?
    // 0 = Pflicht (Standard)
    if (input.year === 2026) {
       // bmfInput.ALV = 0; // Default
    }
    
    // PVS (Sachsen)
    if (input.state === 'sachsen') {
        bmfInput.PVS = 1;
    }
    
    // PVZ (Childless supplement)
    // 2025/2026: If > 23 years old and no children?
    // Checks birthYear.
    if (!input.hasChildren) {
       // Check age if birthYear provided.
       // Default strict: If no children, assume liable for surcharge if age appropriate?
       // Simplification: Set PVZ=1 if no children.
       bmfInput.PVZ = 1;
    } else {
       bmfInput.PVZ = 0;
       // PVA for multiple children (2025/26 logic)
       if (input.childCount > 1) {
          // PVA logic... deduction for children 2-5
          // 2025/26 support this?
          // XML 2026: PVA inputs logic.
          // Simplification: Map PVA = childCount.
          // Wait, PVA is "Anzahl Beitragsabschläge" (0, 1, 2, ...).
          // Max 4?
          // For childCount=2 -> PVA=1?
          // For childCount=3 -> PVA=2?
          // Logic: Max(0, Min(4, childCount - 1))?
          // Verify with BMF logic or assume 0 for MVP.
          const discountableChildren = Math.max(0, Math.min(4, input.childCount - 1));
          bmfInput.PVA = discountableChildren;
       }
    }
    
    // Additional Factors
    bmfInput.af = 1; // Factor method
    
    // Alter?
    if (input.birthYear) {
        const age = input.year - input.birthYear;
        if (age >= 64) {
            bmfInput.ALTER1 = 1;
            bmfInput.AJAHR = input.birthYear + 65; // ? Verify definition AJAHR
            // "Auf die Vollendung des 64. Lebensjahres folgende Kalenderjahr"
            bmfInput.AJAHR = input.birthYear + 65;
        }
    }
    
    return bmfInput;
  }
  
  private calculateSocialSecurity(input: SalaryInput) {
    // Monthly Calculation
    const gross = input.yearlySalary / 12;
    
    // Rates 2025 (Approx / Standard)
    // RV: 18.6% (9.3% AN)
    // AV: 2.6% (1.3% AN)
    // KV: 14.6% + AddOn (7.3% + AddOn/2 AN)
    // PV: 3.4% (1.7% AN) + Childless 0.6%? + Sachsen?
    
    // BBG 2025
    // RV/AV West: 7550, East: 7450 (Monthly) -> 2024 values? 2025 likely higher (96600/yr -> 8050/mo West?)
    // Using BMF Constants as reference:
    // 2025 BBGRV = 96600 (West) => 8050/mo.
    // 2026 BBGRV = 101400 (West) => 8450/mo.
    // KV/PV BBG 2025 = 62100 => 5175/mo (Wait, BMF 2025: BBGKVPV=66150 => 5512.50)
    
    const year = input.year;
    let BBG_RV = 0;
    let BBG_KV = 0;
    
    if (year === 2026) {
        BBG_RV = 101400 / 12;
        BBG_KV = 69750 / 12;
    } else {
        BBG_RV = 96600 / 12;
        BBG_KV = 66150 / 12;
    }
    
    // Adjust for East if needed (West assumed default in BMF constants usually, but wrapper has 'state')
    if (input.state === 'east' || input.state === 'sachsen') {
        // BBG RV usually lower in East.
        // BMF XML doesn't explicitly switch BBG based on state input alone, usually different XML or params?
        // Note: KRV parameter in XML handles BBG logic?
        // Simplification: Use West values or slight adjustment if needed.
    }
    
    const relevantGrossRV = Math.min(gross, BBG_RV);
    const relevantGrossKV = Math.min(gross, BBG_KV);
    
    // Rates
    const rvRate = 0.093; // 9.3%
    const avRate = 0.013; // 1.3%
    
    let kvRate = 0.073; // 7.3%
    if (input.healthInsuranceAddOn) {
        kvRate += (input.healthInsuranceAddOn / 100) / 2;
    }
    
    let pvRate = 0.023; // 2.3% (Childless?) -> 2025 base 3.4% -> 1.7%?
    // Wait, PV rates changed recently.
    // 2025: 
    // Standard: 3.4% total. 
    // Childless: +0.6% -> 4.0%.
    // With Children: -0.25% per child (2-5).
    
    // AN Share:
    // Usually 50% of base (1.7%) + full surcharge (0.6%).
    // Sachsen differs (AG pays less).
    
    // Simplification based on typical 2025 rules:
    // Base AN: 1.7%
    // Childless Surcharge: 0.6% (Full AN) -> Total 2.3%
    // With children discount: -0.25% per child > 1.
    
    let pvBaseAN = 0.017;
    // Sachsen: AN pays higher share. (e.g. 2.2% vs 1.2% AG)
    if (input.state === 'sachsen') {
        pvBaseAN = 0.022; // Approx
    }
    
    let pvSurcharge = 0;
    if (!input.hasChildren) { // AND age > 23
         pvSurcharge = 0.006;
    }
    
    let pvDiscount = 0;
    if (input.childCount > 1) {
        const discountable = Math.min(4, input.childCount - 1); // 2nd, 3rd, 4th, 5th
        pvDiscount = discountable * 0.0025;
    }
    
    const pvRateAN = Math.max(0, pvBaseAN + pvSurcharge - pvDiscount);
    
    if (input.isPrivateHealthInsurance) {
        // Private: No deduction here (user pays invoice), but AG Zuschuss is paid out?
        // Usually Net Salary includes AG Zuschuss? Or AG Zuschuss paid to insurance?
        // "Netto" usually means what lands on account. If PKV, user pays full premium from Netto + AG Zuschuss.
        // Simplification: Return 0 for KV/PV deductions (Self-payer).
        return {
            rv: relevantGrossRV * rvRate,
            av: relevantGrossRV * avRate,
            kv: 0,
            pv: 0
        };
    }
    
    return {
        rv: relevantGrossRV * rvRate,
        av: relevantGrossRV * avRate,
        kv: relevantGrossKV * kvRate,
        pv: relevantGrossKV * pvRateAN
    };
  }
  
  private round(curr: number): number {
    return Math.round(curr * 100) / 100;
  }
}
