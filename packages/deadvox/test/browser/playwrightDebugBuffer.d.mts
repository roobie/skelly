export type Write = NodeJS.WriteStream['write'];
export interface BufferOptions {
  maxLines?: number;
  maxLineChars?: number;
}

export function bufferPlaywrightDebugOutput(
  write: Write,
  options?: BufferOptions,
): {
  write: Write;
  flush: () => void;
  discard: () => void;
};
