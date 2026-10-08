import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  checkDocument,
  checkPolicyRules,
  compare,
  comparePolicy,
  parsePythonReadIf,
} from '../tools/zero-drift-check.mjs';

const docPath = 'docs/test.md';
const pythonReadIf = (reasons = ['read this']) => new Map([[docPath, reasons]]);
const document = (body = '', frontMatter = 'read_if: [read this]') => `---\n${frontMatter}\n---\n${body}`;
let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'zero-drift-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'deadvox/docs'), { recursive: true });
  mkdirSync(join(root, 'deadvox/src'), { recursive: true });
  writeFileSync(
    join(root, 'src/known.ts'),
    'export function startBench() {}\nexport class ChunkMeshes { cull() {} }\n',
  );
  writeFileSync(join(root, 'deadvox/src/known.ts'), 'export function startBench() {}\n');
});
after(() => rmSync(root, { recursive: true, force: true }));

const scan = (text, { tracked = new Set(['src/known.ts']), ignored = new Set(), reasons } = {}) =>
  checkDocument({
    path: docPath,
    text,
    root,
    tracked,
    ignored,
    pythonReadIf: pythonReadIf(reasons),
  });
const checks = (failures) => failures.map(({ check }) => check);

describe('zero-drift read_if check', () => {
  it('accepts block and flow lists when they agree with the Python reader', () => {
    assert.deepEqual(
      checks(
        scan(document('', 'read_if:\n  - first reason\n  - second reason'), {
          reasons: ['first reason', 'second reason'],
        }),
      ),
      [],
    );
    assert.deepEqual(
      checks(scan(document('', 'read_if: [one, "two, with comma"]'), { reasons: ['one', 'two, with comma'] })),
      [],
    );
  });

  it('rejects missing front matter and Python-reader drift', () => {
    assert.ok(checks(scan('No front matter')).includes('read_if'));
    assert.ok(checks(scan(document('', 'read_if: []'))).includes('read_if'));
    assert.ok(
      checks(scan(document('', 'read_if: [yaml reason]'), { reasons: ['different Python reason'] })).includes(
        'read_if_parity',
      ),
    );
  });

  it('parses the Python reader output by document and reason', () => {
    assert.deepEqual(
      parsePythonReadIf('a.md\n  - first\n  - second\nb.md\n  - third\n'),
      new Map([
        ['a.md', ['first', 'second']],
        ['b.md', ['third']],
      ]),
    );
  });
});

describe('zero-drift line-number check', () => {
  it('rejects prose citations and ignores fenced or quoted output', () => {
    assert.ok(checks(scan(document('The implementation is in foo.mjs:12-30.'))).includes('line_number'));
    assert.ok(!checks(scan(document('> stack at foo.mjs:12\n\n```text\nfoo.ts:3\n```'))).includes('line_number'));
  });

  it('exempts dated review citations and paths but still requires read_if', () => {
    const failures = checkDocument({
      path: 'docs/reviews/fixture.md',
      text: 'No front matter. See `src/missing.ts` and foo.ts:12-14.',
      root,
      tracked: new Set(),
      pythonReadIf: new Map(),
    });
    assert.deepEqual(checks(failures), ['read_if']);
  });
});

describe('zero-drift path check', () => {
  it('rejects missing code-span paths and accepts repo-relative links and ignored paths', () => {
    assert.ok(checks(scan(document('See `src/missing.ts`.'))).includes('path'));
    assert.ok(
      !checks(
        scan(document('[source](../src/known.ts#setup); ignored `.claude/worktrees/session/file.ts`'), {
          ignored: new Set(['.claude/worktrees/session/file.ts']),
        }),
      ).includes('path'),
    );
    assert.ok(
      !checks(
        scan(document('Run `python3 tools/read_if.py saves stairs`.'), {
          tracked: new Set(['src/known.ts', 'tools/read_if.py']),
        }),
      ).includes('path'),
    );
  });

  it('resolves subproject-relative citations from their subproject root', () => {
    const path = 'deadvox/docs/fixture.md';
    const failures = checkDocument({
      path,
      text: document('See `src/known.ts`, `startBench`.'),
      root,
      tracked: new Set(['deadvox/src/known.ts']),
      pythonReadIf: new Map([[path, ['read this']]]),
    });
    assert.deepEqual(checks(failures), []);
  });

  it('ignores URLs, globs, and placeholders', () => {
    const failures = scan(document('[source](https://example.com/src/file.ts) `src/*/file.ts` `src/<name>.ts`'));
    assert.ok(!checks(failures).includes('path'));
  });
});

describe('zero-drift symbol check', () => {
  it('checks the pair and markdown-link cue forms against whole-word identifiers', () => {
    assert.ok(!checks(scan(document('See `src/known.ts`, `startBench`; [`cull`](src/known.ts).'))).includes('symbol'));
    assert.ok(!checks(scan(document('See `src/known.ts`, `ChunkMeshes.cull`.'))).includes('symbol'));
    assert.ok(checks(scan(document('See `src/known.ts`, `missingSymbol`.'))).includes('symbol'));
    assert.ok(checks(scan(document('[`missingSymbol`](src/known.ts).'))).includes('symbol'));
  });
});

describe('zero-drift policy rules', () => {
  it('flags stamped source citations, not BR as an actor', () => {
    const markdown = checkPolicyRules({
      path: 'docs/fixture.md',
      text: [
        'BR, 2026-10-04',
        'br, 2026-10-04',
        "BR's 2026-10-07 12:50 rulings",
        '(BR)',
        '(BR, 2026-10-04)',
        'br-43',
        '**Gate (2026-10-05 19:52):** “approved”',
        'discuss with BR before installing',
        'After BR merges',
        'IDs from before 2026-10-02',
      ].join('\n'),
    });
    const source = checkPolicyRules({ path: 'src/fixture.ts', text: '// BR, 2026-10-04\n' });
    assert.deepEqual(
      markdown
        .filter(({ check }) => check === 'citation')
        .map(({ text, count }) => ({ text, count }))
        .sort((a, b) => a.text.localeCompare(b.text)),
      [
        { text: '(2026-10-05 19:52):** “', count: 1 },
        { text: '(BR)', count: 1 },
        { text: 'br-43', count: 1 },
        { text: 'BR, 2026-10-04', count: 2 },
        { text: "BR's 2026-10-07", count: 1 },
      ].sort((a, b) => a.text.localeCompare(b.text)),
    );
    assert.equal(source.filter(({ check }) => check === 'citation').length, 1);
  });

  it('flags host paths and private addresses, exempting the Playwright cache path by value', () => {
    const failures = checkPolicyRules({
      path: 'src/fixture.ts',
      text: '/home/ann/notes 10.0.0.1 172.16.0.1 192.168.1.20 ~/notes ~/.cache/ms-playwright; version 10.29.8',
    });
    assert.deepEqual(
      failures
        .filter(({ check }) => check === 'host')
        .map(({ text }) => text)
        .sort(),
      ['/home/ann/notes', '10.0.0.1', '172.16.0.1', '192.168.1.20', '~/notes'],
    );
    assert.deepEqual(
      checkPolicyRules({
        path: '.github/workflows/ci.yml',
        text: '/home/… /run/user/<uid>/… localhost:5173',
      }),
      [],
    );
    assert.deepEqual(checkPolicyRules({ path: 'src/fixture.ts', text: '~/.cache/ms-playwright' }), []);
    assert.deepEqual(
      checkPolicyRules({ path: '.github/workflows/ci.yml', text: '~/.cache' }).map(({ text }) => text),
      ['~/.cache'],
    );
  });

  it('fails host violations even when the baseline lists them', () => {
    const host = { path: 'src/fixture.ts', check: 'host', text: '/home/ann', count: 1 };
    const comparison = comparePolicy([host], [host]);
    assert.deepEqual(comparison.strictFailures, [host]);
    assert.deepEqual(comparison.strictBaselineRows, [host]);
    assert.deepEqual(comparison.differences, []);
  });

  it('flags today and currently in prose, not in code spans, fences, blockquotes or quotes', () => {
    const failures = checkPolicyRules({
      path: 'docs/fixture.md',
      text: [
        'Today and currently are prohibited.',
        '`today` and `currently` are code.',
        '> today and currently are quoted prose.',
        '```text',
        'today and currently are fenced.',
        '```',
        '"today" and “currently” are quoted.',
      ].join('\n'),
    });
    assert.deepEqual(
      failures.filter(({ check }) => check === 'when').map(({ text }) => text),
      ['today', 'currently'],
    );
  });
});

describe('zero-drift baseline ratchet', () => {
  it('fails for a new violation and for a stale baseline entry', () => {
    const violation = [{ path: 'docs/example.md', check: 'path', text: 'src/missing.ts', count: 1 }];
    assert.equal(compare(violation, [])[0].kind, 'new');
    assert.equal(compare([], violation)[0].kind, 'stale');
  });
});
