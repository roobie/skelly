import { html, render } from 'lit-html';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { type BrowserMod, evaluateMods, MAX_MOD_BYTES, type ModEvaluation } from '../game/browserMods.ts';
import { ModStorage } from '../game/modStorage.ts';
import { factDetail } from './factDetail.ts';

const httpUrl = /^https?:\/\//i;
const sourceSequence = /^mod-(\d+)\//;

type ModsText = ScreenText['mods'];

export const readPaste = async (
  draft: string,
  messages: ModsText,
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
      return failed(messages.httpOnly);
    }
    if (!response.ok) {
      await response.body?.cancel();
      return failed(fillText(messages.httpStatus, { status: response.status }));
    }
    if (!response.body) {
      return failed(messages.emptyResponse);
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
          return failed(fillText(messages.tooLarge, { maxBytes: MAX_MOD_BYTES }));
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { name: value, text };
    } finally {
      reader.releaseLock();
    }
  } catch {
    return failed(messages.fetchFailed);
  }
};

const readUpload = async (file: File, messages: ModsText): Promise<{ name: string; text: string; issue?: string }> => {
  if (!file.name.toLowerCase().endsWith('.json')) {
    return { name: file.name, text: '', issue: messages.jsonOnly };
  }
  if (file.size > MAX_MOD_BYTES) {
    return { name: file.name, text: '', issue: fillText(messages.tooLarge, { maxBytes: MAX_MOD_BYTES }) };
  }
  try {
    return { name: file.name, text: await file.text() };
  } catch (error) {
    return { name: file.name, text: '', issue: error instanceof Error ? error.message : String(error) };
  }
};

// Meta: content selection precedes the world, so no world or bodily cue can replace it.
export const chooseMods = async (
  root: HTMLElement,
  text: ModsText,
  storage = new ModStorage(),
): Promise<ModEvaluation> => {
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
    const add = (name: string, contents: string) => {
      sequence += 1;
      mods.push({ source: `mod-${sequence}/${name}`, text: contents, enabled: true });
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
      const results = await Promise.all(files.map((file) => readUpload(file, text)));
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
      const result = await readPaste(draft, text);
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
      <section class="mods-card" aria-label=${text.heading}>
        <h1>${text.heading}</h1>
        <p>${factDetail(text.jsonLabel, fillText(text.jsonFact, { maxBytes: MAX_MOD_BYTES }))}</p>
        <pre role="alert">${storageFailed ? text.storageFailed : ''}</pre>
        <label>${text.input}<textarea aria-label=${text.inputLabel} ?disabled=${busy || storageFailed} .value=${draft} @input=${(
          event: Event,
        ) => {
          draft = (event.currentTarget as HTMLTextAreaElement).value;
        }}></textarea></label>
        <button type="button" ?disabled=${busy || storageFailed} @click=${paste}>${text.add}</button>
        <label>${text.upload}<input type="file" accept=".json,application/json" multiple ?disabled=${busy || storageFailed} @change=${upload}></label>
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
            <button type="button" aria-label=${fillText(text.moveUp, { mod: mod.source })} ?disabled=${busy || index === 0} @click=${() => move(index, -1)}>${text.up}</button>
            <button type="button" aria-label=${fillText(text.moveDown, { mod: mod.source })} ?disabled=${busy || index === mods.length - 1} @click=${() => move(index, 1)}>${text.down}</button>
            <button type="button" aria-label=${fillText(text.removeLabel, { mod: mod.source })} ?disabled=${busy} @click=${() => {
              mods.splice(index, 1);
              update();
            }}>${text.remove}</button>
            <pre role="status">${(result.issues.get(mod.source) ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('\n') || text.valid}</pre>
          </li>`,
        )}
        </ol>
        <button type="button" id="mods-start" ?disabled=${busy || !result.canStart} @click=${() => {
          const selected = evaluateMods(mods);
          if (!busy && selected.canStart) {
            root.hidden = true;
            resolve(selected);
          }
        }}>${text.start}</button>
      </section>`,
        root,
      );
    };
    draw();
  });
};
