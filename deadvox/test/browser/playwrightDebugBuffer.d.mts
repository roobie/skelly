type WriteCallback = (error?: Error | null) => void;
type WriteArgument = string | WriteCallback;
type Write = (chunk: string | Uint8Array, encodingOrCallback?: WriteArgument, callback?: WriteCallback) => boolean;
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
