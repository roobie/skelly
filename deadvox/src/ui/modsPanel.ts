import { html, render } from 'lit-html';
import { type BrowserMod, evaluateMods, MAX_MOD_BYTES } from '../game/browserMods.ts';
import type { StartupContent } from '../game/bundledContent.ts';
import { factDetail } from './factDetail.ts';

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
export const chooseMods = (root: HTMLElement): Promise<StartupContent> =>
  new Promise((resolve) => {
    const mods: BrowserMod[] = [];
    let draft = '';
    let sequence = 0;
    let busy = false;
    let uploadError = '';
    const add = (name: string, text: string) => {
      sequence += 1;
      mods.push({ source: `mod-${sequence}/${name}`, text, enabled: true });
    };
    const move = (index: number, offset: number) => {
      const target = index + offset;
      if (target >= 0 && target < mods.length) {
        [mods[index], mods[target]] = [mods[target]!, mods[index]!];
        draw();
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
      draw();
    };
    const draw = () => {
      const result = evaluateMods(mods);
      render(
        html`
      <section class="mods-card" aria-label="Mods">
        <h1>Mods</h1>
        <p>${factDetail('JSON files', `Data only. Later files replace whole definitions with the same id. Limit: ${MAX_MOD_BYTES} bytes per file. Mods are not stored across reloads in this preview.`)}</p>
        <label>JSON<textarea aria-label="Mod JSON" .value=${draft} @input=${(event: Event) => {
          draft = (event.currentTarget as HTMLTextAreaElement).value;
        }}></textarea></label>
        <button type="button" ?disabled=${busy} @click=${() => {
          if (draft.trim()) {
            add('pasted.json', draft);
            draft = '';
            draw();
          }
        }}>Add JSON</button>
        <label>Upload .json<input type="file" accept=".json,application/json" multiple ?disabled=${busy} @change=${upload}></label>
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
              draw();
            }}>${mod.source}</label>
            <button type="button" aria-label=${`Move ${mod.source} up`} ?disabled=${busy || index === 0} @click=${() => move(index, -1)}>Up</button>
            <button type="button" aria-label=${`Move ${mod.source} down`} ?disabled=${busy || index === mods.length - 1} @click=${() => move(index, 1)}>Down</button>
            <button type="button" aria-label=${`Remove ${mod.source}`} ?disabled=${busy} @click=${() => {
              mods.splice(index, 1);
              draw();
            }}>Remove</button>
            <pre role="status">${(result.issues.get(mod.source) ?? []).map((issue) => `${issue.path}: ${issue.message}`).join('\n') || 'Valid'}</pre>
          </li>`,
        )}
        </ol>
        <button type="button" id="mods-start" ?disabled=${busy || !result.canStart} @click=${() => {
          const selected = evaluateMods(mods);
          if (!busy && selected.canStart) {
            root.hidden = true;
            resolve(selected.content);
          }
        }}>Start</button>
      </section>`,
        root,
      );
    };
    draw();
  });
