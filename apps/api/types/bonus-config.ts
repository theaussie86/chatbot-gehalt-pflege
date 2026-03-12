/**
 * BonusConfig - Employer-specific bonus and allowance configuration
 *
 * This configuration is stored as JSONB in the projects.bonus_config column
 * and enables dynamic bonus calculations for different employers (e.g., DRK Lübeck).
 */

export interface BonusConfig {
  /**
   * Employer information for personalization
   */
  employer: {
    /** Display name, e.g., "DRK Schwesternschaft Lübeck" */
    name: string;
    /** Custom greeting message for the chatbot */
    greeting: string;
    /** Base tariff system */
    tarif: 'tvoed' | 'tv-l' | 'avr';
  };

  /**
   * Feature flags to enable/disable data collection
   */
  features: {
    /** Collect shift data (night shifts, late shifts, weekend days) */
    collectShiftData: boolean;
    /** Collect qualification data (certifications, specializations) */
    collectQualifications: boolean;
    /** Show one-time bonuses in results (switch bonus, welcome bonus) */
    showOneTimeBonuses: boolean;
  };

  /**
   * TVöD/Tariff-based allowances (Zulagen)
   * These are standard allowances defined in collective agreements.
   */
  allowances?: {
    /** Wechselschichtzulage - shift change allowance */
    shiftChange?: {
      /** Full shift allowance (€) - for regular 3-shift work */
      fullShift: number;
      /** Partial shift allowance (€) - for occasional shift changes */
      partialShift: number;
    };
    /** Nachtarbeitszuschlag - night work surcharge (§3b EStG tax-free) */
    night?: {
      /** Percentage of hourly rate (typically 25%) */
      percentage: number;
    };
    /** Sonntagszuschlag - Sunday work surcharge (§3b EStG tax-free) */
    sunday?: {
      /** Percentage of hourly rate (typically 50%) */
      percentage: number;
    };
    /** Feiertagszuschlag - holiday work surcharge (§3b EStG tax-free) */
    holiday?: {
      /** Percentage of hourly rate (typically 125%) */
      percentage: number;
    };
  };

  /**
   * Employer-specific bonuses (Prämien)
   * These are additional bonuses beyond standard tariff allowances.
   */
  bonuses?: {
    /** Einspringprämie - jump-in/substitute bonus */
    jumpIn?: {
      /** Bonus for jumping in on weekdays (€) */
      weekday: number;
      /** Bonus for jumping in on weekends/holidays (€) */
      weekend: number;
    };

    /** Performance-based bonuses */
    performance?: {
      /** Spätdienst-Bonus - late shift bonus */
      lateShift?: {
        /** Minimum late shifts per month to qualify */
        threshold: number;
        /** Monthly bonus for Pflegefachkraft (€) */
        amount: number;
        /** Monthly bonus for Pflegeassistenz (€) */
        assistantAmount: number;
      };
      /** Nachtdienst-Bonus - night shift bonus */
      nightShift?: {
        /** Minimum night shifts per month to qualify */
        threshold: number;
        /** Monthly bonus for Pflegefachkraft (€) */
        amount: number;
        /** Monthly bonus for Pflegeassistenz (€) */
        assistantAmount: number;
      };
      /** Extra night bonus - for shifts beyond threshold */
      extraNight?: {
        /** First night that qualifies for extra bonus */
        startFrom: number;
        /** Bonus per extra night for Pflegefachkraft (€) */
        amountPerNight: number;
        /** Bonus per extra night for Pflegeassistenz (€) */
        assistantAmountPerNight: number;
      };
    };

    /** Qualifikationszuschläge - qualification bonuses (monthly) */
    qualifications?: Record<string, number>;

    /** One-time bonuses for new employees */
    oneTime?: {
      /** Wechselprämie - switch bonus for experienced nurses */
      switchBonus?: {
        /** Total amount (€) */
        total: number;
        /** Payment schedule description */
        schedule: string;
      };
      /** Willkommensbonus - welcome bonus for new graduates */
      welcomeBonus?: {
        /** Total amount (€) */
        total: number;
        /** Payment schedule description */
        schedule: string;
      };
    };
  };
}

/**
 * Type guard to check if an object is a valid BonusConfig
 */
export function isBonusConfig(obj: unknown): obj is BonusConfig {
  if (!obj || typeof obj !== 'object') return false;
  const config = obj as BonusConfig;

  return (
    typeof config.employer === 'object' &&
    typeof config.employer.name === 'string' &&
    typeof config.employer.greeting === 'string' &&
    ['tvoed', 'tv-l', 'avr'].includes(config.employer.tarif) &&
    typeof config.features === 'object' &&
    typeof config.features.collectShiftData === 'boolean' &&
    typeof config.features.collectQualifications === 'boolean' &&
    typeof config.features.showOneTimeBonuses === 'boolean'
  );
}
