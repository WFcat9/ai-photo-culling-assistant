import { describe, expect, it } from 'vitest';
import { determineEyeStatus, extractFaceAnalysis } from './faceSignals';

describe('determineEyeStatus', () => {
  it('双眼闭合分数都偏高时，标记为闭眼风险', () => {
    const result = determineEyeStatus([
      { categoryName: 'eyeBlinkLeft', score: 0.72 },
      { categoryName: 'eyeBlinkRight', score: 0.81 },
    ]);

    expect(result).toBe('closed_risk');
  });

  it('双眼闭合分数都偏低时，标记为睁眼', () => {
    const result = determineEyeStatus([
      { categoryName: 'eyeBlinkLeft', score: 0.08 },
      { categoryName: 'eyeBlinkRight', score: 0.11 },
    ]);

    expect(result).toBe('open');
  });

  it('一高一低的边界状态保守返回未知', () => {
    const result = determineEyeStatus([
      { categoryName: 'eyeBlinkLeft', score: 0.59 },
      { categoryName: 'eyeBlinkRight', score: 0.22 },
    ]);

    expect(result).toBe('unknown');
  });

  it('没有眼部 blendshape 时，返回未知', () => {
    const result = determineEyeStatus([{ categoryName: 'mouthSmileLeft', score: 0.44 }]);

    expect(result).toBe('unknown');
  });
});

describe('extractFaceAnalysis', () => {
  it('能从 Face Landmarker 结果里提取人脸数量和闭眼状态', () => {
    const primaryFace = Array.from({ length: 300 }, (_, index) => ({
      x: 0.26 + (index % 2) * 0.22,
      y: 0.18 + (index % 3) * 0.24,
      z: 0,
    }));

    const result = extractFaceAnalysis(
      {
        faceLandmarks: [
          primaryFace,
          [{ x: 0.5, y: 0.6, z: 0 }],
        ],
        faceBlendshapes: [
          {
            categories: [
              { categoryName: 'eyeBlinkLeft', score: 0.66 },
              { categoryName: 'eyeBlinkRight', score: 0.71 },
            ],
          },
        ],
      },
      'upper_focus',
    );

    expect(result.faceCount).toBe(1);
    expect(result.eyeStatus).toBe('closed_risk');
    expect(result.expressionBalance).toBe('needs_review');
    expect(result.retouchReadiness).toBe('hold');
    expect(result.detectionMode).toBe('upper_focus');
  });

  it('能提取脸部占比和边界余量', () => {
    const landmarks = Array.from({ length: 300 }, (_, index) => ({
      x: 0.32 + (index % 2) * 0.28,
      y: 0.12 + (index % 3) * 0.34,
      z: 0,
    }));

    landmarks[33] = { x: 0.36, y: 0.32, z: 0 };
    landmarks[263] = { x: 0.58, y: 0.36, z: 0 };

    const result = extractFaceAnalysis(
      {
        faceLandmarks: [landmarks],
        faceBlendshapes: [],
      },
      'full_frame',
    );

    expect(result.faceSizeRatio).toBeGreaterThan(0.18);
    expect(result.faceTopMargin).toBeCloseTo(0.12, 2);
    expect(result.faceShapeTendency).toBe('long');
    expect(result.faceTiltDegrees).toBeGreaterThan(0);
  });

  it('会提取表情稳定度和精修准备度', () => {
    const landmarks = Array.from({ length: 300 }, (_, index) => ({
      x: 0.3 + (index % 2) * 0.24,
      y: 0.16 + (index % 3) * 0.24,
      z: 0,
    }));

    const result = extractFaceAnalysis(
      {
        faceLandmarks: [landmarks],
        faceBlendshapes: [
          {
            categories: [
              { categoryName: 'eyeBlinkLeft', score: 0.12 },
              { categoryName: 'eyeBlinkRight', score: 0.16 },
              { categoryName: 'mouthSmileLeft', score: 0.32 },
              { categoryName: 'mouthSmileRight', score: 0.3 },
              { categoryName: 'jawOpen', score: 0.14 },
            ],
          },
        ],
      },
      'full_frame',
    );

    expect(result.expressionBalance).toBe('stable');
    expect(result.retouchReadiness).toBe('ready');
    expect(result.eyeBlinkDiffScore).toBeCloseTo(0.04, 2);
    expect(result.smileDiffScore).toBeCloseTo(0.02, 2);
  });

  it('即使存在其他脸候选，也会优先聚焦主脸做单人分析', () => {
    const primaryFace = Array.from({ length: 300 }, (_, index) => ({
      x: 0.18 + (index % 2) * 0.22,
      y: 0.18 + (index % 3) * 0.2,
      z: 0,
    }));
    const secondaryFace = Array.from({ length: 300 }, (_, index) => ({
      x: 0.56 + (index % 2) * 0.2,
      y: 0.22 + (index % 3) * 0.18,
      z: 0,
    }));

    const result = extractFaceAnalysis(
      {
        faceLandmarks: [primaryFace, secondaryFace],
        faceBlendshapes: [],
      },
      'center_focus',
    );

    expect(result.faceCount).toBe(1);
    expect(result.detectionMode).toBe('center_focus');
  });
});
