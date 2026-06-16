import { describe, expect, it } from 'vitest';
import { scorePhoto, summarizeAssessments } from './photoScoring';

describe('scorePhoto', () => {
  it('从构图、光影、曝光、暗部、人物、比例六个维度评价照片', () => {
    const result = scorePhoto({
      width: 3600,
      height: 2400,
      brightness: 132,
      darkPixelRatio: 0.08,
      brightPixelRatio: 0.04,
      contrast: 58,
      tiltDegrees: 0.5,
      visualWeightX: 0.48,
      visualWeightY: 0.46,
      centerBrightness: 142,
      edgeBrightness: 116,
      faceCount: 1,
      eyeStatus: 'open',
    });

    expect(result.status).toBe('keep');
    expect(result.dimensionAssessments).toHaveLength(6);
    expect(result.dimensionAssessments.map((item) => item.key)).toEqual([
      'composition',
      'lighting',
      'exposure',
      'shadow',
      'portrait',
      'ratio',
    ]);
    expect(result.suggestions.join('')).toContain('可以优先保留');
  });

  it('不再因为清晰度低而扣分，清晰度不属于评分维度', () => {
    const result = scorePhoto({
      width: 3000,
      height: 2000,
      brightness: 128,
      darkPixelRatio: 0.06,
      brightPixelRatio: 0.04,
      contrast: 52,
      tiltDegrees: 0.3,
      visualWeightX: 0.5,
      visualWeightY: 0.5,
      centerBrightness: 138,
      edgeBrightness: 120,
      faceCount: 1,
      eyeStatus: 'open',
    });

    expect(result.badges.join('')).not.toContain('模糊');
    expect(result.dimensionAssessments.some((item) => item.label.includes('清晰'))).toBe(false);
    expect(result.status).toBe('keep');
  });

  it('构图偏边、过曝、暗部死黑、闭眼风险会给出具体改进建议', () => {
    const result = scorePhoto({
      width: 4200,
      height: 1800,
      brightness: 218,
      darkPixelRatio: 0.38,
      brightPixelRatio: 0.31,
      contrast: 24,
      tiltDegrees: 3.8,
      visualWeightX: 0.83,
      visualWeightY: 0.18,
      centerBrightness: 86,
      edgeBrightness: 166,
      faceCount: 1,
      eyeStatus: 'closed_risk',
    });

    const adviceText = result.suggestions.join('\n');

    expect(result.status).toBe('reject');
    expect(result.badges).toContain('构图偏边');
    expect(result.badges).toContain('高光过曝');
    expect(result.badges).toContain('暗部死黑');
    expect(result.badges).toContain('闭眼风险');
    expect(result.badges).toContain('比例不协调');
    expect(adviceText).toContain('先拉正画面');
    expect(adviceText).toContain('降低高光');
    expect(adviceText).toContain('提升阴影');
    expect(adviceText).toContain('闭眼');
    expect(adviceText).toContain('裁切');
  });
});

describe('summarizeAssessments', () => {
  it('统计保留、待修、淘汰数量和平均综合分', () => {
    const summary = summarizeAssessments([
      {
        status: 'keep',
        score: 90,
        badges: [],
        suggestions: [],
        dimensionAssessments: [],
        severeIssueCount: 0,
        warningIssueCount: 0,
      },
      {
        status: 'review',
        score: 72,
        badges: ['构图偏边'],
        suggestions: [],
        dimensionAssessments: [],
        severeIssueCount: 1,
        warningIssueCount: 0,
      },
      {
        status: 'reject',
        score: 43,
        badges: ['闭眼风险'],
        suggestions: [],
        dimensionAssessments: [],
        severeIssueCount: 3,
        warningIssueCount: 1,
      },
    ]);

    expect(summary.keepCount).toBe(1);
    expect(summary.reviewCount).toBe(1);
    expect(summary.rejectCount).toBe(1);
    expect(summary.averageScore).toBe(68);
  });
});
