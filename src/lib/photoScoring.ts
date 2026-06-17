export type PhotoDecision = 'keep' | 'review' | 'reject';

export type EyeStatus = 'unknown' | 'open' | 'closed_risk';

export type FaceDetectionMode = 'full_frame' | 'upper_focus' | 'center_focus' | 'native_api' | 'not_detected';
export type FaceShapeTendency = 'unknown' | 'balanced' | 'round' | 'long';

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
  faceDetectionMode?: FaceDetectionMode;
  faceSizeRatio?: number;
  faceTopMargin?: number;
  faceBottomMargin?: number;
  faceLeftMargin?: number;
  faceRightMargin?: number;
  faceTiltDegrees?: number;
  faceShapeTendency?: FaceShapeTendency;
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

export function describeFaceDetectionMode(mode?: FaceDetectionMode) {
  switch (mode) {
    case 'full_frame':
      return '整张画面直接识别';
    case 'upper_focus':
      return '上半区补检识别';
    case 'center_focus':
      return '中心区补检识别';
    case 'native_api':
      return '浏览器回退识别';
    default:
      return '未识别到明确人脸';
  }
}

export function describeEyeStatus(status?: EyeStatus) {
  switch (status) {
    case 'open':
      return '眼部状态可用';
    case 'closed_risk':
      return '存在闭眼风险';
    default:
      return '需要人工复核';
  }
}

export function describeFaceShapeTendency(tendency?: FaceShapeTendency) {
  switch (tendency) {
    case 'long':
      return '偏长脸倾向';
    case 'round':
      return '偏圆脸倾向';
    case 'balanced':
      return '比例较均衡';
    default:
      return '暂未稳定判断';
  }
}

function assessComposition(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (Math.abs(metrics.tiltDegrees) > 2.4) {
    score -= 18;
    suggestions.push('先把画面拉正，再判断裁切范围，避免人物和地平线一起歪掉。');
    suggestions.push('如果画面里有建筑、栏杆、海平线，优先拿这些线条做基准，不要只凭感觉转正。');
    suggestions.push('这类歪斜如果不先处理，后面的裁图和局部提亮都会越修越别扭。');
  }

  if (metrics.visualWeightX < 0.28) {
    score -= 18;
    suggestions.push('主体重心明显偏左，建议裁掉右侧空白，或保留左侧空间做引导视线。');
    suggestions.push('如果人物朝右看，右侧可以留一点呼吸空间；如果不是刻意留白，这张更适合往中间收。');
    suggestions.push('批量筛片时，像这种“人贴边”的画面通常都值得单独拉出来重看一眼。');
  } else if (metrics.visualWeightX > 0.72) {
    score -= 18;
    suggestions.push('主体重心明显偏右，建议裁掉左侧空白，让人物或重点回到三分线附近。');
    suggestions.push('如果人物视线朝左，可以保留少量左侧空间；否则这张会有“人快出画”的感觉。');
    suggestions.push('右边过满、左边过空时，观众会先感到不稳，通常比色彩问题更先影响观感。');
  }

  if (metrics.visualWeightY < 0.22) {
    score -= 12;
    suggestions.push('画面重心偏上，建议裁掉底部无效区域，或保留上方空间强化氛围。');
    suggestions.push('底部如果只是杂乱地面或暗块，直接收掉会更干净，人物也会更挺。');
  } else if (metrics.visualWeightY > 0.78) {
    score -= 12;
    suggestions.push('画面重心偏下，建议裁掉顶部多余留白，让主体更稳定。');
    suggestions.push('顶部留白太多时，视线会先跑到空处，裁掉一些会更聚焦人物。');
  }

  if (suggestions.length === 0) {
    suggestions.push('主体位置比较稳定，可以优先保留原构图，只做小幅裁切。');
    suggestions.push('这类画面更适合微调边缘松紧，而不是大刀阔斧重构。');
    suggestions.push('如果后续要做版式输出，这种构图通常也更容易兼容横竖两种尺寸。');
  }

  return makeDimension(
    'composition',
    '构图',
    score,
    score >= 84 ? '主体位置稳定，画面重心比较舒服。' : '构图存在偏边或倾斜风险。',
    suggestions,
  );
}

function assessLighting(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 90;
  const centerEdgeGap = metrics.centerBrightness - metrics.edgeBrightness;

  if (metrics.contrast < 30) {
    score -= 16;
    suggestions.push('整体反差偏低，建议用曲线或对比度把主体和背景拉开。');
    suggestions.push('如果是阴天或雾感场景，可以保留柔和气氛，但人物轮廓最好还是要立起来。');
    suggestions.push('这种“全都差不多亮”的画面最容易显得平，后期先把主次关系拉出来会更有效。');
  }

  if (centerEdgeGap < -18) {
    score -= 18;
    suggestions.push('主体区域比边缘更暗，建议优先提亮人物脸部或主体，不要只拉整体曝光。');
    suggestions.push('这类画面很容易出现背景比人更抢眼，后期要先把眼神和脸部拉回来。');
    suggestions.push('如果是逆光人像，宁可局部修脸，也不要把整张一股脑提亮成灰白。');
  } else if (centerEdgeGap > 42) {
    score -= 10;
    suggestions.push('中心区域明显更亮，注意压住脸部和白色衣物的高光。');
    suggestions.push('如果脸已经发白，先降高光，再用中间调把肤色慢慢拉回去。');
  }

  if (suggestions.length === 0) {
    suggestions.push('中心和边缘亮度关系较自然，光影层次可以保留。');
    suggestions.push('这类片子后期不需要大改光，只要稳住肤色和黑白关系就够了。');
    suggestions.push('如果你追求更高级一点的质感，可以只做很轻的局部明暗塑形。');
  }

  return makeDimension(
    'lighting',
    '光影',
    score,
    score >= 84 ? '光影关系比较自然，主体层次清楚。' : '光影关系需要局部调整。',
    suggestions,
  );
}

function assessExposure(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (metrics.brightness > 210 || metrics.brightPixelRatio > 0.26) {
    score -= 30;
    suggestions.push('高光过曝风险较高，建议降低高光并少量压低曝光，优先保护脸部、天空、白衣服细节。');
    suggestions.push('如果脸和白衣已经连成一片白，后期空间会很小，这张要优先降级处理。');
    suggestions.push('这种问题比偏暗更难救，筛片时通常宁可保守一点，也不要强行留。');
  } else if (metrics.brightPixelRatio > 0.16) {
    score -= 14;
    suggestions.push('高光偏多，建议轻微降低高光，避免亮部发白。');
    suggestions.push('亮部不要一次压太狠，先压高光，再看白色色阶有没有失去空气感。');
  }

  if (metrics.brightness < 70) {
    score -= 14;
    suggestions.push('整体曝光偏低，建议先提升曝光半档，再检查肤色是否自然。');
    suggestions.push('如果只是环境暗、人物还在，可优先拉脸；如果人物本身也沉进暗部，修复空间会有限。');
    suggestions.push('过暗的人像容易把眼神吃掉，后期先确认脸有没有信息，再决定值不值得细修。');
  }

  if (suggestions.length === 0) {
    suggestions.push('曝光整体可用，后期只需要微调高光和白色色阶。');
    suggestions.push('这一类片子不要修太满，轻微收亮部、稳住层次就很耐看。');
    suggestions.push('如果要统一一组照片，这类曝光状态会很省时间。');
  }

  return makeDimension(
    'exposure',
    '曝光',
    score,
    score >= 84 ? '曝光比较稳定，没有明显过曝。' : '曝光需要重点处理。',
    suggestions,
  );
}

function assessShadow(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 92;

  if (metrics.darkPixelRatio > 0.34) {
    score -= 30;
    suggestions.push('暗部死黑比例偏高，建议提升阴影和黑色色阶；如果脸部也没细节，这张优先降级。');
    suggestions.push('暗部一旦糊成一片，观众会觉得闷和脏，所以先把能救回来的层次救出来。');
    suggestions.push('如果你发现头发、衣服、背景全糊在一起，这类片子通常不适合花太多修图时间。');
  } else if (metrics.darkPixelRatio > 0.2) {
    score -= 14;
    suggestions.push('暗部面积偏大，建议提升阴影，但保留一点黑场让画面有厚度。');
    suggestions.push('不要把暗部提得跟灰雾一样，稍微留一点黑能让照片更有力。');
  }

  if (metrics.contrast < 28) {
    score -= 10;
    suggestions.push('暗部和中间调分离不够，建议用曲线做轻微 S 形调整。');
    suggestions.push('如果整张都软绵绵的，没有黑也没有白，后期很难撑住情绪。');
  }

  if (suggestions.length === 0) {
    suggestions.push('暗部保留了层次，可以只做少量阴影修正。');
    suggestions.push('黑位不用提太多，保持一点压感，画面会更高级。');
    suggestions.push('这类暗部状态比较适合统一成一个稳定风格。');
  }

  return makeDimension(
    'shadow',
    '暗部',
    score,
    score >= 84 ? '暗部层次尚可，没有明显死黑。' : '暗部需要拉回细节。',
    suggestions,
  );
}

function assessPortrait(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 88;
  const faceCount = metrics.faceCount ?? 0;
  const eyeStatus = metrics.eyeStatus ?? 'unknown';
  const faceDetectionMode = metrics.faceDetectionMode ?? 'not_detected';
  const faceSizeRatio = metrics.faceSizeRatio ?? 0;
  const faceTopMargin = metrics.faceTopMargin ?? 0;
  const faceBottomMargin = metrics.faceBottomMargin ?? 0;
  const faceLeftMargin = metrics.faceLeftMargin ?? 0;
  const faceRightMargin = metrics.faceRightMargin ?? 0;
  const faceTiltDegrees = Math.abs(metrics.faceTiltDegrees ?? 0);
  const faceShapeTendency = metrics.faceShapeTendency ?? 'unknown';

  if (faceCount === 0) {
    score -= 12;
    suggestions.push('当前没有识别到明确人脸，系统已经按整图、上半区和中心区域做过补检；如果这是人像照片，建议人工复核。');
    suggestions.push('这类漏检更常见于脸太小、侧脸角度过大、眼部被头发或手遮挡、逆光过重，或者人物离镜头太远。');
    suggestions.push('想让批量筛片更稳，尽量让主角脸部至少占画面短边约 12% 到 15%，并保证眼睛附近有可见细节。');
  } else {
    if (faceSizeRatio > 0 && faceSizeRatio < 0.035) {
      score -= 12;
      suggestions.push('主角脸部在整张画面里偏小，这张更适合做氛围留片，不适合拿来做精细表情和脸型判断。');
      suggestions.push('如果后续要继续做人脸分析、闭眼筛选或脸型建议，优先准备更近一点的版本，或先裁出主角区域再分析。');
    } else if (faceSizeRatio > 0.28) {
      score -= 6;
      suggestions.push('脸部占比已经比较大，修图时注意不要把额头、下巴和发际线修得太紧，避免越修越有压迫感。');
    }

    if (faceTopMargin > 0 && faceTopMargin < 0.04) {
      score -= 8;
      suggestions.push('头顶留白偏紧，有顶边裁切风险；如果不是刻意近景，建议补一点头顶空间会更耐看。');
    }

    if (faceBottomMargin > 0 && faceBottomMargin < 0.035) {
      score -= 6;
      suggestions.push('下巴或颈部离底边太近，人物会显得憋，适合重新裁切或改用更松一点的构图。');
    }

    if ((faceLeftMargin > 0 && faceLeftMargin < 0.03) || (faceRightMargin > 0 && faceRightMargin < 0.03)) {
      score -= 8;
      suggestions.push('脸部左右边缘过紧，容易出现“脸贴边”的紧张感，批量筛片时建议把这类图单独复核。');
    }

    if (faceTiltDegrees > 7) {
      score -= 4;
      suggestions.push('人物头部有明显倾斜，筛片时建议顺手确认这是不是有意的动作表达，而不是拍摄瞬间失衡。');
    }

    if (faceCount > 1) {
      score -= 4;
      suggestions.push('画面中可能有多张脸，建议逐个检查主角表情是否统一。');
      suggestions.push('多人画面里最怕有人状态掉队，先确定主角，再看其他人是否拖后腿。');
    }

    if (faceDetectionMode === 'upper_focus' || faceDetectionMode === 'center_focus') {
      score -= 4;
      suggestions.push('这张是通过局部补检才锁定到人脸，说明人物在全图里偏小；批量筛片时建议把这类远景人像单独复核。');
      suggestions.push('如果后续要重点分析闭眼、表情和脸型，最好优先准备脸部占比更大的版本。');
    } else if (faceDetectionMode === 'native_api') {
      score -= 2;
      suggestions.push('这张是通过浏览器回退能力识别到人脸，说明模型判断不算特别稳，建议放大再看一遍眼神和表情。');
    } else {
      suggestions.push('这张在人脸识别上比较顺，说明人物主体足够明确，后续闭眼和表情判断会更稳。');
    }

    if (faceShapeTendency === 'long') {
      suggestions.push('从轮廓比例看更偏长脸倾向，修图时不要再纵向拉长，优先整理两颊和下颌线的光影关系。');
    } else if (faceShapeTendency === 'round') {
      suggestions.push('从轮廓比例看更偏圆脸倾向，修图时优先整理下颌线和两颊明暗，不建议直接把脸生硬拉尖。');
    } else if (faceShapeTendency === 'balanced') {
      suggestions.push('轮廓比例比较均衡，脸型本身不用强改，后期把重点放在肤色、法令纹和发丝边缘会更自然。');
    }

    if (eyeStatus === 'closed_risk') {
      score -= 34;
      suggestions.push('检测到闭眼风险，建议放入待筛或淘汰；如果是连拍，优先找眼神更完整的一张。');
      suggestions.push('闭眼不是后期能真正补回来的问题，所以这类照片通常优先换片，不优先修。');
      suggestions.push('哪怕构图和光线不错，只要主角闭眼，实际交付时往往也很难留下。');
    } else if (eyeStatus === 'unknown') {
      score -= 4;
      suggestions.push('当前闭眼判断还不够确定，建议顺手放大检查眼神、嘴角和脸部是否有轻微抽动。');
      suggestions.push('如果后续这张要进精修池，最好人工确认一下眼皮开合和双眼神态是否一致。');
    } else {
      suggestions.push('人物眼部状态可用，后期可以把重点放到肤色、眼神光和脸部受光的统一上。');
      suggestions.push('如果想继续精修，优先看法令纹、高光边界、发丝遮挡和脸部明暗过渡是否自然。');
    }
  }

  return makeDimension(
    'portrait',
    '人物状态',
    score,
    faceCount === 0
      ? '人物状态需要人工复核，暂未稳定识别到人脸。'
      : score >= 84
        ? `已识别到 ${faceCount} 张人脸，人物状态基本可用，且可以开始做初步脸部判断。`
        : `已识别到 ${faceCount} 张人脸，但人物状态仍需复核。`,
    suggestions,
  );
}

function assessRatio(metrics: RawPhotoMetrics): DimensionAssessment {
  const suggestions: string[] = [];
  let score = 90;
  const aspectRatio = metrics.width / Math.max(1, metrics.height);

  if (aspectRatio > 2.1) {
    score -= 24;
    suggestions.push('画面过宽，人像照片容易显得空，建议裁切成 3:2、4:3 或竖图版本。');
    suggestions.push('除非你就是要强调环境叙事，不然过宽的人像很容易把人压小。');
    suggestions.push('如果这类图后面还要做人脸分析，过宽画幅也会天然拉低识别稳定度。');
  } else if (aspectRatio < 0.55) {
    score -= 24;
    suggestions.push('画面过窄，容易压缩人物空间，建议裁切成 4:5 或 3:4。');
    suggestions.push('太瘦的画幅会让动作和姿态施展不开，尤其是半身和全身人像。');
  } else if (aspectRatio > 1.82 || aspectRatio < 0.68) {
    score -= 10;
    suggestions.push('画面比例略特殊，发布前建议额外导出一个社交平台友好的比例。');
    suggestions.push('如果这张要发朋友圈、小红书或横版封面，最好顺手准备两个版本。');
  }

  if (Math.min(metrics.width, metrics.height) < 1200) {
    score -= 10;
    suggestions.push('图片短边偏小，不建议大幅输出，可以用于网页或社交平台预览。');
    suggestions.push('小尺寸本身不一定毁片，但会限制二次裁切和高质量输出。');
  }

  if (suggestions.length === 0) {
    suggestions.push('画面比例比较常规，适合继续做裁切和调色。');
    suggestions.push('这种比例对后续排版也友好，横竖版本都比较容易兼容。');
    suggestions.push('如果要统一整组作品，这类比例通常最省心。');
  }

  return makeDimension(
    'ratio',
    '画面比例',
    score,
    score >= 84 ? '画面比例协调，适合常规输出。' : '画面比例需要重新裁切。',
    suggestions,
  );
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
    suggestions.unshift('这张照片多维度表现稳定，可以优先保留，再做少量调色和局部修边。');
  } else if (status === 'review') {
    suggestions.unshift('这张照片有可用基础，但建议先处理最明显的问题，再决定要不要进入精修。');
  } else {
    suggestions.unshift('这张照片当前硬伤偏多，更适合先放入待淘汰组，除非内容价值很高。');
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
