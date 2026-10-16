import { describe, expect, test } from 'bun:test';
import { estimatePackageSize } from './packages.service';

describe('estimatePackageSize', () => {
  const estimateHeight = (heightCm: number) => estimatePackageSize(20 - heightCm, null);

  test('uses the configured S/M/L inclusive boundaries', () => {
    expect(estimateHeight(6.7)?.estimatedSize).toBe('S');
    expect(estimateHeight(6.71)?.estimatedSize).toBe('M');
    expect(estimateHeight(13.3)?.estimatedSize).toBe('M');
    expect(estimateHeight(13.31)?.estimatedSize).toBe('L');
    expect(estimateHeight(20)?.estimatedSize).toBe('L');
  });

  test('uses emptyDistanceCm calibration and rejects measurements outside the locker', () => {
    expect(estimatePackageSize(33.31, { emptyDistanceCm: 40 })?.estimatedSize).toBe('S');
    expect(estimatePackageSize(21, null)).toBeNull();
    expect(estimatePackageSize(-1, null)).toBeNull();
    expect(estimatePackageSize(null, null)).toBeNull();
  });
});
