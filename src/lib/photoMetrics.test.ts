import { describe, expect, it } from 'vitest';
import { calculateImageMetricsFromPixels } from './photoMetrics';

function rgbaPixels(values: number[]) {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
}

describe('calculateImageMetricsFromPixels', () => {
  it('能计算均匀灰色图片的亮度、对比度和明暗比例', () => {
    const metrics = calculateImageMetricsFromPixels({
      width: 3,
      height: 3,
      rgbaData: rgbaPixels([128, 128, 128, 128, 128, 128, 128, 128, 128]),
    });

    expect(metrics.brightness).toBe(128);
    expect(metrics.contrast).toBe(0);
    expect(metrics.darkPixelRatio).toBe(0);
    expect(metrics.brightPixelRatio).toBe(0);
  });

  it('能识别过暗和过曝像素比例', () => {
    const metrics = calculateImageMetricsFromPixels({
      width: 2,
      height: 2,
      rgbaData: rgbaPixels([8, 18, 245, 252]),
    });

    expect(metrics.darkPixelRatio).toBe(0.5);
    expect(metrics.brightPixelRatio).toBe(0.5);
  });

  it('能估算画面的视觉重心位置', () => {
    const metrics = calculateImageMetricsFromPixels({
      width: 4,
      height: 4,
      rgbaData: rgbaPixels([
        20, 20, 20, 240,
        20, 20, 20, 240,
        20, 20, 20, 240,
        20, 20, 20, 240,
      ]),
    });

    expect(metrics.visualWeightX).toBeGreaterThan(0.62);
    expect(metrics.visualWeightY).toBeGreaterThan(0.38);
    expect(metrics.visualWeightY).toBeLessThan(0.62);
  });

  it('能区分中心亮度和边缘亮度，用于光影建议', () => {
    const metrics = calculateImageMetricsFromPixels({
      width: 5,
      height: 5,
      rgbaData: rgbaPixels([
        220, 220, 220, 220, 220,
        220, 40, 40, 40, 220,
        220, 40, 40, 40, 220,
        220, 40, 40, 40, 220,
        220, 220, 220, 220, 220,
      ]),
    });

    expect(metrics.centerBrightness).toBeLessThan(metrics.edgeBrightness);
  });
});
