// biome-ignore-all lint/correctness/noNodejsModules: This command-line checker runs only under Node.js.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_PATH = 'tools/zero-drift-baseline.json';
const ISSUE_TEMPLATE = /^\.github\/ISSUE_TEMPLATE\//;
const HISTORICAL_DOC = /(?:^|\/)docs\/reviews\/|(?:^|\/)retro-[^/]+\.md$/;
const POLICY_EXEMPT = new Set([
  'tools/zero-drift-check.mjs',
  'tools/zero-drift-baseline.json',
  'test/zero-drift-check.test.mjs',
]);
const PACKAGE_LOCK = /(?:^|\/)package-lock\.json$/;
const STRICT_CHECKS = new Set(['host', 'historical_doc', 'section_form']);
const PRIVATE_IPV4 =
  /(?<![\d.])(?:10(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2}|192\.168(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2})(?![\d.])/g;
const HOST_PATH = /\/(?:home|Users|tmp)\/[A-Za-z0-9_.$-][A-Za-z0-9_./$-]*/g;
const RUN_USER_PATH = /\/run\/user\/\d+[A-Za-z0-9_./$-]*/g;
const HOME_SHORTCUT = /(^|[\s"'`(=])(~\/[A-Za-z0-9_.$-][A-Za-z0-9_./$-]*)/gm;
const HOST_PATH_VALUE_EXEMPTIONS = new Set(['~/.cache/ms-playwright']);
const INLINE_CODE_SPAN = /(`+)[\s\S]*?\1/g;
const QUOTED_TEXT = /“[^”\n]*”|"[^"\n]*"/g;
const SUBPROJECTS = new Set(['deadvox', 'engine', 'gungen', 'mobgen']);
const LINE_CITATION = /(?<![\w/@.-])(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9_-]*:\d+(?:-\d+)?/g;
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
const FILE_EXTENSION = /\.(?:[cm]?[jt]sx?|jsonc?|jsonnet|libsonnet|ya?ml|md|css|html|py|sh|lua|mjs)$/;
const CUE_PAIR = /(?<!`)`([^`\s]+)`\s*([,;:—-]?)\s*(?:"((?:\\.|[^"\\])+)"|“([^”]+)”|`([^`]+)`|'([^']+)')/g;
const BARE_SECTION =
  /(?<![\w/@`"'.=?&-])([\w./-]+\.md)(?!`)\s*([,;:—-]?)\s*(?:"((?:\\.|[^"\\])+)"|“([^”]+)”|`([^`]+)`|'([^']+)')/g;
const LINK_SECTION = /\[[^\]]*\]\(([^)]+)\)\s*([,;:]?)\s*(?:"((?:\\.|[^"\\])+)"|“([^”]+)”|`([^`]+)`)/g;
const OTHER_SECTION =
  /(?:`[^`\s]+\.md`|(?<![\w/@`"'.-])[\w./-]+\.md)\s*(?:§\s*\d[\d.]*|(?:section|chapter)\b[^.;\n]*|#\d[\d.]*|[,;:]\s*\d+(?:\.\d+)*\b)/gi;
const SECTION_NUMBER = /§\s*\d+(?:\.\d+)*/g;
const NAME_MARKUP = /`|\*[^*]+\*|(?<!\w)_+[^_]+_+(?!\w)|<[^>]+>|\[[^\]]*\]\([^)]*\)/;
const EXTRA_NAME = /^\s*(?:,\s*(?:and\s+)?|and\s+)(?:"((?:\\.|[^"\\])+)"|“([^”]+)”)/;
const PATH_CHARACTERS = /^[\p{L}\p{M}\p{N}_./-]+$/u;
const LEADING_SECTION_NUMBER = /^(?:§\s*)?\d+(?:\.\d+)*(?:[.)]|\s)\s*/;
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;
const TRAILING_PARENTHETICAL = /\s*\([^()]*\)\s*$/;
const SUBTITLE = /: | — /;
const NUMERIC_NAME = /^\d+(?:\.\d+)*$/;
const QUOTE_ESCAPE = /\\(["\\])/g;
const FRONT_MATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const ATX_HEADING = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;

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

function pathValue(raw, bare = false) {
  let value = raw.trim();
  if (value.startsWith('<') && value.endsWith('>')) {
    value = value.slice(1, -1);
  }
  if (
    !value ||
    PATH_PLACEHOLDER.test(value) ||
    URI_SCHEME.test(value) ||
    value.startsWith('/') ||
    value.startsWith('@')
  ) {
    return;
  }
  const [withoutAnchor] = value.split('#', 1);
  const [withoutQuery] = withoutAnchor.split('?', 1);
  value = withoutQuery.replace(LINE_SUFFIX, '');
  if (!PATH_CHARACTERS.test(value)) {
    return;
  }
  if (
    (value?.includes('/') && PATH_SHAPE.test(value)) ||
    (value && (value.endsWith('.md') || (bare && FILE_EXTENSION.test(value))))
  ) {
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
        found.push({ raw: token, value, kind: 'code' });
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
      found.push({ raw, value, kind: 'link' });
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
  const value = pathValue(rawPath, true);
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
    targetSource = sourceFor(target, tree);
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
    if (pathValue(match[1])?.endsWith('.md')) {
      continue;
    }
    checkSymbolCue({ path, symbol: match[2], rawPath: match[1], tree, failures });
  }
  for (const match of visible.matchAll(SYMBOL_LINK)) {
    if (match[2].includes('#') || match[1] === match[2].split('/').at(-1)) {
      continue;
    }
    checkSymbolCue({ path, symbol: match[1], rawPath: match[2], tree, failures });
  }
}

function sourceFor(target, tree) {
  if (!tree.sources.has(target)) {
    tree.sources.set(target, readFileSync(target, 'utf8'));
  }
  return tree.sources.get(target);
}

const CODE_TICKS = /^`+/;

function plainHeading(text) {
  const literals = [];
  let marker = 'headingLiteral';
  while (text.includes(marker)) {
    marker += 'X';
  }
  const protectedText = text.replace(INLINE_CODE_SPAN, (span) => {
    const width = span.match(CODE_TICKS)[0].length;
    literals.push(span.slice(width, -width));
    return `${marker}${literals.length - 1}${marker}`;
  });
  return protectedText
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*+([^*]+)\*+/g, '$1')
    .replace(/(?<!\w)_+([^_]+)_+(?!\w)/g, '$1')
    .replace(new RegExp(`${marker}(\\d+)${marker}`, 'g'), (_, index) => literals[Number(index)]);
}

function namedAnchor(text) {
  return plainHeading(text)
    .trim()
    .replace(LEADING_SECTION_NUMBER, '')
    .replace(TRAILING_PUNCTUATION, '')
    .split(SUBTITLE, 1)[0]
    .trim()
    .replace(TRAILING_PARENTHETICAL, '')
    .trim()
    .replace(TRAILING_PUNCTUATION, '');
}

export function githubSlug(text) {
  return plainHeading(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '')
    .replace(/ /g, '-');
}

function headingTitles(source) {
  const lines = source.split(NEWLINE);
  const headings = [];
  for (const [index, line] of lines.entries()) {
    const atx = line.match(ATX_HEADING);
    if (atx) {
      headings.push(atx[1]);
    } else if (line.trim() && SETEXT_UNDERLINE.test(lines[index + 1] ?? '')) {
      headings.push(line.trim());
    }
  }
  return headings;
}

function anchorsFor(target, tree) {
  if (!tree.anchors.has(target)) {
    const source = visibleMarkdown(sourceFor(target, tree).replace(FRONT_MATTER_BLOCK, ''));
    const headings = headingTitles(source);
    const labels = [...source.matchAll(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\*\*([^*\n]+)\*\*/gm)].map((match) => match[1]);
    const slugs = new Set();
    for (const heading of headings) {
      const base = githubSlug(heading);
      let slug = base;
      let suffix = 0;
      while (slugs.has(slug)) {
        suffix += 1;
        slug = `${base}-${suffix}`;
      }
      slugs.add(slug);
    }
    tree.anchors.set(target, { names: new Set([...headings, ...labels].map(namedAnchor)), slugs });
  }
  return tree.anchors.get(target);
}

function checkNamedCue({ path, rawPath, name, tree, failures }) {
  const value = pathValue(rawPath, true);
  if (!value) {
    return;
  }
  const target = resolvedCandidates(path, value, tree.root).find((candidate) => pathExists(candidate, value, tree));
  let exists = false;
  if (target) {
    try {
      exists = value.endsWith('.md')
        ? anchorsFor(target, tree).names.has(namedAnchor(name))
        : sourceFor(target, tree).includes(name);
    } catch {
      // Ignored/generated paths can resolve spatially but cannot certify a section without readable content.
    }
  }
  if (!exists) {
    add(failures, path, 'section', `${rawPath}, "${name}"`);
  }
}

function* overlappingMatches(text, pattern) {
  const scanner = new RegExp(pattern.source, pattern.flags);
  for (let match = scanner.exec(text); match; match = scanner.exec(text)) {
    yield match;
    scanner.lastIndex = match.index + 1;
  }
}

function checkExtraNames(remaining, context) {
  let tail = remaining;
  for (let extra = tail.match(EXTRA_NAME); extra; extra = tail.match(EXTRA_NAME)) {
    const name = (extra[1] ?? extra[2]).replace(QUOTE_ESCAPE, '$1');
    if (!NAME_MARKUP.test(name)) {
      add(context.failures, context.path, 'section_form', `${context.rawPath}, "${name}" (implicit path)`);
      checkNamedCue({ ...context, name });
    }
    tail = tail.slice(extra[0].length);
  }
}

function nonSectionName(value, name, backticked) {
  return (
    backticked &&
    (pathValue(name, true) || name.startsWith('/') || (!value.endsWith('.md') && SYMBOL_IDENTIFIER.test(name)))
  );
}

function checkSectionPair(match, bare, context) {
  const [original, rawPath, separator, quoted, curly, backticked, single] = match;
  const value = pathValue(rawPath, true);
  const name = (quoted ?? curly ?? backticked ?? single).replace(QUOTE_ESCAPE, '$1');
  const prefix = bare ? rawPath : `\`${rawPath}\``;
  const possessive = single && !separator && original.startsWith(`${prefix}'`);
  if (!value || possessive || nonSectionName(value, name, backticked)) {
    return;
  }
  if (bare || separator !== ',' || !quoted || NUMERIC_NAME.test(name)) {
    add(context.failures, context.path, 'section_form', original);
  }
  if (NAME_MARKUP.test(name)) {
    return;
  }
  checkNamedCue({ ...context, rawPath, name });
  checkExtraNames(context.visible.slice(match.index + original.length), { ...context, rawPath });
}

function checkSectionLink(raw, { path, tree, failures }) {
  if (!raw || URI_SCHEME.test(raw) || raw.startsWith('/') || !raw.includes('#')) {
    return;
  }
  const [rawPath, fragment] = raw.split('#');
  const value = rawPath ? pathValue(rawPath) : path;
  if (!(fragment && value)) {
    return;
  }
  const target = resolvedCandidates(path, value, tree.root).find((candidate) => pathExists(candidate, value, tree));
  let exists = false;
  try {
    exists = target && value.endsWith('.md') && anchorsFor(target, tree).slugs.has(decodeURIComponent(fragment));
  } catch {
    // An unreadable target or malformed escaped fragment cannot certify an anchor.
  }
  if (!exists) {
    add(failures, path, 'section', raw);
  }
}

function checkSections(context) {
  const { path, visible, failures } = context;
  for (const [pattern, bare] of [
    [CUE_PAIR, false],
    [BARE_SECTION, true],
    [LINK_SECTION, true],
  ]) {
    for (const match of overlappingMatches(visible, pattern)) {
      checkSectionPair(match, bare, context);
    }
  }
  const withoutLinks = visible.replace(LINK, '');
  for (const pattern of [OTHER_SECTION, SECTION_NUMBER]) {
    for (const match of withoutLinks.matchAll(pattern)) {
      add(failures, path, 'section_form', match[0]);
    }
  }
  for (const match of visible.matchAll(LINK)) {
    checkSectionLink(match[1].trim().match(LINK_TARGET)?.[1], context);
  }
}

function joinedCues(text) {
  return text.replace(/\r?\n\s*(?:\/\/|\*|#)?\s*/g, ' ');
}

function checkLineNumbers(path, visible, failures) {
  for (const line of visible.split('\n')) {
    if (line.trimStart().startsWith('>')) {
      continue;
    }
    for (const match of line.matchAll(LINE_CITATION)) {
      if (!(path.endsWith('.md') || FILE_EXTENSION.test(match[0].replace(LINE_SUFFIX, '')))) {
        continue;
      }
      add(failures, path, 'line_number', match[0]);
    }
  }
}

const CITATION_PATTERNS = [
  /\bBR(?:['’]s)?\b(?:(?![.!?])[^\n]){0,40}?\b\d{4}-\d{2}-\d{2}\b/g,
  /\bBR(?:['’]s)?[ ,(]{0,3}(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
  /\b\d{4}-\d{2}-\d{2}(?:\s+(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?[^\n]{0,12}?\bBR\b/g,
  /\((?:BR,|BR\))/g,
  /\bbr-\d+\b/gi,
  /\([^\n)]*\b\d{4}-\d{2}-\d{2}(?:\s+(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?[^\n)]*\)(?:[:*\s]){0,6}[“"]/g,
];

function policyExempt(path) {
  return POLICY_EXEMPT.has(path) || PACKAGE_LOCK.test(path) || path.startsWith('mobgen/reference/');
}

function checkCitations(path, text, markdown, failures) {
  const visible = markdown ? visibleMarkdown(text) : text;
  for (const line of visible.split('\n')) {
    const matches = CITATION_PATTERNS.flatMap((pattern) =>
      [...line.matchAll(pattern)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      })),
    ).sort((a, b) => a.start - b.start || b.end - a.end);
    const distinct = [];
    for (const match of matches) {
      const previous = distinct.at(-1);
      if (previous && match.start < previous.end) {
        if (match.end - match.start > previous.end - previous.start) {
          previous.text = match.text;
          previous.start = match.start;
        }
        previous.end = Math.max(previous.end, match.end);
      } else {
        distinct.push({ ...match });
      }
    }
    for (const match of distinct) {
      add(failures, path, 'citation', match.text);
    }
  }
}

function checkHost(path, text, failures) {
  for (const pattern of [HOST_PATH, RUN_USER_PATH, PRIVATE_IPV4]) {
    for (const match of text.matchAll(pattern)) {
      add(failures, path, 'host', match[0]);
    }
  }
  for (const match of text.matchAll(HOME_SHORTCUT)) {
    if (!HOST_PATH_VALUE_EXEMPTIONS.has(match[2])) {
      add(failures, path, 'host', match[2]);
    }
  }
}

function visibleWhenMarkdown(text) {
  return visibleMarkdown(text)
    .split('\n')
    .map((line) =>
      line.trimStart().startsWith('>') ? '' : line.replace(INLINE_CODE_SPAN, '').replace(QUOTED_TEXT, ''),
    )
    .join('\n');
}

function checkWhen(path, text, failures) {
  for (const match of visibleWhenMarkdown(text).matchAll(/\b(?:today|currently)\b/gi)) {
    add(failures, path, 'when', match[0].toLowerCase());
  }
}

export function checkPolicyRules({ path, text }) {
  const failures = new Map();
  if (policyExempt(path)) {
    return [];
  }
  if (HISTORICAL_DOC.test(path)) {
    add(failures, path, 'historical_doc', 'reviews and retros belong in git history, not tracked files');
    return [...failures.values()];
  }
  const markdown = path.endsWith('.md');
  checkCitations(path, text, markdown, failures);
  checkHost(path, text, failures);
  if (markdown) {
    checkWhen(path, text, failures);
  }
  return [...failures.values()];
}

function checkPaths({ path, visible, tree, failures }) {
  for (const candidate of pathCandidates(visible)) {
    const targets = resolvedCandidates(path, candidate.value, tree.root);
    const target = targets.find((item) => pathExists(item, candidate.value, tree));
    if (!target) {
      add(failures, path, 'path', candidate.raw);
    } else if (candidate.kind === 'code') {
      const [sourceProject] = path.split('/');
      const [targetProject] = relative(tree.root, target).split(sep);
      const crossProject =
        SUBPROJECTS.has(sourceProject) && SUBPROJECTS.has(targetProject) && sourceProject !== targetProject;
      if (crossProject && !candidate.value.startsWith(`${targetProject}/`)) {
        add(failures, path, 'path_scope', candidate.raw);
      }
    }
  }
  checkSymbols({ path, visible, tree, failures });
}

export function checkDocument({
  path,
  text,
  root = ROOT,
  tracked,
  ignored = new Set(),
  pythonReadIf = new Map(),
  sources = new Map(),
  anchors = new Map(),
}) {
  const failures = new Map();
  if (path.startsWith('mobgen/reference/')) {
    return [];
  }
  if (path.endsWith('.md') && !ISSUE_TEMPLATE.test(path)) {
    const reasons = readIfReasons(path, text, failures);
    if (reasons) {
      checkReadIfParity(path, reasons, pythonReadIf, failures);
    }
  }
  if (!tracked) {
    throw new Error('tracked file set is required for path checks');
  }
  const owner = resolve(root, path);
  if (sources.get(owner) !== text) {
    sources.set(owner, text);
    anchors.delete(owner);
  }
  const tree = { root, tracked, ignored, sources, anchors };
  checkLineNumbers(path, path.endsWith('.md') ? visibleMarkdown(text) : text, failures);
  const visible = joinedCues(text);
  checkPaths({ path, visible, tree, failures });
  checkSections({ path, visible, tree, failures });
  return [...failures.values()];
}

function trackedTextFiles() {
  return exec('git', ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter((path) => {
      const bytes = readFileSync(resolve(ROOT, path));
      return !bytes.subarray(0, 8192).includes(0);
    });
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
  const sources = new Map([...docTexts].map(([path, text]) => [resolve(ROOT, path), text]));
  const anchors = new Map();
  const candidates = [...docTexts].map(([path, text]) =>
    pathCandidates(joinedCues(text)).flatMap(({ value }) =>
      resolvedCandidates(path, value, ROOT).map(
        (candidate) => `${relative(ROOT, candidate)}${value.endsWith('/') ? '/' : ''}`,
      ),
    ),
  );
  const ignored = ignoredPaths(candidates);
  const pythonReadIf = parsePythonReadIf(exec('python3', ['tools/read_if.py']));
  const failures = new Map();
  const mergeFailure = (failure) => {
    const key = JSON.stringify([failure.path, failure.check, failure.text]);
    const previous = failures.get(key);
    failures.set(key, { ...failure, count: (previous?.count ?? 0) + failure.count });
  };
  for (const [path, text] of docTexts) {
    for (const failure of checkDocument({ path, text, tracked, ignored, pythonReadIf, sources, anchors })) {
      mergeFailure(failure);
    }
    for (const failure of checkPolicyRules({ path, text })) {
      mergeFailure(failure);
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
  return [...SUBPROJECTS].find((name) => path.startsWith(`${name}/`)) ?? 'root';
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

export function comparePolicy(observed, baseline) {
  return {
    strictFailures: observed.filter(({ check }) => STRICT_CHECKS.has(check)),
    strictBaselineRows: baseline.filter(({ check }) => STRICT_CHECKS.has(check)),
    differences: failureDifferences(ratcheted(observed), ratcheted(baseline)),
  };
}

function baselineText(violations) {
  const rows = violations.map((violation) => `    ${JSON.stringify(violation)}`).join(',\n');
  return `{\n  "version": 1,\n  "violations": [\n${rows}\n  ]\n}\n`;
}

function ratcheted(failures) {
  return failures.filter(({ check }) => !STRICT_CHECKS.has(check));
}

const FAILURE_HINTS = new Map([
  ['citation', 'state the rule in plain words and put the quote and stamp in the commit message'],
  ['when', 'name the trigger (item ID or issue) or drop the word'],
  ['host', 'use a repo-relative path, $XDG_RUNTIME_DIR or the host notes'],
  ['historical_doc', 'delete the review or retrospective file and keep only live reasons in current docs'],
  ['read_if', 'add a non-empty read_if list'],
  ['read_if_parity', 'make YAML read_if agree with python3 tools/read_if.py'],
  ['line_number', 'cite the code by path and symbol, not line number'],
  ['path', 'use a valid repo-relative code cue'],
  ['path_scope', 'use a repo-root path when citing another subproject'],
  ['symbol', 'use a symbol present in the cited source'],
  ['section', 'use a current heading, bold lead-in label, link anchor or verbatim name in the cited file'],
  ['section_form', 'use a backticked path, comma and double-quoted name; repeat the path for each section'],
]);

function failureHint(item) {
  if (item.kind === 'stale') {
    return 'run npm run baseline:zero-drift after fixing the cited text';
  }
  return FAILURE_HINTS.get(item.check) ?? 'fix the reported zero-drift violation';
}

function printFailures(items) {
  for (const item of items) {
    const kind = item.kind ?? 'strict';
    process.stderr.write(
      `${kind} ${item.check} ${item.path}: ${JSON.stringify(item.text)} (${item.count}) — fix: ${failureHint(item)}\n`,
    );
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const observed = observedFailures(trackedTextFiles());
  const strictFailures = observed.filter(({ check }) => STRICT_CHECKS.has(check));
  const ratchetedFailures = ratcheted(observed);
  if (args.has('--report')) {
    printStats(observed);
    return;
  }
  if (args.has('--emit-baseline')) {
    process.stdout.write(baselineText(ratchetedFailures));
    if (strictFailures.length > 0) {
      printFailures(strictFailures);
      process.exitCode = 1;
    }
    return;
  }
  if (args.has('--write-baseline')) {
    const formatted = exec('npx', ['biome', 'format', '--stdin-file-path', BASELINE_PATH], {
      input: baselineText(ratchetedFailures),
    });
    writeFileSync(resolve(ROOT, BASELINE_PATH), formatted);
    process.stdout.write(`Wrote ${BASELINE_PATH} (${ratchetedFailures.length} ratcheted rows).\n`);
    if (strictFailures.length > 0) {
      printFailures(strictFailures);
      process.exitCode = 1;
    }
    return;
  }
  const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE_PATH), 'utf8'));
  if (baseline.version !== 1 || !Array.isArray(baseline.violations)) {
    throw new Error(`${BASELINE_PATH} must have version 1 and a violations array`);
  }
  const {
    strictBaselineRows,
    strictFailures: policyStrictFailures,
    differences,
  } = comparePolicy(observed, baseline.violations);
  if (strictBaselineRows.length > 0) {
    throw new Error(
      `${BASELINE_PATH} contains strict check rows: ${strictBaselineRows.map(({ check }) => check).join(', ')}; regenerate after fixing the strict violations`,
    );
  }
  const failures = [...policyStrictFailures.map((item) => ({ ...item, kind: 'strict' })), ...differences];
  if (failures.length > 0) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Zero-drift check passed (${ratchetedFailures.reduce((sum, item) => sum + item.count, 0)} ratcheted violations).\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
