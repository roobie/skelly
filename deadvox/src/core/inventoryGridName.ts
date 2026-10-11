/** One inventory grid cell in rem, so grids scale with the UI. */
export const GRID_CELL_REM = 3;
// Names are laid out at the 16 px root the UI is authored at. hudScale scales cell, font and padding, but the px
// border and gutter don't, so a fitted name can clip below a scale of 1.
const GRID_CELL_PX = GRID_CELL_REM * 16;
const GRID_NAME_FONT_PX = 11;
const GRID_NAME_LINE_HEIGHT = 1.15;
const GRID_NAME_HORIZONTAL_INSETS_PX = 12;
const GRID_NAME_VERTICAL_INSETS_PX = 8;
// The share of a line a name may fill; the rest is the margin for UI fonts the glyph table doesn't cover
// (DESIGN.md, "Inventory screen").
const GRID_NAME_LINE_FILL = 0.95;
const ELLIPSIS = '…';

// Glyph advances in em, printed by tools/grid-name-glyph-widths.mjs (`npm run probe:glyph-widths`). A glyph that isn't
// listed counts as the widest one.
const GLYPH_WIDTHS_EM: readonly (readonly [number, string])[] = [
  [0.28, 'ijlìíî'],
  [0.3, "'IÌÍÎÏ"],
  [0.32, ' ,.‘’'],
  [0.34, ':;\\|¦·'],
  [0.35, 'f'],
  [0.37, '/'],
  [0.4, '()[]rt'],
  [0.41, '!¡¹ï'],
  [0.45, '²³'],
  [0.47, '"-'],
  [0.48, 'ª'],
  [0.49, 'º'],
  [0.51, '*`°´¸'],
  [0.52, '“”'],
  [0.53, 's'],
  [0.56, '?_z¯–'],
  [0.57, 'L§'],
  [0.58, 'Jckç'],
  [0.6, 'vxy¨ýÿ'],
  [0.62, 'Faeo«»¿àáâãäåèéêëðòóôõöø'],
  [0.64, '012356789bdghnpqu{}¢£¥µ¶ßñùúûüþ'],
  [0.65, '$4T'],
  [0.67, 'EPSÈÉÊËÞ'],
  [0.68, 'KYÝ'],
  [0.69, 'BXZ'],
  [0.71, 'VÅ'],
  [0.72, 'AÀÁÂÃÄ'],
  [0.73, 'R¤'],
  [0.74, 'CÇ'],
  [0.75, 'UÙÚÛÜ'],
  [0.76, 'HNÑ'],
  [0.78, 'DGÐ'],
  [0.79, '&OQÒÓÔÕÖØ'],
  [0.82, 'w'],
  [0.84, '#+<=>^~¬±×÷'],
  [0.91, 'M'],
  [0.97, '¼½¾'],
  [0.98, 'm'],
  [0.99, '%æ'],
  [1, '©®'],
  [1.01, 'WÆ—…'],
  [1.02, '@'],
];
const GLYPH_WIDTH_EM = new Map(
  GLYPH_WIDTHS_EM.flatMap(([width, glyphs]) => [...glyphs].map((glyph) => [glyph, width] as const)),
);
const WIDEST_GLYPH_EM = Math.max(...GLYPH_WIDTHS_EM.map(([width]) => width));

const textWidthEm = (text: string): number => {
  let width = 0;
  for (const glyph of text) {
    width += GLYPH_WIDTH_EM.get(glyph) ?? WIDEST_GLYPH_EM;
  }
  return width;
};

const lineWidthEm = (cells: number, insetsPx: number): number =>
  ((GRID_CELL_PX * cells - insetsPx) * GRID_NAME_LINE_FILL) / GRID_NAME_FONT_PX;

const lineCount = (cells: number, insetsPx: number): number =>
  Math.max(1, Math.floor((GRID_CELL_PX * cells - insetsPx) / (GRID_NAME_FONT_PX * GRID_NAME_LINE_HEIGHT)));

const elideWord = (word: string, lineEm: number): string => {
  if (textWidthEm(word) <= lineEm) {
    return word;
  }
  let kept = '';
  let width = textWidthEm(ELLIPSIS);
  for (const glyph of word) {
    width += textWidthEm(glyph);
    if (width > lineEm) {
      break;
    }
    kept += glyph;
  }
  return `${kept}${ELLIPSIS}`;
};

const wrapAtWords = (name: string, lineEm: number): string[] => {
  const lines: string[] = [];
  let current = '';
  for (const sourceWord of name.replace(/\s+/gu, ' ').trim().split(' ')) {
    if (!sourceWord) {
      continue;
    }
    const word = elideWord(sourceWord, lineEm);
    const candidate = current ? `${current} ${word}` : word;
    if (textWidthEm(candidate) <= lineEm) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
};

const appendEllipsis = (line: string, lineEm: number): string => {
  if (line.endsWith(ELLIPSIS)) {
    return line;
  }
  const words = line.split(' ');
  while (words.length > 0 && textWidthEm(`${words.join(' ')}${ELLIPSIS}`) > lineEm) {
    words.pop();
  }
  return `${words.join(' ')}${ELLIPSIS}`;
};

/** Lay out the compact grid label at the base text size and the item's cell footprint. */
export const inventoryGridName = (name: string, widthCells: number, heightCells: number): string => {
  // A tall name runs down the long edge, so its lines stack across the item's width.
  const tall = heightCells > widthCells;
  const lineEm = tall
    ? lineWidthEm(heightCells, GRID_NAME_VERTICAL_INSETS_PX)
    : lineWidthEm(widthCells, GRID_NAME_HORIZONTAL_INSETS_PX);
  const maxLines = tall
    ? lineCount(widthCells, GRID_NAME_HORIZONTAL_INSETS_PX)
    : lineCount(heightCells, GRID_NAME_VERTICAL_INSETS_PX);
  const wrapped = wrapAtWords(name, lineEm);
  if (wrapped.length <= maxLines) {
    return wrapped.join('\n');
  }
  const visible = wrapped.slice(0, maxLines);
  visible[maxLines - 1] = appendEllipsis(visible[maxLines - 1]!, lineEm);
  return visible.join('\n');
};
