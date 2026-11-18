/** @import * as Declared from './playwrightDebugBuffer.d.mts' */

const DEFAULT_MAX_LINES = 256;
const DEFAULT_MAX_LINE_CHARS = 4096;

/** @type {typeof Declared.bufferPlaywrightDebugOutput} */
export function bufferPlaywrightDebugOutput(
  write,
  { maxLines = DEFAULT_MAX_LINES, maxLineChars = DEFAULT_MAX_LINE_CHARS } = {},
) {
  if (!Number.isSafeInteger(maxLines) || maxLines < 1) {
    throw new Error('Playwright debug buffer maxLines must be a positive integer');
  }
  if (!Number.isSafeInteger(maxLineChars) || maxLineChars < 1) {
    throw new Error('Playwright debug buffer maxLineChars must be a positive integer');
  }

  /** @type {string[]} */
  const lines = [];
  /**
   * @param {string | Uint8Array} chunk
   * @param {BufferEncoding | undefined} encoding
   * @param {((error?: Error | null) => void) | undefined} callback
   */
  const forward = (chunk, encoding, callback) =>
    encoding === undefined ? write(chunk, callback) : write(chunk, encoding, callback);
  return {
    /**
     * @param {string | Uint8Array} chunk
     * @param {...(BufferEncoding | ((error?: Error | null) => void) | undefined)} args
     */
    write(chunk, ...args) {
      const encoding = args.find((arg) => typeof arg === 'string');
      const callback = args.find((arg) => typeof arg === 'function');
      const message = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding);
      const parts = message.match(/[^\n]*\n|[^\n]+$/g) ?? [];
      const debugLines = parts.filter((line) => line.includes('pw:browser'));
      if (debugLines.length === 0) {
        return forward(chunk, encoding, callback);
      }

      const otherLines = parts.filter((line) => !line.includes('pw:browser'));
      for (const line of debugLines) {
        lines.push(line.length > maxLineChars ? line.slice(-maxLineChars) : line);
        if (lines.length > maxLines) {
          lines.shift();
        }
      }
      callback?.();
      return otherLines.length > 0 ? write(otherLines.join('')) : true;
    },
    flush() {
      for (const line of lines) {
        write(line);
      }
      lines.length = 0;
    },
    discard() {
      lines.length = 0;
    },
  };
}
