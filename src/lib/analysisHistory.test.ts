import { describe, expect, it } from 'vitest';
import { buildSevenDayTrend, recordAnalysisHistory } from './analysisHistory';

describe('analysis history', () => {
  it('keeps one record per photo and aggregates the latest seven calendar days', () => {
    const records = recordAnalysisHistory(
      [
        { photoId: 'portrait-a', recordedAt: '2026-06-20T10:00:00.000Z', score: 80, decision: 'keep' },
        { photoId: 'portrait-a', recordedAt: '2026-06-20T11:00:00.000Z', score: 20, decision: 'reject' },
      ],
      [
        { photoId: 'portrait-b', recordedAt: '2026-06-21T10:00:00.000Z', score: 70, decision: 'review' },
        { photoId: 'portrait-c', recordedAt: '2026-06-21T11:00:00.000Z', score: 90, decision: 'keep' },
      ],
    );

    expect(records).toHaveLength(3);

    const trend = buildSevenDayTrend(records, new Date('2026-06-21T12:00:00.000Z'));

    expect(trend).toHaveLength(7);
    expect(trend[5]).toMatchObject({ day: '06-20', averageScore: 80, count: 1 });
    expect(trend[6]).toMatchObject({ day: '06-21', averageScore: 80, count: 2 });
  });
});
