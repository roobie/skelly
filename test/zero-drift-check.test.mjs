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
  githubSlug,
  parsePythonReadIf,
} from '../tools/zero-drift-check.mjs';

const docPath = 'docs/test.md';
const pythonReadIf = (reasons = ['read this']) => new Map([[docPath, reasons]]);
const document = (body = '', frontMatter = 'read_if: [read this]') => `---\n${frontMatter}\n---\n${body}`;
let root;
const code = (text) => `${String.fromCharCode(96)}${text}${String.fromCharCode(96)}`;
const cue = (path, name) => `${code(path)}, ${JSON.stringify(name)}`;
const link = (text, target) => `[${text}](${target})`;
const lineCue = (file, range) => `${file}:${range}`;

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
  writeFileSync(
    join(root, 'docs/anchors.md'),
    [
      '---',
      'read_if: [fixture]',
      '# Metadata is not a heading',
      '---',
      '# Anchors',
      'Setext topic',
      '============',
      '## 3.5 API: ownership — details',
      '## Duplicate',
      '## Duplicate',
      '- **Decision (fixture stamp):** explanation',
      '## Combined (fixture stamp): subtitle',
      '## API_label',
      '## First',
      '## Second',
      '## Escaped \\_name\\_',
      '## Doubled \\\\_name_',
      '## `<!-- literal -->`',
      '[^unused]:',
      '    ## Phantom',
      '    ## Duplicate',
      '<!--',
      '## Phantom',
      '-->',
      '```md',
      '# Not an anchor',
      '```',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'src/fixture.yaml'),
    'entries:\n  - name: exact fixture name\n  - name: exact "quoted" name\n  - name: exact second fixture name\n',
  );
  mkdirSync(join(root, 'engine/src'), { recursive: true });
  writeFileSync(join(root, 'engine/src/known.ts'), 'export function assemble() {}\n');
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
    assert.ok(
      checks(scan(document(`The implementation is in ${lineCue('foo.mjs', '12-30')}.`))).includes('line_number'),
    );
    assert.ok(
      !checks(
        scan(document(`> stack at ${lineCue('foo.mjs', '12')}\n\n\`\`\`text\n${lineCue('foo.ts', '3')}\n\`\`\``)),
      ).includes('line_number'),
    );
  });

  it('checks review paths and line citations instead of exempting them', () => {
    const path = 'docs/reviews/fixture.md';
    const failures = checkDocument({
      path,
      text: document(`See ${code('src/missing.ts')} and ${lineCue('foo.ts', '12-14')}.`),
      root,
      tracked: new Set(),
      pythonReadIf: new Map([[path, ['read this']]]),
    });
    assert.deepEqual(checks(failures).sort(), ['line_number', 'path']);
  });
});

describe('zero-drift path check', () => {
  it('rejects missing code-span paths and accepts repo-relative links and ignored paths', () => {
    assert.ok(checks(scan(document(`See ${code('src/missing.ts')}.`))).includes('path'));
    assert.ok(
      !checks(
        scan(document(`${link('source', '../src/known.ts')}; ignored ${code('.claude/worktrees/session/file.ts')}`), {
          ignored: new Set(['.claude/worktrees/session/file.ts']),
        }),
      ).includes('path'),
    );
    assert.ok(
      !checks(
        scan(document(`Run ${code('python3 tools/read_if.py saves stairs')}.`), {
          tracked: new Set(['src/known.ts', 'tools/read_if.py']),
        }),
      ).includes('path'),
    );
  });

  it('resolves subproject-relative citations from their subproject root', () => {
    const path = 'deadvox/docs/fixture.md';
    const failures = checkDocument({
      path,
      text: document(`See ${code('src/known.ts')}, ${code('startBench')}.`),
      root,
      tracked: new Set(['deadvox/src/known.ts']),
      pythonReadIf: new Map([[path, ['read this']]]),
    });
    assert.deepEqual(checks(failures), []);
    const cross = (value) =>
      checkDocument({
        path,
        text: document(`See ${code(value)}, ${code('assemble')}.`),
        root,
        tracked: new Set(['engine/src/known.ts']),
        pythonReadIf: new Map([[path, ['read this']]]),
      });
    assert.deepEqual(cross('engine/src/known.ts'), []);
    assert.ok(checks(cross('../engine/src/known.ts')).includes('path_scope'));
  });

  it('treats each packages/<name> as its own project root', () => {
    const path = 'packages/alpha/docs/fixture.md';
    const cite = (value, tracked) =>
      checkDocument({
        path,
        text: document(`See ${code(value)}.`),
        root,
        tracked: new Set(tracked),
        pythonReadIf: new Map([[path, ['read this']]]),
      });
    assert.deepEqual(checks(cite('src/known.ts', ['packages/alpha/src/known.ts'])), []);
    assert.deepEqual(checks(cite('packages/beta/src/known.ts', ['packages/beta/src/known.ts'])), []);
    assert.ok(checks(cite('../../beta/src/known.ts', ['packages/beta/src/known.ts'])).includes('path_scope'));
  });

  it('ignores URLs, globs, and placeholders', () => {
    const failures = scan(
      document(
        `${link('source', 'https://example.com/src/file.ts')} ${code('src/*/file.ts')} ${code('src/<name>.ts')}`,
      ),
    );
    assert.ok(!checks(failures).includes('path'));
  });
});

describe('zero-drift symbol check', () => {
  it('checks the pair and markdown-link cue forms against whole-word identifiers', () => {
    assert.ok(
      !checks(
        scan(document(`See ${code('src/known.ts')}, ${code('startBench')}; ${link(code('cull'), 'src/known.ts')}.`)),
      ).includes('symbol'),
    );
    assert.ok(!checks(scan(document(`See ${code('src/known.ts')}, ${code('ChunkMeshes.cull')}.`))).includes('symbol'));
    assert.ok(checks(scan(document(`See ${code('src/known.ts')}, ${code('missingSymbol')}.`))).includes('symbol'));
    assert.ok(checks(scan(document(`${link(code('missingSymbol'), 'src/known.ts')}.`))).includes('symbol'));
    assert.deepEqual(scan(document(link(code('known.ts'), 'src/known.ts'))), []);
  });

  it('checks a symbol pair wrapped across a line break', () => {
    assert.ok(checks(scan(document(`See ${code('src/known.ts')},\n${code('missingSymbol')}.`))).includes('symbol'));
  });
});

describe('zero-drift section cues', () => {
  const tracked = new Set(['docs/anchors.md', 'src/fixture.yaml', 'engine/src/known.ts']);
  const sections = (body, path = docPath, trackedFiles = tracked) =>
    checkDocument({
      path,
      text: path.endsWith('.md') ? document(body) : body,
      root,
      tracked: trackedFiles,
      pythonReadIf: new Map([[path, ['read this']]]),
    });

  it('resolves normalized headings and bold lead-in labels with the canonical prose form', () => {
    for (const name of [
      'API',
      '3.5 API: ownership — details.',
      'Decision',
      'Decision (other stamp):',
      'Combined',
      'Setext topic',
      'API_label',
    ]) {
      assert.deepEqual(sections(cue('docs/anchors.md', name)), []);
    }
    assert.ok(checks(sections(cue('docs/anchors.md', 'Missing'))).includes('section'));
    assert.ok(checks(sections(cue('docs/anchors.md', 'Missing_label'))).includes('section'));
    assert.ok(checks(sections(cue('docs/anchors.md', 'Not an anchor'))).includes('section'));
    assert.ok(checks(sections(cue('docs/anchors.md', 'Metadata is not a heading'))).includes('section'));
  });

  it('requires explicit paths for identifier-shaped Markdown section names', () => {
    assert.deepEqual(sections(`${cue('docs/anchors.md', 'First')}; ${cue('docs/anchors.md', 'Second')}`), []);
    assert.deepEqual(
      sections(`${cue('docs/anchors.md', 'First')} and ${code('engine/src/known.ts')}, ${code('assemble')}`),
      [],
    );
    assert.ok(checks(sections(`${cue('docs/anchors.md', 'First')} and ${code('Second')}`)).includes('section_form'));
  });

  it('rejects every alternate prose spelling even when its named anchor exists', () => {
    const variants = [
      'docs/anchors.md "API"',
      'docs/anchors.md, "API"',
      `${code('docs/anchors.md')}, ${code('API')}`,
      `${code('docs/anchors.md')}, ${code('API_label')}`,
      `${code('docs/anchors.md')} "API"`,
      `${code('docs/anchors.md')}; "API"`,
      `${code('docs/anchors.md')} — "API"`,
      `${code('docs/anchors.md')}, 'API'`,
      `${link('target', 'docs/anchors.md')}, "API"`,
      `${code('docs/anchors.md')}, “API”`,
      ['docs/anchors.md', `${String.fromCharCode(167)}3.5`].join(' '),
      'docs/anchors.md section 3.5',
      'docs/anchors.md, 3.5',
      `${cue('docs/anchors.md', 'API')} and "Decision"`,
    ];
    for (const body of variants) {
      assert.ok(checks(sections(body)).includes('section_form'), body);
    }
  });

  it('does not let possessive apostrophes hide a bare section cue', () => {
    const apostrophe = String.fromCharCode(39);
    const path = ['docs/anchors', 'md'].join('.');
    const body = ['BR', apostrophe, 's rule: ', path, ', "Missing" isn', apostrophe, 't kept.'].join('');
    assert.deepEqual(new Set(checks(sections(body))), new Set(['section_form', 'section']));
  });

  it('catches numbered section references in emphasized and linked text, not code', () => {
    const path = ['docs/anchors', 'md'].join('.');
    assert.deepEqual(checks(sections(`**${path}** section 3`)), ['section_form']);
    assert.deepEqual(sections(`${code(path)} section 3`), []);
    assert.deepEqual(checks(sections(`[${path} section 3](${path})`)), ['section_form']);
  });

  it('does not promote escaped backticks in text to code cue nodes', () => {
    const escaped = (value) => code(value).replaceAll('`', '\\`');
    assert.deepEqual(sections(`${escaped('docs/anchors.md')}, ${escaped('Missing')}`), []);
    assert.deepEqual(sections(`${escaped('engine/src/known.ts')}, ${escaped('missing')}`), []);
  });

  it('resolves reference links through definitions and checks their destinations and code labels', () => {
    assert.deepEqual(sections('[target][ref]\n\n[ref]: docs/anchors.md#anchors'), []);
    assert.ok(checks(sections('[target][ref]\n\n[ref]: docs/anchors.md#missing')).includes('section'));
    assert.ok(checks(sections('[target][ref]\n\n[ref]: docs/missing.md')).includes('path'));
    assert.ok(
      checks(
        sections('[`missing`][ref]\n\n[ref]: src/known.ts', docPath, new Set([...tracked, 'src/known.ts'])),
      ).includes('symbol'),
    );
    assert.deepEqual(sections('[target][undefined]'), []);
    const adjacentName = sections('[target][ref], "Missing"\n\n[ref]: docs/anchors.md');
    assert.deepEqual(new Set(checks(adjacentName)), new Set(['section_form', 'section']));
  });

  it('first definition wins for duplicate reference labels', () => {
    const referenceDefinition = (fragment) => ['[ref]: docs/anchors.md', fragment].join('#');
    const referenceLink = (first, second) =>
      ['[target][ref]', '', referenceDefinition(first), ...(second ? [referenceDefinition(second)] : [])].join('\n');
    const singleValid = referenceLink('anchors');
    const singleMissing = referenceLink('missing');
    const firstValid = referenceLink('anchors', 'missing');
    const firstMissing = referenceLink('missing', 'anchors');

    assert.deepEqual(sections(singleValid), []);
    assert.ok(checks(sections(singleMissing)).includes('section'));
    assert.deepEqual(sections(firstValid), []);
    assert.ok(checks(sections(firstMissing)).includes('section'));
  });

  it('does not index headings in unreferenced footnotes or let them take slug suffixes', () => {
    assert.deepEqual(sections(link('target', 'docs/anchors.md#anchors')), []);
    assert.ok(checks(sections(link('target', 'docs/anchors.md#phantom'))).includes('section'));
    assert.ok(checks(sections(link('target', 'docs/anchors.md#duplicate-2'))).includes('section'));
  });

  it('keeps cues in distinct cells of a real GFM table', () => {
    const failures = sections(
      `| Target | Cue |\n| --- | --- |\n| ${cue('docs/anchors.md', 'API')} | ${cue('docs/anchors.md', 'Missing')} |\n| ${['docs/missing', 'md'].join('.')} | "API" |`,
    );
    assert.deepEqual(
      failures.filter(({ check }) => check === 'section').map(({ text }) => text),
      ['docs/anchors.md, "Missing"'],
    );
  });

  it('checks explicit section cues in strings and comments but ignores unformatted strings and inline examples', () => {
    assert.deepEqual(sections(cue('src/fixture.yaml', 'exact fixture name')), []);
    assert.ok(
      checks(
        sections(`${cue('src/fixture.yaml', 'exact fixture name')} and ${code('exact second fixture name')}`),
      ).includes('section_form'),
    );
    assert.ok(checks(sections('See "docs/anchors.md", "API".')).includes('section_form'));
    assert.deepEqual(sections('See `"docs/anchors.md", "API"`.'), []);
    assert.deepEqual(sections('const source = "docs/anchors.md, API";', 'src/fixture.ts'), []);
    const sourceString = `${code('src/fixture.yaml')}, ${JSON.stringify('exact fixture name')} and ${code('exact second fixture name')}`;
    assert.ok(checks(sections(`const note = '${sourceString}';`, 'src/fixture.ts')).includes('section_form'));
    const plainComment = `// Both: ${cue('src/fixture.yaml', 'exact fixture name')} and ${code('exact second fixture name')}`;
    const apostropheComment = `// Author's both: ${cue('src/fixture.yaml', 'exact fixture name')} and ${code('exact second fixture name')}`;
    assert.ok(checks(sections(plainComment, 'src/source.ts')).includes('section_form'));
    assert.ok(checks(sections(apostropheComment, 'src/source.ts')).includes('section_form'));
  });

  it('validates angle-wrapped link destinations for both paths and fragments', () => {
    assert.deepEqual(sections(link('target', '<docs/anchors.md#anchors>')), []);
    assert.ok(checks(sections(link('target', '<docs/anchors.md#missing>'))).includes('section'));
    assert.deepEqual(sections(link('external', '<https://example.com/doc.md#absent>')), []);
  });

  it('uses rendered escaped-underscore headings for GitHub slugs', () => {
    assert.equal(githubSlug('Escaped \\_name\\_'), 'escaped-_name_');
    assert.deepEqual(sections(link('target', 'docs/anchors.md#escaped-_name_')), []);
    assert.ok(checks(sections(link('target', 'docs/anchors.md#escaped-name'))).includes('section'));
  });

  it('uses backslash parity when computing rendered heading slugs', () => {
    assert.equal(githubSlug('Doubled \\\\_name_'), 'doubled-name');
    assert.deepEqual(sections(link('target', 'docs/anchors.md#doubled-name')), []);
    assert.ok(checks(sections(link('target', 'docs/anchors.md#doubled-_name_'))).includes('section'));
  });

  it('keeps comment-shaped code-span text in heading identity', () => {
    assert.equal(githubSlug('`<!-- literal -->`'), '---literal---');
    assert.deepEqual(sections(link('target', 'docs/anchors.md#---literal---')), []);
    assert.ok(checks(sections(link('target', 'docs/anchors.md#literal'))).includes('section'));
  });

  it('excludes headings inside HTML comments from named and slug anchors', () => {
    assert.deepEqual(sections(cue('docs/anchors.md', 'Anchors')), []);
    assert.deepEqual(sections(link('target', 'docs/anchors.md#anchors')), []);
    assert.ok(checks(sections(cue('docs/anchors.md', 'Phantom'))).includes('section'));
    assert.ok(checks(sections(link('target', 'docs/anchors.md#phantom'))).includes('section'));
  });

  it('validates link slugs with punctuation removal, Unicode and duplicate suffixes', () => {
    assert.equal(githubSlug('API: `état` & ownership!'), 'api-état--ownership');
    assert.equal(githubSlug('A **bold** _label_ with snake_case'), 'a-bold-label-with-snake_case');
    assert.equal(githubSlug('API: `_value_` and `<Thing>`'), 'api-_value_-and-thing');
    for (const anchor of ['35-api-ownership--details', 'setext-topic', 'duplicate', 'duplicate-1']) {
      assert.deepEqual(sections(link('target', `docs/anchors.md#${anchor}`)), []);
    }
    assert.ok(checks(sections(link('target', 'docs/anchors.md#gone'))).includes('section'));
    assert.ok(checks(sections(link('target', 'src/fixture.yaml#entries'))).includes('section'));
    assert.deepEqual(sections(link('external', 'https://example.com/doc.md#absent')), []);
    const self = checkDocument({
      path: docPath,
      text: document(`## Own anchor\n${link('self', '#own-anchor')}`),
      root,
      tracked: new Set([...tracked, docPath]),
      pythonReadIf: pythonReadIf(),
    });
    assert.deepEqual(self, []);
  });

  it('checks names in non-Markdown targets verbatim, without heading normalization', () => {
    assert.deepEqual(sections(cue('src/fixture.yaml', 'exact fixture name')), []);
    assert.deepEqual(sections(cue('src/fixture.yaml', 'exact "quoted" name')), []);
    assert.ok(checks(sections(cue('src/fixture.yaml', 'fixture name.'))).includes('section'));
  });

  it('uses the same cue scanner in source, tests, config and content, joining comment-wrapped names', () => {
    for (const path of ['engine/src/fixture.ts', 'test/fixture.mjs', 'config.yaml', 'content.jsonnet']) {
      const body = `${code('docs/anchors.md')}, "API:\n * ownership — details"`;
      assert.deepEqual(sections(body, path), []);
      const bad = sections(
        `${code('src/missing.ts')}; ${code('engine/src/known.ts')}, ${code('missing')}; ${cue('docs/anchors.md', 'Gone')}`,
        path,
      );
      assert.deepEqual(new Set(checks(bad)), new Set(['path', 'symbol', 'section']));
    }
    assert.deepEqual(sections(`// ${code('src/known.ts')}, ${code('assemble')}`, 'engine/src/fixture.ts'), []);
  });

  it('excludes module specifiers, markup names and non-file line-like expressions from code cues', () => {
    assert.deepEqual(
      sections(
        `${code('@scope/module.ts')} ${lineCue('@scope/module.ts', '3')} ${cue('docs/anchors.md', '*example*')} ${lineCue('object.field', '3')}`,
        'src/fixture.ts',
      ),
      [],
    );
    assert.deepEqual(sections(`${code('docs/anchors.md')}, "*example*"`), []);
    assert.deepEqual(checks(sections(`${code('docs/anchors.md')}; "*example*"`)), ['section_form']);
    assert.deepEqual(sections(`${code('docs/anchors.md')}'s label is the player's cue.`, 'src/fixture.ts'), []);
    assert.ok(checks(sections(lineCue('foo.ts', '3'), 'src/fixture.ts')).includes('line_number'));
    assert.deepEqual(
      sections(`${code('src/missing.ts')} ${cue('docs/anchors.md', 'Gone')}`, 'mobgen/reference/fixture.txt'),
      [],
    );
  });
});

describe('zero-drift policy rules', () => {
  it('rejects first-party review and retrospective files but exempts third-party references', () => {
    const paths = ['docs/reviews/fixture.md', 'retro-slice-3.md'];
    assert.deepEqual(
      paths.flatMap((path) => checkPolicyRules({ path, text: '' })).map(({ path, check }) => ({ path, check })),
      paths.map((path) => ({ path, check: 'historical_doc' })),
    );
    assert.deepEqual(checkPolicyRules({ path: 'mobgen/reference/retro-fixture.md', text: '' }), []);
  });

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

  it('fails strict policy violations even when the baseline lists them', () => {
    const violations = [
      { path: 'docs/fixture.md', check: 'section_form', text: 'alternate spelling', count: 1 },
      { path: 'src/fixture.ts', check: 'host', text: '/home/ann', count: 1 },
      {
        path: 'docs/reviews/fixture.md',
        check: 'historical_doc',
        text: 'reviews and retros belong in git history, not tracked files',
        count: 1,
      },
    ];
    for (const violation of violations) {
      const comparison = comparePolicy([violation], [violation]);
      assert.deepEqual(comparison.strictFailures, [violation]);
      assert.deepEqual(comparison.strictBaselineRows, [violation]);
      assert.deepEqual(comparison.differences, []);
    }
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
