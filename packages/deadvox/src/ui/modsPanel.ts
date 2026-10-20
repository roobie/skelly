import { html, render } from 'lit-html';
import { type BrowserMod, evaluateMods, MAX_MOD_BYTES, type ModEvaluation } from '../game/browserMods.ts';
import { ModStorage } from '../game/modStorage.ts';
import { factDetail } from './factDetail.ts';

const httpUrl = /^https?:\/\//i;
const sourceSequence = /^mod-(\d+)\//;

export const readPaste = async (
  draft: string,
  fetchMod: typeof fetch = fetch,
): Promise<{ name: string; text: string; issue?: string }> => {
  const value = draft.trim();
  if (!httpUrl.test(value)) {
    return { name: 'pasted.json', text: draft };
  }
  const failed = (issue: string) => ({ name: value, text: '', issue });
  try {
    const response = await fetchMod(value, { credentials: 'omit' });
    if (response.url && !httpUrl.test(response.url)) {
      await response.body?.cancel();
      return failed('HTTP or HTTPS URLs only');
    }
    if (!response.ok) {
      await response.body?.cancel();
      return failed(`HTTP ${response.status}`);
    }
    if (!response.body) {
      return failed('Empty response');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: Read sequentially so the byte bound precedes the next pull.
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        bytes += chunk.value.byteLength;
        if (bytes > MAX_MOD_BYTES) {
          await reader.cancel();
          return failed(`File exceeds ${MAX_MOD_BYTES} bytes`);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { name: value, text };
    } finally {
      reader.releaseLock();
    }
  } catch {
    return failed('Could not fetch URL; the host may not allow browser access');
  }
};

const readUpload = async (file: File): Promise<{ name: string; text: string; issue?: string }> => {
  if (!file.name.toLowerCase().endsWith('.json')) {
    return { name: file.name, text: '', issue: '.json files only' };
  }
  if (file.size > MAX_MOD_BYTES) {
    return { name: file.name, text: '', issue: `File exceeds ${MAX_MOD_BYTES} bytes` };
  }
  try {
    return { name: file.name, text: await file.text() };
  } catch (error) {
    return { name: file.name, text: '', issue: error instanceof Error ? error.message : String(error) };
  }
};

// Meta: content selection precedes the world, so no world or bodily cue can replace it.
export const chooseMods = async (root: HTMLElement, storage = new ModStorage()): Promise<ModEvaluation> => {
  let initial: BrowserMod[] = [];
  let storageFailed = false;
  try {
    initial = await storage.load();
  } catch {
    storageFailed = true;
  }
  return new Promise((resolve) => {
    const mods: BrowserMod[] = initial;
    let draft = '';
    let sequence = mods.reduce((max, mod) => Math.max(max, Number(sourceSequence.exec(mod.source)?.[1]) || 0), 0);
    let busy = false;
    let uploadError = '';
    const add = (name: string, text: string) => {
      sequence += 1;
      mods.push({ source: `mod-${sequence}/${name}`, text, enabled: true });
    };
    const update = async () => {
      busy = true;
      draw();
      try {
        await storage.save(mods);
      } catch {
        mods.splice(0);
        storageFailed = true;
      }
      busy = false;
      draw();
    };
    const move = (index: number, offset: number) => {
      const target = index + offset;
      if (target >= 0 && target < mods.length) {
        [mods[index], mods[target]] = [mods[target]!, mods[index]!];
        update();
      }
    };
    const upload = async (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const files = [...(input.files ?? [])];
      busy = true;
      uploadError = '';
      draw();
      const results = await Promise.all(files.map(readUpload));
      for (const result of results) {
        if (result.issue) {
          uploadError += `${result.name}: ${result.issue}\n`;
        } else {
          add(result.name, result.text);
        }
      }
      busy = false;
      input.value = '';
      await update();
    };
    const paste = async () => {
      if (!draft.trim() || busy) {
        return;
      }
      busy = true;
      uploadError = '';
      draw();
      const result = await readPaste(draft);
      if (result.issue) {
        uploadError = `${result.name}: ${result.issue}`;
      } else {
        add(result.name, result.text);
        draft = '';
      }
      busy = false;
      await update();
    };
    const draw = () => {
      const result = evaluateMods(mods);
      render(
        html`
      <section class="mods-card" aria-label="Mods">
        <h1>Mods</h1>
        <p>${factDetail('JSON files', `Later JSON files replace whole definitions with the same id; the limit is ${MAX_MOD_BYTES} bytes per file. Selections are stored in this browser; saves require the same enabled mods in the same order.`)}</p>
        <pre role="alert">${storageFailed ? 'Mod storage unavailable · No mods loaded' : ''}</pre>
        <label>JSON or URL<textarea aria-label="Mod JSON or URL" ?disabled=${busy || storageFailed} .value=${draft} @input=${(
          event: Event,
        ) => {
          draft = (event.currentTarget as HTMLTextAreaElement).value;
        }}></textarea></label>
        <button type="button" ?disabled=${busy || storageFailed} @click=${paste}>Add</button>
        <label>Upload .json<input type="file" accept=".json,application/json" multiple ?disabled=${busy || storageFailed} @change=${upload}></label>
        <pre role="alert">${uploadError}</pre>
        <pre role="alert">${[...result.issues]
          .filter(([source]) => !mods.some((mod) => mod.source === source))
          .flatMap(([source, issues]) => issues.map((issue) => `${source} ${issue.path}: ${issue.message}`))
          .join('\n')}</pre>
        <ol>${mods.map(
          (mod, index) => html`
          <li data-mod-source=${mod.source}>
            <label><input type="checkbox" .checked=${mod.enabled} ?disabled=${busy} @change=${(event: Event) => {
              mod.enabled = (event.currentTarget as HTMLInputElement).checked;
              update();
            }}>${mod.source}</label>
            <button type="button" aria-label=${`Move ${mod.source} up`} ?disabled=${busy || index === 0} @click=${() => move(index, -1)}>Up</button>
            <button type="button" aria-label=${`Move ${mod.source} down`} ?disabled=${busy || index === mods.length - 1} @click=${() => move(index, 1)}>Down</button>
            <button type="button" aria-label=${`Remove ${mod.source}`} ?disabled=${busy} @click=${() => {
              mods.splice(index, 1);
              update();
            }}>Remove</button>
            <pre role="status">${(result.issues.get(mod.source) ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('\n') || 'Valid'}</pre>
          </li>`,
        )}
        </ol>
        <button type="button" id="mods-start" ?disabled=${busy || !result.canStart} @click=${() => {
          const selected = evaluateMods(mods);
          if (!busy && selected.canStart) {
            root.hidden = true;
            resolve(selected);
          }
        }}>Start</button>
      </section>`,
        root,
      );
    };
    draw();
  });
};
