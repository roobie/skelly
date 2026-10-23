// Authored, immutable plain text shared by carried notes and furniture signs.
export const READABLE_TITLE_LIMIT = 120;
export const READABLE_TEXT_LIMIT = 12_000;
export const hasReadableWords = (value: string): boolean => value.trim().length > 0;
const MARKUP = /[<>]/u;
/** No HTML delimiters or non-text control characters; paragraphs/tabs are ordinary text. */
export const isReadablePlainText = (value: string): boolean => {
  if (MARKUP.test(value)) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code === 127 || (code < 32 && ![9, 10, 13].includes(code))) {
      return false;
    }
  }
  return true;
};
export interface Readable {
  title: string;
  text: string;
}

/** A requested reading surface; generated paper stays distinct from authored prose. */
export type ReadRequest =
  | Readonly<{ kind: 'text'; readable: Readonly<Readable>; bookUid?: number; itemType?: string }>
  | Readonly<{
      kind: 'paperMap';
      ownerUid: number;
      coverage: Readonly<{ x: number; z: number }>;
      title: string;
      itemType: string;
    }>;
