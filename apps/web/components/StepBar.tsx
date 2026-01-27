import React from 'react';

interface StepBarProps {
  currentSection: 'job_details' | 'tax_details' | 'summary' | 'completed';
}

interface Step {
  id: string;
  label: string;
  section: 'job_details' | 'tax_details' | 'summary' | 'completed';
}

const STEPS: Step[] = [
  { id: '1', label: 'Jobdaten', section: 'job_details' },
  { id: '2', label: 'Steuerdaten', section: 'tax_details' },
  { id: '3', label: 'Übersicht', section: 'summary' },
  { id: '4', label: 'Ergebnis', section: 'completed' },
];

export const StepBar: React.FC<StepBarProps> = ({ currentSection }) => {
  const currentStepIndex = STEPS.findIndex(step => step.section === currentSection);

  const getStepState = (index: number): 'completed' | 'current' | 'upcoming' => {
    if (index < currentStepIndex) return 'completed';
    if (index === currentStepIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const state = getStepState(index);
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Step Circle and Label */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                {/* Circle */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300
                    ${state === 'completed'
                      ? 'bg-[var(--primary-color)] text-white shadow-sm'
                      : state === 'current'
                      ? 'bg-white border-2 border-[var(--primary-color)] text-[var(--primary-color)] ring-4 ring-[var(--primary-light)]'
                      : 'bg-slate-200 text-slate-400 border-2 border-slate-300'
                    }
                  `}
                >
                  {state === 'completed' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>
                {/* Label */}
                <span
                  className={`
                    text-xs font-medium transition-colors duration-300
                    ${state === 'current'
                      ? 'text-[var(--primary-color)]'
                      : state === 'completed'
                      ? 'text-slate-600'
                      : 'text-slate-400'
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 transition-colors duration-300
                    ${state === 'completed'
                      ? 'bg-[var(--primary-color)]'
                      : 'bg-slate-300'
                    }
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
