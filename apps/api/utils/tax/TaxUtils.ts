/**
 * Lightweight helper to mimic Java BigDecimal behavior required by BMF XML logic.
 * This simplifies porting the XML pseudo-code directly to TypeScript.
 */
export class Big {
  private value: number;

  constructor(value: number | Big) {
    if (value instanceof Big) {
      this.value = value.value;
    } else {
      this.value = value;
    }
  }

  static of(value: number): Big {
    return new Big(value);
  }

  static get ZERO(): Big {
    return new Big(0);
  }

  static get ONE(): Big {
    return new Big(1);
  }

  add(other: Big | number): Big {
    const val = other instanceof Big ? other.value : other;
    return new Big(this.value + val);
  }

  subtract(other: Big | number): Big {
    const val = other instanceof Big ? other.value : other;
    return new Big(this.value - val);
  }

  multiply(other: Big | number): Big {
    const val = other instanceof Big ? other.value : other;
    return new Big(this.value * val);
  }

  divide(other: Big | number, scale?: number, roundingMode?: 'ROUND_DOWN' | 'ROUND_UP'): Big {
    const val = other instanceof Big ? other.value : other;
    if (val === 0) return new Big(0); // Safety check, though generally shouldn't happen in tax logic logic usually checks before
    let result = this.value / val;
    
    if (scale !== undefined) {
      return new Big(this.round(result, scale, roundingMode));
    }
    return new Big(result);
  }

  setScale(scale: number, roundingMode: 'ROUND_DOWN' | 'ROUND_UP'): Big {
    return new Big(this.round(this.value, scale, roundingMode));
  }

  compareTo(other: Big | number): number {
    const val = other instanceof Big ? other.value : other;
    if (this.value < val) return -1;
    if (this.value > val) return 1;
    return 0;
  }

  toNumber(): number {
    return this.value;
  }

  longValue(): number {
    return Math.trunc(this.value);
  }

  private round(value: number, scale: number, roundingMode?: 'ROUND_DOWN' | 'ROUND_UP'): number {
    const factor = Math.pow(10, scale);
    if (roundingMode === 'ROUND_DOWN') {
      return Math.floor(value * factor) / factor;
    } else if (roundingMode === 'ROUND_UP') {
      return Math.ceil(value * factor) / factor;
    } else {
      // Default standard round if not specified (though BMF usually specifies)
      return Math.round(value * factor) / factor;
    }
  }
}
