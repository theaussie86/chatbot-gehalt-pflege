/**
 * AllowanceCalculator - Calculates employer-specific allowances and bonuses
 *
 * Calculation Assumptions:
 * - 169 working hours/month (~39h/week standard for TVöD)
 * - 8 hours per shift (night, late, weekend)
 * - 50% of weekend days are Sundays (simplified)
 * - Jump-ins: 70% weekday, 30% weekend (average distribution)
 * - Holiday surcharges not separately queried (TODO for future version)
 *
 * Tax Treatment (§3b EStG):
 * - Tax-free: Night surcharges (25%), Sunday surcharges (50%), Holiday surcharges (125%)
 * - Taxable: Shift change allowance, qualification bonuses, performance bonuses, jump-in bonuses
 */

import { BonusConfig } from '../../types/bonus-config';
import { EmployeeType, AllowancesBreakdown, OneTimeBonuses } from '../../types/form';

/**
 * Input data for shift calculations
 */
export interface ShiftData {
  nightShifts: number;
  lateShifts: number;
  weekendDays: number;
  jumpInFrequency: number;
}

/**
 * Complete result from allowance calculation
 */
export interface AllowanceResult {
  taxFree: {
    night: number;
    sunday: number;
    holiday: number;
  };
  taxable: {
    shiftChange: number;
    qualifications: number;
    performance: number;
    jumpIn: number;
  };
  oneTimeBonuses?: OneTimeBonuses;
  total: number;
  breakdown: string[];
}

/**
 * Constants for calculation
 */
const HOURS_PER_MONTH = 169; // ~39h/week
const HOURS_PER_SHIFT = 8;
const SUNDAY_RATIO = 0.5; // 50% of weekend days are Sundays
const WEEKDAY_JUMP_IN_RATIO = 0.7; // 70% of jump-ins are on weekdays

export class AllowanceCalculator {
  constructor(private config: BonusConfig) {}

  /**
   * Calculate all allowances based on shift data and qualifications
   *
   * @param shifts - Shift data (night shifts, late shifts, weekend days, jump-ins)
   * @param qualifications - Array of qualification keys (e.g., ['wundmanager', 'praxisanleiter'])
   * @param employeeType - 'fachkraft' or 'assistenz'
   * @param baseSalary - Monthly base salary in Euro
   * @returns Complete allowance breakdown
   */
  calculate(
    shifts: ShiftData,
    qualifications: string[],
    employeeType: EmployeeType,
    baseSalary: number
  ): AllowanceResult {
    const hourlyRate = baseSalary / HOURS_PER_MONTH;
    const breakdown: string[] = [];

    // 1. Tax-free SFN surcharges (§3b EStG)
    const taxFree = {
      night: this.calculateNightAllowance(shifts.nightShifts, hourlyRate, breakdown),
      sunday: this.calculateSundayAllowance(shifts.weekendDays, hourlyRate, breakdown),
      holiday: 0 // Simplified: Holidays not separately queried
    };

    // 2. Taxable allowances
    const taxable = {
      shiftChange: this.calculateShiftChangeAllowance(shifts, breakdown),
      qualifications: this.calculateQualificationBonus(qualifications, breakdown),
      performance: this.calculatePerformanceBonus(shifts, employeeType, breakdown),
      jumpIn: this.calculateJumpInBonus(shifts.jumpInFrequency, breakdown)
    };

    // 3. One-time bonuses (shown separately, not in monthly calculation)
    const oneTimeBonuses = this.config.features.showOneTimeBonuses
      ? this.getOneTimeBonuses()
      : undefined;

    // Calculate total monthly allowances
    const total =
      taxFree.night + taxFree.sunday + taxFree.holiday +
      taxable.shiftChange + taxable.qualifications +
      taxable.performance + taxable.jumpIn;

    return { taxFree, taxable, oneTimeBonuses, total, breakdown };
  }

  /**
   * Convert AllowanceResult to FormState-compatible AllowancesBreakdown
   */
  toFormStateBreakdown(result: AllowanceResult): AllowancesBreakdown {
    return {
      taxFree: result.taxFree,
      taxable: result.taxable,
      total: result.total,
      breakdown: result.breakdown
    };
  }

  /**
   * Calculate night work surcharge (Nachtarbeitszuschlag)
   * Tax-free according to §3b EStG (up to 25% for hours 20:00-06:00)
   */
  private calculateNightAllowance(
    nightShifts: number,
    hourlyRate: number,
    breakdown: string[]
  ): number {
    if (!nightShifts || nightShifts <= 0) return 0;

    const percentage = this.config.allowances?.night?.percentage || 25;
    const amount = nightShifts * HOURS_PER_SHIFT * hourlyRate * (percentage / 100);

    if (amount > 0) {
      breakdown.push(
        `Nachtarbeitszuschlag (${nightShifts} Dienste): +${Math.round(amount)}€ (steuerfrei)`
      );
    }

    return amount;
  }

  /**
   * Calculate Sunday work surcharge (Sonntagszuschlag)
   * Tax-free according to §3b EStG (up to 50%)
   */
  private calculateSundayAllowance(
    weekendDays: number,
    hourlyRate: number,
    breakdown: string[]
  ): number {
    if (!weekendDays || weekendDays <= 0) return 0;

    const percentage = this.config.allowances?.sunday?.percentage || 50;
    // Assumption: 50% of weekend days are Sundays
    const sundayShifts = Math.floor(weekendDays * SUNDAY_RATIO);
    const amount = sundayShifts * HOURS_PER_SHIFT * hourlyRate * (percentage / 100);

    if (amount > 0) {
      breakdown.push(
        `Sonntagszuschlag (${sundayShifts} Tage): +${Math.round(amount)}€ (steuerfrei)`
      );
    }

    return amount;
  }

  /**
   * Calculate shift change allowance (Wechselschichtzulage)
   * Taxable - added to gross before tax calculation
   */
  private calculateShiftChangeAllowance(shifts: ShiftData, breakdown: string[]): number {
    if (!this.config.allowances?.shiftChange) return 0;

    // Full shift allowance: Regular night AND late shifts
    const hasRegularShiftChange = shifts.nightShifts >= 4 && shifts.lateShifts >= 4;

    let amount: number;
    if (hasRegularShiftChange) {
      amount = this.config.allowances.shiftChange.fullShift;
    } else if (shifts.nightShifts >= 2) {
      amount = this.config.allowances.shiftChange.partialShift;
    } else {
      amount = 0;
    }

    if (amount > 0) {
      breakdown.push(`Wechselschichtzulage: +${amount}€`);
    }

    return amount;
  }

  /**
   * Calculate qualification bonuses (Qualifikationszuschläge)
   * Taxable - monthly addition to base salary
   */
  private calculateQualificationBonus(qualifications: string[], breakdown: string[]): number {
    if (!this.config.bonuses?.qualifications || !qualifications.length) return 0;

    let total = 0;
    for (const qual of qualifications) {
      const amount = this.config.bonuses.qualifications[qual];
      if (amount) {
        total += amount;
        // Capitalize first letter and replace underscores with spaces
        const label = qual.charAt(0).toUpperCase() + qual.slice(1).replace(/_/g, ' ');
        breakdown.push(`Qualifikation ${label}: +${amount}€`);
      }
    }

    return total;
  }

  /**
   * Calculate performance bonuses (Leistungsprämien)
   * Taxable - based on shift thresholds
   */
  private calculatePerformanceBonus(
    shifts: ShiftData,
    employeeType: EmployeeType,
    breakdown: string[]
  ): number {
    if (!this.config.bonuses?.performance) return 0;

    let total = 0;
    const perf = this.config.bonuses.performance;
    const isFachkraft = employeeType === 'fachkraft';

    // Late shift bonus (Spätdienst-Bonus)
    if (perf.lateShift && shifts.lateShifts >= perf.lateShift.threshold) {
      const amount = isFachkraft ? perf.lateShift.amount : perf.lateShift.assistantAmount;
      total += amount;
      breakdown.push(`Spätdienst-Bonus (ab ${perf.lateShift.threshold} Dienste): +${amount}€`);
    }

    // Night shift bonus (Nachtdienst-Bonus)
    if (perf.nightShift && shifts.nightShifts >= perf.nightShift.threshold) {
      const amount = isFachkraft ? perf.nightShift.amount : perf.nightShift.assistantAmount;
      total += amount;
      breakdown.push(`Nachtdienst-Bonus (ab ${perf.nightShift.threshold} Dienste): +${amount}€`);

      // Extra night bonus (beyond threshold)
      if (perf.extraNight && shifts.nightShifts >= perf.extraNight.startFrom) {
        const extraNights = shifts.nightShifts - perf.extraNight.startFrom + 1;
        const extraAmount = extraNights * (
          isFachkraft ? perf.extraNight.amountPerNight : perf.extraNight.assistantAmountPerNight
        );
        total += extraAmount;
        breakdown.push(`Zusatz-Nächte (${extraNights}×): +${extraAmount}€`);
      }
    }

    return total;
  }

  /**
   * Calculate jump-in bonuses (Einspringprämien)
   * Taxable - based on average jump-in frequency
   */
  private calculateJumpInBonus(jumpInFrequency: number, breakdown: string[]): number {
    if (!this.config.bonuses?.jumpIn || !jumpInFrequency || jumpInFrequency <= 0) return 0;

    // Distribution assumption: 70% weekday, 30% weekend
    const weekdayJumpIns = Math.floor(jumpInFrequency * WEEKDAY_JUMP_IN_RATIO);
    const weekendJumpIns = jumpInFrequency - weekdayJumpIns;

    const amount =
      weekdayJumpIns * this.config.bonuses.jumpIn.weekday +
      weekendJumpIns * this.config.bonuses.jumpIn.weekend;

    if (amount > 0) {
      breakdown.push(`Einspringprämien (${jumpInFrequency}× im Schnitt): +${amount}€`);
    }

    return amount;
  }

  /**
   * Get one-time bonuses configuration
   */
  private getOneTimeBonuses(): OneTimeBonuses | undefined {
    const oneTime = this.config.bonuses?.oneTime;
    if (!oneTime) return undefined;

    const result: OneTimeBonuses = {};

    if (oneTime.switchBonus) {
      result.switchBonus = {
        total: oneTime.switchBonus.total,
        schedule: oneTime.switchBonus.schedule
      };
    }

    if (oneTime.welcomeBonus) {
      result.welcomeBonus = {
        total: oneTime.welcomeBonus.total,
        schedule: oneTime.welcomeBonus.schedule
      };
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Get total taxable allowances (for TaxWrapper integration)
   */
  getTaxableTotal(result: AllowanceResult): number {
    return (
      result.taxable.shiftChange +
      result.taxable.qualifications +
      result.taxable.performance +
      result.taxable.jumpIn
    );
  }

  /**
   * Get total tax-free allowances (for TaxWrapper integration)
   */
  getTaxFreeTotal(result: AllowanceResult): number {
    return result.taxFree.night + result.taxFree.sunday + result.taxFree.holiday;
  }
}
