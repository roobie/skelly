// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { appendError, installErrorLogCopy, setError } from '@skelly/presentation/internal/ui/errorLog.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const [shippedLog] = /<div id="error-log">[\s\S]*?<\/button>\s*<\/div>/.exec(readFileSync('index.html', 'utf8'))!;

const copyButton = () => document.getElementById('errors-copy') as HTMLButtonElement;

describe('error log copy', () => {
  const writeText = vi.fn(async (_text: string) => undefined);

  beforeEach(() => {
    document.body.innerHTML = shippedLog;
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setError('');
    installErrorLogCopy();
  });

  it('offers no copy button until something is logged', () => {
    expect(copyButton().hidden).toBe(true);
    appendError('first');
    expect(copyButton().hidden).toBe(false);
  });

  it('copies every message logged so far, whichever site logged it', async () => {
    appendError('from content');
    appendError('from audio');
    copyButton().click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(document.getElementById('errors')!.textContent);
    expect(writeText.mock.calls[0]![0]).toContain('from content');
    expect(writeText.mock.calls[0]![0]).toContain('from audio');
  });

  it('copies the whole refusal a startup sets, including a multi-line one', async () => {
    const refusal = 'line one\nline two';
    setError(refusal);
    copyButton().click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(refusal));
  });
});
