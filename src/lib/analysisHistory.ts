export type AnalysisHistoryDecision = 'keep' | 'review' | 'reject';

export type AnalysisHistoryRecord = {
  photoId: string;
  recordedAt: string;
  score: number;
  decision: AnalysisHistoryDecision;
};

export type AnalysisTrendPoint = {
  day: string;
  averageScore: number;
  count: number;
};

const HISTORY_STORAGE_KEY = 'ai-photo-culling-analysis-history-v1';
const MAX_HISTORY_RECORDS = 2000;

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is AnalysisHistoryRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as AnalysisHistoryRecord;
  return (
    typeof record.photoId === 'string' &&
    typeof record.recordedAt === 'string' &&
    typeof record.score === 'number' &&
    (record.decision === 'keep' || record.decision === 'review' || record.decision === 'reject')
  );
}

export function recordAnalysisHistory(existing: AnalysisHistoryRecord[], incoming: AnalysisHistoryRecord[]) {
  const seenPhotoIds = new Set<string>();
  const merged: AnalysisHistoryRecord[] = [];

  for (const record of [...existing, ...incoming]) {
    if (seenPhotoIds.has(record.photoId)) continue;
    seenPhotoIds.add(record.photoId);
    merged.push(record);
  }

  return merged
    .sort((first, second) => second.recordedAt.localeCompare(first.recordedAt))
    .slice(0, MAX_HISTORY_RECORDS);
}

export function loadAnalysisHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawHistory) return [];

    const parsedHistory: unknown = JSON.parse(rawHistory);
    if (!Array.isArray(parsedHistory)) return [];

    return parsedHistory.filter(isRecord).slice(0, MAX_HISTORY_RECORDS);
  } catch {
    return [];
  }
}

export function saveAnalysisHistory(history: AnalysisHistoryRecord[]) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY_RECORDS)));
}

export function clearAnalysisHistory() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export function buildSevenDayTrend(history: AnalysisHistoryRecord[], now = new Date()): AnalysisTrendPoint[] {
  const scoresByDay = new Map<string, number[]>();

  for (const record of history) {
    const date = new Date(record.recordedAt);
    if (Number.isNaN(date.getTime())) continue;

    const dayKey = toDayKey(date);
    const scores = scoresByDay.get(dayKey) ?? [];
    scores.push(record.score);
    scoresByDay.set(dayKey, scores);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (6 - index)));
    const dayKey = toDayKey(date);
    const scores = scoresByDay.get(dayKey) ?? [];
    const averageScore = scores.length === 0 ? 0 : Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);

    return { day: dayKey.slice(5), averageScore, count: scores.length };
  });
}
