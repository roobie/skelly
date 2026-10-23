import { expect, test, vi } from 'vitest';
import { MAX_MOD_BYTES } from '../src/game/browserMods.ts';
import { readPaste } from '../src/ui/modsPanel.ts';
import { baseScreenText } from './baseRegistry.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };

const messages = baseScreenText().mods;
const url = 'https://example.test/mod.json';
const text = JSON.stringify(fixture);

test('URL and pasted JSON reach mod admission as unchanged payloads', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(text));
  const result = await readPaste(` ${url} `, messages, fetchMod);
  expect(fetchMod).toHaveBeenCalledWith(url, { credentials: 'omit' });
  expect(result).toEqual({ name: url, text });
  expect(await readPaste(text, messages, fetchMod)).toEqual({ name: 'pasted.json', text });
  expect(fetchMod).toHaveBeenCalledOnce();
});

test('URL intake reports HTTP and network failures', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(text, { status: 403 }));
  expect((await readPaste(url, messages, fetchMod)).issue).toBeDefined();
  fetchMod.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect((await readPaste(url, messages, fetchMod)).issue).toBeDefined();
});

test('URL intake cancels streamed overflow before requesting another chunk', async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(
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
  expect((await readPaste(url, messages, fetchMod)).issue).toBeDefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(pulls).toBe(2);
});

test('malformed URL content passes intake unchanged for mod admission to refuse', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{'));
  expect(await readPaste(url, messages, fetchMod)).toEqual({ name: url, text: '{' });
});
