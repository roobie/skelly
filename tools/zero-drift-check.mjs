// biome-ignore-all lint/correctness/noNodejsModules: This command-line checker runs only under Node.js.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { parse } from 'yaml';
import { compareCodeUnits } from '../packages/engine/src/core/codeUnitOrder.ts';

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
const STRICT_CHECKS = new Set(['host', 'historical_doc', 'section_form', 'private_term']);
const PRIVATE_IPV4 =
  /(?<![\d.])(?:10(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2}|192\.168(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){2})(?![\d.])/g;
const HOST_PATH = /\/(?:home|Users|tmp)\/[A-Za-z0-9_.$-][A-Za-z0-9_./$-]*/g;
const RUN_USER_PATH = /\/run\/user\/\d+[A-Za-z0-9_./$-]*/g;
const HOME_SHORTCUT = /(^|[\s"'`(=])(~\/[A-Za-z0-9_.$-][A-Za-z0-9_./$-]*)/gm;
const HOST_PATH_VALUE_EXEMPTIONS = new Set(['~/.cache/ms-playwright']);
const QUOTED_TEXT = /“[^”\n]*”|"[^"\n]*"/g;

/**
 * @typedef {{ path: string, check: string, text: string, count: number }} Failure
 * @typedef {Failure & { kind: 'new' | 'stale' }} Difference
 * @typedef {Failure & { kind?: Difference['kind'] | 'strict' }} ReportedFailure
 * @typedef {Map<string, Failure>} Failures
 * @typedef {{ files: Set<string>, read: (file: string) => string }} PinnedSubmodule
 * @typedef {Map<string, PinnedSubmodule>} PinnedSubmodules
 */

/**
 * The mdast fields the checker reads. Restored positions carry offsets only.
 * @typedef {{ offset?: number | undefined }} OffsetPoint
 * @typedef {{ start: OffsetPoint, end: OffsetPoint }} OffsetPosition
 * @typedef {object} MarkdownNode
 * @property {string} type
 * @property {string} [value]
 * @property {string | null | undefined} [alt]
 * @property {string} [url]
 * @property {string} [identifier]
 * @property {MarkdownNode[]} [children]
 * @property {OffsetPosition | undefined} [position]
 * @typedef {MarkdownNode & { children: MarkdownNode[] }} MarkdownRoot
 */

/**
 * A cue-scanner token: a Markdown node, or a name or bare path split out of a text node.
 * @typedef {MarkdownNode & { quoted?: boolean, single?: boolean, markup?: boolean, spelling?: string }} CueToken
 * @typedef {{ url: string, children: MarkdownNode[] }} MarkdownLink
 * @typedef {{ names: Set<string>, slugs: Set<string> }} Anchors
 * @typedef {{ raw: string, value: string, kind: 'code' | 'link' }} PathCandidate
 */

/**
 * @typedef {object} SourceTree
 * @property {string} root
 * @property {Set<string>} tracked
 * @property {Set<string>} ignored
 * @property {PinnedSubmodules} pinned
 * @property {Map<string, string>} sources
 * @property {Map<string, Anchors>} anchors
 * @property {Map<string, MarkdownRoot>} markdown
 * @typedef {{ path: string, visible: string, markdown: MarkdownRoot | undefined, tree: SourceTree, failures: Failures }} CheckContext
 * @typedef {CheckContext & { rawPath: string }} CueContext
 */

// A subproject is a package, `packages/<name>`, so its root is the path's first two segments.
/** @param {string} path */
function projectOf(path) {
  const [first, second] = path.split('/');
  return first === 'packages' && second ? `packages/${second}` : undefined;
}
const LINE_CITATION = /(?<![\w/@.-])(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9_-]*:\d+(?:-\d+)?/g;
const INLINE_CODE = /(?<!`)`([^`\n]+)`(?!`)/g;
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;
const SYMBOL_PAIR = /`([^`\n]+)`, `([^`\n]+)`/g;
const SYMBOL_PAIR_SEPARATOR = /^\s*,\s*$/;
const SYMBOL_LINK = /\[`([^`\n]+)`\]\(([^)]+)\)/g;
const SYMBOL_IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const NEWLINE = /\r?\n/;
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
const EXTRA_NAME = /^\s*(?:,\s*(?:and\s+)?|and\s+)(?:"((?:\\.|[^"\\])+)"|“([^”]+)”|`([^`]+)`)/;
const EXTRA_CANONICAL_NAME = /^\s*,\s*(?:"[^"\n]+"|“[^”\n]+”)/;
const BACKTICKED_IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*:?$/;
const PATH_CHARACTERS = /^[\p{L}\p{M}\p{N}_./-]+$/u;
const LEADING_SECTION_NUMBER = /^(?:§\s*)?\d+(?:\.\d+)*(?:[.)]|\s)\s*/;
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;
const TRAILING_PARENTHETICAL = /\s*\([^()]*\)\s*$/;
const SUBTITLE = /: | — /;
const NUMERIC_NAME = /^\d+(?:\.\d+)*$/;
const QUOTE_ESCAPE = /\\(["\\])/g;

/** @typedef {Omit<import('node:child_process').ExecFileSyncOptions, 'encoding'>} TextExecOptions */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {TextExecOptions} [options]
 */
const exec = (command, args, options = {}) => execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });

const GITLINK = /^160000 ([0-9a-f]+) \d\t(.+)$/;

// A hook exports the pushing repository's GIT_DIR, which would otherwise redirect commands meant for a submodule.
/**
 * @param {string} dir
 * @param {string[]} args
 * @param {TextExecOptions} [options]
 */
function unboundGit(dir, args, options = {}) {
  // biome-ignore lint/style/noProcessEnv: the child keeps caller settings except Git's local repository bindings.
  const env = { ...process.env };
  for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n')) {
    delete env[name];
  }
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 28, ...options });
}

/** @returns {PinnedSubmodules} */
export function pinnedSubmodules(root = ROOT) {
  /** @type {PinnedSubmodules} */
  const pinned = new Map();
  for (const line of unboundGit(root, ['ls-files', '--stage', '-z']).split('\0')) {
    const match = line.match(GITLINK);
    if (!match) {
      continue;
    }
    const [, commit, path] = /** @type {[string, string, string]} */ (match);
    const dir = resolve(root, path);
    let files;
    try {
      // An uninitialized submodule directory would otherwise resolve to the superproject.
      if (resolve(unboundGit(dir, ['rev-parse', '--show-toplevel'], { stdio: 'pipe' }).trim()) !== dir) {
        throw new Error('not a checkout');
      }
      files = new Set(
        unboundGit(dir, ['ls-tree', '-r', '-z', '--name-only', commit], { stdio: 'pipe' }).split('\0').filter(Boolean),
      );
    } catch (cause) {
      throw new Error(
        `zero-drift: cannot read submodule ${path} at its pinned commit ${commit}; run git submodule update --init ${path}`,
        { cause },
      );
    }
    pinned.set(path, {
      files,
      read: (file) => unboundGit(dir, ['cat-file', 'blob', `${commit}:${file}`]),
    });
  }
  return pinned;
}

/**
 * @param {string} rel
 * @param {Pick<SourceTree, 'pinned'>} tree
 */
function pinnedEntry(rel, tree) {
  const owner = [...tree.pinned].find(([root]) => rel.startsWith(`${root}/`));
  if (!owner) {
    return;
  }
  const [path, submodule] = owner;
  return { submodule, file: rel.slice(path.length + 1) };
}

/** @param {string} output */
export function parsePythonReadIf(output) {
  /** @type {Map<string, string[]>} */
  const docs = new Map();
  /** @type {string[] | undefined} */
  let current;
  for (const line of output.split(NEWLINE)) {
    if (line.startsWith('  - ')) {
      current?.push(line.slice(4));
    } else if (line) {
      current = [];
      docs.set(line, current);
    }
  }
  return docs;
}

const MARKDOWN_OPTIONS = {
  extensions: [gfm(), frontmatter(['yaml'])],
  mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
};

/**
 * @param {string} source
 * @returns {MarkdownRoot}
 */
function parseMarkdown(source) {
  const markdown = fromMarkdown(source, MARKDOWN_OPTIONS);
  restoreMarkdownPositions(markdown, source);
  return markdown;
}

/**
 * @param {MarkdownNode} node
 * @param {(node: MarkdownNode) => void} visit
 */
function walkMarkdown(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walkMarkdown(child, visit);
  }
}

/** @param {MarkdownNode} node */
function isHtmlComment(node) {
  return node.type === 'html' && (node.value ?? '').trimStart().startsWith('<!--');
}

/**
 * @param {MarkdownNode} node
 * @returns {string}
 */
function renderedText(node) {
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value ?? '';
  }
  if (node.type === 'image') {
    return node.alt ?? '';
  }
  if (node.type === 'html' || node.type === 'yaml' || node.type === 'code') {
    return '';
  }
  if (node.type === 'break') {
    return '\n';
  }
  return (node.children ?? []).map(renderedText).join('');
}

/** @param {MarkdownNode} node */
function offsetRange(node) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/**
 * @param {number} start
 * @param {number} end
 */
function position(start, end) {
  return { start: { offset: start }, end: { offset: end } };
}

/**
 * @param {MarkdownNode} child
 * @param {{ nextLink: MarkdownNode | undefined, cursor: number, end: number, source: string }} run
 */
function recoveredPosition(child, { nextLink, cursor, end, source }) {
  const start = child.type === 'text' ? cursor : source.indexOf(renderedText(child), cursor);
  let finish = start + renderedText(child).length;
  if (child.type === 'text') {
    finish = nextLink ? source.indexOf(renderedText(nextLink), cursor) : end;
  }
  return start < cursor || start > end || finish < cursor || finish > end ? undefined : position(start, finish);
}

/**
 * @param {MarkdownNode[]} run
 * @param {number} start
 * @param {number} end
 */
function restoreRunPosition(run, start, end) {
  for (const child of run) {
    child.position = position(start, end);
  }
}

/**
 * @param {MarkdownNode[]} children
 * @param {number} first
 * @param {MarkdownNode} parent
 * @param {string} source
 */
function restoreMissingPositionRun(children, first, parent, source) {
  const endIndex = children.findIndex((child, index) => index > first && child.position);
  const run = children.slice(first, endIndex === -1 ? undefined : endIndex);
  const { position: previousPosition } = children[first - 1] ?? {};
  const end = children[endIndex]?.position?.start.offset ?? parent.position?.end.offset;
  let cursor = previousPosition?.end.offset ?? parent.position?.start.offset;
  if (cursor === undefined || end === undefined) {
    return;
  }
  for (const [index, child] of run.entries()) {
    const nextLink = run.slice(index + 1).find((sibling) => sibling.type === 'link');
    const recovered = recoveredPosition(child, { nextLink, cursor, end, source });
    if (!recovered) {
      restoreRunPosition(run.slice(index), cursor, end);
      return;
    }
    child.position = recovered;
    cursor = recovered.end.offset;
  }
}

/**
 * @param {MarkdownNode} node
 * @param {string} source
 */
function restoreMarkdownPositions(node, source) {
  const children = node.children ?? [];
  for (const [index, child] of children.entries()) {
    if (!child.position && (index === 0 || children[index - 1]?.position)) {
      restoreMissingPositionRun(children, index, node, source);
    }
    if (child.position) {
      restoreMarkdownPositions(child, source);
    }
  }
}

/** @typedef {{ skipBlockquotes?: boolean, skipInlineCode?: boolean }} TextOptions */

/**
 * @param {MarkdownNode} node
 * @param {TextOptions} [options]
 * @returns {string}
 */
function markdownText(node, { skipBlockquotes = false, skipInlineCode = false } = {}) {
  if (
    node.type === 'yaml' ||
    node.type === 'code' ||
    isHtmlComment(node) ||
    (skipBlockquotes && node.type === 'blockquote') ||
    (skipInlineCode && node.type === 'inlineCode')
  ) {
    return '';
  }
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'html') {
    return node.value ?? '';
  }
  if (node.type === 'break') {
    return '\n';
  }
  const children = (node.children ?? []).map((child) => markdownText(child, { skipBlockquotes, skipInlineCode }));
  if (node.type === 'tableRow') {
    return children.join(' | ');
  }
  if (['root', 'blockquote', 'list', 'listItem', 'table', 'footnoteDefinition'].includes(node.type)) {
    return children.join('\n');
  }
  return children.join('');
}

/**
 * @param {MarkdownNode} node
 * @returns {Generator<MarkdownNode[]>}
 */
function* markdownCueRuns(node) {
  if (node.type === 'code' || node.type === 'yaml' || isHtmlComment(node)) {
    return;
  }
  if (['paragraph', 'heading', 'tableCell'].includes(node.type)) {
    yield node.children ?? [];
  }
  if (['strong', 'emphasis', 'delete', 'link', 'linkReference'].includes(node.type)) {
    yield node.children ?? [];
  }
  for (const child of node.children ?? []) {
    yield* markdownCueRuns(child);
  }
}

/**
 * @param {MarkdownNode} markdown
 * @returns {Generator<[undefined, string, string]>}
 */
function* markdownSymbolPairs(markdown) {
  for (const nodes of markdownCueRuns(markdown)) {
    for (let index = 0; index < nodes.length; index++) {
      const first = nodes[index];
      const separator = nodes[index + 1];
      const second = nodes[index + 2];
      if (
        first?.type === 'inlineCode' &&
        separator?.type === 'text' &&
        SYMBOL_PAIR_SEPARATOR.test(nodeValue(separator)) &&
        second?.type === 'inlineCode'
      ) {
        yield [undefined, nodeValue(first), nodeValue(second)];
      }
    }
  }
}

const TEXT_CUE_TOKEN = /"((?:\\.|[^"\\])+)"|“([^”]+)”|(?<!\w)'([^']+)'(?!\w)|(?<![\w/@`"'.=?&-])([\w./-]+\.md)(?!`)/g;
const CUE_SEPARATOR = /^\s*([,;:—-]?)\s*$/;
const EXTRA_SEPARATOR = /^\s*(?:,\s*(?:and\s+)?|and\s+)$/;
const TEXT_OTHER_SECTION =
  /(?<![\w/@`"'.-])[\w./-]+\.md\s*(?:§\s*\d[\d.]*|(?:section|chapter)\b[^.;\n]*|#\d[\d.]*|[,;:]\s*\d+(?:\.\d+)*\b)/gi;

const ESCAPED_QUOTE = /\\["\\]/;
const COMMA_PREFIX = /^\s*,/;

/**
 * @param {MarkdownNode[]} nodes
 * @param {string} source
 * @returns {CueToken[]}
 */
function cueTokens(nodes, source) {
  return nodes.flatMap((node) => (node.type === 'text' ? textCueTokens(node, source) : [node]));
}

/**
 * @param {MarkdownNode} node
 * @param {string} source
 */
function textCueTokens(node, source) {
  /** @type {CueToken[]} */
  const tokens = [];
  // Preserve escaped quotes within a text node: their decoded value loses the name's closing boundary.
  const range = offsetRange(node);
  const raw = range ? source.slice(range.start, range.end) : '';
  const text = ESCAPED_QUOTE.test(raw) ? raw : (node.value ?? '');
  let offset = 0;
  for (const match of text.matchAll(TEXT_CUE_TOKEN)) {
    if (match.index > offset) {
      tokens.push({ type: 'text', value: text.slice(offset, match.index) });
    }
    tokens.push(
      match[4] === undefined
        ? {
            type: 'name',
            value: (match[1] ?? match[2] ?? match[3] ?? '').replace(QUOTE_ESCAPE, '$1'),
            quoted: match[1] !== undefined,
            single: match[3] !== undefined,
            spelling: match[0],
          }
        : { type: 'bare', value: match[4] },
    );
    offset = match.index + match[0].length;
  }
  if (offset < text.length) {
    tokens.push({ type: 'text', value: text.slice(offset) });
  }
  return tokens;
}

/** @param {MarkdownNode} node */
const nodeValue = (node) => node.value ?? '';

/**
 * @param {CueToken[]} tokens
 * @param {number} index
 */
const textTokenValue = (tokens, index) => {
  const token = tokens[index];
  return token?.type === 'text' ? nodeValue(token) : undefined;
};

/** @param {CueToken | undefined} token */
function cueName(token) {
  return token && ['name', 'inlineCode'].includes(token.type) ? token : undefined;
}

/**
 * @param {CueToken[]} tokens
 * @param {number} index
 * @param {string | undefined} target
 */
function nextExplicitCueLength(tokens, index, target) {
  const following = cueName(tokens[index + 1]);
  const separator = textTokenValue(tokens, index) ?? '';
  if (!(EXTRA_SEPARATOR.test(separator) && following)) {
    return 0;
  }
  const named = following.type === 'name' && following.quoted && COMMA_PREFIX.test(separator);
  const symbol =
    target &&
    !target.endsWith('.md') &&
    following.type === 'inlineCode' &&
    BACKTICKED_IDENTIFIER.test(nodeValue(following));
  return named || symbol ? 2 : 0;
}

/**
 * @param {CueToken[]} tokens
 * @param {number} index
 * @param {CueToken} name
 * @param {string} rawPath
 */
function skippedMarkdownExtra(tokens, index, name, rawPath) {
  if (name.type !== 'inlineCode') {
    return 0;
  }
  const value = nodeValue(name);
  const target = pathValue(value, true);
  if (target || value.startsWith('/')) {
    return 2 + nextExplicitCueLength(tokens, index + 2, target);
  }
  return !pathValue(rawPath, true)?.endsWith('.md') && BACKTICKED_IDENTIFIER.test(value) ? 2 : 0;
}

/**
 * @param {CueToken[]} tokens
 * @param {number} start
 * @param {CueContext} context
 */
function checkMarkdownExtraNames(tokens, start, context) {
  let index = start;
  while (EXTRA_SEPARATOR.test(textTokenValue(tokens, index) ?? '')) {
    const name = cueName(tokens[index + 1]);
    if (!name) {
      return;
    }
    const skip = skippedMarkdownExtra(tokens, index, name, context.rawPath);
    index += skip || 2;
    if (skip) {
      continue;
    }
    const value = nodeValue(name);
    if (!NAME_MARKUP.test(value)) {
      add(context.failures, context.path, 'section_form', `${context.rawPath}, "${value}" (implicit path)`);
      checkNamedCue({ ...context, name: value });
    }
  }
}

const OPEN_FORMATTED_NAME = /^(\s*[,;:—-]?\s*)(["“])([^"”]*)$/;

const FORMATTED_NAME_PARTS = ['strong', 'emphasis', 'delete', 'inlineCode', 'link', 'linkReference', 'html', 'text'];
/** @param {CueToken} token */
const tokenText = (token) => (token.type === 'name' ? token.spelling : token.value) ?? '';

/**
 * @param {CueToken[]} tokens
 * @param {number} index
 * @returns {{ gap: string, nameIndex: number, name: CueToken } | undefined}
 */
function formattedNameAt(tokens, index) {
  const opening = textTokenValue(tokens, index)?.match(OPEN_FORMATTED_NAME);
  if (!opening) {
    return;
  }
  const close = opening[2] === '“' ? '”' : '"';
  /** @param {CueToken} token */
  const closes = (token) => ['text', 'name'].includes(token.type) && tokenText(token).includes(close);
  let value = opening[3] ?? '';
  let end = index + 1;
  let closing = tokens[end];
  while (closing && !closes(closing)) {
    if (!FORMATTED_NAME_PARTS.includes(closing.type)) {
      return;
    }
    value += renderedText(closing);
    end += 1;
    closing = tokens[end];
  }
  if (!closing) {
    return;
  }
  const text = tokenText(closing);
  value += text.slice(0, text.indexOf(close));
  return {
    gap: opening[1] ?? '',
    nameIndex: end,
    name: {
      type: 'name',
      value,
      quoted: opening[2] === '"',
      markup: true,
      spelling: `${opening[2]}${value}${close}`,
    },
  };
}

/**
 * @param {CueToken[]} tokens
 * @param {number} index
 * @param {MarkdownLink[]} links
 */
function markdownPairAt(tokens, index, links) {
  const target = tokens[index];
  if (!(target && ['inlineCode', 'bare', 'link', 'linkReference'].includes(target.type))) {
    return;
  }
  const rawPath =
    target.type === 'linkReference'
      ? links.find((link) => link.children === target.children)?.url
      : (target.url ?? target.value);
  const value = rawPath && pathValue(rawPath, true);
  if (!value) {
    return;
  }
  const formatted = formattedNameAt(tokens, index + 1);
  const gap = formatted?.gap ?? textTokenValue(tokens, index + 1) ?? '';
  const separator = gap.match(CUE_SEPARATOR);
  const nameIndex = formatted?.nameIndex ?? index + (gap ? 2 : 1);
  const name = formatted?.name ?? cueName(tokens[nameIndex]);
  if (
    !(separator && name) ||
    (name.single && !gap) ||
    nonSectionName(value, nodeValue(name), name.type === 'inlineCode')
  ) {
    return;
  }
  return { target, rawPath, gap, separator: separator[1], name, nameIndex };
}

/**
 * @param {NonNullable<ReturnType<typeof markdownPairAt>>} pair
 * @param {CueToken[]} tokens
 * @param {CheckContext} context
 */
function checkMarkdownPair(pair, tokens, context) {
  const { target, rawPath, gap, separator, name, nameIndex } = pair;
  const value = nodeValue(name);
  const prefix = target.type === 'inlineCode' ? `\`${rawPath}\`` : rawPath;
  const spelling = name.type === 'inlineCode' ? `\`${value}\`` : name.spelling;
  if (target.type !== 'inlineCode' || separator !== ',' || !name.quoted || NUMERIC_NAME.test(value)) {
    add(context.failures, context.path, 'section_form', `${prefix}${gap}${spelling}`);
  }
  if (!(name.markup || NAME_MARKUP.test(value))) {
    checkNamedCue({ ...context, rawPath, name: value });
    checkMarkdownExtraNames(tokens, nameIndex + 1, { ...context, rawPath });
  }
}

/**
 * @param {MarkdownNode} node
 * @returns {string}
 */
function markdownTextFormText(node) {
  if (node.type === 'text') {
    return nodeValue(node);
  }
  if (node.type === 'break') {
    return '\n';
  }
  if (node.type === 'inlineCode' || isHtmlComment(node)) {
    return '';
  }
  return (node.children ?? []).map(markdownTextFormText).join('');
}

/**
 * @param {MarkdownNode[]} nodes
 * @param {CheckContext} context
 */
function checkMarkdownTextForms(nodes, { path, failures }) {
  for (const node of nodes) {
    if (node.type !== 'text') {
      continue;
    }
    for (const pattern of [QUOTED_PATH_SECTION, SECTION_NUMBER]) {
      for (const match of nodeValue(node).matchAll(pattern)) {
        add(failures, path, 'section_form', match[0]);
      }
    }
  }
}

/**
 * @param {MarkdownNode} node
 * @returns {Generator<MarkdownNode[]>}
 */
function* markdownTextFormRuns(node) {
  if (
    node.type === 'yaml' ||
    node.type === 'code' ||
    node.type === 'inlineCode' ||
    node.type === 'link' ||
    node.type === 'linkReference' ||
    isHtmlComment(node)
  ) {
    return;
  }
  if (['paragraph', 'heading', 'tableCell'].includes(node.type)) {
    yield node.children ?? [];
  }
  for (const child of node.children ?? []) {
    yield* markdownTextFormRuns(child);
  }
}

/**
 * @param {MarkdownNode} markdown
 * @param {CheckContext} context
 */
function checkMarkdownOtherSections(markdown, { path, failures }) {
  for (const nodes of markdownTextFormRuns(markdown)) {
    const text = nodes.map(markdownTextFormText).join('');
    for (const match of text.matchAll(TEXT_OTHER_SECTION)) {
      add(failures, path, 'section_form', match[0]);
    }
  }
}

/** @param {CheckContext & { markdown: MarkdownRoot }} context */
function checkMarkdownSections(context) {
  const { markdown, tree, path } = context;
  const source = sourceFor(resolve(tree.root, path), tree);
  const links = markdownLinks(markdown);
  for (const nodes of markdownCueRuns(markdown)) {
    checkMarkdownTextForms(nodes, context);
    const tokens = cueTokens(nodes, source);
    for (let index = 0; index < tokens.length; index++) {
      const pair = markdownPairAt(tokens, index, links);
      if (pair) {
        checkMarkdownPair(pair, tokens, context);
      }
    }
  }
  checkMarkdownOtherSections(markdown, context);
  for (const link of links) {
    checkSectionLink(link.url, context);
  }
}

/** @param {MarkdownNode} tree */
function markdownLinks(tree) {
  /** @type {Map<string | undefined, MarkdownNode>} */
  const definitions = new Map();
  walkMarkdown(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
  });

  /** @type {MarkdownLink[]} */
  const links = [];
  walkMarkdown(tree, (node) => {
    if (node.type === 'link') {
      links.push({ url: node.url ?? '', children: node.children ?? [] });
    } else if (node.type === 'linkReference') {
      const definition = definitions.get(node.identifier);
      if (definition) {
        links.push({ url: definition.url ?? '', children: node.children ?? [] });
      }
    }
  });
  return links;
}

/** @param {MarkdownNode} tree */
function markdownCodeSpans(tree) {
  /** @type {string[]} */
  const spans = [];
  walkMarkdown(tree, (node) => {
    if (node.type === 'inlineCode') {
      spans.push(nodeValue(node));
    }
  });
  return spans;
}

/**
 * @param {string} source
 * @param {MarkdownNode} tree
 * @param {TextOptions} [options]
 */
function markdownSourceText(source, tree, { skipBlockquotes = false, skipInlineCode = false } = {}) {
  /** @type {{ start: number, end: number }[]} */
  const excluded = [];
  /** @param {MarkdownNode} node */
  const visit = (node) => {
    const hidden =
      node.type === 'yaml' ||
      node.type === 'code' ||
      isHtmlComment(node) ||
      (skipBlockquotes && node.type === 'blockquote') ||
      (skipInlineCode && node.type === 'inlineCode');
    if (hidden) {
      const range = offsetRange(node);
      if (range) {
        excluded.push(range);
      }
      return;
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(tree);
  excluded.sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {string[]} */
  const visible = [];
  let offset = 0;
  for (const range of excluded) {
    if (range.start < offset) {
      continue;
    }
    visible.push(source.slice(offset, range.start));
    offset = range.end;
  }
  visible.push(source.slice(offset));
  return visible.join('');
}

/** @param {string} text */
function inlineMarkdownText(text) {
  return parseMarkdown(text).children.map(renderedText).join('\n');
}
/**
 * @param {Failures} failures
 * @param {string} path
 * @param {string} check
 * @param {string} text
 */
function add(failures, path, check, text) {
  const key = JSON.stringify([path, check, text]);
  const previous = failures.get(key);
  failures.set(key, { path, check, text, count: (previous?.count ?? 0) + 1 });
}

/**
 * @param {unknown} reasons
 * @returns {reasons is string[]}
 */
function validReadIf(reasons) {
  return (
    Array.isArray(reasons) &&
    reasons.length > 0 &&
    reasons.every((reason) => typeof reason === 'string' && reason.trim())
  );
}

/**
 * @param {string} path
 * @param {MarkdownRoot} markdown
 * @param {Failures} failures
 */
function readIfReasons(path, markdown, failures) {
  const metadata = markdown.children.find((node) => node.type === 'yaml')?.value;
  if (metadata === undefined) {
    add(failures, path, 'read_if', 'missing YAML front matter');
    return;
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = parse(metadata);
  } catch {
    add(failures, path, 'read_if', 'invalid YAML front matter');
    return;
  }
  const reasons = parsed && typeof parsed === 'object' && 'read_if' in parsed ? parsed.read_if : undefined;
  if (!validReadIf(reasons)) {
    add(failures, path, 'read_if', 'read_if must be a non-empty list of non-empty strings');
    return;
  }
  return reasons;
}

/**
 * @param {string} path
 * @param {string[]} reasons
 * @param {Map<string, string[]>} pythonReadIf
 * @param {Failures} failures
 */
function checkReadIfParity(path, reasons, pythonReadIf, failures) {
  const pythonReasons = pythonReadIf.get(path);
  if (!pythonReasons || JSON.stringify(reasons) !== JSON.stringify(pythonReasons)) {
    add(failures, path, 'read_if_parity', 'YAML read_if differs from python3 tools/read_if.py');
  }
}

/** @param {string} raw */
function linkDestination(raw) {
  const destination = raw.trim().match(LINK_TARGET)?.[1];
  return destination?.startsWith('<') && destination.endsWith('>') ? destination.slice(1, -1) : destination;
}

/**
 * @param {string} raw
 * @returns {string | undefined}
 */
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
  const [withoutAnchor = ''] = value.split('#', 1);
  const [withoutQuery = ''] = withoutAnchor.split('?', 1);
  value = withoutQuery.replace(LINE_SUFFIX, '');
  if (!PATH_CHARACTERS.test(value)) {
    return;
  }
  const pathShaped =
    (value.includes('/') && PATH_SHAPE.test(value)) || value.endsWith('.md') || (bare && FILE_EXTENSION.test(value));
  return pathShaped ? value : undefined;
}

/**
 * @param {string} root
 * @param {string} candidate
 */
function isInsideRepo(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * @param {string} visible
 * @param {MarkdownRoot | undefined} markdown
 */
function pathCandidates(visible, markdown) {
  /** @type {PathCandidate[]} */
  const found = [];
  const codeValues = markdown
    ? markdownCodeSpans(markdown)
    : [...visible.matchAll(INLINE_CODE)].map(([, code = '']) => code);
  for (const code of codeValues) {
    for (const token of code.trim().split(WHITESPACE)) {
      const value = pathValue(token);
      if (value) {
        found.push({ raw: token, value, kind: 'code' });
      }
    }
  }
  const destinations = markdown
    ? markdownLinks(markdown).map((link) => link.url)
    : [...visible.matchAll(LINK)].map(([, destination = '']) => linkDestination(destination));
  for (const raw of destinations) {
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

/**
 * @param {string} docPath
 * @param {string} value
 * @param {string} root
 */
function resolvedCandidates(docPath, value, root) {
  const subproject = projectOf(docPath);
  const candidates = [
    value,
    ...(subproject ? [resolve(root, subproject, value)] : []),
    resolve(dirname(resolve(root, docPath)), value),
  ];
  return [
    ...new Set(
      candidates.map((candidate) => resolve(root, candidate)).filter((candidate) => isInsideRepo(root, candidate)),
    ),
  ];
}

/**
 * @param {string} candidate
 * @param {string} value
 * @param {SourceTree} tree
 */
function pathExists(candidate, value, tree) {
  const rel = relative(tree.root, candidate).split(sep).join('/');
  const pinned = pinnedEntry(rel, tree);
  if (pinned) {
    const { files } = pinned.submodule;
    const dir = pinned.file.replace(TRAILING_SLASH, '');
    return files.has(pinned.file) || (value.endsWith('/') && [...files].some((file) => file.startsWith(`${dir}/`)));
  }
  if (tree.tracked.has(rel)) {
    return true;
  }
  if (value.endsWith('/') && [...tree.tracked].some((path) => path.startsWith(`${rel.replace(TRAILING_SLASH, '')}/`))) {
    return true;
  }
  return tree.ignored.has(rel) || (value.endsWith('/') && tree.ignored.has(`${rel}/`));
}

/**
 * @param {string} symbol
 * @param {string} source
 */
function symbolExists(symbol, source) {
  return symbol.split('.').every((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source));
}

/** @param {Pick<CueContext, 'path' | 'rawPath' | 'tree' | 'failures'> & { symbol: string }} cue */
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

/**
 * @param {string} visible
 * @param {MarkdownRoot | undefined} markdown
 * @returns {Iterable<readonly (string | undefined)[]>}
 */
function symbolPairs(visible, markdown) {
  return markdown ? markdownSymbolPairs(markdown) : visible.matchAll(SYMBOL_PAIR);
}

/** @param {CheckContext} context */
function checkSymbols({ path, visible, markdown, tree, failures }) {
  const pairs = symbolPairs(visible, markdown);
  for (const [, rawPath = '', symbol = ''] of pairs) {
    if (pathValue(rawPath)?.endsWith('.md')) {
      continue;
    }
    checkSymbolCue({ path, symbol, rawPath, tree, failures });
  }
  /** @type {MarkdownLink[]} */
  const links = markdown
    ? markdownLinks(markdown)
    : [...visible.matchAll(SYMBOL_LINK)].map(([, label = '', destination = '']) => ({
        url: linkDestination(destination) ?? '',
        children: [{ type: 'inlineCode', value: label }],
      }));
  for (const link of links) {
    if (link.url.includes('#') || link.url.endsWith('.md')) {
      continue;
    }
    /** @type {string[]} */
    const codeLabels = [];
    for (const child of link.children) {
      walkMarkdown(child, (node) => {
        if (node.type === 'inlineCode') {
          codeLabels.push(nodeValue(node));
        }
      });
    }
    for (const symbol of codeLabels) {
      if (symbol !== link.url.split('/').at(-1)) {
        checkSymbolCue({ path, symbol, rawPath: link.url, tree, failures });
      }
    }
  }
}

/**
 * @param {string} target
 * @param {SourceTree} tree
 */
function sourceFor(target, tree) {
  let source = tree.sources.get(target);
  if (source === undefined) {
    const pinned = pinnedEntry(relative(tree.root, target).split(sep).join('/'), tree);
    source = pinned ? pinned.submodule.read(pinned.file) : readFileSync(target, 'utf8');
    tree.sources.set(target, source);
  }
  return source;
}

/** @param {string} text */
function normalizeAnchor(text) {
  const [title = ''] = text
    .trim()
    .replace(LEADING_SECTION_NUMBER, '')
    .replace(TRAILING_PUNCTUATION, '')
    .split(SUBTITLE, 1);
  return title.trim().replace(TRAILING_PARENTHETICAL, '').trim().replace(TRAILING_PUNCTUATION, '');
}

/** @param {string} text */
function namedAnchor(text) {
  return normalizeAnchor(inlineMarkdownText(text));
}

/** @param {string} text */
export function githubSlug(text) {
  return new GithubSlugger().slug(inlineMarkdownText(text));
}

/**
 * @param {string} target
 * @param {SourceTree} tree
 */
function parsedMarkdownFor(target, tree) {
  let markdown = tree.markdown.get(target);
  if (!markdown) {
    markdown = parseMarkdown(sourceFor(target, tree));
    tree.markdown.set(target, markdown);
  }
  return markdown;
}

/**
 * @param {MarkdownNode} node
 * @param {Set<string | undefined>} renderedFootnotes
 */
function isUnrenderedFootnote(node, renderedFootnotes) {
  return node.type === 'footnoteDefinition' && !renderedFootnotes.has(node.identifier);
}

/** @param {MarkdownNode} node */
function firstBoldLeadIn(node) {
  if (node.type !== 'paragraph') {
    return;
  }
  const [lead, next] = node.children ?? [];
  const first = lead?.type === 'text' && !nodeValue(lead).trim() ? next : lead;
  return first?.type === 'strong' ? renderedText(first) : undefined;
}

/**
 * @param {MarkdownNode} markdown
 * @param {Set<string | undefined>} [renderedFootnotes]
 */
function boldLeadIns(markdown, renderedFootnotes = new Set()) {
  /** @type {string[]} */
  const labels = [];
  /** @param {MarkdownNode} node */
  const visit = (node) => {
    if (isUnrenderedFootnote(node, renderedFootnotes)) {
      return;
    }
    const label = firstBoldLeadIn(node);
    if (label) {
      labels.push(label);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(markdown);
  return labels;
}

/**
 * @param {MarkdownNode} node
 * @param {string[]} headings
 * @param {(string | undefined)[]} footnoteReferences
 */
function collectRenderedContent(node, headings, footnoteReferences) {
  if (node.type === 'footnoteDefinition') {
    return;
  }
  if (node.type === 'heading') {
    headings.push(renderedText(node));
  }
  if (node.type === 'footnoteReference') {
    footnoteReferences.push(node.identifier);
  }
  for (const child of node.children ?? []) {
    collectRenderedContent(child, headings, footnoteReferences);
  }
}

/** @param {MarkdownNode} markdown */
function renderedMarkdownHeadings(markdown) {
  /** @type {Map<string | undefined, MarkdownNode>} */
  const definitions = new Map();
  walkMarkdown(markdown, (node) => {
    if (node.type === 'footnoteDefinition') {
      definitions.set(node.identifier, node);
    }
  });
  /** @type {string[]} */
  const headings = [];
  /** @type {(string | undefined)[]} */
  const footnoteReferences = [];
  collectRenderedContent(markdown, headings, footnoteReferences);
  /** @type {Set<string | undefined>} */
  const renderedFootnotes = new Set();
  for (const identifier of footnoteReferences) {
    if (renderedFootnotes.has(identifier)) {
      continue;
    }
    renderedFootnotes.add(identifier);
    const definition = definitions.get(identifier);
    for (const child of definition?.children ?? []) {
      collectRenderedContent(child, headings, footnoteReferences);
    }
  }
  return { headings, renderedFootnotes };
}

/**
 * @param {MarkdownNode} markdown
 * @returns {Anchors}
 */
function markdownAnchors(markdown) {
  const { headings, renderedFootnotes } = renderedMarkdownHeadings(markdown);
  const labels = boldLeadIns(markdown, renderedFootnotes);
  const slugger = new GithubSlugger();
  const slugs = new Set(headings.map((heading) => slugger.slug(heading)));
  return { names: new Set([...headings, ...labels].map(normalizeAnchor)), slugs };
}

/**
 * @param {string} target
 * @param {SourceTree} tree
 */
function anchorsFor(target, tree) {
  let anchors = tree.anchors.get(target);
  if (!anchors) {
    anchors = markdownAnchors(parsedMarkdownFor(target, tree));
    tree.anchors.set(target, anchors);
  }
  return anchors;
}

/** @param {Pick<CueContext, 'path' | 'rawPath' | 'tree' | 'failures'> & { name: string }} cue */
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

/**
 * @param {string} text
 * @param {RegExp} pattern
 */
function* overlappingMatches(text, pattern) {
  const scanner = new RegExp(pattern.source, pattern.flags);
  for (let match = scanner.exec(text); match; match = scanner.exec(text)) {
    yield match;
    scanner.lastIndex = match.index + 1;
  }
}

/**
 * @param {RegExpMatchArray} extra
 * @param {string} tail
 * @param {string} name
 * @param {string} rawPath
 */
function skippedExtraLength(extra, tail, name, rawPath) {
  if (extra[3] === undefined) {
    return 0;
  }
  const targetPath = pathValue(name, true);
  if (targetPath || name.startsWith('/')) {
    const following = tail.slice(extra[0].length);
    const followingName = following.match(EXTRA_CANONICAL_NAME);
    const codeName = targetPath && !targetPath.endsWith('.md') ? following.match(EXTRA_NAME) : undefined;
    const codeSymbol = codeName?.[3] && BACKTICKED_IDENTIFIER.test(codeName[3]) ? codeName[0].length : 0;
    return extra[0].length + (followingName?.[0].length ?? codeSymbol);
  }
  const originalTarget = pathValue(rawPath, true);
  return originalTarget && !originalTarget.endsWith('.md') && BACKTICKED_IDENTIFIER.test(name) ? extra[0].length : 0;
}

/**
 * @param {string} remaining
 * @param {CueContext} context
 */
function checkExtraNames(remaining, context) {
  let tail = remaining;
  for (let extra = tail.match(EXTRA_NAME); extra; extra = tail.match(EXTRA_NAME)) {
    const name = (extra[1] ?? extra[2] ?? extra[3] ?? '').replace(QUOTE_ESCAPE, '$1');
    const skip = skippedExtraLength(extra, tail, name, context.rawPath);
    if (skip) {
      tail = tail.slice(skip);
      continue;
    }
    if (!NAME_MARKUP.test(name)) {
      add(context.failures, context.path, 'section_form', `${context.rawPath}, "${name}" (implicit path)`);
      checkNamedCue({ ...context, name });
    }
    tail = tail.slice(extra[0].length);
  }
}

/**
 * @param {string} value
 * @param {string} name
 * @param {unknown} backticked
 */
function nonSectionName(value, name, backticked) {
  return (
    backticked &&
    (pathValue(name, true) || name.startsWith('/') || (!value.endsWith('.md') && SYMBOL_IDENTIFIER.test(name)))
  );
}

/**
 * @param {RegExpExecArray} match
 * @param {boolean} bare
 * @param {CheckContext} context
 */
function checkSectionPair(match, bare, context) {
  const [original, rawPath = '', separator, quoted, curly, backticked, single] = match;
  const value = pathValue(rawPath, true);
  const name = (quoted ?? curly ?? backticked ?? single ?? '').replace(QUOTE_ESCAPE, '$1');
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
  checkExtraNames(context.visible.slice(match.index + original.length), {
    ...context,
    rawPath,
  });
}

/**
 * @param {string} raw
 * @param {CheckContext} context
 */
function checkSectionLink(raw, { path, tree, failures }) {
  const destination = linkDestination(raw);
  if (!destination || URI_SCHEME.test(destination) || destination.startsWith('/') || !destination.includes('#')) {
    return;
  }
  const [rawPath, fragment] = destination.split('#');
  const value = rawPath ? pathValue(rawPath) : path;
  if (!(fragment && value)) {
    return;
  }
  const target = resolvedCandidates(path, value, tree.root).find((candidate) => pathExists(candidate, value, tree));
  let exists = false;
  try {
    exists =
      target !== undefined && value.endsWith('.md') && anchorsFor(target, tree).slugs.has(decodeURIComponent(fragment));
  } catch {
    // An unreadable target or malformed escaped fragment cannot certify an anchor.
  }
  if (!exists) {
    add(failures, path, 'section', destination);
  }
}

const QUOTED_PATH_SECTION = /(?<![\w/])"([\w./-]+\.md)"\s*,\s*"([^"\n]+)"/g;

/** @type {[RegExp, boolean][]} */
const SECTION_PAIR_PATTERNS = [
  [CUE_PAIR, false],
  [BARE_SECTION, true],
  [LINK_SECTION, true],
];

/** @param {CheckContext} context */
function checkSections(context) {
  const { path, visible, failures, markdown } = context;
  if (markdown) {
    checkMarkdownSections({ ...context, markdown });
    return;
  }
  for (const [pattern, bare] of SECTION_PAIR_PATTERNS) {
    for (const match of overlappingMatches(visible, pattern)) {
      checkSectionPair(match, bare, context);
    }
  }
  const references = visible.replace(LINK, '');
  for (const pattern of [OTHER_SECTION, SECTION_NUMBER]) {
    for (const match of references.matchAll(pattern)) {
      add(failures, path, 'section_form', match[0]);
    }
  }
  const links = [...visible.matchAll(LINK)].map(([, destination = '']) => destination.trim());
  for (const raw of links) {
    checkSectionLink(raw, context);
  }
}

/** @param {string} text */
function joinedCues(text) {
  return text.replace(/\r?\n\s*(?:\/\/|\*|#)?\s*/g, ' ');
}

/**
 * @param {string} path
 * @param {string} visible
 * @param {Failures} failures
 */
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

/** @param {string} path */
function policyExempt(path) {
  return POLICY_EXEMPT.has(path) || PACKAGE_LOCK.test(path);
}

/**
 * @param {string} path
 * @param {string} text
 * @param {MarkdownRoot | undefined} markdown
 * @param {Failures} failures
 */
function checkCitations(path, text, markdown, failures) {
  const visible = markdown ? markdownSourceText(text, markdown) : text;
  for (const line of visible.split('\n')) {
    const matches = CITATION_PATTERNS.flatMap((pattern) =>
      [...line.matchAll(pattern)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      })),
    ).sort((a, b) => a.start - b.start || b.end - a.end);
    /** @type {typeof matches} */
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

/**
 * @param {string} path
 * @param {string} text
 * @param {Failures} failures
 */
function checkHost(path, text, failures) {
  for (const pattern of [HOST_PATH, RUN_USER_PATH, PRIVATE_IPV4]) {
    for (const match of text.matchAll(pattern)) {
      add(failures, path, 'host', match[0]);
    }
  }
  for (const [, , homePath = ''] of text.matchAll(HOME_SHORTCUT)) {
    if (!HOST_PATH_VALUE_EXEMPTIONS.has(homePath)) {
      add(failures, path, 'host', homePath);
    }
  }
}

/**
 * @param {string} path
 * @param {string} text
 * @param {MarkdownRoot} markdown
 * @param {Failures} failures
 */
function checkWhen(path, text, markdown, failures) {
  const visible = markdownSourceText(text, markdown, { skipBlockquotes: true, skipInlineCode: true }).replace(
    QUOTED_TEXT,
    '',
  );
  for (const match of visible.matchAll(/\b(?:today|currently)\b/gi)) {
    add(failures, path, 'when', match[0].toLowerCase());
  }
}

/** @param {string | undefined} path */
export function readPrivateTerms(path) {
  if (path === undefined) {
    return [];
  }
  return [
    ...new Set(
      readFileSync(path, 'utf8')
        .split(NEWLINE)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * @param {{ path: string, text: string, parsedMarkdown?: MarkdownRoot | undefined, privateTerms?: string[] }} file
 */
export function checkPolicyRules({ path, text, parsedMarkdown, privateTerms = [] }) {
  /** @type {Failures} */
  const failures = new Map();
  for (const term of privateTerms) {
    if (text.includes(term)) {
      add(failures, path, 'private_term', term);
    }
  }
  if (policyExempt(path)) {
    return [...failures.values()];
  }
  if (HISTORICAL_DOC.test(path)) {
    add(failures, path, 'historical_doc', 'reviews and retros belong in git history, not tracked files');
    return [...failures.values()];
  }
  const markdown = path.endsWith('.md') ? (parsedMarkdown ?? parseMarkdown(text)) : undefined;
  checkCitations(path, text, markdown, failures);
  checkHost(path, text, failures);
  if (markdown) {
    checkWhen(path, text, markdown, failures);
  }
  return [...failures.values()];
}

/** @param {CheckContext} context */
function checkPaths({ path, visible, markdown, tree, failures }) {
  for (const candidate of pathCandidates(visible, markdown)) {
    const targets = resolvedCandidates(path, candidate.value, tree.root);
    const target = targets.find((item) => pathExists(item, candidate.value, tree));
    if (!target) {
      add(failures, path, 'path', candidate.raw);
    } else if (candidate.kind === 'code') {
      const sourceProject = projectOf(path);
      const targetProject = projectOf(relative(tree.root, target).split(sep).join('/'));
      const crossProject = sourceProject && targetProject && sourceProject !== targetProject;
      if (crossProject && !candidate.value.startsWith(`${targetProject}/`)) {
        add(failures, path, 'path_scope', candidate.raw);
      }
    }
  }
  checkSymbols({ path, visible, markdown, tree, failures });
}

/**
 * @param {object} document
 * @param {string} document.path
 * @param {string} document.text
 * @param {string} [document.root]
 * @param {Set<string>} document.tracked
 * @param {Set<string>} [document.ignored]
 * @param {PinnedSubmodules} [document.pinned]
 * @param {Map<string, string[]>} [document.pythonReadIf]
 * @param {Map<string, string>} [document.sources]
 * @param {Map<string, Anchors>} [document.anchors]
 * @param {Map<string, MarkdownRoot>} [document.parsedMarkdown]
 */
export function checkDocument({
  path,
  text,
  root = ROOT,
  tracked,
  ignored = new Set(),
  pinned = new Map(),
  pythonReadIf = new Map(),
  sources = new Map(),
  anchors = new Map(),
  parsedMarkdown = new Map(),
}) {
  /** @type {Failures} */
  const failures = new Map();
  if (!tracked) {
    throw new Error('tracked file set is required for path checks');
  }
  const owner = resolve(root, path);
  if (sources.get(owner) !== text) {
    sources.set(owner, text);
    anchors.delete(owner);
    parsedMarkdown.delete(owner);
  }
  const markdown = path.endsWith('.md') ? (parsedMarkdown.get(owner) ?? parseMarkdown(text)) : undefined;
  if (markdown) {
    parsedMarkdown.set(owner, markdown);
  }
  if (markdown && !ISSUE_TEMPLATE.test(path)) {
    const reasons = readIfReasons(path, markdown, failures);
    if (reasons) {
      checkReadIfParity(path, reasons, pythonReadIf, failures);
    }
  }
  /** @type {SourceTree} */
  const tree = { root, tracked, ignored, pinned, sources, anchors, markdown: parsedMarkdown };
  const visible = markdown ? markdownText(markdown) : joinedCues(text);
  checkLineNumbers(path, markdown ? markdownSourceText(text, markdown) : text, failures);
  checkPaths({ path, visible, markdown, tree, failures });
  checkSections({ path, visible, markdown, tree, failures });
  return [...failures.values()];
}

export function trackedTextFiles(paths = exec('git', ['ls-files', '-z']).split('\0').filter(Boolean), root = ROOT) {
  return paths.filter((path) => {
    const absolute = resolve(root, path);
    if (!statSync(absolute).isFile()) {
      return false;
    }
    const bytes = readFileSync(absolute);
    return !bytes.subarray(0, 8192).includes(0);
  });
}

/**
 * @param {string[][]} candidates
 * @returns {Set<string>}
 */
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
    output = /** @type {{ stdout?: string | Buffer }} */ (error).stdout?.toString() ?? '';
  }
  return new Set(output.split('\0').filter(Boolean));
}

/**
 * @param {string[]} paths
 * @param {string[]} privateTerms
 */
function observedFailures(paths, privateTerms) {
  const tracked = new Set(exec('git', ['ls-files', '-z']).split('\0').filter(Boolean));
  const pinned = pinnedSubmodules();
  const docTexts = new Map(paths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]));
  const sources = new Map([...docTexts].map(([path, text]) => [resolve(ROOT, path), text]));
  const parsedMarkdown = new Map(
    [...docTexts]
      .filter(([path]) => path.endsWith('.md'))
      .map(([path, text]) => [resolve(ROOT, path), parseMarkdown(text)]),
  );
  /** @type {Map<string, Anchors>} */
  const anchors = new Map();
  const candidates = [...docTexts].map(([path, text]) => {
    const markdown = parsedMarkdown.get(resolve(ROOT, path));
    const visible = markdown ? markdownText(markdown) : joinedCues(text);
    return pathCandidates(visible, markdown).flatMap(({ value }) =>
      resolvedCandidates(path, value, ROOT).map(
        (candidate) => `${relative(ROOT, candidate)}${value.endsWith('/') ? '/' : ''}`,
      ),
    );
  });
  // Git refuses ignore queries for paths inside a submodule, and the pinned tree answers those paths anyway.
  const ignored = ignoredPaths(
    candidates.map((docCandidates) =>
      docCandidates.filter((item) => !pinnedEntry(item.split(sep).join('/'), { pinned })),
    ),
  );
  const pythonReadIf = parsePythonReadIf(exec('python3', ['tools/read_if.py']));
  /** @type {Failures} */
  const failures = new Map();
  /** @param {Failure} failure */
  const mergeFailure = (failure) => {
    const key = JSON.stringify([failure.path, failure.check, failure.text]);
    const previous = failures.get(key);
    failures.set(key, { ...failure, count: (previous?.count ?? 0) + failure.count });
  };
  for (const [path, text] of docTexts) {
    for (const failure of checkDocument({
      path,
      text,
      tracked,
      ignored,
      pinned,
      pythonReadIf,
      sources,
      anchors,
      parsedMarkdown,
    })) {
      mergeFailure(failure);
    }
    for (const failure of checkPolicyRules({
      path,
      text,
      parsedMarkdown: parsedMarkdown.get(resolve(ROOT, path)),
      privateTerms,
    })) {
      mergeFailure(failure);
    }
  }
  return [...failures.values()].sort(
    (a, b) =>
      compareCodeUnits(a.path, b.path) || compareCodeUnits(a.check, b.check) || compareCodeUnits(a.text, b.text),
  );
}

/** @param {Failure[]} failures */
function failureMap(failures) {
  return new Map(
    failures.map(({ path, check, text, count }) => [JSON.stringify([path, check, text]), { path, check, text, count }]),
  );
}

/** @param {string} path */
function group(path) {
  return projectOf(path) ?? 'root';
}

/** @param {Failure[]} failures */
function printStats(failures) {
  /** @type {Map<string, number>} */
  const checks = new Map();
  /** @type {Map<string, number>} */
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

/**
 * @param {Failure[]} observed
 * @param {Failure[]} baseline
 */
function failureDifferences(observed, baseline) {
  const actual = failureMap(observed);
  const expected = failureMap(baseline);
  /** @type {Difference[]} */
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
      compareCodeUnits(a.kind, b.kind) ||
      compareCodeUnits(a.path, b.path) ||
      compareCodeUnits(a.check, b.check) ||
      compareCodeUnits(a.text, b.text),
  );
}

/**
 * @param {Failure[]} observed
 * @param {Failure[]} baseline
 */
export function compare(observed, baseline) {
  return failureDifferences(observed, baseline);
}

/**
 * @param {Failure[]} observed
 * @param {Failure[]} baseline
 */
export function comparePolicy(observed, baseline) {
  return {
    strictFailures: observed.filter(({ check }) => STRICT_CHECKS.has(check)),
    strictBaselineRows: baseline.filter(({ check }) => STRICT_CHECKS.has(check)),
    differences: failureDifferences(ratcheted(observed), ratcheted(baseline)),
  };
}

/** @param {Failure[]} violations */
function baselineText(violations) {
  const rows = violations.map((violation) => `    ${JSON.stringify(violation)}`).join(',\n');
  return `{\n  "version": 1,\n  "violations": [\n${rows}\n  ]\n}\n`;
}

/** @param {Failure[]} failures */
function ratcheted(failures) {
  return failures.filter(({ check }) => !STRICT_CHECKS.has(check));
}

const FAILURE_HINTS = new Map([
  ['citation', 'state the rule in plain words and put the quote and stamp in the commit message'],
  ['when', 'name the trigger issue or drop the word'],
  ['private_term', 'remove the private term from tracked text; keep private instructions outside the repository'],
  ['host', 'use a repo-relative path or an environment variable such as $XDG_RUNTIME_DIR'],
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

/** @param {ReportedFailure} item */
function failureHint(item) {
  if (item.kind === 'stale') {
    return 'run npm run baseline:zero-drift after fixing the cited text';
  }
  return FAILURE_HINTS.get(item.check) ?? 'fix the reported zero-drift violation';
}

/** @param {ReportedFailure[]} items */
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
  // biome-ignore lint/style/noProcessEnv: an optional local list keeps private vocabulary out of tracked configuration.
  const privateTermsPath = process.env.ZERO_DRIFT_PRIVATE_TERMS;
  let privateTerms;
  try {
    privateTerms = readPrivateTerms(privateTermsPath);
  } catch (error) {
    process.stderr.write(
      `zero-drift: cannot read ZERO_DRIFT_PRIVATE_TERMS file ${JSON.stringify(privateTermsPath)} (${/** @type {NodeJS.ErrnoException} */ (error).code ?? 'read error'})\n`,
    );
    process.exitCode = 1;
    return;
  }
  const observed = observedFailures(trackedTextFiles(), privateTerms);
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
  /** @type {ReportedFailure[]} */
  const failures = [
    ...policyStrictFailures.map((item) => ({ ...item, kind: /** @type {const} */ ('strict') })),
    ...differences,
  ];
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
