export type PhotoDecision = 'keep' | 'review' | 'reject';

import { FACE_CAPTURE_GUIDE, FACE_REFERENCE_RANGES, isAboveRange, isBelowRange, isWithinRange } from './faceReference';

export type EyeStatus = 'unknown' | 'open' | 'closed_risk';
export type ExpressionBalance = 'unknown' | 'stable' | 'slight_asymmetry' | 'needs_review';
export type RetouchReadiness = 'hold' | 'conditional' | 'ready';

export type FaceDetectionMode =
  | 'full_frame'
  | 'upper_focus'
  | 'center_focus'
  | 'tight_center'
  | 'native_api'
  | 'not_detected';

export type FaceShapeTendency = 'unknown' | 'balanced' | 'round' | 'long';
export type FaceWidthTendency = 'unknown' | 'balanced' | 'broad' | 'tapered';
export type FaceStructureConfidence = 'low' | 'medium' | 'high';

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
  expressionBalance?: ExpressionBalance;
  retouchReadiness?: RetouchReadiness;
  faceDetectionMode?: FaceDetectionMode;
  faceSizeRatio?: number;
  faceTopMargin?: number;
  faceBottomMargin?: number;
  faceLeftMargin?: number;
  faceRightMargin?: number;
  faceTiltDegrees?: number;
  faceShapeTendency?: FaceShapeTendency;
  faceWidthTendency?: FaceWidthTendency;
  faceStructureConfidence?: FaceStructureConfidence;
  upperThirdRatio?: number;
  midThirdRatio?: number;
  lowerThirdRatio?: number;
  eyeGapRatio?: number;
  jawToCheekRatio?: number;
  leftEyeBlinkScore?: number;
  rightEyeBlinkScore?: number;
  eyeBlinkDiffScore?: number;
  leftSmileScore?: number;
  rightSmileScore?: number;
  smileDiffScore?: number;
  mouthOpenScore?: number;
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
    case 'tight_center':
      return '单人近景补检识别';
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

export function describeExpressionBalance(balance?: ExpressionBalance) {
  switch (balance) {
    case 'stable':
      return '表情比较稳定';
    case 'slight_asymmetry':
      return '有轻微不对称';
    case 'needs_review':
      return '表情建议复核';
    default:
      return '表情信息待复核';
  }
}

export function describeRetouchReadiness(readiness?: RetouchReadiness) {
  switch (readiness) {
    case 'ready':
      return '可直接进精修';
    case 'conditional':
      return '放大复核后再修';
    default:
      return '先别进精修';
  }
}

export function describeFaceWidthTendency(tendency?: FaceWidthTendency) {
  switch (tendency) {
    case 'broad':
      return '下颌存在宽感';
    case 'tapered':
      return '下巴收得较快';
    case 'balanced':
      return '横向比例较稳';
    default:
      return '横向结构待复核';
  }
}

export function describeFaceStructureConfidence(confidence?: FaceStructureConfidence) {
  switch (confidence) {
    case 'high':
      return '结构判断较稳定';
    case 'medium':
      return '结构判断基本可用';
    default:
      return '结构判断仅供参考';
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
    suggestions.push('右边过满、左边过空时，观众会先感觉到不稳，通常比色彩问题更先影响观感。');
  }

  if (metrics.visualWeightY < 0.22) {
    score -= 12;
    suggestions.push('画面重心偏上，建议裁掉底部无效区域，或保留上方空间强化氛围。');
    suggestions.push('底部如果只是杂乱地面或暗块，直接收掉会更干净，人物也会更挺。');
  } else if (metrics.visualWeightY > 0.78) {
    score -= 12;
    suggestions.push('画面重心偏下，建议裁掉顶部多余留白，让主体更稳定。');
    suggestions.push('顶部留白太多时，视线会先跑到空处，裁掉一点会更聚焦人物。');
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
    suggestions.push('这种“全部差不多亮”的画面最容易显得平，后期先把主次关系拉出来会更有效。');
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
    suggestions.push('如果想更高级一点，可以只做很轻的局部明暗塑形。');
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
    suggestions.push('高光过曝风险较高，建议降低高光并少量压低曝光，优先保护脸部、天空、白衣细节。');
    suggestions.push('如果脸和白衣已经连成一片白，后期空间会很小，这张要优先降级处理。');
    suggestions.push('这种问题比偏暗更难救，筛片时通常宁可保守一点，也不要强行留。');
  } else if (metrics.brightPixelRatio > 0.16) {
    score -= 14;
    suggestions.push('高光偏多，建议轻微降低高光，避免亮部发白。');
    suggestions.push('亮部不要一次压太狠，先压高光，再看白色色阶有没有失去空气感。');
  }

  if (metrics.brightness < 70) {
    score -= 14;
    suggestions.push('整体曝光偏低，建议先提升曝光半档以内，再检查肤色是否自然。');
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
  let score = 90;
  const faceCount = metrics.faceCount ?? 0;
  const eyeStatus = metrics.eyeStatus ?? 'unknown';
  const expressionBalance = metrics.expressionBalance ?? 'unknown';
  const retouchReadiness = metrics.retouchReadiness ?? 'hold';
  const faceDetectionMode = metrics.faceDetectionMode ?? 'not_detected';
  const faceSizeRatio = metrics.faceSizeRatio ?? 0;
  const faceTopMargin = metrics.faceTopMargin ?? 0;
  const faceBottomMargin = metrics.faceBottomMargin ?? 0;
  const faceLeftMargin = metrics.faceLeftMargin ?? 0;
  const faceRightMargin = metrics.faceRightMargin ?? 0;
  const faceTiltDegrees = Math.abs(metrics.faceTiltDegrees ?? 0);
  const faceShapeTendency = metrics.faceShapeTendency ?? 'unknown';
  const faceWidthTendency = metrics.faceWidthTendency ?? 'unknown';
  const faceStructureConfidence = metrics.faceStructureConfidence ?? 'low';

  if (faceCount === 0) {
    score -= 24;
    suggestions.push('当前没有识别到明确人脸，系统已经按整图、上半区、中心区和近景单人区做过补检；如果这是人像照片，建议人工复核。');
    suggestions.push('这类漏检更常见于脸太小、侧脸角度过大、眼部被头发或手遮挡、逆光过重，或者人物离镜头太远。');
    suggestions.push(`想让批量筛片更稳，尽量让主角脸部至少占画面短边约 ${FACE_CAPTURE_GUIDE.minReliableShortEdgeCoverage}，并保证眼睛附近有可见细节。`);
    suggestions.push(`正脸到轻微侧脸最稳，偏转角度尽量控制在 ${FACE_CAPTURE_GUIDE.maxReliableTurnDegrees}° 内，同时别让眉眼被头发、手或大面积阴影盖住。`);
    suggestions.push('如果你后面还要做修脸和面部结构分析，最好先裁出单人主角，再重新分析一次。');
  } else if (faceCount > 1) {
    score -= 26;
    suggestions.push('当前识别到多张人脸，这一版只对单人主角给出修脸和塑形建议。');
    suggestions.push('建议先裁成单人图，再进入脸型判断、闭眼筛查和局部修饰建议。');
    suggestions.push('多人画面里最怕主角状态没问题、配角状态拖后腿，所以多人照片先作为筛片判断，不直接进入修脸阶段。');
  } else {
    if (faceSizeRatio > 0 && faceSizeRatio < 0.04) {
      score -= 14;
      suggestions.push('主角脸部在整张画面里偏小，这张更适合做氛围留片，不适合拿来做精细表情和脸型判断。');
      suggestions.push('如果后面要继续做闭眼筛选、表情筛选和修脸建议，优先准备更近一点的版本，或先裁出主角区域再分析。');
    } else if (faceSizeRatio > 0.3) {
      score -= 6;
      suggestions.push('脸部占比已经比较大，修图时不要把额头、下巴和发际线修得太紧，避免越修越有压迫感。');
    }

    if (faceTopMargin > 0 && faceTopMargin < 0.04) {
      score -= 8;
      suggestions.push('头顶留白偏紧，有顶边裁切风险；如果不是刻意近景，补一点头顶空间会更耐看。');
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
      score -= 6;
      suggestions.push('人物头部有明显倾斜，筛片时建议顺手确认这是有意的动作表达，而不是拍摄瞬间失衡。');
    }

    if (faceDetectionMode === 'upper_focus' || faceDetectionMode === 'center_focus' || faceDetectionMode === 'tight_center') {
      score -= 4;
      suggestions.push('这张是通过局部补检才锁定到人脸，说明人脸在全图里不算特别稳；如果要做精修，建议先看放大细节。');
    } else if (faceDetectionMode === 'native_api') {
      score -= 3;
      suggestions.push('这张是通过浏览器回退能力识别到人脸，说明模型判断不算特别稳，建议放大再看眼神和嘴角。');
    } else {
      suggestions.push('这张在人脸识别上比较顺，说明人物主体足够明确，后续闭眼和结构判断会更稳。');
    }

    if (faceStructureConfidence === 'low') {
      score -= 4;
      suggestions.push('当前脸部结构判断信息还不够完整，修脸建议可参考，但最好配合人工复看。');
    } else if (faceStructureConfidence === 'high') {
      suggestions.push('这张单人脸的结构点位比较稳定，可以更放心地参考修脸和塑形建议。');
    }

    if (isAboveRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.01)) {
        score -= 5;
        suggestions.push('上庭略长，后期不建议再往上拉头部比例；更适合轻压发际线附近明度，或裁掉一点顶部空白。');
      } else if (isBelowRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.02)) {
        score -= 4;
        suggestions.push('上庭略短，修图时不要把发际线再压低，构图上也尽量别把头顶收得更紧。');
      }

    if (isAboveRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01)) {
        score -= 5;
        suggestions.push('中庭略长，修图时优先控制鼻梁高光和法令纹投影，不建议把鼻子继续修得更长更挺。');
      } else if (isBelowRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01)) {
        score -= 3;
        suggestions.push('中庭偏短，鼻部和面中部已经够集中，后期更适合做轻微提亮，不用过度立体化。');
      }

    if (isAboveRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)) {
        score -= 5;
        suggestions.push('下庭略长，修图时不要再拉长下巴，优先整理下颌线和下巴底部阴影，让长度看起来更收一点。');
      } else if (isBelowRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)) {
        score -= 3;
        suggestions.push('下庭偏短，修图时不要把下巴再压平，适合保留一点下颌线过渡，让脸型更舒展。');
      }

    if (isAboveRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.03)) {
        score -= 4;
        suggestions.push('眼距偏宽，后期更适合加强鼻梁中段和眼头附近的结构感，不建议把双眼再做得更散。');
      } else if (isBelowRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.04)) {
        score -= 4;
        suggestions.push('眼距偏紧，修图时不要把鼻根和眼头阴影压得太重，避免五官挤在一起。');
      }

    if (isAboveRange(metrics.jawToCheekRatio, FACE_REFERENCE_RANGES.jawToCheek)) {
        score -= 4;
        suggestions.push('下颌存在宽感，修图时更适合轻收下颌角阴影和下巴两侧明暗，不建议生硬削骨感。');
      } else if (isBelowRange(metrics.jawToCheekRatio, FACE_REFERENCE_RANGES.jawToCheek)) {
        score -= 3;
        suggestions.push('下巴收得较快，修图时不要再过度瘦脸，保留一点两颊过渡会更自然。');
      }

    if (faceShapeTendency === 'long') {
      suggestions.push('从轮廓比例看更偏长脸，修图时不要再纵向拉长，优先整理两颊和下颌线的光影关系。');
      suggestions.push('长脸更适合控制额头和下巴的纵向视觉长度，少做“拉挺”“拉高”的处理。');
    } else if (faceShapeTendency === 'round') {
      suggestions.push('从轮廓比例看更偏圆脸，修图时优先整理下颌线和两颊明暗，不建议直接把脸生硬拉尖。');
      suggestions.push('圆脸的高级感通常来自轮廓过渡和面中部层次，不来自大幅度瘦脸。');
    } else if (faceShapeTendency === 'balanced') {
      suggestions.push('轮廓比例比较均衡，脸型本身不用强改，后期把重点放在肤色、法令纹和发丝边缘会更自然。');
    }

    if (faceWidthTendency === 'broad') {
      suggestions.push('横向结构偏稳重，修图时更适合轻收下颌外轮廓，而不是把整张脸一起压窄。');
    } else if (faceWidthTendency === 'tapered') {
      suggestions.push('下巴收得较快，后期更适合保留一点面颊体积，避免修成过薄、过尖的网感脸。');
    }

    if (eyeStatus === 'closed_risk') {
      score -= 34;
      suggestions.push('检测到闭眼风险，建议放入待筛或淘汰；如果是连拍，优先找眼神更完整的一张。');
      suggestions.push('闭眼不是后期能真正补回来的问题，所以这类照片通常优先换片，不优先修。');
      suggestions.push('哪怕构图和光线不错，只要主角闭眼，实际交付时往往也很难留下。');
    } else if (eyeStatus === 'unknown') {
      score -= 4;
      suggestions.push('当前闭眼判断还不够确定，建议放大复核眼神、嘴角和脸部是否有轻微抽动。');
      suggestions.push('如果这张要进精修，最好人工确认一下双眼开合和神态是否一致。');
    } else {
      suggestions.push('人物眼部状态可用，后期可以把重点放在肤色、眼神光和脸部受光的统一上。');
      suggestions.push('继续精修时，优先看法令纹、高光边界、发丝遮挡和脸部明暗过渡是否自然。');
    }

    if (expressionBalance === 'needs_review') {
      score -= 18;
      suggestions.push('表情两侧有明显不对称或嘴角开合异常，这类图要优先放大复核，不建议直接进精修。');
      suggestions.push('如果这是抓拍瞬间，常见问题会出现在一只眼半眯、单侧嘴角抽动，或者说话瞬间嘴型没收住。');
    } else if (expressionBalance === 'slight_asymmetry') {
      score -= 7;
      suggestions.push('表情存在轻微不对称，建议放大看双眼开合、嘴角高低和法令纹两侧是否一致。');
      suggestions.push('这类照片不一定废，但最好先确认神态稳不稳，再决定值不值得细修。');
    } else if (expressionBalance === 'stable') {
      suggestions.push('表情整体比较稳，双眼和嘴角没有明显失衡，更适合继续做人像精修。');
    }

    if (retouchReadiness === 'hold') {
      suggestions.push('这张当前不建议直接进精修，先把闭眼、表情或主脸识别稳定性确认清楚会更省时间。');
    } else if (retouchReadiness === 'conditional') {
      suggestions.push('这张可以作为候选片，但更适合先放大复核，再决定是否进入脸部精修。');
    } else {
      suggestions.push('这张已经比较适合作为精修起点，可以优先处理肤色、轮廓光影和发丝边缘。');
    }

    if (
      isWithinRange(metrics.upperThirdRatio, FACE_REFERENCE_RANGES.upperThird, 0.01) &&
      isWithinRange(metrics.midThirdRatio, FACE_REFERENCE_RANGES.midThird, 0.01) &&
      isWithinRange(metrics.lowerThirdRatio, FACE_REFERENCE_RANGES.lowerThird, 0.01)
    ) {
      suggestions.push('三庭比例基本落在当前参考区间附近，更适合用轻微明暗塑形来提气质，不建议靠大幅液化去改比例。');
    }

    if (isWithinRange(metrics.eyeGapRatio, FACE_REFERENCE_RANGES.eyeGap, 0.03)) {
      suggestions.push('眼距比例在比较自然的区间里，鼻根和眼头只要做很轻的结构强调就够，不需要刻意挤近五官。');
    }

    if (faceStructureConfidence === 'high' && faceShapeTendency !== 'unknown') {
      suggestions.push('这一张更适合走“轻修脸型、重修光影”的路线，先整理法令纹、下颌线和发丝边界，再决定要不要动脸宽。');
    }
  }

  const summary =
    faceCount === 0
      ? '当前未稳定识别人脸，建议先复核是否为单人可分析画面。'
      : faceCount > 1
        ? '当前为多人画面，这一版只对单人主角提供修脸结构建议。'
        : retouchReadiness === 'ready'
          ? '已识别单人脸，人物状态比较稳，可以直接作为精修候选。'
          : retouchReadiness === 'conditional'
            ? '已识别单人脸，但建议先放大复核表情和结构，再决定是否进精修。'
            : '已识别单人脸，但人物状态或表情稳定度仍需复核。';

  return makeDimension('portrait', '人物状态', score, summary, suggestions);
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
    suggestions.push('小尺寸本身不一定废片，但会限制二次裁切和高质量输出。');
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
    shadow: '暗部过黑',
    portrait: '人物需复核',
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
    suggestions.unshift('这张照片多维度表现稳定，可以优先保留，再做少量调色和局部修饰。');
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
