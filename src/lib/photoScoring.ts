export type PhotoDecision = 'keep' | 'review' | 'reject';

export type EyeStatus = 'unknown' | 'open' | 'closed_risk';

export type RawPhotoMetrics = {
  width: number;
  height: number;
  brightness: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  contrast: number;
  tiltDegrees: number;
  visualWeightX: number;
  visualWeightY: number;
  centerBrightness: number;
  edgeBrightness: number;
  faceCount?: number;
  eyeStatus?: EyeStatus;
};

export type AnalysisDimension = 'composition' | 'lighting' | 'exposure' | 'shadow' | 'portrait' | 'ratio';

export type DimensionStatus = 'good' | 'notice' | 'problem';

export type DimensionAssessment = {
  key: AnalysisDimension;
  label: string;
  status: DimensionStatus;
  score: number;
  summary: string;
  suggestions: string[];
};

export type PhotoAssessment = {
  status: PhotoDecision;
  score: number;
  badges: string[];
  suggestions: string[];
  dimensionAssessments: DimensionAssessment[];
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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromScore(score: number): DimensionStatus {
  if (score < 68) return 'problem';
  if (score < 84) return 'notice';
  return 'good';
}

function makeDimension(
  key: AnalysisDimension,
  label: string,
  score: number,
  summary: string,
  suggestions: string[],
): DimensionAssessment {
  return {
    key,
    label,
    status: statusFromScore(score),
    score: clampScore(score),
    summary,
    suggestions,
  };
}

function assessComposition(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (Math.abs(metrics.tiltDegrees) > 2.4) {
    score -= 18;
    suggestions.push('先拉正画面，再重新判断裁切范围，避免人物和地平线一起歪。');
  }

  if (metrics.visualWeightX < 0.28) {
    score -= 18;
    suggestions.push('主体重心明显偏左，建议裁掉右侧空白，或保留左侧空间做引导视线。');
  } else if (metrics.visualWeightX > 0.72) {
    score -= 18;
    suggestions.push('主体重心明显偏右，建议裁掉左侧空白，让人物或重点回到三分线附近。');
  }

  if (metrics.visualWeightY < 0.22) {
    score -= 12;
    suggestions.push('画面重心偏上，建议裁掉底部无效区域，或保留上方空间强化氛围。');
  } else if (metrics.visualWeightY > 0.78) {
    score -= 12;
    suggestions.push('画面重心偏下，建议裁掉顶部多余留白，让主体更稳定。');
  }

  if (suggestions.length === 0) {
    suggestions.push('主体位置比较稳定，可以优先保留原构图，只做小幅裁切。');
  }

  return makeDimension('composition', '构图', score, score >= 84 ? '主体位置稳定，画面重心比较舒服。' : '构图存在偏边或倾斜风险。', suggestions);
}

function assessLighting(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 90;
  const centerEdgeGap = metrics.centerBrightness - metrics.edgeBrightness;

  if (metrics.contrast < 30) {
    score -= 16;
    suggestions.push('整体反差偏低，建议用曲线或对比度把主体和背景拉开。');
  }

  if (centerEdgeGap < -18) {
    score -= 18;
    suggestions.push('主体区域比边缘更暗，建议优先提亮人物脸部或主体，不要只拉整体曝光。');
  } else if (centerEdgeGap > 42) {
    score -= 10;
    suggestions.push('中心区域明显更亮，注意压住脸部和白色衣物的高光。');
  }

  if (suggestions.length === 0) {
    suggestions.push('中心和边缘亮度关系较自然，光影层次可以保留。');
  }

  return makeDimension('lighting', '光影', score, score >= 84 ? '光影关系比较自然，主体层次清楚。' : '光影关系需要局部调整。', suggestions);
}

function assessExposure(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (metrics.brightness > 210 || metrics.brightPixelRatio > 0.26) {
    score -= 30;
    suggestions.push('高光过曝风险较高，建议降低高光并少量压低曝光，优先保护脸部、天空、白衣服细节。');
  } else if (metrics.brightPixelRatio > 0.16) {
    score -= 14;
    suggestions.push('高光偏多，建议轻微降低高光，避免亮部发白。');
  }

  if (metrics.brightness < 70) {
    score -= 14;
    suggestions.push('整体曝光偏低，建议先提升曝光半档，再检查肤色是否自然。');
  }

  if (suggestions.length === 0) {
    suggestions.push('曝光整体可用，后期只需要微调高光和白色色阶。');
  }

  return makeDimension('exposure', '曝光', score, score >= 84 ? '曝光比较稳定，没有明显过曝。' : '曝光需要重点处理。', suggestions);
}

function assessShadow(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (metrics.darkPixelRatio > 0.34) {
    score -= 30;
    suggestions.push('暗部死黑比例偏高，建议提升阴影和黑色色阶；如果脸部也没细节，这张优先降级。');
  } else if (metrics.darkPixelRatio > 0.2) {
    score -= 14;
    suggestions.push('暗部面积偏大，建议提升阴影，但保留一点黑场让画面有厚度。');
  }

  if (metrics.contrast < 28) {
    score -= 10;
    suggestions.push('暗部和中间调分离不够，建议用曲线做轻微 S 形调整。');
  }

  if (suggestions.length === 0) {
    suggestions.push('暗部保留了层次，可以只做少量阴影修正。');
  }

  return makeDimension('shadow', '暗部', score, score >= 84 ? '暗部层次尚可，没有明显死黑。' : '暗部需要拉回细节。', suggestions);
}

function assessPortrait(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 88;
  const faceCount = metrics.faceCount ?? 0;
  const eyeStatus = metrics.eyeStatus ?? 'unknown';

  if (faceCount === 0) {
    score -= 8;
    suggestions.push('当前没有识别到明确人脸；如果这是人像照片，请人工复核脸部表情和眼神。');
  } else if (faceCount > 1) {
    score -= 4;
    suggestions.push('画面中可能有多张脸，建议逐个检查主角表情是否统一。');
  }

  if (eyeStatus === 'closed_risk') {
    score -= 34;
    suggestions.push('检测到闭眼风险，建议放入待筛或淘汰；如果是连拍，优先找眼神更完整的一张。');
  } else if (eyeStatus === 'unknown') {
    suggestions.push('当前免费本地版暂未接入完整眼部关键点模型，闭眼需要人工复核。');
  } else {
    suggestions.push('人物眼部状态可用，后期重点检查肤色和脸部受光。');
  }

  return makeDimension('portrait', '人物状态', score, score >= 84 ? '人物状态基本可用。' : '人物状态需要复核。', suggestions);
}

function assessRatio(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 90;
  const aspectRatio = metrics.width / Math.max(1, metrics.height);

  if (aspectRatio > 2.1) {
    score -= 24;
    suggestions.push('画面过宽，人物照片容易显得空，建议裁切成 3:2、4:3 或竖图版本。');
  } else if (aspectRatio < 0.55) {
    score -= 24;
    suggestions.push('画面过窄，容易压缩人物空间，建议裁切成 4:5 或 3:4。');
  } else if (aspectRatio > 1.82 || aspectRatio < 0.68) {
    score -= 10;
    suggestions.push('画面比例略特殊，发布前建议额外导出一个社交平台友好的比例。');
  }

  if (Math.min(metrics.width, metrics.height) < 1200) {
    score -= 10;
    suggestions.push('图片短边偏小，不建议大幅输出，可以用于网页或社交平台预览。');
  }

  if (suggestions.length === 0) {
    suggestions.push('画面比例比较常规，适合继续做裁切和调色。');
  }

  return makeDimension('ratio', '画面比例', score, score >= 84 ? '画面比例协调，适合常规输出。' : '画面比例需要重新裁切。', suggestions);
}

function badgeForDimension(dimension: DimensionAssessment) {
  if (dimension.status !== 'problem') return null;

  const badgeMap: Record<AnalysisDimension, string> = {
    composition: '构图偏边',
    lighting: '光影不稳',
    exposure: '高光过曝',
    shadow: '暗部死黑',
    portrait: '闭眼风险',
    ratio: '比例不协调',
  };

  return badgeMap[dimension.key];
}

export function scorePhoto(metrics: RawPhotoMetrics): PhotoAssessment {
  const dimensionAssessments = [
    assessComposition(metrics),
    assessLighting(metrics),
    assessExposure(metrics),
    assessShadow(metrics),
    assessPortrait(metrics),
    assessRatio(metrics),
  ];
  const severeIssueCount = dimensionAssessments.filter((item) => item.status === 'problem').length;
  const warningIssueCount = dimensionAssessments.filter((item) => item.status === 'notice').length;
  const score = clampScore(
    dimensionAssessments.reduce((sum, dimension) => sum + dimension.score, 0) / dimensionAssessments.length,
  );
  const status: PhotoDecision =
    severeIssueCount >= 4 || score < 58 ? 'reject' : severeIssueCount >= 1 || warningIssueCount >= 3 ? 'review' : 'keep';
  const badges = dimensionAssessments
    .map((dimension) => badgeForDimension(dimension))
    .filter((badge): badge is string => Boolean(badge));
  const suggestions = dimensionAssessments.flatMap((dimension) => dimension.suggestions);

  if (status === 'keep') {
    suggestions.unshift('这张照片多维度表现稳定，可以优先保留，再做少量调色。');
  }

  return {
    status,
    score,
    badges,
    suggestions,
    dimensionAssessments,
    severeIssueCount,
    warningIssueCount,
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
