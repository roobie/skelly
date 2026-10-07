import { describe, expect, it } from 'vitest';
import { bufferPlaywrightDebugOutput } from './browser/playwrightDebugBuffer.mjs';

describe('Playwright browser debug buffering', () => {
  it('flushes the recent bounded logs when a stage fails after launch', () => {
    const output: string[] = [];
    const buffer = bufferPlaywrightDebugOutput(
      (chunk) => {
        output.push(String(chunk));
        return true;
      },
      { maxLines: 2 },
    );

    buffer.write('pw:browser launch diagnostic\n');
    buffer.write('pw:browser launched\n');
    buffer.write('pw:browser post-launch failure\n');
    expect(output).toEqual([]);

    buffer.flush();
    const emitted = output.join('');
    expect(emitted).not.toContain('launch diagnostic');
    expect(emitted).toContain('pw:browser post-launch failure');
  });

  it('discards buffered logs after a successful stage', () => {
    const output: string[] = [];
    const buffer = bufferPlaywrightDebugOutput((chunk) => {
      output.push(String(chunk));
      return true;
    });

    buffer.write('pw:browser launch diagnostic\n');
    buffer.write('pw:browser stage activity\n');
    buffer.discard();
    expect(output).toEqual([]);
  });
});
