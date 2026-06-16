import { describe, expect, it } from 'vitest';
import { calculateImageMetricsFromPixels } from './photoMetrics';

function rgbaPixels(values: number[]) {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
}

describe('calculateImageMetricsFromPixels', () => {
  it('能计算均匀灰色图片的亮度和低对比度', () => {
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

  it('能识别过暗和过亮像素比例', () => {
    const metrics = calculateImageMetricsFromPixels({
      width: 2,
      height: 2,
      rgbaData: rgbaPixels([8, 18, 245, 252]),
    });

    expect(metrics.darkPixelRatio).toBe(0.5);
    expect(metrics.brightPixelRatio).toBe(0.5);
  });

  it('细节变化明显的图片清晰度高于纯色图片', () => {
    const flat = calculateImageMetricsFromPixels({
      width: 4,
      height: 4,
      rgbaData: rgbaPixels(new Array(16).fill(128)),
    });

    const checkerboard = calculateImageMetricsFromPixels({
      width: 4,
      height: 4,
      rgbaData: rgbaPixels([0, 255, 0, 255, 255, 0, 255, 0, 0, 255, 0, 255, 255, 0, 255, 0]),
    });

    expect(checkerboard.sharpness).toBeGreaterThan(flat.sharpness);
  });
});
