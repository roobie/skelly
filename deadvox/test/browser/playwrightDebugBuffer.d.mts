type WriteCallback = (error?: Error | null) => void;
type WriteArgument = string | WriteCallback;
type Write = (chunk: string | Uint8Array, encodingOrCallback?: WriteArgument, callback?: WriteCallback) => boolean;

export function bufferPlaywrightDebugOutput(write: Write): {
  write: Write;
  flush: () => void;
  discard: () => void;
};
