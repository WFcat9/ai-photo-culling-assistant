export type PhotoDecision = 'keep' | 'review' | 'reject';

export type RawPhotoMetrics = {
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  contrast: number;
  tiltDegrees: number;
};

export type PhotoAssessment = {
  status: PhotoDecision;
  score: number;
  badges: string[];
  suggestions: string[];
  severeIssueCount: number;
  warningIssueCount: number;
};

export type AssessmentSummary = {
  totalCount: number;
  keepCount: number;
  reviewCount: number;
  rejectCount: number;
  averageScore: number;
};

const MIN_SAFE_EDGE = 1200;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pushIssue(
  condition: boolean,
  level: 'severe' | 'warning',
  badge: string,
  suggestion: string,
  target: {
    badges: string[];
    suggestions: string[];
    severeIssueCount: number;
    warningIssueCount: number;
    scorePenalty: number;
  },
) {
  if (!condition) return;

  target.badges.push(badge);
  target.suggestions.push(suggestion);

  if (level === 'severe') {
    target.severeIssueCount += 1;
    target.scorePenalty += 22;
    return;
  }

  target.warningIssueCount += 1;
  target.scorePenalty += 10;
}

export function scorePhoto(metrics: RawPhotoMetrics): PhotoAssessment {
  const issueState = {
    badges: [] as string[],
    suggestions: [] as string[],
    severeIssueCount: 0,
    warningIssueCount: 0,
    scorePenalty: 0,
  };

  pushIssue(
    metrics.sharpness < 80,
    'severe',
    '明显模糊',
    '照片清晰度明显不足，除非内容特别重要，否则建议淘汰。',
    issueState,
  );

  pushIssue(
    metrics.sharpness >= 80 && metrics.sharpness < 140,
    'warning',
    '轻微模糊',
    '照片有轻微虚焦或手抖风险，建议放大检查人物眼睛和主体边缘。',
    issueState,
  );

  pushIssue(
    metrics.brightness < 55 || metrics.darkPixelRatio > 0.42,
    'severe',
    '画面偏暗',
    '暗部面积过大，建议先尝试提升曝光和阴影；如果主体已经丢失细节就淘汰。',
    issueState,
  );

  pushIssue(
    metrics.brightness > 210 || metrics.brightPixelRatio > 0.24,
    'warning',
    '高光偏多',
    '高光区域偏多，建议降低曝光和高光，优先保护脸部与白色衣物细节。',
    issueState,
  );

  pushIssue(
    metrics.contrast < 28,
    'warning',
    '反差偏低',
    '画面对比度偏低，建议轻微增加对比度或曲线，让主体和背景分开。',
    issueState,
  );

  pushIssue(
    Math.abs(metrics.tiltDegrees) > 2.4,
    'warning',
    '画面倾斜',
    '画面可能不够水平，建议先拉正，再决定是否裁切。',
    issueState,
  );

  pushIssue(
    Math.min(metrics.width, metrics.height) < MIN_SAFE_EDGE,
    'warning',
    '尺寸偏小',
    '照片尺寸偏小，不适合大幅输出；可以用于预览或社交平台小图。',
    issueState,
  );

  const score = clampScore(100 - issueState.scorePenalty);
  const status =
    issueState.severeIssueCount >= 2 || score < 55
      ? 'reject'
      : issueState.severeIssueCount === 1 || issueState.warningIssueCount >= 2
        ? 'review'
        : 'keep';

  if (issueState.suggestions.length === 0) {
    issueState.suggestions.push('这张照片基础质量不错，可以优先保留。');
  }

  return {
    status,
    score,
    badges: issueState.badges,
    suggestions: issueState.suggestions,
    severeIssueCount: issueState.severeIssueCount,
    warningIssueCount: issueState.warningIssueCount,
  };
}

export function summarizeAssessments(assessments: PhotoAssessment[]): AssessmentSummary {
  const totalScore = assessments.reduce((sum, assessment) => sum + assessment.score, 0);

  return {
    totalCount: assessments.length,
    keepCount: assessments.filter((assessment) => assessment.status === 'keep').length,
    reviewCount: assessments.filter((assessment) => assessment.status === 'review').length,
    rejectCount: assessments.filter((assessment) => assessment.status === 'reject').length,
    averageScore: assessments.length === 0 ? 0 : Math.round(totalScore / assessments.length),
  };
}

