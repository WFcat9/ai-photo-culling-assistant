import { detectFaceSignals as detectFaceSignalsWithModel } from './faceSignals';
import type { EyeStatus, FaceDetectionMode, RawPhotoMetrics } from './photoScoring';

export type PixelMetricInput = {
  width: number;
  height: number;
  rgbaData: Uint8ClampedArray;
};

export type PixelMetrics = Pick<
  RawPhotoMetrics,
  | 'brightness'
  | 'darkPixelRatio'
  | 'brightPixelRatio'
  | 'contrast'
  | 'tiltDegrees'
  | 'visualWeightX'
  | 'visualWeightY'
  | 'centerBrightness'
  | 'edgeBrightness'
>;

type FaceDetectionAttempt = {
  detectionMode: Exclude<FaceDetectionMode, 'native_api' | 'not_detected'>;
  leftRatio: number;
  topRatio: number;
  widthRatio: number;
  heightRatio: number;
  maxEdge: number;
};

const DARK_PIXEL_LIMIT = 35;
const BRIGHT_PIXEL_LIMIT = 235;
const MAX_SAMPLE_EDGE = 900;
const MAX_FACE_SAMPLE_EDGE = 1600;

function getLuminance(rgbaData: Uint8ClampedArray, pixelIndex: number) {
  const baseIndex = pixelIndex * 4;
  const red = rgbaData[baseIndex] ?? 0;
  const green = rgbaData[baseIndex + 1] ?? 0;
  const blue = rgbaData[baseIndex + 2] ?? 0;

  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function getVisualWeight(grayscale: number[], width: number, height: number) {
  let weightedXTotal = 0;
  let weightedYTotal = 0;
  let totalWeight = 0;

  for (let yPosition = 0; yPosition < height; yPosition += 1) {
    for (let xPosition = 0; xPosition < width; xPosition += 1) {
      const index = yPosition * width + xPosition;
      const luminance = grayscale[index] ?? 0;
      const left = grayscale[index - 1] ?? luminance;
      const right = grayscale[index + 1] ?? luminance;
      const top = grayscale[index - width] ?? luminance;
      const bottom = grayscale[index + width] ?? luminance;
      const localEdge = Math.abs(right - left) + Math.abs(bottom - top);
      const weight = Math.max(1, luminance - 24) + localEdge * 0.8;

      weightedXTotal += (xPosition / Math.max(1, width - 1)) * weight;
      weightedYTotal += (yPosition / Math.max(1, height - 1)) * weight;
      totalWeight += weight;
    }
  }

  return {
    visualWeightX: Math.round((weightedXTotal / totalWeight) * 100) / 100,
    visualWeightY: Math.round((weightedYTotal / totalWeight) * 100) / 100,
  };
}

function getRegionalBrightness(grayscale: number[], width: number, height: number) {
  let centerTotal = 0;
  let centerCount = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  const centerLeft = width * 0.25;
  const centerRight = width * 0.75;
  const centerTop = height * 0.25;
  const centerBottom = height * 0.75;

  for (let yPosition = 0; yPosition < height; yPosition += 1) {
    for (let xPosition = 0; xPosition < width; xPosition += 1) {
      const luminance = grayscale[yPosition * width + xPosition] ?? 0;
      const isCenter =
        xPosition >= centerLeft && xPosition <= centerRight && yPosition >= centerTop && yPosition <= centerBottom;

      if (isCenter) {
        centerTotal += luminance;
        centerCount += 1;
      } else {
        edgeTotal += luminance;
        edgeCount += 1;
      }
    }
  }

  return {
    centerBrightness: Math.round(centerTotal / Math.max(1, centerCount)),
    edgeBrightness: Math.round(edgeTotal / Math.max(1, edgeCount)),
  };
}

function estimateTiltDegrees(grayscale: number[], width: number, height: number) {
  if (width < 12 || height < 12) return 0;

  let leftEdgeWeight = 0;
  let leftWeightedY = 0;
  let rightEdgeWeight = 0;
  let rightWeightedY = 0;
  const halfWidth = Math.floor(width / 2);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  // 粗略寻找左右两侧较强的横向边缘，用来提示画面是否歪斜。
  for (let yPosition = step; yPosition < height - step; yPosition += step) {
    for (let xPosition = step; xPosition < width - step; xPosition += step) {
      const centerIndex = yPosition * width + xPosition;
      const top = grayscale[centerIndex - width] ?? 0;
      const bottom = grayscale[centerIndex + width] ?? 0;
      const edgeStrength = Math.abs(bottom - top);

      if (edgeStrength < 28) continue;

      if (xPosition < halfWidth) {
        leftEdgeWeight += edgeStrength;
        leftWeightedY += edgeStrength * yPosition;
      } else {
        rightEdgeWeight += edgeStrength;
        rightWeightedY += edgeStrength * yPosition;
      }
    }
  }

  if (leftEdgeWeight === 0 || rightEdgeWeight === 0) return 0;

  const leftAverageY = leftWeightedY / leftEdgeWeight;
  const rightAverageY = rightWeightedY / rightEdgeWeight;
  const degrees = Math.atan2(rightAverageY - leftAverageY, halfWidth) * (180 / Math.PI);

  return Math.round(degrees * 10) / 10;
}

function createSampleCanvas(
  imageBitmap: ImageBitmap,
  cropLeft: number,
  cropTop: number,
  cropWidth: number,
  cropHeight: number,
  maxEdge: number,
) {
  const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight));
  const targetWidth = Math.max(1, Math.round(cropWidth * scale));
  const targetHeight = Math.max(1, Math.round(cropHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('当前浏览器无法读取图片像素。');
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.drawImage(imageBitmap, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

  return { canvas, context };
}

async function detectFaceSignalsWithRetries(imageBitmap: ImageBitmap) {
  const attempts: FaceDetectionAttempt[] = [
    {
      detectionMode: 'full_frame',
      leftRatio: 0,
      topRatio: 0,
      widthRatio: 1,
      heightRatio: 1,
      maxEdge: MAX_FACE_SAMPLE_EDGE,
    },
    {
      detectionMode: 'upper_focus',
      leftRatio: 0.16,
      topRatio: 0,
      widthRatio: 0.68,
      heightRatio: 0.72,
      maxEdge: MAX_FACE_SAMPLE_EDGE,
    },
    {
      detectionMode: 'center_focus',
      leftRatio: 0.2,
      topRatio: 0.12,
      widthRatio: 0.6,
      heightRatio: 0.68,
      maxEdge: MAX_FACE_SAMPLE_EDGE,
    },
  ];

  for (const attempt of attempts) {
    const cropLeft = Math.round(imageBitmap.width * attempt.leftRatio);
    const cropTop = Math.round(imageBitmap.height * attempt.topRatio);
    const cropWidth = Math.max(1, Math.round(imageBitmap.width * attempt.widthRatio));
    const cropHeight = Math.max(1, Math.round(imageBitmap.height * attempt.heightRatio));
    const { canvas } = createSampleCanvas(
      imageBitmap,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      attempt.maxEdge,
    );
    const faceSignals = await detectFaceSignalsWithModel(canvas, attempt.detectionMode);

    if (faceSignals.faceCount > 0) {
      return faceSignals;
    }
  }

  return {
    faceCount: 0,
    eyeStatus: 'unknown' as const,
    detectionMode: 'not_detected' as const,
  };
}

async function detectFaceSignalsWithNativeApi(
  imageBitmap: ImageBitmap,
): Promise<{ faceCount: number; eyeStatus: EyeStatus; detectionMode: FaceDetectionMode }> {
  type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
    detect(image: ImageBitmap): Promise<unknown[]>;
  };
  const maybeWindow = window as typeof window & { FaceDetector?: FaceDetectorConstructor };

  if (!maybeWindow.FaceDetector) {
    return { faceCount: 0, eyeStatus: 'unknown', detectionMode: 'not_detected' };
  }

  try {
    const detector = new maybeWindow.FaceDetector({ fastMode: true, maxDetectedFaces: 8 });
    const faces = await detector.detect(imageBitmap);

    return {
      faceCount: faces.length,
      eyeStatus: 'unknown',
      detectionMode: faces.length > 0 ? 'native_api' : 'not_detected',
    };
  } catch {
    return { faceCount: 0, eyeStatus: 'unknown', detectionMode: 'not_detected' };
  }
}

export function calculateImageMetricsFromPixels({ width, height, rgbaData }: PixelMetricInput): PixelMetrics {
  const pixelCount = Math.max(1, width * height);
  const grayscale: number[] = [];
  let luminanceTotal = 0;
  let darkPixelCount = 0;
  let brightPixelCount = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const luminance = getLuminance(rgbaData, pixelIndex);

    grayscale.push(luminance);
    luminanceTotal += luminance;

    if (luminance < DARK_PIXEL_LIMIT) darkPixelCount += 1;
    if (luminance > BRIGHT_PIXEL_LIMIT) brightPixelCount += 1;
  }

  const brightness = luminanceTotal / pixelCount;
  const variance = grayscale.reduce((sum, luminance) => sum + (luminance - brightness) ** 2, 0) / pixelCount;
  const visualWeight = getVisualWeight(grayscale, width, height);
  const regionalBrightness = getRegionalBrightness(grayscale, width, height);

  return {
    brightness: Math.round(brightness),
    darkPixelRatio: Math.round((darkPixelCount / pixelCount) * 100) / 100,
    brightPixelRatio: Math.round((brightPixelCount / pixelCount) * 100) / 100,
    contrast: Math.round(Math.sqrt(variance)),
    tiltDegrees: estimateTiltDegrees(grayscale, width, height),
    ...visualWeight,
    ...regionalBrightness,
  };
}

export async function analyzeImageFile(file: File): Promise<RawPhotoMetrics> {
  const imageBitmap = await createImageBitmap(file);
  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;
  const { canvas, context } = createSampleCanvas(imageBitmap, 0, 0, originalWidth, originalHeight, MAX_SAMPLE_EDGE);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixelMetrics = calculateImageMetricsFromPixels({
    width: canvas.width,
    height: canvas.height,
    rgbaData: imageData.data,
  });
  const faceSignals = await detectFaceSignalsWithRetries(imageBitmap);
  const fallbackFaceSignals =
    faceSignals.faceCount > 0 ? faceSignals : await detectFaceSignalsWithNativeApi(imageBitmap);

  imageBitmap.close();

  return {
    width: originalWidth,
    height: originalHeight,
    ...pixelMetrics,
    faceCount: fallbackFaceSignals.faceCount,
    eyeStatus: fallbackFaceSignals.eyeStatus,
    faceDetectionMode: fallbackFaceSignals.detectionMode,
    faceSizeRatio: fallbackFaceSignals.faceSizeRatio,
    faceTopMargin: fallbackFaceSignals.faceTopMargin,
    faceBottomMargin: fallbackFaceSignals.faceBottomMargin,
    faceLeftMargin: fallbackFaceSignals.faceLeftMargin,
    faceRightMargin: fallbackFaceSignals.faceRightMargin,
    faceTiltDegrees: fallbackFaceSignals.faceTiltDegrees,
    faceShapeTendency: fallbackFaceSignals.faceShapeTendency,
  };
}
