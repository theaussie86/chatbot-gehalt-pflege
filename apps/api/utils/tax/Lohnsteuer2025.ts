import { TaxInput, TaxOutput } from './types';
import { Big } from './TaxUtils';

export class Lohnsteuer2025 {
  // Inputs
  private af: number = 1;
  private AJAHR: number = 0;
  private ALTER1: number = 0;
  private f: number = 1.0;
  private JFREIB: Big = Big.ZERO;
  private JHINZU: Big = Big.ZERO;
  private JRE4: Big = Big.ZERO;
  private JRE4ENT: Big = Big.ZERO;
  private JVBEZ: Big = Big.ZERO;
  private KRV: number = 0;
  private KVZ: Big = Big.ZERO;
  private LZZ: number = 1;
  private LZZFREIB: Big = Big.ZERO;
  private LZZHINZU: Big = Big.ZERO;
  private MBV: Big = Big.ZERO;
  private PKPV: Big = Big.ZERO;
  private PKV: number = 0;
  private PVA: Big = Big.ZERO;
  private PVS: number = 0;
  private PVZ: number = 0;
  private R: number = 0;
  private RE4: Big = Big.ZERO;
  private SONSTB: Big = Big.ZERO;
  private SONSTENT: Big = Big.ZERO;
  private STERBE: Big = Big.ZERO;
  private STKL: number = 0;
  private VBEZ: Big = Big.ZERO;
  private VBEZM: Big = Big.ZERO;
  private VBEZS: Big = Big.ZERO;
  private VBS: Big = Big.ZERO;
  private VJAHR: number = 0;
  private ZKF: Big = Big.ZERO;
  private ZMVB: number = 0;

  // Outputs
  private BK: Big = Big.ZERO;
  private BKS: Big = Big.ZERO;
  private LSTLZZ: Big = Big.ZERO;
  private SOLZLZZ: Big = Big.ZERO;
  private SOLZS: Big = Big.ZERO;
  private STS: Big = Big.ZERO;
  private VKVLZZ: Big = Big.ZERO;
  private VKVSONST: Big = Big.ZERO;

  // DBA Outputs (not strictly needed for basic net-gross but good to have)
  private VFRB: Big = Big.ZERO;
  private VFRBS1: Big = Big.ZERO;
  private VFRBS2: Big = Big.ZERO;
  private WVFRB: Big = Big.ZERO;
  private WVFRBO: Big = Big.ZERO;
  private WVFRBM: Big = Big.ZERO;

  // Internals
  private ALTE: Big = Big.ZERO;
  private ANP: Big = Big.ZERO;
  private ANTEIL1: Big = Big.ZERO;
  private BBGKVPV: Big = Big.ZERO;
  private BBGRV: Big = Big.ZERO;
  private BMG: Big = Big.ZERO;
  private DIFF: Big = Big.ZERO;
  private EFA: Big = Big.ZERO;
  private FVB: Big = Big.ZERO;
  private FVBSO: Big = Big.ZERO;
  private FVBZ: Big = Big.ZERO;
  private FVBZSO: Big = Big.ZERO;
  private GFB: Big = Big.ZERO;
  private HBALTE: Big = Big.ZERO;
  private HFVB: Big = Big.ZERO;
  private HFVBZ: Big = Big.ZERO;
  private HFVBZSO: Big = Big.ZERO;
  private HOCH: Big = Big.ZERO;
  private J: number = 0;
  private JBMG: Big = Big.ZERO;
  private JLFREIB: Big = Big.ZERO;
  private JLHINZU: Big = Big.ZERO;
  private JW: Big = Big.ZERO;
  private K: number = 0;
  private KFB: Big = Big.ZERO;
  private KVSATZAG: Big = Big.ZERO;
  private KVSATZAN: Big = Big.ZERO;
  private KZTAB: number = 0;
  private LSTJAHR: Big = Big.ZERO;
  private LSTOSO: Big = Big.ZERO;
  private LSTSO: Big = Big.ZERO;
  private MIST: Big = Big.ZERO;
  private PVSATZAG: Big = Big.ZERO;
  private PVSATZAN: Big = Big.ZERO;
  private RVSATZAN: Big = Big.ZERO;
  private RW: Big = Big.ZERO;
  private SAP: Big = Big.ZERO;
  private SOLZFREI: Big = Big.ZERO;
  private SOLZJ: Big = Big.ZERO;
  private SOLZMIN: Big = Big.ZERO;
  private SOLZSBMG: Big = Big.ZERO;
  private SOLZSZVE: Big = Big.ZERO;
  private SOLZVBMG: Big = Big.ZERO;
  private ST: Big = Big.ZERO;
  private ST1: Big = Big.ZERO;
  private ST2: Big = Big.ZERO;
  private VBEZB: Big = Big.ZERO;
  private VBEZBSO: Big = Big.ZERO;
  private VERGL: Big = Big.ZERO;
  private VHB: Big = Big.ZERO;
  private VKV: Big = Big.ZERO;
  private VSP: Big = Big.ZERO;
  private VSPN: Big = Big.ZERO;
  private VSP1: Big = Big.ZERO;
  private VSP2: Big = Big.ZERO;
  private VSP3: Big = Big.ZERO;
  private W1STKL5: Big = Big.ZERO;
  private W2STKL5: Big = Big.ZERO;
  private W3STKL5: Big = Big.ZERO;
  private X: Big = Big.ZERO;
  private Y: Big = Big.ZERO;
  private ZRE4: Big = Big.ZERO;
  private ZRE4J: Big = Big.ZERO;
  private ZRE4VP: Big = Big.ZERO;
  private ZTABFB: Big = Big.ZERO;
  private ZVBEZ: Big = Big.ZERO;
  private ZVBEZJ: Big = Big.ZERO;
  private ZVE: Big = Big.ZERO;
  private ZX: Big = Big.ZERO;
  private ZZX: Big = Big.ZERO;

  // Constants
  private readonly ZAHL1 = Big.ONE;
  private readonly ZAHL2 = Big.of(2);
  private readonly ZAHL5 = Big.of(5);
  private readonly ZAHL7 = Big.of(7);
  private readonly ZAHL12 = Big.of(12);
  private readonly ZAHL100 = Big.of(100);
  private readonly ZAHL360 = Big.of(360);
  private readonly ZAHL500 = Big.of(500);
  private readonly ZAHL700 = Big.of(700);
  private readonly ZAHL1000 = Big.of(1000);
  private readonly ZAHL10000 = Big.of(10000);

  private readonly TAB1 = [Big.of(0), Big.of(0.4), Big.of(0.384), Big.of(0.368), Big.of(0.352), Big.of(0.336), Big.of(0.32), Big.of(0.304), Big.of(0.288), Big.of(0.272), Big.of(0.256), Big.of(0.24), Big.of(0.224), Big.of(0.208), Big.of(0.192), Big.of(0.176), Big.of(0.16), Big.of(0.152), Big.of(0.144), Big.of(0.14), Big.of(0.136), Big.of(0.132), Big.of(0.128), Big.of(0.124), Big.of(0.12), Big.of(0.116), Big.of(0.112), Big.of(0.108), Big.of(0.104), Big.of(0.1), Big.of(0.096), Big.of(0.092), Big.of(0.088), Big.of(0.084), Big.of(0.08), Big.of(0.076), Big.of(0.072), Big.of(0.068), Big.of(0.064), Big.of(0.06), Big.of(0.056), Big.of(0.052), Big.of(0.048), Big.of(0.044), Big.of(0.04), Big.of(0.036), Big.of(0.032), Big.of(0.028), Big.of(0.024), Big.of(0.02), Big.of(0.016), Big.of(0.012), Big.of(0.008), Big.of(0.004), Big.of(0)];
  private readonly TAB2 = [Big.of(0), Big.of(3000), Big.of(2880), Big.of(2760), Big.of(2640), Big.of(2520), Big.of(2400), Big.of(2280), Big.of(2160), Big.of(2040), Big.of(1920), Big.of(1800), Big.of(1680), Big.of(1560), Big.of(1440), Big.of(1320), Big.of(1200), Big.of(1140), Big.of(1080), Big.of(1050), Big.of(1020), Big.of(990), Big.of(960), Big.of(930), Big.of(900), Big.of(870), Big.of(840), Big.of(810), Big.of(780), Big.of(750), Big.of(720), Big.of(690), Big.of(660), Big.of(630), Big.of(600), Big.of(570), Big.of(540), Big.of(510), Big.of(480), Big.of(450), Big.of(420), Big.of(390), Big.of(360), Big.of(330), Big.of(300), Big.of(270), Big.of(240), Big.of(210), Big.of(180), Big.of(150), Big.of(120), Big.of(90), Big.of(60), Big.of(30), Big.of(0)];
  private readonly TAB3 = [Big.of(0), Big.of(900), Big.of(864), Big.of(828), Big.of(792), Big.of(756), Big.of(720), Big.of(684), Big.of(648), Big.of(612), Big.of(576), Big.of(540), Big.of(504), Big.of(468), Big.of(432), Big.of(396), Big.of(360), Big.of(342), Big.of(324), Big.of(315), Big.of(306), Big.of(297), Big.of(288), Big.of(279), Big.of(270), Big.of(261), Big.of(252), Big.of(243), Big.of(234), Big.of(225), Big.of(216), Big.of(207), Big.of(198), Big.of(189), Big.of(180), Big.of(171), Big.of(162), Big.of(153), Big.of(144), Big.of(135), Big.of(126), Big.of(117), Big.of(108), Big.of(99), Big.of(90), Big.of(81), Big.of(72), Big.of(63), Big.of(54), Big.of(45), Big.of(36), Big.of(27), Big.of(18), Big.of(9), Big.of(0)];
  private readonly TAB4 = [Big.of(0), Big.of(0.4), Big.of(0.384), Big.of(0.368), Big.of(0.352), Big.of(0.336), Big.of(0.32), Big.of(0.304), Big.of(0.288), Big.of(0.272), Big.of(0.256), Big.of(0.24), Big.of(0.224), Big.of(0.208), Big.of(0.192), Big.of(0.176), Big.of(0.16), Big.of(0.152), Big.of(0.144), Big.of(0.14), Big.of(0.136), Big.of(0.132), Big.of(0.128), Big.of(0.124), Big.of(0.12), Big.of(0.116), Big.of(0.112), Big.of(0.108), Big.of(0.104), Big.of(0.1), Big.of(0.096), Big.of(0.092), Big.of(0.088), Big.of(0.084), Big.of(0.08), Big.of(0.076), Big.of(0.072), Big.of(0.068), Big.of(0.064), Big.of(0.06), Big.of(0.056), Big.of(0.052), Big.of(0.048), Big.of(0.044), Big.of(0.04), Big.of(0.036), Big.of(0.032), Big.of(0.028), Big.of(0.024), Big.of(0.02), Big.of(0.016), Big.of(0.012), Big.of(0.008), Big.of(0.004), Big.of(0)];
  private readonly TAB5 = [Big.of(0), Big.of(1900), Big.of(1824), Big.of(1748), Big.of(1672), Big.of(1596), Big.of(1520), Big.of(1444), Big.of(1368), Big.of(1292), Big.of(1216), Big.of(1140), Big.of(1064), Big.of(988), Big.of(912), Big.of(836), Big.of(760), Big.of(722), Big.of(684), Big.of(665), Big.of(646), Big.of(627), Big.of(608), Big.of(589), Big.of(570), Big.of(551), Big.of(532), Big.of(513), Big.of(494), Big.of(475), Big.of(456), Big.of(437), Big.of(418), Big.of(399), Big.of(380), Big.of(361), Big.of(342), Big.of(323), Big.of(304), Big.of(285), Big.of(266), Big.of(247), Big.of(228), Big.of(209), Big.of(190), Big.of(171), Big.of(152), Big.of(133), Big.of(114), Big.of(95), Big.of(76), Big.of(57), Big.of(38), Big.of(19), Big.of(0)];

  public calculate(input: TaxInput): TaxOutput {
    this.setInputs(input);
    this.MAIN();
    return this.getOutputs();
  }

  private setInputs(input: TaxInput): void {
    this.af = input.af ?? 1;
    this.AJAHR = input.AJAHR ?? 0;
    this.ALTER1 = input.ALTER1 ?? 0;
    this.f = input.f ?? 1.0;
    this.JFREIB = Big.of(input.JFREIB ?? 0);
    this.JHINZU = Big.of(input.JHINZU ?? 0);
    this.JRE4 = Big.of(input.JRE4 ?? 0);
    this.JRE4ENT = Big.of(input.JRE4ENT ?? 0);
    this.JVBEZ = Big.of(input.JVBEZ ?? 0);
    this.KRV = input.KRV ?? 0;
    this.KVZ = Big.of(input.KVZ ?? 0);
    this.LZZ = input.LZZ ?? 1;
    this.LZZFREIB = Big.of(input.LZZFREIB ?? 0);
    this.LZZHINZU = Big.of(input.LZZHINZU ?? 0);
    this.MBV = Big.of(input.MBV ?? 0);
    this.PKPV = Big.of(input.PKPV ?? 0);
    this.PKV = input.PKV ?? 0;
    this.PVA = Big.of(input.PVA ?? 0);
    this.PVS = input.PVS ?? 0;
    this.PVZ = input.PVZ ?? 0;
    this.R = input.R ?? 0;
    this.RE4 = Big.of(input.RE4 ?? 0);
    this.SONSTB = Big.of(input.SONSTB ?? 0);
    this.SONSTENT = Big.of(input.SONSTENT ?? 0);
    this.STERBE = Big.of(input.STERBE ?? 0);
    this.STKL = input.STKL ?? 0;
    this.VBEZ = Big.of(input.VBEZ ?? 0);
    this.VBEZM = Big.of(input.VBEZM ?? 0);
    this.VBEZS = Big.of(input.VBEZS ?? 0);
    this.VBS = Big.of(input.VBS ?? 0);
    this.VJAHR = input.VJAHR ?? 0;
    this.ZKF = Big.of(input.ZKF ?? 0);
    this.ZMVB = input.ZMVB ?? 0;
  }

  private getOutputs(): TaxOutput {
    return {
      BK: this.BK.toNumber(),
      BKS: this.BKS.toNumber(),
      LSTLZZ: this.LSTLZZ.toNumber(),
      SOLZLZZ: this.SOLZLZZ.toNumber(),
      SOLZS: this.SOLZS.toNumber(),
      STS: this.STS.toNumber(),
      VKVLZZ: this.VKVLZZ.toNumber(),
      VKVSONST: this.VKVSONST.toNumber(),
    };
  }

  private MAIN(): void {
    this.MPARA();
    this.MRE4JL();
    this.VBEZBSO = Big.ZERO;
    this.MRE4();
    this.MRE4ABZ();
    this.MBERECH();
    this.MSONST();
  }

  private MPARA(): void {
    if (this.KRV < 1) {
      this.BBGRV = Big.of(96600);
      this.RVSATZAN = Big.of(0.093);
    } 

    this.BBGKVPV = Big.of(66150);
    this.KVSATZAN = this.KVZ.divide(this.ZAHL2).divide(this.ZAHL100).add(Big.of(0.07));
    this.KVSATZAG = Big.of(0.0125).add(Big.of(0.07));

    if (this.PVS === 1) {
      this.PVSATZAN = Big.of(0.023);
      this.PVSATZAG = Big.of(0.013);
    } else {
      this.PVSATZAN = Big.of(0.018);
      this.PVSATZAG = Big.of(0.018);
    }

    if (this.PVZ === 1) {
      this.PVSATZAN = this.PVSATZAN.add(Big.of(0.006));
    } else {
      this.PVSATZAN = this.PVSATZAN.subtract(this.PVA.multiply(Big.of(0.0025)));
    }

    this.W1STKL5 = Big.of(13785);
    this.W2STKL5 = Big.of(34240);
    this.W3STKL5 = Big.of(222260);
    this.GFB = Big.of(12096);
    this.SOLZFREI = Big.of(19950);
  }

  private MRE4JL(): void {
    if (this.LZZ === 1) {
      this.ZRE4J = this.RE4.divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.ZVBEZJ = this.VBEZ.divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLFREIB = this.LZZFREIB.divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLHINZU = this.LZZHINZU.divide(this.ZAHL100, 2, 'ROUND_DOWN');
    } else if (this.LZZ === 2) {
      this.ZRE4J = this.RE4.multiply(this.ZAHL12).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.ZVBEZJ = this.VBEZ.multiply(this.ZAHL12).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLFREIB = this.LZZFREIB.multiply(this.ZAHL12).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLHINZU = this.LZZHINZU.multiply(this.ZAHL12).divide(this.ZAHL100, 2, 'ROUND_DOWN');
    } else if (this.LZZ === 3) {
      this.ZRE4J = this.RE4.multiply(this.ZAHL360).divide(this.ZAHL700, 2, 'ROUND_DOWN');
      this.ZVBEZJ = this.VBEZ.multiply(this.ZAHL360).divide(this.ZAHL700, 2, 'ROUND_DOWN');
      this.JLFREIB = this.LZZFREIB.multiply(this.ZAHL360).divide(this.ZAHL700, 2, 'ROUND_DOWN');
      this.JLHINZU = this.LZZHINZU.multiply(this.ZAHL360).divide(this.ZAHL700, 2, 'ROUND_DOWN');
    } else {
      this.ZRE4J = this.RE4.multiply(this.ZAHL360).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.ZVBEZJ = this.VBEZ.multiply(this.ZAHL360).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLFREIB = this.LZZFREIB.multiply(this.ZAHL360).divide(this.ZAHL100, 2, 'ROUND_DOWN');
      this.JLHINZU = this.LZZHINZU.multiply(this.ZAHL360).divide(this.ZAHL100, 2, 'ROUND_DOWN');
    }

    if (this.af === 0) {
      this.f = 1;
    }
  }

  private MRE4(): void {
    if (this.ZVBEZJ.compareTo(Big.ZERO) === 0) {
      this.FVBZ = Big.ZERO;
      this.FVB = Big.ZERO;
      this.FVBZSO = Big.ZERO;
      this.FVBSO = Big.ZERO;
    } else {
      if (this.VJAHR < 2006) {
        this.J = 1;
      } else if (this.VJAHR < 2058) {
        this.J = this.VJAHR - 2004;
      } else {
        this.J = 54;
      }

      if (this.LZZ === 1) {
        this.VBEZB = this.VBEZM.multiply(Big.of(this.ZMVB)).add(this.VBEZS);
        this.HFVB = this.TAB2[this.J].divide(this.ZAHL12).multiply(Big.of(this.ZMVB)).setScale(0, 'ROUND_UP');
        this.FVBZ = this.TAB3[this.J].divide(this.ZAHL12).multiply(Big.of(this.ZMVB)).setScale(0, 'ROUND_UP');
      } else {
        this.VBEZB = this.VBEZM.multiply(this.ZAHL12).add(this.VBEZS).setScale(2, 'ROUND_DOWN');
        this.HFVB = this.TAB2[this.J];
        this.FVBZ = this.TAB3[this.J];
      }

      this.FVB = this.VBEZB.multiply(this.TAB1[this.J]).divide(this.ZAHL100).setScale(2, 'ROUND_UP');

      if (this.FVB.compareTo(this.HFVB) === 1) {
        this.FVB = this.HFVB;
      }

      if (this.FVB.compareTo(this.ZVBEZJ) === 1) {
        this.FVB = this.ZVBEZJ;
      }

      this.FVBSO = this.FVB.add(this.VBEZBSO.multiply(this.TAB1[this.J]).divide(this.ZAHL100)).setScale(2, 'ROUND_UP');

      if (this.FVBSO.compareTo(this.TAB2[this.J]) === 1) {
        this.FVBSO = this.TAB2[this.J];
      }

      this.HFVBZSO = this.VBEZB.add(this.VBEZBSO).divide(this.ZAHL100).subtract(this.FVBSO).setScale(2, 'ROUND_DOWN');
      this.FVBZSO = this.FVBZ.add(this.VBEZBSO.divide(this.ZAHL100)).setScale(0, 'ROUND_UP');

      if (this.FVBZSO.compareTo(this.HFVBZSO) === 1) {
        this.FVBZSO = this.HFVBZSO.setScale(0, 'ROUND_UP');
      }

      if (this.FVBZSO.compareTo(this.TAB3[this.J]) === 1) {
        this.FVBZSO = this.TAB3[this.J];
      }

      this.HFVBZ = this.VBEZB.divide(this.ZAHL100).subtract(this.FVB).setScale(2, 'ROUND_DOWN');
      
      if (this.FVBZ.compareTo(this.HFVBZ) === 1) {
         this.FVBZ = this.HFVBZ.setScale(0, 'ROUND_UP');
      }
    }
    this.MRE4ALTE();
  }

  private MRE4ALTE(): void {
    if (this.ALTER1 === 0) {
      this.ALTE = Big.ZERO;
    } else {
      if (this.AJAHR < 2006) {
        this.K = 1;
      } else if (this.AJAHR < 2058) {
        this.K = this.AJAHR - 2004;
      } else {
        this.K = 54;
      }

      this.BMG = this.ZRE4J.subtract(this.ZVBEZJ);
      this.ALTE = this.BMG.multiply(this.TAB4[this.K]).setScale(0, 'ROUND_UP');
      this.HBALTE = this.TAB5[this.K];

      if (this.ALTE.compareTo(this.HBALTE) === 1) {
        this.ALTE = this.HBALTE;
      }
    }
  }

  private MRE4ABZ(): void {
    this.ZRE4 = this.ZRE4J.subtract(this.FVB).subtract(this.ALTE).subtract(this.JLFREIB).add(this.JLHINZU).setScale(2, 'ROUND_DOWN');
    if (this.ZRE4.compareTo(Big.ZERO) === -1) {
      this.ZRE4 = Big.ZERO;
    }
    this.ZRE4VP = this.ZRE4J;
    this.ZVBEZ = this.ZVBEZJ.subtract(this.FVB).setScale(2, 'ROUND_DOWN');
    if (this.ZVBEZ.compareTo(Big.ZERO) === -1) {
      this.ZVBEZ = Big.ZERO;
    }
  }

  private MBERECH(): void {
    this.MZTABFB();
    this.VFRB = this.ANP.add(this.FVB.add(this.FVBZ)).multiply(this.ZAHL100).setScale(0, 'ROUND_DOWN');
    this.MLSTJAHR();
    this.WVFRB = this.ZVE.subtract(this.GFB).multiply(this.ZAHL100).setScale(0, 'ROUND_DOWN');
    if (this.WVFRB.compareTo(Big.ZERO) === -1) {
      this.WVFRB = Big.ZERO;
    }
    
    this.LSTJAHR = this.ST.multiply(Big.of(this.f)).setScale(0, 'ROUND_DOWN');
    this.UPLSTLZZ();
    this.UPVKVLZZ();

    if (this.ZKF.compareTo(Big.ZERO) === 1) {
      this.ZTABFB = this.ZTABFB.add(this.KFB);
      this.MRE4ABZ();
      this.MLSTJAHR();
      this.JBMG = this.ST.multiply(Big.of(this.f)).setScale(0, 'ROUND_DOWN');
    } else {
      this.JBMG = this.LSTJAHR;
    }
    this.MSOLZ();
  }

  private MZTABFB(): void {
    this.ANP = Big.ZERO;
    if (this.ZVBEZ.compareTo(Big.ZERO) >= 0 && this.ZVBEZ.compareTo(this.FVBZ) === -1) {
      this.FVBZ = Big.of(this.ZVBEZ.longValue());
    }

    if (this.STKL < 6) {
      if (this.ZVBEZ.compareTo(Big.ZERO) === 1) {
        if (this.ZVBEZ.subtract(this.FVBZ).compareTo(Big.of(102)) === -1) {
           this.ANP = this.ZVBEZ.subtract(this.FVBZ).setScale(0, 'ROUND_UP');
        } else {
           this.ANP = Big.of(102);
        }
      }
    } else {
      this.FVBZ = Big.ZERO;
      this.FVBZSO = Big.ZERO;
    }

    if (this.STKL < 6) {
       if (this.ZRE4.compareTo(this.ZVBEZ) === 1) {
         if (this.ZRE4.subtract(this.ZVBEZ).compareTo(Big.of(1230)) === -1) {
            this.ANP = this.ANP.add(this.ZRE4).subtract(this.ZVBEZ).setScale(0, 'ROUND_UP');
         } else {
            this.ANP = this.ANP.add(Big.of(1230));
         }
       }
    }

    this.KZTAB = 1;
    if (this.STKL === 1) {
      this.SAP = Big.of(36);
      this.KFB = this.ZKF.multiply(Big.of(9600)).setScale(0, 'ROUND_DOWN');
    } else if (this.STKL === 2) {
      this.EFA = Big.of(4260);
      this.SAP = Big.of(36);
      this.KFB = this.ZKF.multiply(Big.of(9600)).setScale(0, 'ROUND_DOWN');
    } else if (this.STKL === 3) {
      this.KZTAB = 2;
      this.SAP = Big.of(36);
      this.KFB = this.ZKF.multiply(Big.of(9600)).setScale(0, 'ROUND_DOWN');
    } else if (this.STKL === 4) {
      this.SAP = Big.of(36);
      this.KFB = this.ZKF.multiply(Big.of(4800)).setScale(0, 'ROUND_DOWN');
    } else if (this.STKL === 5) {
      this.SAP = Big.of(36);
      this.KFB = Big.ZERO;
    } else {
      this.KFB = Big.ZERO;
    }

    this.ZTABFB = this.EFA.add(this.ANP).add(this.SAP).add(this.FVBZ).setScale(2, 'ROUND_DOWN');
  }

  private MLSTJAHR(): void {
    this.UPEVP();
    this.ZVE = this.ZRE4.subtract(this.ZTABFB).subtract(this.VSP);
    this.UPMLST();
  }

  private UPVKVLZZ(): void {
    this.UPVKV();
    this.JW = this.VKV;
    this.UPANTEIL();
    this.VKVLZZ = this.ANTEIL1;
  }

  private UPVKV(): void {
    if (this.PKV > 0) {
      if (this.VSP2.compareTo(this.VSP3) === 1) {
        this.VKV = this.VSP2.multiply(this.ZAHL100);
      } else {
        this.VKV = this.VSP3.multiply(this.ZAHL100);
      }
    } else {
      this.VKV = Big.ZERO;
    }
  }

  private UPLSTLZZ(): void {
    this.JW = this.LSTJAHR.multiply(this.ZAHL100);
    this.UPANTEIL();
    this.LSTLZZ = this.ANTEIL1;
  }

  private UPMLST(): void {
    if (this.ZVE.compareTo(this.ZAHL1) === -1) {
      this.ZVE = Big.ZERO;
      this.X = Big.ZERO;
    } else {
      this.X = this.ZVE.divide(Big.of(this.KZTAB)).setScale(0, 'ROUND_DOWN');
    }

    if (this.STKL < 5) {
      this.UPTAB25();
    } else {
      this.MST5_6();
    }
  }

  private UPEVP(): void {
    if (this.KRV === 1) {
      this.VSP1 = Big.ZERO;
    } else {
      if (this.ZRE4VP.compareTo(this.BBGRV) === 1) {
        this.ZRE4VP = this.BBGRV;
      }
      this.VSP1 = this.ZRE4VP.multiply(this.RVSATZAN).setScale(2, 'ROUND_DOWN');
    }

    this.VSP2 = this.ZRE4VP.multiply(Big.of(0.12)).setScale(2, 'ROUND_DOWN');
    
    if (this.STKL === 3) {
      this.VHB = Big.of(3000);
    } else {
      this.VHB = Big.of(1900);
    }

    if (this.VSP2.compareTo(this.VHB) === 1) {
      this.VSP2 = this.VHB;
    }

    this.VSPN = this.VSP1.add(this.VSP2).setScale(0, 'ROUND_UP');
    this.MVSP();
    if (this.VSPN.compareTo(this.VSP) === 1) {
       this.VSP = this.VSPN.setScale(2, 'ROUND_DOWN');
    }
  }

  private MVSP(): void {
    if (this.ZRE4VP.compareTo(this.BBGKVPV) === 1) {
      this.ZRE4VP = this.BBGKVPV;
    }

    if (this.PKV > 0) {
      if (this.STKL === 6) {
        this.VSP3 = Big.ZERO;
      } else {
        this.VSP3 = this.PKPV.multiply(this.ZAHL12).divide(this.ZAHL100);
        if (this.PKV === 2) {
          this.VSP3 = this.VSP3.subtract(this.ZRE4VP.multiply(this.KVSATZAG.add(this.PVSATZAG))).setScale(2, 'ROUND_DOWN');
        }
      }
    } else {
      this.VSP3 = this.ZRE4VP.multiply(this.KVSATZAN.add(this.PVSATZAN)).setScale(2, 'ROUND_DOWN');
    }
    this.VSP = this.VSP3.add(this.VSP1).setScale(0, 'ROUND_UP');
  }

  private MST5_6(): void {
    this.ZZX = this.X;
    if (this.ZZX.compareTo(this.W2STKL5) === 1) {
      this.ZX = this.W2STKL5;
      this.UP5_6();
      if (this.ZZX.compareTo(this.W3STKL5) === 1) {
        this.ST = this.ST.add(this.W3STKL5.subtract(this.W2STKL5).multiply(Big.of(0.42))).setScale(0, 'ROUND_DOWN');
        this.ST = this.ST.add(this.ZZX.subtract(this.W3STKL5).multiply(Big.of(0.45))).setScale(0, 'ROUND_DOWN');
      } else {
        this.ST = this.ST.add(this.ZZX.subtract(this.W2STKL5).multiply(Big.of(0.42))).setScale(0, 'ROUND_DOWN');
      }
    } else {
      this.ZX = this.ZZX;
      this.UP5_6();
      if (this.ZZX.compareTo(this.W1STKL5) === 1) {
        this.VERGL = this.ST;
        this.ZX = this.W1STKL5;
        this.UP5_6();
        this.HOCH = this.ST.add(this.ZZX.subtract(this.W1STKL5).multiply(Big.of(0.42))).setScale(0, 'ROUND_DOWN');
        if (this.HOCH.compareTo(this.VERGL) === -1) {
           this.ST = this.HOCH;
        } else {
           this.ST = this.VERGL;
        }
      }
    }
  }

  private UP5_6(): void {
    this.X = this.ZX.multiply(Big.of(1.25)).setScale(2, 'ROUND_DOWN');
    this.UPTAB25();
    this.ST1 = this.ST;
    this.X = this.ZX.multiply(Big.of(0.75)).setScale(2, 'ROUND_DOWN');
    this.UPTAB25();
    this.ST2 = this.ST;
    this.DIFF = this.ST1.subtract(this.ST2).multiply(this.ZAHL2);
    this.MIST = this.ZX.multiply(Big.of(0.14)).setScale(0, 'ROUND_DOWN');
    if (this.MIST.compareTo(this.DIFF) === 1) {
      this.ST = this.MIST;
    } else {
      this.ST = this.DIFF;
    }
  }

  private MSOLZ(): void {
    this.SOLZFREI = this.SOLZFREI.multiply(Big.of(this.KZTAB));
    if (this.JBMG.compareTo(this.SOLZFREI) === 1) {
      this.SOLZJ = this.JBMG.multiply(Big.of(5.5)).divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
      this.SOLZMIN = this.JBMG.subtract(this.SOLZFREI).multiply(Big.of(11.9)).divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
      if (this.SOLZMIN.compareTo(this.SOLZJ) === -1) {
        this.SOLZJ = this.SOLZMIN;
      }
      this.JW = this.SOLZJ.multiply(this.ZAHL100).setScale(0, 'ROUND_DOWN');
      this.UPANTEIL();
      this.SOLZLZZ = this.ANTEIL1;
    } else {
      this.SOLZLZZ = Big.ZERO;
    }

    if (this.R > 0) {
      this.JW = this.JBMG.multiply(this.ZAHL100);
      this.UPANTEIL();
      this.BK = this.ANTEIL1;
    } else {
      this.BK = Big.ZERO;
    }
  }

  private UPANTEIL(): void {
    if (this.LZZ === 1) {
      this.ANTEIL1 = this.JW;
    } else if (this.LZZ === 2) {
      this.ANTEIL1 = this.JW.divide(this.ZAHL12, 0, 'ROUND_DOWN');
    } else if (this.LZZ === 3) {
      this.ANTEIL1 = this.JW.multiply(this.ZAHL7).divide(this.ZAHL360, 0, 'ROUND_DOWN');
    } else {
      this.ANTEIL1 = this.JW.divide(this.ZAHL360, 0, 'ROUND_DOWN');
    }
  }

  private MSONST(): void {
    this.LZZ = 1;
    if (this.ZMVB === 0) {
      this.ZMVB = 12;
    }
    if (this.SONSTB.compareTo(Big.ZERO) === 0 && this.MBV.compareTo(Big.ZERO) === 0) {
      this.VKVSONST = Big.ZERO;
      this.LSTSO = Big.ZERO;
      this.STS = Big.ZERO;
      this.SOLZS = Big.ZERO;
      this.BKS = Big.ZERO;
    } else {
      this.MOSONST();
      this.UPVKV();
      this.VKVSONST = this.VKV;
      this.ZRE4J = this.JRE4.add(this.SONSTB).divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
      this.ZVBEZJ = this.JVBEZ.add(this.VBS).divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
      this.VBEZBSO = this.STERBE;
      this.MRE4SONST();
      this.MLSTJAHR();
      
      this.WVFRBM = this.ZVE.subtract(this.GFB).multiply(this.ZAHL100).setScale(2, 'ROUND_DOWN');
      if (this.WVFRBM.compareTo(Big.ZERO) === -1) {
        this.WVFRBM = Big.ZERO;
      }
      
      this.UPVKV();
      this.VKVSONST = this.VKV.subtract(this.VKVSONST);
      this.LSTSO = this.ST.multiply(this.ZAHL100);
      
      this.STS = this.LSTSO.subtract(this.LSTOSO).multiply(Big.of(this.f)).divide(this.ZAHL100, 0, 'ROUND_DOWN').multiply(this.ZAHL100);
      
      this.STSMIN();
    }
  }

  private STSMIN(): void {
    if (this.STS.compareTo(Big.ZERO) === -1) {
      if (this.MBV.compareTo(Big.ZERO) === 0) {
        // do nothing
      } else {
        this.LSTLZZ = this.LSTLZZ.add(this.STS);
        if (this.LSTLZZ.compareTo(Big.ZERO) === -1) {
          this.LSTLZZ = Big.ZERO;
        }
        
        this.SOLZLZZ = this.SOLZLZZ.add(this.STS.multiply(Big.of(5.5).divide(this.ZAHL100))).setScale(0, 'ROUND_DOWN');
        if (this.SOLZLZZ.compareTo(Big.ZERO) === -1) {
          this.SOLZLZZ = Big.ZERO;
        }

        this.BK = this.BK.add(this.STS);
        if (this.BK.compareTo(Big.ZERO) === -1) {
          this.BK = Big.ZERO;
        }
      }
      this.STS = Big.ZERO;
      this.SOLZS = Big.ZERO;
    } else {
      this.MSOLZSTS();
    }

    if (this.R > 0) {
      this.BKS = this.STS;
    } else {
      this.BKS = Big.ZERO;
    }
  }

  private MSOLZSTS(): void {
    if (this.ZKF.compareTo(Big.ZERO) === 1) {
      this.SOLZSZVE = this.ZVE.subtract(this.KFB);
    } else {
      this.SOLZSZVE = this.ZVE;
    }

    if (this.SOLZSZVE.compareTo(Big.ONE) === -1) {
      this.SOLZSZVE = Big.ZERO;
      this.X = Big.ZERO;
    } else {
      this.X = this.SOLZSZVE.divide(Big.of(this.KZTAB), 0, 'ROUND_DOWN');
    }

    if (this.STKL < 5) {
      this.UPTAB25();
    } else {
      this.MST5_6();
    }

    this.SOLZSBMG = this.ST.multiply(Big.of(this.f)).setScale(0, 'ROUND_DOWN');

    if (this.SOLZSBMG.compareTo(this.SOLZFREI) === 1) {
      this.SOLZS = this.STS.multiply(Big.of(5.5)).divide(this.ZAHL100, 0, 'ROUND_DOWN');
    } else {
      this.SOLZS = Big.ZERO;
    }
  }

  private MOSONST(): void {
    this.ZRE4J = this.JRE4.divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
    this.ZVBEZJ = this.JVBEZ.divide(this.ZAHL100).setScale(2, 'ROUND_DOWN');
    this.JLFREIB = this.JFREIB.divide(this.ZAHL100, 2, 'ROUND_DOWN');
    this.JLHINZU = this.JHINZU.divide(this.ZAHL100, 2, 'ROUND_DOWN');
    this.MRE4();
    this.MRE4ABZ();
    this.ZRE4VP = this.ZRE4VP.subtract(this.JRE4ENT.divide(this.ZAHL100));
    this.MZTABFB();
    this.VFRBS1 = this.ANP.add(this.FVB.add(this.FVBZ)).multiply(this.ZAHL100).setScale(2, 'ROUND_DOWN');
    this.MLSTJAHR();
    this.WVFRBO = this.ZVE.subtract(this.GFB).multiply(this.ZAHL100).setScale(2, 'ROUND_DOWN');
    if (this.WVFRBO.compareTo(Big.ZERO) === -1) {
      this.WVFRBO = Big.ZERO;
    }
    this.LSTOSO = this.ST.multiply(this.ZAHL100);
  }

  private MRE4SONST(): void {
    this.MRE4();
    this.FVB = this.FVBSO;
    this.MRE4ABZ();
    this.ZRE4VP = this.ZRE4VP.add(this.MBV.divide(this.ZAHL100)).subtract(this.JRE4ENT.divide(this.ZAHL100)).subtract(this.SONSTENT.divide(this.ZAHL100));
    this.FVBZ = this.FVBZSO;
    this.MZTABFB();
    this.VFRBS2 = this.ANP.add(this.FVB).add(this.FVBZ).multiply(this.ZAHL100).subtract(this.VFRBS1);
  }

  // UPTAB25 - Tariff for 2025
  private UPTAB25(): void {
    if (this.X.compareTo(this.GFB.add(this.ZAHL1)) === -1) {
      this.ST = Big.ZERO;
    } else {
      if (this.X.compareTo(Big.of(17444)) === -1) {
        this.Y = this.X.subtract(this.GFB).divide(this.ZAHL10000, 6, 'ROUND_DOWN');
        this.RW = this.Y.multiply(Big.of(932.30)); // 2025
        this.RW = this.RW.add(Big.of(1400));
        this.ST = this.RW.multiply(this.Y).setScale(0, 'ROUND_DOWN');
      } else if (this.X.compareTo(Big.of(68481)) === -1) {
        this.Y = this.X.subtract(Big.of(17443)).divide(this.ZAHL10000, 6, 'ROUND_DOWN'); // 2025
        this.RW = this.Y.multiply(Big.of(176.64)); // 2025
        this.RW = this.RW.add(Big.of(2397)); 
        this.RW = this.RW.multiply(this.Y);
        this.ST = this.RW.add(Big.of(1015.13)).setScale(0, 'ROUND_DOWN'); // 2025
      } else {
        if (this.X.compareTo(Big.of(277826)) === -1) {
           this.ST = this.X.multiply(Big.of(0.42)).subtract(Big.of(10911.92)).setScale(0, 'ROUND_DOWN'); // 2025
        } else {
           this.ST = this.X.multiply(Big.of(0.45)).subtract(Big.of(19246.67)).setScale(0, 'ROUND_DOWN'); // 2025
        }
      }
    }
    this.ST = this.ST.multiply(Big.of(this.KZTAB));
  }
}
