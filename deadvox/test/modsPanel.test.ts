import { expect, test, vi } from 'vitest';
import { MAX_MOD_BYTES } from '../src/game/browserMods.ts';
import { readPaste } from '../src/ui/modsPanel.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };

test('URL intake preserves payloads and rejects HTTP failures and streamed overflow', async () => {
  const url = 'https://example.test/mod.json';
  const text = JSON.stringify(fixture);
  const fetchMod = vi.fn<typeof fetch>();
  fetchMod.mockResolvedValueOnce(new Response(text));
  const result = await readPaste(` ${url} `, fetchMod);
  expect(fetchMod).toHaveBeenCalledWith(url, { credentials: 'omit' });
  expect(result).toEqual({ name: url, text });

  fetchMod.mockResolvedValueOnce(new Response(text, { status: 403 }));
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
  const cancel = vi.fn();
  let pulls = 0;
  fetchMod.mockResolvedValueOnce(
    new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls += 1;
            if (pulls === 1) {
              controller.enqueue(new Uint8Array(MAX_MOD_BYTES));
            } else if (pulls === 2) {
              controller.enqueue(new Uint8Array([32]));
            } else {
              controller.close();
            }
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    ),
  );
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(pulls).toBe(2);

  fetchMod.mockResolvedValueOnce(new Response('{'));
  const invalid = await readPaste(url, fetchMod);
  expect(invalid).toEqual({ name: url, text: '{' });
  fetchMod.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
  expect(await readPaste(text, fetchMod)).toEqual({ name: 'pasted.json', text });
  expect(fetchMod).toHaveBeenCalledTimes(5);
});
