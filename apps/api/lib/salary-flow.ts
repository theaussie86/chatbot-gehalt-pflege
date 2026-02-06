import { FormState } from "../types/form";

export type StepResult = {
  nextState: FormState;
  shouldExtend: boolean; // If true, we need more info from user
  systemInstructions: string;
};

export type SectionType = 'job_details' | 'tax_details' | 'summary' | 'completed';

export class SalaryStateMachine {

  // Define required fields for each state to act as Guardrails
  private static REQUIREMENTS: Record<string, string[]> = {
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
    birthYear: 'Geburtsjahr'
  };

  /**
   * Check if all required fields for the current phase are complete
   * @param currentState The current form state
   * @returns True if the current phase is complete
   */
  static isPhaseComplete(currentState: FormState): boolean {
    const section = currentState.section;
    if (section === 'summary' || section === 'completed') {
      return true;
    }

    const sectionData = currentState.data[section as 'job_details' | 'tax_details'] || {};
    const required = this.REQUIREMENTS[section] || [];
    const missing = this.getMissingFields(sectionData, required);

    return missing.length === 0;
  }

  /**
   * Check if all data collection is complete (all phases)
   * @param currentState The current form state
   * @returns True if all required data has been collected
   */
  static isComplete(currentState: FormState): boolean {
    // Check job_details
    const jobRequired = this.REQUIREMENTS.job_details;
    const jobData = currentState.data.job_details || {};
    const jobMissing = this.getMissingFields(jobData, jobRequired);

    if (jobMissing.length > 0) return false;

    // Check tax_details
    const taxRequired = this.REQUIREMENTS.tax_details;
    const taxData = currentState.data.tax_details || {};
    const taxMissing = this.getMissingFields(taxData, taxRequired);

    if (taxMissing.length > 0) return false;

    return true;
  }

  /**
   * Check if a transition to the target state is valid
   * @param currentState The current form state
   * @param nextSection The desired next section
   * @returns True if the transition is valid
   */
  static canTransition(currentState: FormState, nextSection: SectionType): boolean {
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
      return this.isPhaseComplete(currentState);
    }

    if (nextSection === 'summary' && currentState.section === 'tax_details') {
      return this.isPhaseComplete(currentState);
    }

    if (nextSection === 'completed' && currentState.section === 'summary') {
      return this.isComplete(currentState);
    }

    return true;
  }

  /**
   * Get progress percentage (0-100) based on collected fields
   * @param currentState The current form state
   * @returns Progress percentage
   */
  static getProgress(currentState: FormState): number {
    const allRequired = [
      ...this.REQUIREMENTS.job_details,
      ...this.REQUIREMENTS.tax_details
    ];
    const totalRequired = allRequired.length;

    if (totalRequired === 0) return 100;

    const jobData = currentState.data.job_details || {};
    const taxData = currentState.data.tax_details || {};

    const jobMissing = this.getMissingFields(jobData, this.REQUIREMENTS.job_details);
    const taxMissing = this.getMissingFields(taxData, this.REQUIREMENTS.tax_details);

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
   */
  static getNextStep(currentState: FormState): StepResult {
    // Clone to avoid mutation side-effects on input
    const nextState: FormState = JSON.parse(JSON.stringify(currentState));
    
    // --- STATE: JOB DETAILS ---
    if (nextState.section === 'job_details') {
      const remaining = this.getMissingFields(
        nextState.data.job_details || {}, 
        this.REQUIREMENTS.job_details
      );
      
      nextState.missingFields = remaining;

      if (remaining.length === 0) {
        // Transition: JOB_DETAILS -> TAX_DETAILS
        nextState.section = 'tax_details';
        // Check next requirements immediately
        nextState.missingFields = this.getMissingFields(
          nextState.data.tax_details || {},
          this.REQUIREMENTS.tax_details
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
        this.REQUIREMENTS.tax_details
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
}
