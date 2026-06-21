export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'center';

export type WatermarkSettings = {
  text: string;
  position: WatermarkPosition;
  opacity: number;
  scaleRatio: number;
};

export type ProcessedWatermarkPhoto = {
  blob: Blob;
  fileName: string;
  previewUrl: string;
};

type WatermarkPlacement = {
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  xRatio: number;
  yRatio: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildWatermarkOutputFileName(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return `${fileName}-watermark`;
  }

  const baseName = fileName.slice(0, lastDotIndex);
  const extension = fileName.slice(lastDotIndex);

  return `${baseName}-watermark${extension}`;
}

export function resolveWatermarkPlacement(position: WatermarkPosition): WatermarkPlacement {
  switch (position) {
    case 'bottom-left':
      return {
        textAlign: 'left',
        textBaseline: 'bottom',
        xRatio: 0.04,
        yRatio: 0.96,
      };
    case 'top-right':
      return {
        textAlign: 'right',
        textBaseline: 'top',
        xRatio: 0.96,
        yRatio: 0.04,
      };
    case 'center':
      return {
        textAlign: 'center',
        textBaseline: 'middle',
        xRatio: 0.5,
        yRatio: 0.5,
      };
    case 'bottom-right':
    default:
      return {
        textAlign: 'right',
        textBaseline: 'bottom',
        xRatio: 0.96,
        yRatio: 0.96,
      };
  }
}

export async function generateWatermarkedPhoto(
  input: Blob | File,
  sourceFileName: string,
  settings: WatermarkSettings,
): Promise<ProcessedWatermarkPhoto> {
  const imageBitmap = await createImageBitmap(input);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('当前浏览器无法生成水印结果。');
  }

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  context.drawImage(imageBitmap, 0, 0);

  const placement = resolveWatermarkPlacement(settings.position);
  const fontSize = clampNumber(Math.round(Math.min(canvas.width, canvas.height) * settings.scaleRatio), 18, 84);
  const strokeWidth = clampNumber(fontSize * 0.09, 1.5, 5);
  const shadowBlur = clampNumber(fontSize * 0.16, 2, 14);
  const clampedOpacity = clampNumber(settings.opacity, 0.08, 0.5);

  context.font = `700 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif`;
  context.textAlign = placement.textAlign;
  context.textBaseline = placement.textBaseline;
  context.shadowColor = `rgba(0, 0, 0, ${clampedOpacity * 0.9})`;
  context.shadowBlur = shadowBlur;
  context.lineWidth = strokeWidth;
  context.strokeStyle = `rgba(0, 0, 0, ${clampedOpacity * 0.75})`;
  context.fillStyle = `rgba(255, 255, 255, ${clampedOpacity})`;

  const drawX = canvas.width * placement.xRatio;
  const drawY = canvas.height * placement.yRatio;

  context.strokeText(settings.text, drawX, drawY);
  context.fillText(settings.text, drawX, drawY);
  imageBitmap.close();

  const mimeType = input.type || 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (outputBlob) => {
        if (!outputBlob) {
          reject(new Error('水印副本生成失败。'));
          return;
        }

        resolve(outputBlob);
      },
      mimeType,
      0.98,
    );
  });

  return {
    blob,
    fileName: buildWatermarkOutputFileName(sourceFileName),
    previewUrl: URL.createObjectURL(blob),
  };
}
