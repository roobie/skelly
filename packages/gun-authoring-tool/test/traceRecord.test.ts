import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkTraceRecords } from '../src/cli/traceCheck.ts';
import { parseTraceRecord, resolveTraceReference } from '../src/gun/traceRecord.ts';
import { parseTraceSvg } from '../src/gun/traceSvg.ts';

const svg = '<svg viewBox="0 0 20 30"><g><path id="outline" d="M1,2 L7,2 L7,10 L1,2"/></g></svg>';
const reference = {
  id: 'test-image',
  svg: 'shape.svg',
  calibration: {
    pixels: {
      kind: 'derived',
      value: [
        [0, 0],
        [3, 4],
      ],
      reason: 'Picked datum',
    },
    lengthMm: { kind: 'sourced', value: 10, source: 'https://example.org/dimensions' },
  },
  allowancePercent: { kind: 'derived', value: 10, reason: 'Author allowance, not a confidence interval' },
  comparisons: {},
  landmarks: {},
  features: { body: { kind: 'derived', paths: ['outline'] } },
};
const record = { title: 'Test trace', document: 'docs/study.md', values: {}, reference };
const roots: string[] = [];
const cue = (file: string): string => `[${file}](../references/${file})`;
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'gun-trace-'));
  roots.push(root);
  mkdirSync(join(root, 'references'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'references/shape.trace.json'), JSON.stringify(record));
  writeFileSync(join(root, 'references/shape.svg'), svg);
  writeFileSync(join(root, 'docs/study.md'), `${cue('shape.trace.json')} ${cue('shape.svg')}`);
  return root;
};

it('rejects an SVG/record path mismatch through the check used by validate', () => {
  const root = fixture();
  expect(checkTraceRecords(root)).toEqual([]);
  writeFileSync(join(root, 'references/shape.svg'), svg.replace('id="outline"', 'id="renamed"'));
  expect(checkTraceRecords(root)).toEqual([expect.stringContaining('missing SVG path outline')]);
});

it('rejects an SVG path without a record feature instead of silently omitting it', () => {
  const parsed = parseTraceRecord(record);
  const extra = svg.replace('</g>', '<path id="unrecorded" d="M0,0 L1,1"/></g>');
  expect(() => resolveTraceReference(parsed.reference!, extra)).toThrow('has no record feature');
});

it('requires study links to both the record and SVG, so a moved or missing cue fails validation', () => {
  const root = fixture();
  writeFileSync(join(root, 'docs/study.md'), cue('other.trace.json'));
  expect(checkTraceRecords(root)).toEqual([expect.stringContaining('must link its trace record')]);
  writeFileSync(join(root, 'docs/study.md'), cue('shape.trace.json'));
  expect(checkTraceRecords(root)).toEqual([expect.stringContaining('must link its trace SVG')]);
});

it('accepts an invented gun record with no reference evidence', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'references/shape.trace.json'),
    JSON.stringify({
      title: 'Invented gun',
      document: 'docs/study.md',
      values: { lengthMm: { kind: 'unknown', reason: 'No physical reference' } },
    }),
  );
  expect(checkTraceRecords(root)).toEqual([]);
});

it('derives envelopes and allowance from SVG vertices and the datum rather than storing copies', () => {
  const parsed = parseTraceRecord(record);
  const result = resolveTraceReference(parsed.reference!, svg);
  const span = result.features.body!;
  expect(span.widthMm / result.mmPerPixel).toBeCloseTo(6);
  expect(span.heightMm / result.mmPerPixel).toBeCloseTo(8);
  expect(span.widthAllowanceMm.max - span.widthMm).toBeCloseTo(span.widthMm * 0.1);
  const moved = resolveTraceReference(parsed.reference!, svg.replace('L7,10', 'L7,14'));
  expect(moved.features.body!.widthMm).toBe(span.widthMm);
  expect(moved.features.body!.heightMm).toBeGreaterThan(span.heightMm);
});

it('rejects unsupported SVG geometry rather than computing an incorrect envelope', () => {
  expect(() => parseTraceSvg(svg.replace('L7,2', 'Q4,2 7,2'))).toThrow();
  expect(() => parseTraceSvg(svg.replace('<g>', '<g transform="scale(2)">'))).toThrow();
  expect(() => parseTraceSvg(svg.replace('L7,10', 'L7,1e999'))).toThrow();
});

it('rejects missing provenance and nonpositive calibration lengths', () => {
  expect(() => parseTraceRecord({ ...record, values: { bad: { kind: 'sourced', value: 1 } } })).toThrow();
  expect(() =>
    parseTraceRecord({
      ...record,
      reference: {
        ...reference,
        calibration: {
          ...reference.calibration,
          lengthMm: { kind: 'derived', value: 10, reason: 'Not a sourced length' },
        },
      },
    }),
  ).toThrow();
  const parsed = parseTraceRecord(record);
  const invalid = {
    ...parsed.reference!,
    calibration: {
      ...parsed.reference!.calibration,
      lengthMm: { ...parsed.reference!.calibration.lengthMm, value: 0 },
    },
  };
  expect(() => resolveTraceReference(invalid, svg)).toThrow();
});
