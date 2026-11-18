type Write = NodeJS.WriteStream['write'];
interface BufferOptions {
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
