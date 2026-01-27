interface SalaryEmailData {
  // User inputs
  tarif?: string;
  gruppe?: string;
  stufe?: string;
  hours?: number;
  state?: string;
  taxClass?: string;
  churchTax?: boolean | string;
  numberOfChildren?: number;
  // Calculation results
  brutto: number;
  netto: number;
  taxes: {
    lohnsteuer: number;
    soli: number;
    kirchensteuer: number;
  };
  socialSecurity: {
    kv: number;
    rv: number;
    av: number;
    pv: number;
  };
  year: number;
}

/**
 * Format a number as German EUR currency
 */
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Build HTML email template for salary calculation results
 */
export function buildSalaryEmail(data: SalaryEmailData): string {
  const tarifMap: Record<string, string> = {
    'tvoed': 'TVöD',
    'tv-l': 'TV-L',
    'avr': 'AVR'
  };

  const tarifDisplay = tarifMap[data.tarif?.toLowerCase() || ''] || data.tarif || 'TVöD';
  const kirchensteuerDisplay = data.churchTax === true || data.churchTax === 'ja' || data.churchTax === 'true' ? 'Ja' : 'Nein';

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deine Gehaltsberechnung</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                Deine Gehaltsberechnung
              </h1>
              <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 16px;">
                Jahr ${data.year}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">

              <!-- Section 1: Deine Angaben -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <h2 style="margin: 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                      📋 Deine Angaben
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 8px; padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Tarifvertrag:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${tarifDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Entgeltgruppe:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${data.gruppe || 'P7'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Erfahrungsstufe:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">Stufe ${data.stufe || '2'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Wochenstunden:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${data.hours || 38.5} Stunden</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Bundesland:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${data.state || '—'}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 16px 0 8px 0;"><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;"></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Steuerklasse:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${data.taxClass || '1'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Kirchensteuer:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${kirchensteuerDisplay}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 50%;">Anzahl Kinder:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${data.numberOfChildren || 0}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Section 2: Berechnungsergebnis -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <h2 style="margin: 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                      💰 Berechnungsergebnis
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 24px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #d1fae5; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Monatliches Bruttogehalt
                    </p>
                    <p style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">
                      ${formatEuro(data.brutto)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 12px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; padding: 20px;">
                      <tr>
                        <td style="padding: 8px 0; color: #166534; font-size: 16px; font-weight: 600;">Monatliches Nettogehalt:</td>
                        <td style="padding: 8px 0; color: #166534; font-size: 20px; font-weight: 700; text-align: right;">${formatEuro(data.netto)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Section 3: Abzüge im Detail -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding-bottom: 16px;">
                    <h2 style="margin: 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                      📉 Abzüge im Detail
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 8px; padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td colspan="2" style="padding-bottom: 12px; color: #475569; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                          Steuern
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Lohnsteuer:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.taxes.lohnsteuer)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Solidaritätszuschlag:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.taxes.soli)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Kirchensteuer:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.taxes.kirchensteuer)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 16px 0 12px 0;">
                          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-bottom: 12px; color: #475569; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                          Sozialversicherung
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Krankenversicherung:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.socialSecurity.kv)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Rentenversicherung:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.socialSecurity.rv)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Arbeitslosenversicherung:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.socialSecurity.av)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Pflegeversicherung:</td>
                        <td style="padding: 6px 0; color: #1e293b; font-size: 14px; font-weight: 600; text-align: right;">${formatEuro(data.socialSecurity.pv)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; color: #475569; font-size: 14px; font-weight: 600;">
                Pflege Gehalt Chatbot
              </p>
              <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
                Diese Berechnung wurde mit dem Pflege Gehalt Chatbot erstellt.<br>
                <strong>Hinweis:</strong> Die Werte sind Schätzungen und können von tatsächlichen Abrechnungen abweichen.<br>
                Für verbindliche Auskünfte konsultiere bitte deinen Arbeitgeber oder Steuerberater.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
