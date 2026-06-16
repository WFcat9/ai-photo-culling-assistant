import { describe, expect, it } from 'vitest';
import { scorePhoto, summarizeAssessments } from './photoScoring';

describe('scorePhoto', () => {
  it('曝光和清晰度都正常时，建议保留照片', () => {
    const result = scorePhoto({
      width: 3600,
      height: 2400,
      sharpness: 260,
      brightness: 128,
      darkPixelRatio: 0.08,
      brightPixelRatio: 0.05,
      contrast: 62,
      tiltDegrees: 0.4,
    });

    expect(result.status).toBe('keep');
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.suggestions).toContain('这张照片基础质量不错，可以优先保留。');
  });

  it('照片轻微模糊并且过曝时，建议进入待修列表', () => {
    const result = scorePhoto({
      width: 3000,
      height: 2000,
      sharpness: 118,
      brightness: 216,
      darkPixelRatio: 0.02,
      brightPixelRatio: 0.28,
      contrast: 48,
      tiltDegrees: 1.2,
    });

    expect(result.status).toBe('review');
    expect(result.badges).toContain('轻微模糊');
    expect(result.badges).toContain('高光偏多');
  });

  it('多个严重问题同时出现时，建议淘汰', () => {
    const result = scorePhoto({
      width: 900,
      height: 700,
      sharpness: 45,
      brightness: 35,
      darkPixelRatio: 0.52,
      brightPixelRatio: 0.01,
      contrast: 18,
      tiltDegrees: 4.6,
    });

    expect(result.status).toBe('reject');
    expect(result.score).toBeLessThan(60);
    expect(result.badges).toContain('明显模糊');
    expect(result.badges).toContain('画面偏暗');
    expect(result.badges).toContain('画面倾斜');
  });
});

describe('summarizeAssessments', () => {
  it('能统计保留、待修、淘汰数量和平均分', () => {
    const summary = summarizeAssessments([
      {
        status: 'keep',
        score: 92,
        badges: [],
        suggestions: [],
        severeIssueCount: 0,
        warningIssueCount: 0,
      },
      {
        status: 'review',
        score: 74,
        badges: ['轻微模糊'],
        suggestions: [],
        severeIssueCount: 0,
        warningIssueCount: 1,
      },
      {
        status: 'reject',
        score: 42,
        badges: ['明显模糊'],
        suggestions: [],
        severeIssueCount: 2,
        warningIssueCount: 1,
      },
    ]);

    expect(summary.keepCount).toBe(1);
    expect(summary.reviewCount).toBe(1);
    expect(summary.rejectCount).toBe(1);
    expect(summary.averageScore).toBe(69);
  });
});
