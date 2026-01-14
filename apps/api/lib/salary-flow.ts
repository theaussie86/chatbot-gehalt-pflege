import { FormState } from "../types/form";

export type StepResult = {
  nextState: FormState;
  shouldExtend: boolean; // If true, we need more info from user
  systemInstructions: string;
};

export class SalaryStateMachine {
  
  // Define required fields for each state to act as Guardrails
  private static REQUIREMENTS = {
    job_details: ['tarif', 'experience', 'hours', 'state'],
    tax_details: ['taxClass', 'churchTax', 'numberOfChildren'],
    summary: []
  };

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
