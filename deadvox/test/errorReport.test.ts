import { describe, expect, it } from 'vitest';
import { errorDetails, errorReportText, errorText, feedbackUrlForError } from '../src/ui/errorReport.ts';

const handBack = (name: string, value: unknown) => ({
  blob: new Blob([JSON.stringify(value)], { type: 'application/json' }),
  name,
});

const FEEDBACK_SOURCE = 'https://github.com/roobie/skelly/issues/new?template=playtest-feedback.md';

describe('error reports', () => {
  it('preserves the complete Error message and stack for copying', () => {
    const error = new Error('failure detail');
    const details = errorDetails(error);
    expect(details.message).toBe(error.message);
    expect(details.stack).toBe(error.stack);
    expect(errorText(details)).toContain(error.message);
    expect(errorText(details)).toContain(error.stack);
  });

  it('prefills concise GitHub feedback and falls back to attaching the report when long', () => {
    const concise = feedbackUrlForError('Short failure\nstack', FEEDBACK_SOURCE);
    const conciseUrl = new URL(concise.href);
    expect(concise.attachReport).toBe(false);
    expect(conciseUrl.searchParams.get('template')).toBe('playtest-feedback.md');
    expect(conciseUrl.searchParams.get('title')).toContain('Short failure');
    expect(conciseUrl.searchParams.get('body')).toContain('Short failure');

    const long = feedbackUrlForError('x'.repeat(10_000), FEEDBACK_SOURCE);
    expect(long.attachReport).toBe(true);
    expect(long.href).toBe(FEEDBACK_SOURCE);
  });

  it('builds the local report with world context and existing playtest exports', async () => {
    const error = new Error('loop failed');
    const report = JSON.parse(
      await errorReportText({
        details: errorDetails(error),
        context: {
          seed: 73,
          site: 'testHouse',
          clockText: () => '23:30',
          stop: () => undefined,
          metricsFile: () => handBack('metrics.json', { schemaVersion: 1, seed: 73 }),
          replayFile: async () => handBack('replay.json', { frames: [] }),
        },
        userAgent: 'browser user agent',
        revision: 'build revision',
        occurredAt: new Date('2026-10-11T12:00:00.000Z'),
      }),
    );
    expect(report.error.message).toBe(error.message);
    expect(report.error.stack).toBe(error.stack);
    expect(report.world).toEqual({ seed: 73, site: 'testHouse', clock: '23:30' });
    expect(report.userAgent).toBe('browser user agent');
    expect(report.buildRevision).toBe('build revision');
    expect(report.playtest.metrics.seed).toBe(73);
    expect(report.playtest.replay.frames).toEqual([]);
  });
});
