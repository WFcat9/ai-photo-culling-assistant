import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { EyeStatus, FaceDetectionMode, FaceShapeTendency } from './photoScoring';

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
  detectionMode: FaceDetectionMode;
  faceSizeRatio?: number;
  faceTopMargin?: number;
  faceBottomMargin?: number;
  faceLeftMargin?: number;
  faceRightMargin?: number;
  faceTiltDegrees?: number;
  faceShapeTendency?: FaceShapeTendency;
};

const VISION_WASM_URL = '/mediapipe';
const FACE_LANDMARKER_MODEL_URL = '/models/face_landmarker.task';
const EYE_CLOSED_THRESHOLD = 0.58;
const EYE_OPEN_THRESHOLD = 0.32;

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function estimateFaceShape(faceWidth: number, faceHeight: number): FaceShapeTendency {
  if (faceWidth <= 0 || faceHeight <= 0) return 'unknown';

  const aspectRatio = faceHeight / faceWidth;

  if (aspectRatio >= 1.45) return 'long';
  if (aspectRatio <= 1.18) return 'round';
  return 'balanced';
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
  const leftEyeOuter = faceLandmarks[33];
  const rightEyeOuter = faceLandmarks[263];
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
    faceShapeTendency: estimateFaceShape(faceWidth, faceHeight),
  };
}

export function determineEyeStatus(categories: BlendshapeCategory[]): EyeStatus {
  const leftBlink = categories.find((category) => category.categoryName === 'eyeBlinkLeft')?.score;
  const rightBlink = categories.find((category) => category.categoryName === 'eyeBlinkRight')?.score;

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

export function extractFaceAnalysis(
  result: FaceLandmarkerLikeResult,
  detectionMode: FaceDetectionMode = 'full_frame',
): FaceAnalysis {
  const faceCount = result.faceLandmarks?.length ?? 0;
  const primaryBlendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
  const geometry = buildFaceGeometry(result.faceLandmarks?.[0]);

  return {
    faceCount,
    eyeStatus: determineEyeStatus(primaryBlendshapes),
    detectionMode: faceCount > 0 ? detectionMode : 'not_detected',
    ...geometry,
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
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
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
      detectionMode: 'not_detected',
      faceShapeTendency: 'unknown',
    };
  }
}
