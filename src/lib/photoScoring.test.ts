import { describe, expect, it } from 'vitest';
import { describeFaceDetectionMode, scorePhoto, type RawPhotoMetrics } from './photoScoring';
import { buildColorAdjustmentPlan } from './colorPresets';

function createBaseMetrics(overrides: Partial<RawPhotoMetrics> = {}): RawPhotoMetrics {
  return {
    width: 2400,
    height: 3200,
    brightness: 128,
    darkPixelRatio: 0.12,
    brightPixelRatio: 0.08,
    contrast: 42,
    tiltDegrees: 0.4,
    visualWeightX: 0.5,
    visualWeightY: 0.48,
    centerBrightness: 132,
    edgeBrightness: 120,
    faceCount: 1,
    eyeStatus: 'open',
    expressionBalance: 'stable',
    retouchReadiness: 'ready',
    faceDetectionMode: 'full_frame',
    faceSizeRatio: 0.16,
    faceTopMargin: 0.1,
    faceBottomMargin: 0.12,
    faceLeftMargin: 0.12,
    faceRightMargin: 0.12,
    faceTiltDegrees: 1.4,
    faceShapeTendency: 'balanced',
    faceWidthTendency: 'balanced',
    faceStructureConfidence: 'high',
    upperThirdRatio: 0.33,
    midThirdRatio: 0.34,
    lowerThirdRatio: 0.33,
    eyeGapRatio: 1.08,
    jawToCheekRatio: 0.8,
    leftEyeBlinkScore: 0.1,
    rightEyeBlinkScore: 0.12,
    eyeBlinkDiffScore: 0.02,
    leftSmileScore: 0.22,
    rightSmileScore: 0.2,
    smileDiffScore: 0.02,
    mouthOpenScore: 0.12,
    ...overrides,
  };
}

describe('scorePhoto', () => {
  it('marks multi-face portraits as review or reject because this version is single-person only', () => {
    const assessment = scorePhoto(
      createBaseMetrics({
        faceCount: 2,
        brightPixelRatio: 0.18,
      }),
    );

    expect(assessment.score).toBeLessThan(85);
    expect(assessment.suggestions.join(' ')).toContain('单人');
  });

  it('penalizes closed-eye risk heavily', () => {
    const assessment = scorePhoto(
      createBaseMetrics({
        eyeStatus: 'closed_risk',
      }),
    );

    expect(assessment.status).toBe('review');
    expect(assessment.badges).toContain('人物需复核');
  });

  it('explains reliable face-detection conditions when no face is found', () => {
    const assessment = scorePhoto(
      createBaseMetrics({
        faceCount: 0,
        faceDetectionMode: 'not_detected',
      }),
    );

    expect(assessment.suggestions.join(' ')).toContain('12% - 15%');
    expect(assessment.suggestions.join(' ')).toContain('30°');
  });

  it('downgrades portraits with expression asymmetry before retouching', () => {
    const assessment = scorePhoto(
      createBaseMetrics({
        expressionBalance: 'needs_review',
        retouchReadiness: 'hold',
        eyeBlinkDiffScore: 0.39,
        smileDiffScore: 0.31,
        mouthOpenScore: 0.48,
      }),
    );

    const portraitDimension = assessment.dimensionAssessments.find((dimension) => dimension.key === 'portrait');

    expect(portraitDimension?.score).toBeLessThan(80);
    expect(assessment.suggestions.join(' ')).toContain('表情');
    expect(assessment.suggestions.join(' ')).toContain('精修');
  });
});

describe('buildColorAdjustmentPlan', () => {
  it('recommends highlight recovery for bright portraits', () => {
    const plan = buildColorAdjustmentPlan(
      createBaseMetrics({
        brightness: 216,
        brightPixelRatio: 0.28,
      }),
    );

    expect(plan.exposureCompensation).toContain('-0.15');
    expect(plan.recommendedPresetIds[0]).toBe('pro-neg-std');
  });
});

describe('describeFaceDetectionMode', () => {
  it('supports the tight center retry label', () => {
    expect(describeFaceDetectionMode('tight_center')).toBe('单人近景补检识别');
  });
});
