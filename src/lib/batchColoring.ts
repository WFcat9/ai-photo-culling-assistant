import type { ColorAdjustmentSettings } from './colorPresets';

export type ProcessedColorPhoto = {
  blob: Blob;
  fileName: string;
  previewUrl: string;
};

function clampChannel(value: number) {
  return Math.min(1, Math.max(0, value));
}

function applyContrast(value: number, contrast: number) {
  return clampChannel((value - 0.5) * (1 + contrast) + 0.5);
}

function applySaturation(red: number, green: number, blue: number, saturation: number) {
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue;

  return {
    red: clampChannel(luma + (red - luma) * (1 + saturation)),
    green: clampChannel(luma + (green - luma) * (1 + saturation)),
    blue: clampChannel(luma + (blue - luma) * (1 + saturation)),
  };
}

function isLikelySkinPixel(red: number, green: number, blue: number) {
  return red > 0.24 && green > 0.16 && blue > 0.1 && red > green && green > blue && red - blue < 0.42;
}

function getOutputFileName(fileName: string, presetLabel: string) {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return `${fileName}-${presetLabel}-tone`;
  }

  const baseName = fileName.slice(0, lastDotIndex);
  const extension = fileName.slice(lastDotIndex);

  return `${baseName}-${presetLabel}-tone${extension}`;
}

export async function generateColorAdjustedPhoto(
  file: File,
  presetLabel: string,
  settings: ColorAdjustmentSettings,
): Promise<ProcessedColorPhoto> {
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('当前浏览器无法生成调色结果。');
  }

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  context.drawImage(imageBitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixelData = imageData.data;
  const exposureScale = 2 ** settings.exposureEv;

  for (let index = 0; index < pixelData.length; index += 4) {
    let red = (pixelData[index] ?? 0) / 255;
    let green = (pixelData[index + 1] ?? 0) / 255;
    let blue = (pixelData[index + 2] ?? 0) / 255;
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    const highlightWeight = luminance * luminance;
    const shadowWeight = (1 - luminance) * (1 - luminance);

    red = clampChannel(red * exposureScale);
    green = clampChannel(green * exposureScale);
    blue = clampChannel(blue * exposureScale);

    red = clampChannel(red - red * settings.highlightRecovery * highlightWeight);
    green = clampChannel(green - green * settings.highlightRecovery * highlightWeight);
    blue = clampChannel(blue - blue * settings.highlightRecovery * highlightWeight);

    red = clampChannel(red + (1 - red) * settings.shadowLift * shadowWeight);
    green = clampChannel(green + (1 - green) * settings.shadowLift * shadowWeight);
    blue = clampChannel(blue + (1 - blue) * settings.shadowLift * shadowWeight);

    red = applyContrast(red, settings.contrast);
    green = applyContrast(green, settings.contrast);
    blue = applyContrast(blue, settings.contrast);

    const saturatedChannels = applySaturation(red, green, blue, settings.saturation);
    red = saturatedChannels.red;
    green = saturatedChannels.green;
    blue = saturatedChannels.blue;

    red = clampChannel(red + settings.warmth * 0.035);
    green = clampChannel(green + settings.warmth * 0.01);
    blue = clampChannel(blue - settings.warmth * 0.04);

    if (settings.skinSoftLift > 0 && isLikelySkinPixel(red, green, blue)) {
      red = clampChannel(red + settings.skinSoftLift * 0.05);
      green = clampChannel(green + settings.skinSoftLift * 0.04);
      blue = clampChannel(blue + settings.skinSoftLift * 0.02);
    }

    pixelData[index] = Math.round(red * 255);
    pixelData[index + 1] = Math.round(green * 255);
    pixelData[index + 2] = Math.round(blue * 255);
  }

  context.putImageData(imageData, 0, 0);
  imageBitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (outputBlob) => {
        if (!outputBlob) {
          reject(new Error('调色副本生成失败。'));
          return;
        }

        resolve(outputBlob);
      },
      file.type || 'image/jpeg',
      0.98,
    );
  });

  return {
    blob,
    fileName: getOutputFileName(file.name, presetLabel),
    previewUrl: URL.createObjectURL(blob),
  };
}
