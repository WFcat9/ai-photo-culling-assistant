import { describe, expect, it } from 'vitest';
import { describeFaceDetectionMode, scorePhoto, summarizeAssessments } from './photoScoring';

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
      faceDetectionMode: 'full_frame',
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
      faceDetectionMode: 'full_frame',
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
      faceDetectionMode: 'center_focus',
    });

    const adviceText = result.suggestions.join('\n');

    expect(result.status).toBe('reject');
    expect(result.badges).toContain('构图偏边');
    expect(result.badges).toContain('高光过曝');
    expect(result.badges).toContain('暗部死黑');
    expect(result.badges).toContain('闭眼风险');
    expect(result.badges).toContain('比例不协调');
    expect(adviceText).toContain('先把画面拉正');
    expect(adviceText).toContain('降低高光');
    expect(adviceText).toContain('提升阴影');
    expect(adviceText).toContain('闭眼');
    expect(adviceText).toContain('裁切');
    expect(adviceText).toContain('局部补检');
  });

  it('未识别到人脸时，会明确提醒人工复核和识别条件', () => {
    const result = scorePhoto({
      width: 4200,
      height: 2800,
      brightness: 140,
      darkPixelRatio: 0.12,
      brightPixelRatio: 0.08,
      contrast: 40,
      tiltDegrees: 0.6,
      visualWeightX: 0.5,
      visualWeightY: 0.44,
      centerBrightness: 145,
      edgeBrightness: 118,
      faceCount: 0,
      eyeStatus: 'unknown',
      faceDetectionMode: 'not_detected',
    });

    const portraitAdvice = result.dimensionAssessments.find((item) => item.key === 'portrait');

    expect(portraitAdvice?.suggestions.join('')).toContain('整图、上半区和中心区域');
    expect(portraitAdvice?.suggestions.join('')).toContain('12% 到 15%');
  });
});

describe('describeFaceDetectionMode', () => {
  it('输出面向用户的人脸识别路径说明', () => {
    expect(describeFaceDetectionMode('full_frame')).toBe('整张画面直接识别');
    expect(describeFaceDetectionMode('upper_focus')).toBe('上半区补检识别');
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
