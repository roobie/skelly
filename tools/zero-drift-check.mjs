// biome-ignore-all lint/correctness/noNodejsModules: This command-line checker runs only under Node.js.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = 'tools/zero-drift-baseline.json';
const ISSUE_TEMPLATE = /^\.github\/ISSUE_TEMPLATE\//;
const DATED_SNAPSHOT = /(?:^|\/)docs\/reviews\/[^/]+\.md$|(?:^|\/)retro-[^/]+\.md$/;
const SUBPROJECTS = new Set(['deadvox', 'gungen', 'mobgen']);
const LINE_CITATION = /(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9_-]*:\d+(?:-\d+)?/g;
const INLINE_CODE = /(?<!`)`([^`\n]+)`(?!`)/g;
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const SYMBOL_PAIR = /`([^`\n]+)`, `([^`\n]+)`/g;
const SYMBOL_LINK = /\[`([^`\n]+)`\]\(([^)]+)\)/g;
const SYMBOL_IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const NEWLINE = /\r?\n/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const PATH_PLACEHOLDER = /[<>{}*…]|\.\.\.|\[|\]/;
const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;
const PATH_SHAPE = /\/$|\/[^/]+\.[A-Za-z][A-Za-z0-9_-]*$/;
const WHITESPACE = /\s+/;
const LINK_TARGET = /^(<[^>]+>|[^\s]+)/;
const TRAILING_SLASH = /\/$/;

const exec = (command, args, options = {}) => execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });

export function parsePythonReadIf(output) {
  const docs = new Map();
  let current;
  for (const line of output.split(NEWLINE)) {
    if (line.startsWith('  - ')) {
      if (current) {
        docs.get(current).push(line.slice(4));
      }
    } else if (line) {
      current = line;
      docs.set(current, []);
    }
  }
  return docs;
}

function frontMatter(text) {
  const lines = text.split(NEWLINE);
  if (lines[0]?.trim() !== '---') {
    return;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end < 0 ? undefined : lines.slice(1, end).join('\n');
}

function add(failures, path, check, text) {
  const key = JSON.stringify([path, check, text]);
  const previous = failures.get(key);
  failures.set(key, { path, check, text, count: (previous?.count ?? 0) + 1 });
}

function validReadIf(reasons) {
  return (
    Array.isArray(reasons) &&
    reasons.length > 0 &&
    reasons.every((reason) => typeof reason === 'string' && reason.trim())
  );
}

function readIfReasons(path, text, failures) {
  const metadata = frontMatter(text);
  if (metadata === undefined) {
    add(failures, path, 'read_if', 'missing YAML front matter');
    return;
  }
  let parsed;
  try {
    parsed = parse(metadata);
  } catch {
    add(failures, path, 'read_if', 'invalid YAML front matter');
    return;
  }
  const reasons = parsed?.read_if;
  if (!validReadIf(reasons)) {
    add(failures, path, 'read_if', 'read_if must be a non-empty list of non-empty strings');
    return;
  }
  return reasons;
}

function checkReadIfParity(path, reasons, pythonReadIf, failures) {
  const pythonReasons = pythonReadIf.get(path);
  if (!pythonReasons || JSON.stringify(reasons) !== JSON.stringify(pythonReasons)) {
    add(failures, path, 'read_if_parity', 'YAML read_if differs from python3 tools/read_if.py');
  }
}

function visibleMarkdown(text) {
  let fence;
  return text
    .split(NEWLINE)
    .map((line) => {
      const marker = line.match(fence ? FENCE_CLOSE : FENCE_OPEN);
      if (fence) {
        if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) {
          fence = undefined;
        }
        return '';
      }
      if (marker) {
        fence = { char: marker[1][0], length: marker[1].length };
        return '';
      }
      return line;
    })
    .join('\n');
}

function pathValue(raw) {
  let value = raw.trim();
  if (value.startsWith('<') && value.endsWith('>')) {
    value = value.slice(1, -1);
  }
  if (!value || PATH_PLACEHOLDER.test(value) || URI_SCHEME.test(value) || value.startsWith('/')) {
    return;
  }
  const [withoutAnchor] = value.split('#', 1);
  const [withoutQuery] = withoutAnchor.split('?', 1);
  value = withoutQuery.replace(LINE_SUFFIX, '');
  if (value?.includes('/') && PATH_SHAPE.test(value)) {
    return value;
  }
}

function isInsideRepo(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function pathCandidates(visible) {
  const found = [];
  for (const match of visible.matchAll(INLINE_CODE)) {
    for (const token of match[1].trim().split(WHITESPACE)) {
      const value = pathValue(token);
      if (value) {
        found.push({ raw: token, value });
      }
    }
  }
  for (const match of visible.matchAll(LINK)) {
    const raw = match[1].trim().match(LINK_TARGET)?.[1];
    if (!raw || raw.startsWith('/')) {
      continue;
    }
    const value = pathValue(raw);
    if (value) {
      found.push({ raw, value });
    }
  }
  return found;
}

function resolvedCandidates(docPath, value, root) {
  const [subproject] = docPath.split('/');
  const candidates = [
    value,
    ...(SUBPROJECTS.has(subproject) ? [resolve(root, subproject, value)] : []),
    resolve(dirname(resolve(root, docPath)), value),
  ];
  return [
    ...new Set(
      candidates.map((candidate) => resolve(root, candidate)).filter((candidate) => isInsideRepo(root, candidate)),
    ),
  ];
}

function pathExists(candidate, value, tree) {
  const rel = relative(tree.root, candidate).split(sep).join('/');
  if (tree.tracked.has(rel)) {
    return true;
  }
  if (value.endsWith('/') && [...tree.tracked].some((path) => path.startsWith(`${rel.replace(TRAILING_SLASH, '')}/`))) {
    return true;
  }
  return tree.ignored.has(rel) || (value.endsWith('/') && tree.ignored.has(`${rel}/`));
}

function symbolExists(symbol, source) {
  return symbol.split('.').every((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source));
}

function checkSymbolCue({ path, symbol, rawPath, tree, failures }) {
  if (!SYMBOL_IDENTIFIER.test(symbol)) {
    return;
  }
  const value = pathValue(rawPath);
  if (!value) {
    return;
  }
  const candidates = resolvedCandidates(path, value, tree.root);
  const target = candidates.find((candidate) => pathExists(candidate, value, tree));
  if (!target) {
    add(failures, path, 'symbol', `${rawPath}, ${symbol}`);
    return;
  }
  const targetPath = relative(tree.root, target);
  let targetSource;
  try {
    targetSource = readFileSync(target, 'utf8');
  } catch {
    add(failures, path, 'symbol', `${targetPath}, ${symbol}`);
    return;
  }
  if (!symbolExists(symbol, targetSource)) {
    add(failures, path, 'symbol', `${targetPath}, ${symbol}`);
  }
}

function checkSymbols({ path, visible, tree, failures }) {
  for (const match of visible.matchAll(SYMBOL_PAIR)) {
    checkSymbolCue({ path, symbol: match[2], rawPath: match[1], tree, failures });
  }
  for (const match of visible.matchAll(SYMBOL_LINK)) {
    checkSymbolCue({ path, symbol: match[1], rawPath: match[2], tree, failures });
  }
}

function checkLineNumbers(path, visible, failures) {
  for (const line of visible.split('\n')) {
    if (line.trimStart().startsWith('>')) {
      continue;
    }
    for (const match of line.matchAll(LINE_CITATION)) {
      add(failures, path, 'line_number', match[0]);
    }
  }
}

function checkPaths({ path, visible, tree, failures }) {
  for (const candidate of pathCandidates(visible)) {
    const targets = resolvedCandidates(path, candidate.value, tree.root);
    if (!targets.some((target) => pathExists(target, candidate.value, tree))) {
      add(failures, path, 'path', candidate.raw);
    }
  }
  checkSymbols({ path, visible, tree, failures });
}

export function checkDocument({ path, text, root = ROOT, tracked, ignored = new Set(), pythonReadIf = new Map() }) {
  const failures = new Map();
  const reasons = readIfReasons(path, text, failures);
  if (reasons) {
    checkReadIfParity(path, reasons, pythonReadIf, failures);
  }
  const visible = visibleMarkdown(text);
  if (!DATED_SNAPSHOT.test(path)) {
    if (!tracked) {
      throw new Error('tracked file set is required for path checks');
    }
    const tree = { root, tracked, ignored };
    checkLineNumbers(path, visible, failures);
    checkPaths({ path, visible, tree, failures });
  }
  return [...failures.values()];
}

function trackedMarkdown() {
  return exec('git', ['ls-files', '-z', '--', '*.md'])
    .split('\0')
    .filter((path) => path && !ISSUE_TEMPLATE.test(path));
}

function ignoredPaths(candidates) {
  const unique = [...new Set(candidates.flat())];
  if (unique.length === 0) {
    return new Set();
  }
  const input = `${unique.join('\0')}\0`;
  let output = '';
  try {
    output = exec('git', ['check-ignore', '--no-index', '-z', '--stdin'], { input });
  } catch (error) {
    output = error.stdout?.toString() ?? '';
  }
  return new Set(output.split('\0').filter(Boolean));
}

function observedFailures(paths) {
  const tracked = new Set(exec('git', ['ls-files', '-z']).split('\0').filter(Boolean));
  const docTexts = new Map(paths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]));
  const candidates = [...docTexts].map(([path, text]) =>
    pathCandidates(visibleMarkdown(text)).flatMap(({ value }) =>
      resolvedCandidates(path, value, ROOT).map(
        (candidate) => `${relative(ROOT, candidate)}${value.endsWith('/') ? '/' : ''}`,
      ),
    ),
  );
  const ignored = ignoredPaths(candidates);
  const pythonReadIf = parsePythonReadIf(exec('python3', ['tools/read_if.py']));
  const failures = new Map();
  for (const [path, text] of docTexts) {
    for (const failure of checkDocument({ path, text, tracked, ignored, pythonReadIf })) {
      const key = JSON.stringify([failure.path, failure.check, failure.text]);
      const previous = failures.get(key);
      failures.set(key, { ...failure, count: (previous?.count ?? 0) + failure.count });
    }
  }
  return [...failures.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.check.localeCompare(b.check) || a.text.localeCompare(b.text),
  );
}

function failureMap(failures) {
  return new Map(
    failures.map(({ path, check, text, count }) => [JSON.stringify([path, check, text]), { path, check, text, count }]),
  );
}

function group(path) {
  return ['gungen', 'deadvox', 'mobgen'].find((name) => path.startsWith(`${name}/`)) ?? 'root';
}

function printStats(failures) {
  const checks = new Map();
  const groups = new Map();
  for (const { path, check, count } of failures) {
    checks.set(check, (checks.get(check) ?? 0) + count);
    const key = `${group(path)}\t${check}`;
    groups.set(key, (groups.get(key) ?? 0) + count);
  }
  const lines = ['Baseline violations by check:'];
  for (const [check, count] of [...checks].sort()) {
    lines.push(`  ${check}: ${count}`);
  }
  lines.push('Baseline violations by top-level doc group and check:');
  for (const [key, count] of [...groups].sort()) {
    const [docGroup, check] = key.split('\t');
    lines.push(`  ${docGroup} / ${check}: ${count}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function failureDifferences(observed, baseline) {
  const actual = failureMap(observed);
  const expected = failureMap(baseline);
  const differences = [];
  for (const [key, item] of actual) {
    const allowed = expected.get(key)?.count ?? 0;
    if (item.count > allowed) {
      differences.push({ ...item, kind: 'new', count: item.count - allowed });
    }
  }
  for (const [key, item] of expected) {
    const found = actual.get(key)?.count ?? 0;
    if (item.count > found) {
      differences.push({ ...item, kind: 'stale', count: item.count - found });
    }
  }
  return differences.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.path.localeCompare(b.path) ||
      a.check.localeCompare(b.check) ||
      a.text.localeCompare(b.text),
  );
}

export function compare(observed, baseline) {
  return failureDifferences(observed, baseline);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const observed = observedFailures(trackedMarkdown());
  if (args.has('--report')) {
    printStats(observed);
  }
  if (args.has('--emit-baseline')) {
    const rows = observed.map((violation) => `    ${JSON.stringify(violation)}`).join(',\n');
    process.stdout.write(`{\n  "version": 1,\n  "violations": [\n${rows}\n  ]\n}\n`);
    return;
  }
  if (args.has('--report')) {
    return;
  }
  const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE_PATH), 'utf8'));
  if (baseline.version !== 1 || !Array.isArray(baseline.violations)) {
    throw new Error(`${BASELINE_PATH} must have version 1 and a violations array`);
  }
  const differences = failureDifferences(observed, baseline.violations);
  if (differences.length > 0) {
    for (const item of differences) {
      process.stderr.write(`${item.kind} ${item.check} ${item.path}: ${JSON.stringify(item.text)} (${item.count})\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Zero-drift check passed (${observed.reduce((sum, item) => sum + item.count, 0)} ratcheted violations).\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
