import { FormState, CalculationResult } from "../types/form";
import { BonusConfig } from "../types/bonus-config";

export type StepResult = {
  nextState: FormState;
  shouldExtend: boolean; // If true, we need more info from user
  systemInstructions: string;
};

export type SectionType = 'job_details' | 'tax_details' | 'summary' | 'completed';

export class SalaryStateMachine {

  // Base required fields for each state (without employer-specific fields)
  private static BASE_REQUIREMENTS: Record<string, string[]> = {
    job_details: ['tarif', 'group', 'experience', 'hours', 'state'],
    tax_details: ['taxClass', 'churchTax', 'numberOfChildren'],
    summary: [],
    completed: []
  };

  // User-friendly field labels for German display
  private static FIELD_LABELS: Record<string, string> = {
    tarif: 'Tarifvertrag',
    group: 'Entgeltgruppe',
    experience: 'Berufserfahrung/Stufe',
    hours: 'Wochenstunden',
    state: 'Bundesland',
    taxClass: 'Steuerklasse',
    churchTax: 'Kirchensteuer',
    numberOfChildren: 'Anzahl Kinder',
    hasChildren: 'Kinder',
    childCount: 'Kinderanzahl',
    birthYear: 'Geburtsjahr',
    // DRK-specific fields
    employeeType: 'Berufsgruppe',
    nightShifts: 'Nachtdienste pro Monat',
    lateShifts: 'Spätdienste pro Monat',
    weekendDays: 'Wochenend-Tage pro Monat',
    jumpInFrequency: 'Einspringen pro Monat',
    qualifications: 'Zusatzqualifikationen',
  };

  /**
   * Get requirements for a section, optionally extended by BonusConfig features
   * @param section The section to get requirements for
   * @param config Optional BonusConfig to add employer-specific fields
   * @returns Array of required field names
   */
  static getRequirements(section: string, config?: BonusConfig | null): string[] {
    const base = [...(this.BASE_REQUIREMENTS[section] || [])];

    if (section === 'job_details' && config?.features) {
      // employeeType for premium differentiation (Fachkraft vs Assistenz)
      if (config.bonuses?.performance) {
        base.push('employeeType');
      }
      // Shift data collection
      if (config.features.collectShiftData) {
        base.push('nightShifts', 'lateShifts', 'weekendDays', 'jumpInFrequency');
      }
      // Qualifications collection
      if (config.features.collectQualifications) {
        base.push('qualifications');
      }
    }
    return base;
  }

  /**
   * Check if all required fields for the current phase are complete
   * @param currentState The current form state
   * @param config Optional BonusConfig for employer-specific requirements
   * @returns True if the current phase is complete
   */
  static isPhaseComplete(currentState: FormState, config?: BonusConfig | null): boolean {
    const section = currentState.section;
    if (section === 'summary' || section === 'completed') {
      return true;
    }

    const sectionData = currentState.data[section as 'job_details' | 'tax_details'] || {};
    const required = this.getRequirements(section, config);
    const missing = this.getMissingFields(sectionData, required);

    return missing.length === 0;
  }

  /**
   * Check if all data collection is complete (all phases)
   * @param currentState The current form state
   * @param config Optional BonusConfig for employer-specific requirements
   * @returns True if all required data has been collected
   */
  static isComplete(currentState: FormState, config?: BonusConfig | null): boolean {
    // Check job_details
    const jobRequired = this.getRequirements('job_details', config);
    const jobData = currentState.data.job_details || {};
    const jobMissing = this.getMissingFields(jobData, jobRequired);

    if (jobMissing.length > 0) return false;

    // Check tax_details
    const taxRequired = this.getRequirements('tax_details', config);
    const taxData = currentState.data.tax_details || {};
    const taxMissing = this.getMissingFields(taxData, taxRequired);

    if (taxMissing.length > 0) return false;

    return true;
  }

  /**
   * Check if a transition to the target state is valid
   * @param currentState The current form state
   * @param nextSection The desired next section
   * @param config Optional BonusConfig for employer-specific requirements
   * @returns True if the transition is valid
   */
  static canTransition(currentState: FormState, nextSection: SectionType, config?: BonusConfig | null): boolean {
    const validTransitions: Record<string, SectionType[]> = {
      job_details: ['tax_details'],
      tax_details: ['summary', 'job_details'], // Can go back to job_details for modifications
      summary: ['completed', 'job_details', 'tax_details'], // Can modify or complete
      completed: [] // No transitions from completed
    };

    const allowedNext = validTransitions[currentState.section] || [];

    // Check if transition is allowed
    if (!allowedNext.includes(nextSection)) {
      return false;
    }

    // For forward transitions, check if current phase is complete
    if (nextSection === 'tax_details' && currentState.section === 'job_details') {
      return this.isPhaseComplete(currentState, config);
    }

    if (nextSection === 'summary' && currentState.section === 'tax_details') {
      return this.isPhaseComplete(currentState, config);
    }

    if (nextSection === 'completed' && currentState.section === 'summary') {
      return this.isComplete(currentState, config);
    }

    return true;
  }

  /**
   * Get progress percentage (0-100) based on collected fields
   * @param currentState The current form state
   * @param config Optional BonusConfig for employer-specific requirements
   * @returns Progress percentage
   */
  static getProgress(currentState: FormState, config?: BonusConfig | null): number {
    const jobReq = this.getRequirements('job_details', config);
    const taxReq = this.getRequirements('tax_details', config);
    const allRequired = [...jobReq, ...taxReq];
    const totalRequired = allRequired.length;

    if (totalRequired === 0) return 100;

    const jobData = currentState.data.job_details || {};
    const taxData = currentState.data.tax_details || {};

    const jobMissing = this.getMissingFields(jobData, jobReq);
    const taxMissing = this.getMissingFields(taxData, taxReq);

    const totalMissing = jobMissing.length + taxMissing.length;
    const collected = totalRequired - totalMissing;

    return Math.round((collected / totalRequired) * 100);
  }

  /**
   * Get a user-friendly label for a field name
   * @param fieldName The internal field name
   * @returns User-friendly German label
   */
  static getFieldLabel(fieldName: string): string {
    return this.FIELD_LABELS[fieldName] || fieldName;
  }

  /**
   * Format collected data for summary display
   * @param currentState The current form state
   * @returns Formatted summary string in German
   */
  static formatSummary(currentState: FormState): string {
    const lines: string[] = [];

    lines.push('📋 **Zusammenfassung deiner Angaben:**\n');

    // Job Details
    const jobData = currentState.data.job_details;
    if (jobData) {
      lines.push('**Berufliche Daten:**');
      if (jobData.tarif) lines.push(`• Tarifvertrag: ${jobData.tarif}`);
      if (jobData.group) lines.push(`• Entgeltgruppe: ${jobData.group}`);
      if (jobData.experience) lines.push(`• Erfahrungsstufe: ${jobData.experience}`);
      if (jobData.hours) lines.push(`• Wochenstunden: ${jobData.hours}`);
      if (jobData.state) lines.push(`• Bundesland: ${jobData.state}`);
      lines.push('');
    }

    // Tax Details
    const taxData = currentState.data.tax_details;
    if (taxData) {
      lines.push('**Steuerliche Daten:**');
      if (taxData.taxClass) lines.push(`• Steuerklasse: ${taxData.taxClass}`);
      if (taxData.churchTax !== undefined) {
        const churchTaxStr = this.formatBoolean(taxData.churchTax);
        lines.push(`• Kirchensteuer: ${churchTaxStr}`);
      }
      if (taxData.numberOfChildren !== undefined) {
        lines.push(`• Anzahl Kinder: ${taxData.numberOfChildren}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format boolean values for German display
   */
  private static formatBoolean(value: boolean | string | undefined): string {
    if (value === true || value === 'true' || value === 'ja' || value === 'yes') {
      return 'Ja';
    }
    return 'Nein';
  }

  /**
   * Evaluates the current state and data to determine the next step.
   * This is the functional "next()" transition logic.
   * @param currentState The current form state
   * @param config Optional BonusConfig for employer-specific requirements
   */
  static getNextStep(currentState: FormState, config?: BonusConfig | null): StepResult {
    // Clone to avoid mutation side-effects on input
    const nextState: FormState = JSON.parse(JSON.stringify(currentState));

    const jobRequirements = this.getRequirements('job_details', config);
    const taxRequirements = this.getRequirements('tax_details', config);

    // --- STATE: JOB DETAILS ---
    if (nextState.section === 'job_details') {
      const remaining = this.getMissingFields(
        nextState.data.job_details || {},
        jobRequirements
      );

      nextState.missingFields = remaining;

      if (remaining.length === 0) {
        // Transition: JOB_DETAILS -> TAX_DETAILS
        nextState.section = 'tax_details';
        // Check next requirements immediately
        nextState.missingFields = this.getMissingFields(
          nextState.data.tax_details || {},
          taxRequirements
        );

        return {
          nextState,
          shouldExtend: true, // We need to now ask for tax details
          systemInstructions: "Der Nutzer hat alle Job-Informationen gegeben. Bedanke dich kurz und leite über zur Netto-Berechnung. Frage nach: " + nextState.missingFields.join(', ')
        };
      } else {
        // Stay in JOB_DETAILS
        return {
          nextState,
          shouldExtend: true,
          systemInstructions: "FÜR DEN ASSISTENTEN: Es fehlen noch folgende Werte für die Brutto-Berechnung: " + remaining.join(', ') + ". Frage gezielt danach."
        };
      }
    }

    // --- STATE: TAX DETAILS ---
    if (nextState.section === 'tax_details') {
      const remaining = this.getMissingFields(
        nextState.data.tax_details || {},
        taxRequirements
      );

      nextState.missingFields = remaining;

      if (remaining.length === 0) {
        // Transition: TAX_DETAILS -> SUMMARY
        nextState.section = 'summary';
        nextState.missingFields = [];

        return {
          nextState,
          shouldExtend: true, // Ask for confirmation
          systemInstructions: "Alle Daten sind vollständig. Fasse die Daten (Job + Steuer) kurz zusammen und frage, ob die Berechnung gestartet werden soll."
        };
      } else {
         // Stay in TAX_DETAILS
         return {
          nextState,
          shouldExtend: true,
          systemInstructions: "FÜR DEN ASSISTENTEN: Es fehlen noch folgende Werte für die Netto-Berechnung: " + remaining.join(', ') + ". Frage gezielt danach."
        };
      }
    }

    // --- STATE: SUMMARY ---
    if (nextState.section === 'summary') {
      // Here usually we wait for user confirmation ("Yes, calculate").
      // The logic here depends on how we detect "confirmation".
      // For now, if we are in summary, the agent just waits for a "Go".
      return {
        nextState,
        shouldExtend: false, // Ready to calculate if user said yes, but usually handled by Agent or separate trigger
        systemInstructions: "Warte auf Bestätigung des Nutzers."
      };
    }

    // --- STATE: COMPLETED ---
    if (nextState.section === 'completed') {
      return {
        nextState,
        shouldExtend: false,
        systemInstructions: "Die Berechnung ist abgeschlossen. Du kannst dem Nutzer weitere Fragen beantworten oder ihm bei neuen Berechnungen helfen."
      };
    }

    return {
      nextState,
      shouldExtend: false,
      systemInstructions: ""
    };
  }

  private static getMissingFields(currentData: any, required: string[]): string[] {
    const existingKeys = Object.keys(currentData || {});
    // Filter out fields that are present AND not empty/null
    return required.filter(key => {
        const val = currentData[key];
        return val === undefined || val === null || val === '';
    });
  }

  /**
   * Format calculation result for display to user
   * @param result The calculation result from FormState
   * @param config Optional BonusConfig for employer-specific formatting
   * @returns Formatted result string in German
   */
  static formatResult(result: CalculationResult, config?: BonusConfig | null): string {
    const lines: string[] = [];

    // Header with employer name if available
    const employerName = config?.employer?.name;
    lines.push(`## 💰 Deine Gehaltsberechnung${employerName ? ` beim ${employerName}` : ''}\n`);

    // Base salary
    if (result.brutto) {
      lines.push(`**Grundgehalt:** ${result.brutto.toFixed(0)} € brutto\n`);
    }

    // Allowances breakdown (if present)
    if (result.allowances && result.allowances.breakdown && result.allowances.breakdown.length > 0) {
      lines.push('### Monatliche Zulagen & Prämien:\n');
      for (const item of result.allowances.breakdown) {
        lines.push(`- ${item}`);
      }
      lines.push(`- **Gesamt Zulagen:** +${result.allowances.total.toFixed(0)} €\n`);
    }

    // Net calculation breakdown
    lines.push('### Netto-Berechnung:\n');

    // Show adjusted brutto if there are taxable allowances
    const taxableAllowances = result.allowances?.taxable;
    const taxableTotal = taxableAllowances
      ? (taxableAllowances.shiftChange || 0) +
        (taxableAllowances.qualifications || 0) +
        (taxableAllowances.performance || 0) +
        (taxableAllowances.jumpIn || 0)
      : 0;

    if (taxableTotal > 0 && result.brutto) {
      lines.push(`- Brutto inkl. steuerp. Zulagen: ${(result.brutto + taxableTotal).toFixed(0)} €`);
    }

    if (result.taxes !== undefined) {
      lines.push(`- Lohnsteuer: -${result.taxes.toFixed(0)} €`);
    }
    if (result.socialContributions !== undefined) {
      lines.push(`- Sozialabgaben: -${result.socialContributions.toFixed(0)} €`);
    }
    if (result.netto !== undefined) {
      lines.push(`- **Netto:** ${result.netto.toFixed(0)} €`);
    }

    // Tax-free allowances added to netto
    if (result.allowances?.taxFree) {
      const taxFreeTotal = (result.allowances.taxFree.night || 0) +
                           (result.allowances.taxFree.sunday || 0) +
                           (result.allowances.taxFree.holiday || 0);
      if (taxFreeTotal > 0) {
        lines.push(`- + Steuerfreie Zuschläge: +${taxFreeTotal.toFixed(0)} €`);
      }
    }

    // Final payout amount
    if (result.nettoWithAllowances !== undefined) {
      lines.push(`- **Dein Auszahlungsbetrag: ca. ${result.nettoWithAllowances.toFixed(0)} €**\n`);
    }

    // One-time bonuses (for new employees)
    if (result.oneTimeBonuses && config?.features?.showOneTimeBonuses) {
      lines.push('### Zusätzlich als Neueinsteiger:\n');
      if (result.oneTimeBonuses.switchBonus) {
        lines.push(`🎁 **Wechselprämie:** ${result.oneTimeBonuses.switchBonus.total} € (${result.oneTimeBonuses.switchBonus.schedule})`);
      }
      if (result.oneTimeBonuses.welcomeBonus) {
        lines.push(`🎁 **Willkommensbonus:** ${result.oneTimeBonuses.welcomeBonus.total} € (${result.oneTimeBonuses.welcomeBonus.schedule})`);
      }
    }

    return lines.join('\n');
  }
}
