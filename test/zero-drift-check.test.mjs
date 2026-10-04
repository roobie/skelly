import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { checkDocument, compare, parsePythonReadIf } from '../tools/zero-drift-check.mjs';

const docPath = 'docs/test.md';
const pythonReadIf = (reasons = ['read this']) => new Map([[docPath, reasons]]);
const document = (body = '', frontMatter = 'read_if: [read this]') => `---\n${frontMatter}\n---\n${body}`;
let root;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'zero-drift-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'src/known.ts'),
    'export function startBench() {}\nexport class ChunkMeshes { cull() {} }\n',
  );
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

describe('zero-drift baseline ratchet', () => {
  it('fails for a new violation and for a stale baseline entry', () => {
    const violation = [{ path: 'docs/example.md', check: 'path', text: 'src/missing.ts', count: 1 }];
    assert.equal(compare(violation, [])[0].kind, 'new');
    assert.equal(compare([], violation)[0].kind, 'stale');
  });
});
