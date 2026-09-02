import type { RandomSource } from './types';

const UINT32_RANGE = 0x1_0000_0000;

export class CryptoRandomSource implements RandomSource {
  public randomInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError('maxExclusive must be an integer between 1 and 2^32.');
    }

    const rejectionLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    const values = new Uint32Array(1);

    for (;;) {
      globalThis.crypto.getRandomValues(values);
      const value = values[0];
      if (value !== undefined && value < rejectionLimit) {
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
