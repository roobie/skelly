import { expect, test, vi } from 'vitest';
import { evaluateMods, MAX_MOD_BYTES } from '../src/game/browserMods.ts';
import { readPaste } from '../src/ui/modsPanel.ts';
import fixture from './fixtures/mods/browser-mod.json' with { type: 'json' };

const url = 'https://example.test/mod.json';
const text = JSON.stringify(fixture);

test('URL and pasted JSON share ordinary mod admission', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(text));
  const result = await readPaste(` ${url} `, fetchMod);
  expect(fetchMod).toHaveBeenCalledWith(url, { credentials: 'omit' });
  expect(result).toEqual({ name: url, text });
  const accepted = evaluateMods([{ source: result.name, text: result.text, enabled: true }]);
  expect(accepted.canStart).toBe(true);
  expect(accepted.content.registry.items.get(fixture.items[0]!.id)?.name).toBe(fixture.items[0]!.name);
  expect(await readPaste(text, fetchMod)).toEqual({ name: 'pasted.json', text });
  expect(fetchMod).toHaveBeenCalledOnce();
});

test('URL intake reports HTTP and network failures', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(text, { status: 403 }));
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
  fetchMod.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
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
  expect((await readPaste(url, fetchMod)).issue).toBeDefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(pulls).toBe(2);
});

test('malformed URL content is refused by mod admission', async () => {
  const fetchMod = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{'));
  const invalid = await readPaste(url, fetchMod);
  const result = evaluateMods([{ source: invalid.name, text: invalid.text, enabled: true }]);
  expect(result.canStart).toBe(false);
  expect(result.issues.get(url)?.length).toBeGreaterThan(0);
});
