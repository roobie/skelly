// Authored, immutable plain text shared by carried notes and furniture signs.
export const READABLE_TITLE_LIMIT = 120;
export const READABLE_TEXT_LIMIT = 12000;
export const hasReadableWords = (value: string): boolean => value.trim().length > 0;
/** No HTML delimiters or non-text control characters; paragraphs/tabs are ordinary text. */
export const isReadablePlainText = (value: string): boolean => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
export interface Readable {
  title: string;
  text: string;
}
