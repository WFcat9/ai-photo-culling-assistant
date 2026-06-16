import type { EyeStatus, RawPhotoMetrics } from './photoScoring';

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

const DARK_PIXEL_LIMIT = 35;
const BRIGHT_PIXEL_LIMIT = 235;
const MAX_SAMPLE_EDGE = 900;

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

  // 粗略寻找水平强边缘左右两侧的高度差，用来提示“画面可能歪了”。
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

async function detectFaceSignals(imageBitmap: ImageBitmap): Promise<{ faceCount: number; eyeStatus: EyeStatus }> {
  type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
    detect(image: ImageBitmap): Promise<unknown[]>;
  };
  const maybeWindow = window as typeof window & { FaceDetector?: FaceDetectorConstructor };

  if (!maybeWindow.FaceDetector) {
    return { faceCount: 0, eyeStatus: 'unknown' };
  }

  try {
    const detector = new maybeWindow.FaceDetector({ fastMode: true, maxDetectedFaces: 8 });
    const faces = await detector.detect(imageBitmap);

    return { faceCount: faces.length, eyeStatus: 'unknown' };
  } catch {
    return { faceCount: 0, eyeStatus: 'unknown' };
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
  const variance =
    grayscale.reduce((sum, luminance) => sum + (luminance - brightness) ** 2, 0) / pixelCount;
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
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(originalWidth, originalHeight));
  const sampleWidth = Math.max(1, Math.round(originalWidth * scale));
  const sampleHeight = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('当前浏览器无法读取图片像素。');
  }

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  context.drawImage(imageBitmap, 0, 0, sampleWidth, sampleHeight);

  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
  const pixelMetrics = calculateImageMetricsFromPixels({
    width: sampleWidth,
    height: sampleHeight,
    rgbaData: imageData.data,
  });
  const faceSignals = await detectFaceSignals(imageBitmap);

  imageBitmap.close();

  return {
    width: originalWidth,
    height: originalHeight,
    ...pixelMetrics,
    ...faceSignals,
  };
}

