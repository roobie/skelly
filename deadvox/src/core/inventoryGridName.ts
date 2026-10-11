const GRID_CELL_PX = 48;
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

interface WrappedName {
  lines: string[];
  separators: string[];
}

const pushLine = (wrapped: WrappedName, text: string, separator: string): void => {
  wrapped.lines.push(text);
  wrapped.separators.push(separator);
};

const appendLongWord = (wrapped: WrappedName, current: string, word: string, capacity: number): string => {
  if (current) {
    pushLine(wrapped, current, ' ');
  }
  const parts = Array.from({ length: Math.ceil(word.length / capacity) }, (_, index) =>
    word.slice(index * capacity, (index + 1) * capacity),
  );
  for (const part of parts.slice(0, -1)) {
    pushLine(wrapped, part, '');
  }
  return parts.at(-1) ?? '';
};

const wrapAtWords = (name: string, capacity: number): WrappedName => {
  const wrapped: WrappedName = { lines: [], separators: [] };
  let current = '';
  for (const word of name.replace(/\s+/gu, ' ').trim().split(' ')) {
    if (!word) {
      continue;
    }
    if (word.length > capacity) {
      current = appendLongWord(wrapped, current, word, capacity);
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= capacity) {
      current = candidate;
    } else {
      pushLine(wrapped, current, ' ');
      current = word;
    }
  }
  if (current) {
    wrapped.lines.push(current);
  }
  return wrapped;
};

const appendEllipsis = (line: string, capacity: number, continuesLongWord: boolean): string => {
  let visible = line;
  while (visible.length + 1 > capacity) {
    const lastWord = visible.lastIndexOf(' ');
    if (lastWord >= 0) {
      visible = visible.slice(0, lastWord);
      continue;
    }
    visible = continuesLongWord ? visible.slice(0, capacity - 1) : '';
    break;
  }
  return `${visible}…`;
};

/** Approximate the compact grid label at the original font size and the item's cell footprint. */
export const inventoryGridName = (name: string, widthCells: number, heightCells: number): string => {
  const { charsPerLine, lines: maxLines } = gridNameCapacity(widthCells, heightCells);
  const wrapped = wrapAtWords(name, charsPerLine);
  if (wrapped.lines.length <= maxLines) {
    return wrapped.lines.map((line, index) => line + (wrapped.separators[index] ?? '')).join('\n');
  }
  const visible = wrapped.lines.slice(0, maxLines);
  const lastLine = maxLines - 1;
  visible[lastLine] = appendEllipsis(
    visible[lastLine]!,
    charsPerLine,
    lastLine > 0 && wrapped.separators[lastLine - 1] === '',
  );
  return visible.map((line, index) => line + (wrapped.separators[index] ?? '')).join('\n');
};
