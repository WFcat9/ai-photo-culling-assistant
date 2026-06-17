import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { EyeStatus, FaceDetectionMode } from './photoScoring';

type BlendshapeCategory = {
  categoryName: string;
  score: number;
};

type FaceBlendshapeGroup = {
  categories: BlendshapeCategory[];
};

type FaceLandmarkerLikeResult = {
  faceLandmarks?: Array<unknown[]>;
  faceBlendshapes?: FaceBlendshapeGroup[];
};

export type FaceAnalysis = {
  faceCount: number;
  eyeStatus: EyeStatus;
  detectionMode: FaceDetectionMode;
};

const VISION_WASM_URL = '/mediapipe';
const FACE_LANDMARKER_MODEL_URL = '/models/face_landmarker.task';
const EYE_CLOSED_THRESHOLD = 0.58;
const EYE_OPEN_THRESHOLD = 0.32;

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

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

  return {
    faceCount,
    eyeStatus: determineEyeStatus(primaryBlendshapes),
    detectionMode: faceCount > 0 ? detectionMode : 'not_detected',
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
    return { faceCount: 0, eyeStatus: 'unknown', detectionMode: 'not_detected' };
  }
}
