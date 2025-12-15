export interface TaxInput {
  // BMF Input Parameters (2025/2026)
  af?: number; // 1 = Faktorverfahren (nur StKl 4)
  AJAHR?: number; // Jahr nach Vollendung des 64. Lebensjahres
  ALTER1?: number; // 1 wenn 64. Lebensjahr zu Beginn des Jahres vollendet
  ALV?: number; // 2026: Arbeitslosenversicherung (0=pflicht, 1=nicht)
  f?: number; // Faktor
  JFREIB?: number; // Jahresfreibetrag
  JHINZU?: number; // Jahreshinzurechnungsbetrag
  JRE4?: number; // Voraussichtlicher Jahresarbeitslohn
  JRE4ENT?: number; // Entschädigungen in JRE4
  JVBEZ?: number; // Versorgungsbezüge in JRE4
  KRV?: number; // 0=gesetzlich, 1=privat/keine, 2=freiwillig (check logic?) mostly 0 or 1 in BMF logic usually 0=pflicht, 1=nicht, 2=freiwillig varies slightly
  KVZ?: number; // Zusatzbeitrag KV%
  LZZ?: number; // 1=Jahr, 2=Monat, 3=Woche, 4=Tag
  LZZFREIB?: number; // Freibetrag LZZ
  LZZHINZU?: number; // Hinzurechnungsbetrag LZZ
  MBV?: number; // Nicht zu besteuernde Vorteile bei Vermögensbeteiligungen
  PKPV?: number; // Private KV/PV Zahlungen
  PKPVAGZ?: number; // 2026: Arbeitgeberzuschuss Private KV/PV
  PKV?: number; // 0=Gesetzlich, 1=Privat ohne AG-Zuschuss, 2=Privat mit AG-Zuschuss
  PVA?: number; // Beitragsabschlag PV Kinder
  PVS?: number; // 1=Sachsen
  PVZ?: number; // 1=Zuschlag Kinderlose
  R?: number; // 1=Kirche, 0=Keine
  RE4?: number; // Steuerpflichtiger Arbeitslohn LZZ (Cent)
  SONSTB?: number; // Sonstige Bezüge
  SONSTENT?: number; // Entschädigungen in SONSTB
  STERBE?: number; // Sterbegeld
  STKL?: number; // Steuerklasse 1-6
  VBEZ?: number; // Versorgungsbezüge LZZ
  VBEZM?: number; // Versorgungsbezug Januar 2005
  VBEZS?: number; // Sonderzahlungen Versorgungsbezüge
  VBS?: number; // Versorgungsbezüge in SONSTB
  VJAHR?: number; // Jahr Versorgungsbeginn
  ZKF?: number; // Zahl der Kinderfreibeträge
  ZMVB?: number; // Monate Versorgungsbezüge
}

export interface TaxOutput {
  BK: number; // Kirchensteuer
  BKS: number; // Kirchensteuer sonstige Bezüge
  LSTLZZ: number; // Lohnsteuer
  SOLZLZZ: number; // Soli
  SOLZS: number; // Soli sonstige Bezüge
  STS: number; // Lohnsteuer sonstige Bezüge
  VKVLZZ: number; // KV/PV
  VKVSONST: number; // KV/PV sonstige Bezüge
}

// User-friendly wrapper input
export interface SalaryInput {
  yearlySalary: number; // in Euro
  taxClass: number; // 1-6
  hasChildren: boolean;
  childCount: number;
  churchTax: 'none' | 'bayern' | 'baden_wuerttemberg' | 'common'; // Bayern/BW often have different rates (8% vs 9%), usually handled by R=1 and external calc, but we can refine
  state: 'west' | 'east' | 'sachsen'; // Sachsen specific PV
  year: number; // 2025, 2026
  healthInsuranceAddOn: number; // e.g. 1.6
  birthYear?: number; // For interaction with ALTER1
  isPrivateHealthInsurance?: boolean; // simple toggle for now
}

export interface TaxResult {
  netto: number;
  taxes: {
    lohnsteuer: number;
    soli: number;
    kirchensteuer: number;
  };
  socialSecurity: {
    kv: number; // approx derived/calculated
    rv: number; // approx derived/calculated
    av: number; // approx derived/calculated
    pv: number; // approx derived/calculated
  };
}
