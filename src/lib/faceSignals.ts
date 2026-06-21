import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type {
  EyeStatus,
  ExpressionBalance,
  FaceDetectionMode,
  FaceShapeTendency,
  FaceStructureConfidence,
  FaceWidthTendency,
  RetouchReadiness,
} from './photoScoring';

type BlendshapeCategory = {
  categoryName: string;
  score: number;
};

type FaceBlendshapeGroup = {
  categories: BlendshapeCategory[];
};

type FaceLandmarkPoint = {
  x: number;
  y: number;
  z?: number;
};

type FaceLandmarkerLikeResult = {
  faceLandmarks?: FaceLandmarkPoint[][];
  faceBlendshapes?: FaceBlendshapeGroup[];
};

export type FaceAnalysis = {
  faceCount: number;
  eyeStatus: EyeStatus;
  expressionBalance?: ExpressionBalance;
  retouchReadiness?: RetouchReadiness;
  detectionMode: FaceDetectionMode;
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

const VISION_WASM_URL = `${import.meta.env.BASE_URL}mediapipe`;
const FACE_LANDMARKER_MODEL_URL = `${import.meta.env.BASE_URL}models/face_landmarker.task`;
const EYE_CLOSED_THRESHOLD = 0.58;
const EYE_OPEN_THRESHOLD = 0.32;
const EYE_DIFF_REVIEW_THRESHOLD = 0.34;
const EYE_DIFF_NOTICE_THRESHOLD = 0.18;
const SMILE_DIFF_REVIEW_THRESHOLD = 0.28;
const SMILE_DIFF_NOTICE_THRESHOLD = 0.16;
const MOUTH_OPEN_REVIEW_THRESHOLD = 0.45;
const MOUTH_OPEN_NOTICE_THRESHOLD = 0.28;

const FOREHEAD_TOP_INDEX = 10;
const CHIN_INDEX = 152;
const LEFT_EYE_OUTER_INDEX = 33;
const LEFT_EYE_INNER_INDEX = 133;
const RIGHT_EYE_INNER_INDEX = 362;
const RIGHT_EYE_OUTER_INDEX = 263;
const LEFT_CHEEK_INDEX = 234;
const RIGHT_CHEEK_INDEX = 454;
const LEFT_JAW_INDEX = 172;
const RIGHT_JAW_INDEX = 397;
const BROW_INDICES = [70, 63, 105, 66, 296, 334, 293, 300];
const NOSE_BASE_INDICES = [2, 98, 327];
const MIN_SIGNIFICANT_FACE_AREA = 0.0025;

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function distanceBetweenPoints(pointA?: FaceLandmarkPoint, pointB?: FaceLandmarkPoint) {
  if (!pointA || !pointB) return undefined;
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function averagePoint(faceLandmarks: FaceLandmarkPoint[], indices: number[]) {
  const points = indices
    .map((index) => faceLandmarks[index])
    .filter((point): point is FaceLandmarkPoint => Boolean(point));

  if (points.length === 0) return undefined;

  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function estimateFaceShape(faceWidth: number, faceHeight: number, jawToCheekRatio?: number): FaceShapeTendency {
  if (faceWidth <= 0 || faceHeight <= 0) return 'unknown';

  const aspectRatio = faceHeight / faceWidth;

  if (aspectRatio >= 1.44) return 'long';
  if (aspectRatio <= 1.18 || (typeof jawToCheekRatio === 'number' && jawToCheekRatio > 0.88)) return 'round';
  return 'balanced';
}

function estimateFaceWidthTendency(jawToCheekRatio?: number): FaceWidthTendency {
  if (typeof jawToCheekRatio !== 'number') return 'unknown';
  if (jawToCheekRatio >= 0.86) return 'broad';
  if (jawToCheekRatio <= 0.74) return 'tapered';
  return 'balanced';
}

function estimateStructureConfidence(values: Array<number | undefined>): FaceStructureConfidence {
  const definedCount = values.filter((value) => typeof value === 'number').length;

  if (definedCount >= 5) return 'high';
  if (definedCount >= 3) return 'medium';
  return 'low';
}

function buildFaceGeometry(faceLandmarks?: FaceLandmarkPoint[]) {
  if (!faceLandmarks || faceLandmarks.length === 0) {
    return {};
  }

  const xValues = faceLandmarks.map((point) => point.x);
  const yValues = faceLandmarks.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const faceWidth = Math.max(0, maxX - minX);
  const faceHeight = Math.max(0, maxY - minY);

  const foreheadTop = faceLandmarks[FOREHEAD_TOP_INDEX];
  const chin = faceLandmarks[CHIN_INDEX];
  const browCenter = averagePoint(faceLandmarks, BROW_INDICES);
  const noseBase = averagePoint(faceLandmarks, NOSE_BASE_INDICES);
  const leftEyeOuter = faceLandmarks[LEFT_EYE_OUTER_INDEX];
  const leftEyeInner = faceLandmarks[LEFT_EYE_INNER_INDEX];
  const rightEyeInner = faceLandmarks[RIGHT_EYE_INNER_INDEX];
  const rightEyeOuter = faceLandmarks[RIGHT_EYE_OUTER_INDEX];
  const leftCheek = faceLandmarks[LEFT_CHEEK_INDEX];
  const rightCheek = faceLandmarks[RIGHT_CHEEK_INDEX];
  const leftJaw = faceLandmarks[LEFT_JAW_INDEX];
  const rightJaw = faceLandmarks[RIGHT_JAW_INDEX];

  const structureHeight = foreheadTop && chin ? Math.max(0.001, chin.y - foreheadTop.y) : undefined;
  const upperThirdRatio =
    structureHeight && browCenter ? roundMetric(Math.max(0, browCenter.y - foreheadTop!.y) / structureHeight) : undefined;
  const midThirdRatio =
    structureHeight && browCenter && noseBase
      ? roundMetric(Math.max(0, noseBase.y - browCenter.y) / structureHeight)
      : undefined;
  const lowerThirdRatio =
    structureHeight && noseBase && chin ? roundMetric(Math.max(0, chin.y - noseBase.y) / structureHeight) : undefined;

  const leftEyeWidth = distanceBetweenPoints(leftEyeOuter, leftEyeInner);
  const rightEyeWidth = distanceBetweenPoints(rightEyeOuter, rightEyeInner);
  const eyeGap = distanceBetweenPoints(leftEyeInner, rightEyeInner);
  const averageEyeWidth =
    typeof leftEyeWidth === 'number' && typeof rightEyeWidth === 'number' ? (leftEyeWidth + rightEyeWidth) / 2 : undefined;
  const eyeGapRatio =
    typeof eyeGap === 'number' && typeof averageEyeWidth === 'number' && averageEyeWidth > 0
      ? roundMetric(eyeGap / averageEyeWidth)
      : undefined;

  const cheekWidth = distanceBetweenPoints(leftCheek, rightCheek);
  const jawWidth = distanceBetweenPoints(leftJaw, rightJaw);
  const jawToCheekRatio =
    typeof cheekWidth === 'number' && cheekWidth > 0 && typeof jawWidth === 'number'
      ? roundMetric(jawWidth / cheekWidth)
      : undefined;

  let faceTiltDegrees: number | undefined;

  if (leftEyeOuter && rightEyeOuter) {
    faceTiltDegrees = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * (180 / Math.PI);
  }

  return {
    faceSizeRatio: roundMetric(faceWidth * faceHeight),
    faceTopMargin: roundMetric(minY),
    faceBottomMargin: roundMetric(1 - maxY),
    faceLeftMargin: roundMetric(minX),
    faceRightMargin: roundMetric(1 - maxX),
    faceTiltDegrees: typeof faceTiltDegrees === 'number' ? Math.round(faceTiltDegrees * 10) / 10 : undefined,
    faceShapeTendency: estimateFaceShape(faceWidth, faceHeight, jawToCheekRatio),
    faceWidthTendency: estimateFaceWidthTendency(jawToCheekRatio),
    faceStructureConfidence: estimateStructureConfidence([
      upperThirdRatio,
      midThirdRatio,
      lowerThirdRatio,
      eyeGapRatio,
      jawToCheekRatio,
    ]),
    upperThirdRatio,
    midThirdRatio,
    lowerThirdRatio,
    eyeGapRatio,
    jawToCheekRatio,
  };
}

function getFaceArea(faceLandmarks?: FaceLandmarkPoint[]) {
  if (!faceLandmarks || faceLandmarks.length === 0) return 0;

  const xValues = faceLandmarks.map((point) => point.x);
  const yValues = faceLandmarks.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function getBlendshapeScore(categories: BlendshapeCategory[], categoryName: string) {
  return categories.find((category) => category.categoryName === categoryName)?.score;
}

export function determineEyeStatus(categories: BlendshapeCategory[]): EyeStatus {
  const leftBlink = getBlendshapeScore(categories, 'eyeBlinkLeft');
  const rightBlink = getBlendshapeScore(categories, 'eyeBlinkRight');

  if (typeof leftBlink !== 'number' || typeof rightBlink !== 'number') {
    return 'unknown';
  }

  if (leftBlink >= EYE_CLOSED_THRESHOLD && rightBlink >= EYE_CLOSED_THRESHOLD) {
    return 'closed_risk';
  }

  if (leftBlink <= EYE_OPEN_THRESHOLD && rightBlink <= EYE_OPEN_THRESHOLD) {
    return 'open';
  }

  return 'unknown';
}

function determineExpressionBalance(categories: BlendshapeCategory[], eyeStatus: EyeStatus): ExpressionBalance {
  const leftBlink = getBlendshapeScore(categories, 'eyeBlinkLeft');
  const rightBlink = getBlendshapeScore(categories, 'eyeBlinkRight');
  const leftSmile = getBlendshapeScore(categories, 'mouthSmileLeft');
  const rightSmile = getBlendshapeScore(categories, 'mouthSmileRight');
  const mouthOpen =
    getBlendshapeScore(categories, 'jawOpen') ??
    getBlendshapeScore(categories, 'mouthOpen') ??
    getBlendshapeScore(categories, 'mouthPucker');

  const blinkDiff =
    typeof leftBlink === 'number' && typeof rightBlink === 'number' ? Math.abs(leftBlink - rightBlink) : undefined;
  const smileDiff =
    typeof leftSmile === 'number' && typeof rightSmile === 'number' ? Math.abs(leftSmile - rightSmile) : undefined;

  if (eyeStatus === 'closed_risk') {
    return 'needs_review';
  }

  if (typeof blinkDiff !== 'number' && typeof smileDiff !== 'number' && typeof mouthOpen !== 'number') {
    return 'unknown';
  }

  if (
    (typeof blinkDiff === 'number' && blinkDiff >= EYE_DIFF_REVIEW_THRESHOLD) ||
    (typeof smileDiff === 'number' && smileDiff >= SMILE_DIFF_REVIEW_THRESHOLD) ||
    (typeof mouthOpen === 'number' && mouthOpen >= MOUTH_OPEN_REVIEW_THRESHOLD)
  ) {
    return 'needs_review';
  }

  if (
    (typeof blinkDiff === 'number' && blinkDiff >= EYE_DIFF_NOTICE_THRESHOLD) ||
    (typeof smileDiff === 'number' && smileDiff >= SMILE_DIFF_NOTICE_THRESHOLD) ||
    (typeof mouthOpen === 'number' && mouthOpen >= MOUTH_OPEN_NOTICE_THRESHOLD)
  ) {
    return 'slight_asymmetry';
  }

  return 'stable';
}

function determineRetouchReadiness({
  faceCount,
  faceSizeRatio,
  eyeStatus,
  expressionBalance,
  detectionMode,
  faceStructureConfidence,
}: {
  faceCount: number;
  faceSizeRatio?: number;
  eyeStatus: EyeStatus;
  expressionBalance?: ExpressionBalance;
  detectionMode: FaceDetectionMode;
  faceStructureConfidence?: FaceStructureConfidence;
}): RetouchReadiness {
  if (faceCount !== 1) return 'hold';
  if (eyeStatus === 'closed_risk' || expressionBalance === 'needs_review') return 'hold';

  if (
    expressionBalance === 'slight_asymmetry' ||
    faceStructureConfidence === 'low' ||
    detectionMode === 'upper_focus' ||
    detectionMode === 'center_focus' ||
    detectionMode === 'tight_center' ||
    detectionMode === 'native_api' ||
    ((faceSizeRatio ?? 0) > 0 && (faceSizeRatio ?? 0) < 0.04)
  ) {
    return 'conditional';
  }

  return 'ready';
}

export function extractFaceAnalysis(
  result: FaceLandmarkerLikeResult,
  detectionMode: FaceDetectionMode = 'full_frame',
): FaceAnalysis {
  const faces = result.faceLandmarks ?? [];

  if (faces.length === 0) {
    return {
      faceCount: 0,
      eyeStatus: 'unknown',
      detectionMode: 'not_detected',
    };
  }

  const faceEntries = faces
    .map((faceLandmarks, index) => ({
      index,
      faceLandmarks,
      area: getFaceArea(faceLandmarks),
    }))
    .sort((left, right) => right.area - left.area);
  const dominantFace = faceEntries[0];
  const faceCount = dominantFace.area >= MIN_SIGNIFICANT_FACE_AREA ? 1 : 0;
  const primaryBlendshapes = result.faceBlendshapes?.[dominantFace.index]?.categories ?? [];
  const geometry = buildFaceGeometry(dominantFace.faceLandmarks);
  const eyeStatus = determineEyeStatus(primaryBlendshapes);
  const expressionBalance = determineExpressionBalance(primaryBlendshapes, eyeStatus);
  const leftEyeBlinkScore = getBlendshapeScore(primaryBlendshapes, 'eyeBlinkLeft');
  const rightEyeBlinkScore = getBlendshapeScore(primaryBlendshapes, 'eyeBlinkRight');
  const leftSmileScore = getBlendshapeScore(primaryBlendshapes, 'mouthSmileLeft');
  const rightSmileScore = getBlendshapeScore(primaryBlendshapes, 'mouthSmileRight');
  const mouthOpenScore =
    getBlendshapeScore(primaryBlendshapes, 'jawOpen') ??
    getBlendshapeScore(primaryBlendshapes, 'mouthOpen') ??
    getBlendshapeScore(primaryBlendshapes, 'mouthPucker');
  const eyeBlinkDiffScore =
    typeof leftEyeBlinkScore === 'number' && typeof rightEyeBlinkScore === 'number'
      ? roundMetric(Math.abs(leftEyeBlinkScore - rightEyeBlinkScore))
      : undefined;
  const smileDiffScore =
    typeof leftSmileScore === 'number' && typeof rightSmileScore === 'number'
      ? roundMetric(Math.abs(leftSmileScore - rightSmileScore))
      : undefined;
  const retouchReadiness = determineRetouchReadiness({
    faceCount,
    faceSizeRatio: geometry.faceSizeRatio,
    eyeStatus,
    expressionBalance,
    detectionMode,
    faceStructureConfidence: geometry.faceStructureConfidence,
  });

  return {
    faceCount,
    eyeStatus,
    expressionBalance,
    retouchReadiness,
    detectionMode: faceCount > 0 ? detectionMode : 'not_detected',
    ...geometry,
    leftEyeBlinkScore,
    rightEyeBlinkScore,
    eyeBlinkDiffScore,
    leftSmileScore,
    rightSmileScore,
    smileDiffScore,
    mouthOpenScore,
  };
}

async function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        },
        runningMode: 'IMAGE',
        numFaces: 8,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
        outputFaceBlendshapes: true,
      });
    })();
  }

  return faceLandmarkerPromise;
}

export async function warmupFaceLandmarker() {
  await getFaceLandmarker();
}

export async function detectFaceSignals(
  imageSource: CanvasImageSource,
  detectionMode: FaceDetectionMode = 'full_frame',
): Promise<FaceAnalysis> {
  try {
    const faceLandmarker = await getFaceLandmarker();
    const result = faceLandmarker.detect(imageSource);

    return extractFaceAnalysis(result, detectionMode);
  } catch {
    return {
      faceCount: 0,
      eyeStatus: 'unknown',
      expressionBalance: 'unknown',
      retouchReadiness: 'hold',
      detectionMode: 'not_detected',
      faceShapeTendency: 'unknown',
      faceWidthTendency: 'unknown',
      faceStructureConfidence: 'low',
    };
  }
}
