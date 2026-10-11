/** One inventory grid cell in rem, so grids scale with the UI. */
export const GRID_CELL_REM = 3;
// Names are laid out at the 16 px root the UI is authored at; hudScale scales cell, font and insets alike.
const GRID_CELL_PX = GRID_CELL_REM * 16;
const GRID_NAME_FONT_PX = 11;
const GRID_NAME_LINE_HEIGHT = 1.15;
const GRID_NAME_AVERAGE_GLYPH_WIDTH_EM = 0.5;
const GRID_ITEM_INSETS_PX = 12;
const GRID_NAME_VERTICAL_INSETS_PX = 8;

const gridNameCapacity = (widthCells: number, heightCells: number) => ({
  charsPerLine: Math.max(
    1,
    Math.floor(
      (GRID_CELL_PX * widthCells - GRID_ITEM_INSETS_PX) / (GRID_NAME_FONT_PX * GRID_NAME_AVERAGE_GLYPH_WIDTH_EM),
    ),
  ),
  lines: Math.max(
    1,
    Math.floor(
      (GRID_CELL_PX * heightCells - GRID_NAME_VERTICAL_INSETS_PX) / (GRID_NAME_FONT_PX * GRID_NAME_LINE_HEIGHT),
    ),
  ),
});

const elideWord = (word: string, capacity: number): string =>
  word.length <= capacity ? word : `${word.slice(0, Math.max(0, capacity - 1))}…`;

const wrapAtWords = (name: string, capacity: number): string[] => {
  const lines: string[] = [];
  let current = '';
  for (const sourceWord of name.replace(/\s+/gu, ' ').trim().split(' ')) {
    if (!sourceWord) {
      continue;
    }
    const word = elideWord(sourceWord, capacity);
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= capacity) {
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

const appendEllipsis = (line: string, capacity: number): string => {
  if (line.endsWith('…')) {
    return line;
  }
  const words = line.split(' ');
  while (words.length > 0 && words.join(' ').length + 1 > capacity) {
    words.pop();
  }
  return `${words.join(' ')}…`;
};

/** Approximate the compact grid label at the original font size and the item's cell footprint. */
export const inventoryGridName = (name: string, widthCells: number, heightCells: number): string => {
  const tall = heightCells > widthCells;
  const { charsPerLine, lines: maxLines } = tall
    ? gridNameCapacity(heightCells, widthCells)
    : gridNameCapacity(widthCells, heightCells);
  const wrapped = wrapAtWords(name, charsPerLine);
  if (wrapped.length <= maxLines) {
    return wrapped.join('\n');
  }
  const visible = wrapped.slice(0, maxLines);
  visible[maxLines - 1] = appendEllipsis(visible[maxLines - 1]!, charsPerLine);
  return visible.join('\n');
};
