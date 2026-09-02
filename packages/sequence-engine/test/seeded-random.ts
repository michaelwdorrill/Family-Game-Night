import type { RandomSource } from '../src';

const UINT32_RANGE = 0x1_0000_0000;

/** Test-only deterministic randomness. This file is excluded from the production build and exports. */
export class SeededRandomSource implements RandomSource {
  private state: number;

  public constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError('A deterministic seed must be a safe integer.');
    }
    this.state = seed >>> 0 || 0x6d2b_79f5;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  public randomInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError('maxExclusive must be an integer between 1 and 2^32.');
    }
    const rejectionLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    for (;;) {
      const value = this.nextUint32();
      if (value < rejectionLimit) {
        return value % maxExclusive;
      }
    }
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const result = items.slice();
    for (let end = result.length - 1; end > 0; end -= 1) {
      const selected = this.randomInt(end + 1);
      const selectedValue = result[selected];
      const endValue = result[end];
      if (selectedValue === undefined || endValue === undefined) {
        throw new Error('Shuffle encountered an unexpected sparse array.');
      }
      result[selected] = endValue;
      result[end] = selectedValue;
    }
    return result;
  }
}
