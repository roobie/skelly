import { describe, expect, it } from 'vitest';
import { bufferPlaywrightDebugOutput } from './browser/playwrightDebugBuffer.mjs';

describe('Playwright browser debug buffering', () => {
  it('emits captured browser logs only when the launch fails', () => {
    const output: string[] = [];
    const buffer = bufferPlaywrightDebugOutput((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const debugLine = 'pw:browser launch diagnostic\n';
    buffer.write(debugLine);
    buffer.write('Vite warning\n');
    expect(output).toEqual(['Vite warning\n']);

    buffer.flush();
    expect(output).toEqual(['Vite warning\n', debugLine]);
  });

  it('discards captured browser logs after a successful launch', () => {
    const output: string[] = [];
    const buffer = bufferPlaywrightDebugOutput((chunk) => {
      output.push(String(chunk));
      return true;
    });

    buffer.write('pw:browser launch diagnostic\n');
    buffer.discard();
    expect(output).toEqual([]);
  });
});
