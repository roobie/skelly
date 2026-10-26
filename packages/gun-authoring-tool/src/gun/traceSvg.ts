import type { TracePoint } from './trace.ts';

const SEPARATORS = /^[\s,]*$/;
const TOKEN = /[ML]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const UNSUPPORTED = /\b(?:transform|style|class)\s*=|<!|<\?/;
const TAG = /<\/?([\w:-]+)\b[^>]*>/g;
const COORDINATE_SEPARATOR = /[\s,]+/;

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 's').exec(tag);
  return match?.[2];
};

// A deliberately small authoring subset keeps envelope extraction exact rather than approximating curves.
const pathPoints = (d: string): TracePoint[] => {
  const tokens: string[] = [];
  let end = 0;
  for (const match of d.matchAll(TOKEN)) {
    if (!SEPARATORS.test(d.slice(end, match.index))) {
      throw new Error('Trace paths support only absolute M/L vertices');
    }
    tokens.push(match[0]);
    end = match.index + match[0].length;
  }
  if (!SEPARATORS.test(d.slice(end)) || tokens[0] !== 'M') {
    throw new Error('Invalid trace path');
  }
  const points: TracePoint[] = [];
  let index = 0;
  while (index < tokens.length) {
    if (tokens[index] === 'M' || tokens[index] === 'L') {
      index += 1;
    }
    const x = Number(tokens[index]);
    const y = Number(tokens[index + 1]);
    index += 2;
    if (!(Number.isFinite(x) && Number.isFinite(y))) {
      throw new Error('Trace path needs finite coordinate pairs');
    }
    points.push([x, y]);
  }
  return points;
};

export const parseTraceSvg = (svg: string) => {
  if (UNSUPPORTED.test(svg)) {
    throw new Error('Trace SVG must contain untransformed, unstyled vertices');
  }
  const tags = [...svg.matchAll(TAG)];
  if (tags.some((tag) => !['svg', 'title', 'desc', 'g', 'path'].includes(tag[1]!))) {
    throw new Error('Trace SVG supports only svg/title/desc/g/path elements');
  }
  const roots = tags.filter((tag) => tag[1] === 'svg' && !tag[0].startsWith('</'));
  if (roots.length !== 1) {
    throw new Error('Trace SVG needs one root');
  }
  const viewBox = attribute(roots[0]![0], 'viewBox')?.trim().split(COORDINATE_SEPARATOR).map(Number);
  if (
    viewBox?.length !== 4 ||
    viewBox.some((n) => !Number.isFinite(n)) ||
    viewBox[0] !== 0 ||
    viewBox[1] !== 0 ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  ) {
    throw new Error('Trace SVG needs an origin-zero, positive viewBox');
  }
  const paths = new Map<string, TracePoint[]>();
  for (const tag of tags.filter((entry) => entry[1] === 'path' && !entry[0].startsWith('</'))) {
    const id = attribute(tag[0], 'id');
    const d = attribute(tag[0], 'd');
    if (!(id && d) || paths.has(id)) {
      throw new Error('Trace paths need unique ids and vertex data');
    }
    paths.set(id, pathPoints(d));
  }
  if (paths.size === 0) {
    throw new Error('Trace SVG needs at least one path');
  }
  return { width: viewBox[2]!, height: viewBox[3]!, paths };
};
