import { describe, expect, it } from 'vitest';
import { buildWatermarkOutputFileName, resolveWatermarkPlacement } from './batchWatermarking';

describe('batchWatermarking helpers', () => {
  it('会保留原扩展名生成水印文件名', () => {
    expect(buildWatermarkOutputFileName('portrait.jpg')).toBe('portrait-watermark.jpg');
    expect(buildWatermarkOutputFileName('album.final.png')).toBe('album.final-watermark.png');
  });

  it('没有扩展名时也能生成输出文件名', () => {
    expect(buildWatermarkOutputFileName('cover')).toBe('cover-watermark');
  });

  it('会返回稳定的角标位置配置', () => {
    expect(resolveWatermarkPlacement('bottom-right')).toMatchObject({
      textAlign: 'right',
      textBaseline: 'bottom',
      xRatio: 0.96,
      yRatio: 0.96,
    });
    expect(resolveWatermarkPlacement('center')).toMatchObject({
      textAlign: 'center',
      textBaseline: 'middle',
      xRatio: 0.5,
      yRatio: 0.5,
    });
  });
});
