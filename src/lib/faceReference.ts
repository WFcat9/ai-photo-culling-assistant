export type RatioRange = {
  min: number;
  max: number;
};

export const FACE_REFERENCE_RANGES = {
  upperThird: { min: 0.31, max: 0.35 },
  midThird: { min: 0.33, max: 0.36 },
  lowerThird: { min: 0.3, max: 0.33 },
  eyeGap: { min: 1.05, max: 1.15 },
  jawToCheek: { min: 0.74, max: 0.86 },
} as const satisfies Record<string, RatioRange>;

export const FACE_CAPTURE_GUIDE = {
  minReliableShortEdgeCoverage: '12% - 15%',
  maxReliableTurnDegrees: 30,
  checklist: [
    '单人主角优先',
    '眼睛附近要看得见细节',
    '脸部不要被头发、手和饰品挡住眉眼',
    '尽量避免强逆光和脸部死黑',
    '正脸到轻微侧脸最稳',
  ],
} as const;

export function isBelowRange(value: number | undefined, range: RatioRange, slack = 0) {
  return typeof value === 'number' && value < range.min - slack;
}

export function isAboveRange(value: number | undefined, range: RatioRange, slack = 0) {
  return typeof value === 'number' && value > range.max + slack;
}

export function isWithinRange(value: number | undefined, range: RatioRange, slack = 0) {
  return typeof value === 'number' && value >= range.min - slack && value <= range.max + slack;
}
