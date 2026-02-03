import { InquiryRow, Citation } from '@/app/actions/inquiries';

interface InquiryDetailProps {
  inquiry: InquiryRow;
}

/**
 * Consolidate citations for display by document name
 * Extracts unique page numbers and formats them comma-separated
 */
function consolidateCitationsForDisplay(citations: Citation[]): Array<{ documentName: string; pages: string }> {
  const byDocument = new Map<string, Set<string>>();

  for (const citation of citations) {
    const existing = byDocument.get(citation.documentName);
    if (existing) {
      // Extract individual page references from the combined string (e.g., "S. 5, S. 7")
      if (citation.pages) {
        const pageMatches = citation.pages.match(/S\.\s*\d+(?:-\d+)?/g);
        if (pageMatches) {
          pageMatches.forEach(p => existing.add(p));
        }
      }
    } else {
      const pages = new Set<string>();
      if (citation.pages) {
        const pageMatches = citation.pages.match(/S\.\s*\d+(?:-\d+)?/g);
        if (pageMatches) {
          pageMatches.forEach(p => pages.add(p));
        }
      }
      byDocument.set(citation.documentName, pages);
    }
  }

  // Convert to array and sort by document name
  return Array.from(byDocument.entries())
    .map(([documentName, pages]) => ({
      documentName,
      pages: Array.from(pages).join(', ')
    }))
    .sort((a, b) => a.documentName.localeCompare(b.documentName));
}

export default function InquiryDetail({ inquiry }: InquiryDetailProps) {
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '-';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const formatBoolean = (value: boolean | string | undefined) => {
    if (value === undefined || value === null) return '-';
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'yes' || lower === 'ja' || lower === 'true') return 'Ja';
      if (lower === 'no' || lower === 'nein' || lower === 'false') return 'Nein';
    }
    return String(value);
  };

  const jobDetails = inquiry.details?.job_details || {};
  const taxDetails = inquiry.details?.tax_details || {};
  const taxes = inquiry.details?.taxes;
  const socialSecurity = inquiry.details?.socialSecurity;
  const citations = inquiry.details?.citations;

  return (
    <div className="space-y-6">
      {/* Job Details */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Berufliche Daten
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Tarifvertrag:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {jobDetails.tarif?.toUpperCase() || '-'}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Entgeltgruppe:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {jobDetails.group || inquiry.gruppe || '-'}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Erfahrungsstufe:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {jobDetails.experience || inquiry.stufe || '-'}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Wochenstunden:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {jobDetails.hours || '-'}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Bundesland:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {jobDetails.state || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Details */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Steuerliche Daten
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Steuerklasse:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {taxDetails.taxClass || '-'}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Kirchensteuer:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatBoolean(taxDetails.churchTax)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Anzahl Kinder:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {taxDetails.numberOfChildren || taxDetails.childCount || '0'}
            </p>
          </div>
        </div>
      </div>

      {/* Tax Breakdown */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Steuerabzüge
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Lohnsteuer:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(taxes?.lohnsteuer)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Solidaritätszuschlag:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(taxes?.soli)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Kirchensteuer:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(taxes?.kirchensteuer)}
            </p>
          </div>
        </div>
      </div>

      {/* Social Security */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Sozialabgaben
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Krankenversicherung:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(socialSecurity?.kv)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Rentenversicherung:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(socialSecurity?.rv)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Arbeitslosenversicherung:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(socialSecurity?.av)}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Pflegeversicherung:</span>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {formatCurrency(socialSecurity?.pv)}
            </p>
          </div>
        </div>
      </div>

      {/* Email */}
      {inquiry.email && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            E-Mail
          </h3>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {inquiry.email}
          </p>
        </div>
      )}

      {/* Citations - Admin traceability (Phase 11) */}
      {citations && citations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Quellenangaben
          </h3>
          <div className="space-y-2">
            {consolidateCitationsForDisplay(citations).map((citation, index) => (
              <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {citation.documentName}
                </span>
                {citation.pages && (
                  <span className="ml-1">, {citation.pages}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
