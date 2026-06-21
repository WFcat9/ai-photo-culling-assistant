import type { RawPhotoMetrics } from './photoScoring';

export type ColorPresetCategory = 'portrait' | 'neutral' | 'cinematic' | 'vivid' | 'classic' | 'mono';

export type ColorPreset = {
  id: string;
  label: string;
  fileName: string;
  path: string;
  category: ColorPresetCategory;
  summary: string;
  skinToneNote: string;
};

export type ColorAdjustmentPlan = {
  exposureCompensation: string;
  highlightAdjustment: string;
  shadowAdjustment: string;
  whiteBalanceNote: string;
  skinToneGoal: string;
  recommendedPresetIds: string[];
  notes: string[];
};

export type ColorAdjustmentSettings = {
  exposureEv: number;
  highlightRecovery: number;
  shadowLift: number;
  contrast: number;
  saturation: number;
  warmth: number;
  skinSoftLift: number;
};

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'pro-neg-std',
    label: '柔和肖像',
    fileName: '柔和肖像 - Pro Neg.Std.3dl',
    path: '/luts/柔和肖像 - Pro Neg.Std.3dl',
    category: 'portrait',
    summary: '更适合人像统一肤色，压住高光以后不容易把皮肤做脏。',
    skinToneNote: '偏白但不发灰，适合保留自然皮肤层次。',
  },
  {
    id: 'pro-neg-hi',
    label: '标准肖像',
    fileName: '标准肖像 - Pro Neg.Hi.3dl',
    path: '/luts/标准肖像 - Pro Neg.Hi.3dl',
    category: 'portrait',
    summary: '人像层次更清楚，适合本身曝光还算稳定、只想提一点精神气的照片。',
    skinToneNote: '更利落，适合眼神和面部轮廓已经比较到位的片子。',
  },
  {
    id: 'astia',
    label: '柔和色彩',
    fileName: '柔和色彩 - Astia.3dl',
    path: '/luts/柔和色彩 - Astia.3dl',
    category: 'portrait',
    summary: '整体颜色轻一点，适合婚礼、人像、偏清爽的氛围统一。',
    skinToneNote: '肤色偏柔和，适合不想把脸修得太硬的照片。',
  },
  {
    id: 'provia',
    label: '标准色彩',
    fileName: '标准色彩 - Provia.Std.3dl',
    path: '/luts/标准色彩 - Provia.Std.3dl',
    category: 'neutral',
    summary: '最稳的基准预设，适合先统一一整组片子的基础颜色。',
    skinToneNote: '肤色中性，后续还可以继续微调偏白一点。',
  },
  {
    id: 'classic-chrome',
    label: '经典正片',
    fileName: '经典正片 - Classic Chrome.3dl',
    path: '/luts/经典正片 - Classic Chrome.3dl',
    category: 'classic',
    summary: '更克制、更纪实，适合街拍、环境感强的人像。',
    skinToneNote: '不建议直接用于需要很白净皮肤的片子，可作为风格参考。',
  },
  {
    id: 'classic-neg',
    label: '经典负片',
    fileName: '经典负片 - Classic Neg.3dl',
    path: '/luts/经典负片 - Classic Neg.3dl',
    category: 'classic',
    summary: '层次感和氛围感都更明显，适合街头和生活感照片。',
    skinToneNote: '皮肤会更有情绪感，适合不追求纯净白皙的项目。',
  },
  {
    id: 'eterna-cinema',
    label: '影院色彩',
    fileName: '影院色彩 - Eterna (Cinema).3dl',
    path: '/luts/影院色彩 - Eterna (Cinema).3dl',
    category: 'cinematic',
    summary: '适合压住高光、做安静一点的电影感氛围。',
    skinToneNote: '肤色会更克制，适合高光容易炸的人像。',
  },
  {
    id: 'eterna-luts-plus',
    label: '电影色调',
    fileName: '电影色调 - Eterna (LUTs+).3dl',
    path: '/luts/电影色调 - Eterna (LUTs+).3dl',
    category: 'cinematic',
    summary: '比影院色彩更有风格感，适合已经确定氛围方向的作品。',
    skinToneNote: '脸部要先收高光，再用这个更稳。',
  },
  {
    id: 'eterna-bleach',
    label: '漂白效果',
    fileName: '漂白效果 - Eterna (Bleach).3dl',
    path: '/luts/漂白效果 - Eterna (Bleach).3dl',
    category: 'cinematic',
    summary: '强风格预设，只适合作品型画面，不适合作为整组基础预设。',
    skinToneNote: '容易让皮肤偏冷偏薄，不建议作为默认人像预设。',
  },
  {
    id: 'velvia',
    label: '鲜艳色彩',
    fileName: '鲜艳色彩 - Velvia_.3dl',
    path: '/luts/鲜艳色彩 - Velvia_.3dl',
    category: 'vivid',
    summary: '颜色会更冲，适合风景和环境色非常重要的片子。',
    skinToneNote: '不建议直接大批量用在人像肤色统一上。',
  },
  {
    id: 'sepia',
    label: '复古褐色',
    fileName: '复古褐色 - Sepia.3dl',
    path: '/luts/复古褐色 - Sepia.3dl',
    category: 'classic',
    summary: '更适合作品化单张，不适合作为人像白净肤色的基准方案。',
    skinToneNote: '会明显改变肤色方向，只建议手动挑片使用。',
  },
];

export function getPresetById(presetId?: string) {
  return COLOR_PRESETS.find((preset) => preset.id === presetId);
}

export function buildColorAdjustmentPlan(metrics: RawPhotoMetrics): ColorAdjustmentPlan {
  const isPortrait = (metrics.faceCount ?? 0) === 1;
  const notes: string[] = [];
  let exposureCompensation = '0 EV 到 +0.10 EV';
  let highlightAdjustment = '高光 -4 到 -8';
  let shadowAdjustment = '阴影 +2 到 +6';
  let whiteBalanceNote = '白平衡先保持中性，避免一上来就把肤色推黄或推粉。';
  let skinToneGoal = '人物肤色保持偏白、自然、真实，不要做成灰白或蜡感。';
  let recommendedPresetIds = isPortrait ? ['provia', 'pro-neg-std', 'astia'] : ['provia', 'classic-chrome', 'eterna-cinema'];

  if (metrics.brightPixelRatio > 0.22 || metrics.brightness > 205) {
    exposureCompensation = '-0.15 EV 到 -0.35 EV';
    highlightAdjustment = '高光 -12 到 -22';
    shadowAdjustment = '阴影 0 到 +4';
    notes.push('这张片子的重点不是大改颜色，而是先把脸部和白色区域的高光收回来。');
    notes.push('如果脸已经开始发白，先降高光和白色色阶，再决定是否套预设。');
    recommendedPresetIds = isPortrait
      ? ['pro-neg-std', 'astia', 'eterna-cinema']
      : ['eterna-cinema', 'provia', 'classic-chrome'];
  } else if (metrics.darkPixelRatio > 0.28 || metrics.brightness < 82) {
    exposureCompensation = '+0.10 EV 到 +0.30 EV';
    highlightAdjustment = '高光 -2 到 -6';
    shadowAdjustment = '阴影 +8 到 +16';
    notes.push('先轻轻补一点曝光，不要一次抬太多，避免皮肤和背景一起发灰。');
    notes.push('更适合先把脸部提出来，再统一整组颜色。');
    recommendedPresetIds = isPortrait
      ? ['pro-neg-hi', 'pro-neg-std', 'provia']
      : ['provia', 'classic-neg', 'eterna-luts-plus'];
  } else {
    notes.push('这张片子的曝光基础还可以，更适合做统一风格，而不是大幅度救片。');
  }

  if ((metrics.faceCount ?? 0) === 1) {
    whiteBalanceNote = '肤色先保持中性略偏白，红润感只补一点，避免修成粉脸或灰脸。';
    notes.push('人像统一时，建议先用肖像类预设，再用很小的曝光补偿去拉齐整组照片。');
  } else {
    skinToneGoal = '当前不是单人脸稳定状态，先统一整体曝光和色彩，再决定是否做人像细修。';
  }

  if ((metrics.faceShapeTendency ?? 'unknown') === 'round') {
    notes.push('圆脸更适合柔和肖像或标准肖像，不建议直接用高饱和预设把面部再撑开。');
  }

  if ((metrics.faceShapeTendency ?? 'unknown') === 'long') {
    notes.push('长脸建议避免冷硬、过薄的电影预设，优先用更柔一点的肖像类方案。');
  }

  return {
    exposureCompensation,
    highlightAdjustment,
    shadowAdjustment,
    whiteBalanceNote,
    skinToneGoal,
    recommendedPresetIds,
    notes,
  };
}

export function buildColorAdjustmentSettings(metrics: RawPhotoMetrics, presetId?: string): ColorAdjustmentSettings {
  const preset = getPresetById(presetId);
  const isPortrait = (metrics.faceCount ?? 0) === 1;
  let settings: ColorAdjustmentSettings = {
    exposureEv: 0.06,
    highlightRecovery: 0.08,
    shadowLift: 0.08,
    contrast: 0.03,
    saturation: 0.02,
    warmth: 0.01,
    skinSoftLift: isPortrait ? 0.04 : 0,
  };

  if (metrics.brightPixelRatio > 0.22 || metrics.brightness > 205) {
    settings = {
      ...settings,
      exposureEv: -0.22,
      highlightRecovery: 0.2,
      shadowLift: 0.04,
      contrast: 0.01,
      saturation: -0.01,
    };
  } else if (metrics.darkPixelRatio > 0.28 || metrics.brightness < 82) {
    settings = {
      ...settings,
      exposureEv: 0.18,
      highlightRecovery: 0.05,
      shadowLift: 0.18,
      contrast: 0.04,
      saturation: 0.01,
    };
  }

  switch (preset?.category) {
    case 'portrait':
      settings = {
        ...settings,
        contrast: settings.contrast + 0.01,
        saturation: settings.saturation + 0.01,
        warmth: settings.warmth + 0.02,
        skinSoftLift: settings.skinSoftLift + 0.03,
      };
      break;
    case 'neutral':
      settings = {
        ...settings,
        contrast: settings.contrast,
        saturation: settings.saturation,
      };
      break;
    case 'cinematic':
      settings = {
        ...settings,
        contrast: settings.contrast - 0.02,
        saturation: settings.saturation - 0.04,
        warmth: settings.warmth - 0.01,
      };
      break;
    case 'classic':
      settings = {
        ...settings,
        contrast: settings.contrast - 0.01,
        saturation: settings.saturation - 0.03,
        warmth: settings.warmth - 0.02,
      };
      break;
    case 'vivid':
      settings = {
        ...settings,
        contrast: settings.contrast + 0.03,
        saturation: settings.saturation + 0.08,
      };
      break;
    case 'mono':
      settings = {
        ...settings,
        saturation: -1,
        warmth: 0,
      };
      break;
  }

  if ((metrics.faceShapeTendency ?? 'unknown') === 'round') {
    settings = {
      ...settings,
      contrast: settings.contrast + 0.01,
      skinSoftLift: settings.skinSoftLift + 0.01,
    };
  }

  if ((metrics.faceShapeTendency ?? 'unknown') === 'long') {
    settings = {
      ...settings,
      contrast: settings.contrast - 0.01,
      warmth: settings.warmth + 0.01,
    };
  }

  return settings;
}
