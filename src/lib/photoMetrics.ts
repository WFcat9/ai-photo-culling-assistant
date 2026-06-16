import type { RawPhotoMetrics } from './photoScoring';

export type PixelMetricInput = {
  width: number;
  height: number;
  rgbaData: Uint8ClampedArray;
};

export type PixelMetrics = Pick<
  RawPhotoMetrics,
  'brightness' | 'darkPixelRatio' | 'brightPixelRatio' | 'contrast' | 'sharpness' | 'tiltDegrees'
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

function calculateSharpness(grayscale: number[], width: number, height: number) {
  if (width < 3 || height < 3) return 0;

  let laplacianTotal = 0;
  let sampleCount = 0;

  // 用拉普拉斯变化估算清晰度：边缘变化越强，数值通常越高。
  for (let yPosition = 1; yPosition < height - 1; yPosition += 1) {
    for (let xPosition = 1; xPosition < width - 1; xPosition += 1) {
      const centerIndex = yPosition * width + xPosition;
      const center = grayscale[centerIndex] ?? 0;
      const left = grayscale[centerIndex - 1] ?? center;
      const right = grayscale[centerIndex + 1] ?? center;
      const top = grayscale[centerIndex - width] ?? center;
      const bottom = grayscale[centerIndex + width] ?? center;
      const laplacian = Math.abs(left + right + top + bottom - 4 * center);

      laplacianTotal += laplacian;
      sampleCount += 1;
    }
  }

  return Math.round(laplacianTotal / Math.max(1, sampleCount));
}

function estimateTiltDegrees(grayscale: number[], width: number, height: number) {
  if (width < 12 || height < 12) return 0;

  let leftEdgeWeight = 0;
  let leftWeightedY = 0;
  let rightEdgeWeight = 0;
  let rightWeightedY = 0;
  const halfWidth = Math.floor(width / 2);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180));

  // 粗略寻找水平强边缘左右两侧的高度差，用来提示“可能歪了”。
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

  return {
    brightness: Math.round(brightness),
    darkPixelRatio: Math.round((darkPixelCount / pixelCount) * 100) / 100,
    brightPixelRatio: Math.round((brightPixelCount / pixelCount) * 100) / 100,
    contrast: Math.round(Math.sqrt(variance)),
    sharpness: calculateSharpness(grayscale, width, height),
    tiltDegrees: estimateTiltDegrees(grayscale, width, height),
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

  imageBitmap.close();

  return {
    width: originalWidth,
    height: originalHeight,
    ...pixelMetrics,
  };
}
