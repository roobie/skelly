import { html, render } from 'lit-html';
import { bundledModChoices, bundledModsUrl } from '../game/bundledMods.ts';
import { factDetail } from './factDetail.ts';

/**
 * Lists every bundled mod on the launcher with the running ones checked. Content and the save
 * identity are fixed at startup, so a change reloads with the new `mods=` instead of swapping them live.
 */
export const mountModOptions = (
  root: HTMLElement,
  active: readonly string[],
  navigate: (href: string) => void = (href) => location.assign(href),
): void => {
  const change = (id: string, on: boolean): void => {
    const ids = bundledModChoices.map((mod) => mod.id).filter((modId) => (modId === id ? on : active.includes(modId)));
    navigate(bundledModsUrl(location.href, ids));
  };
  render(
    html`<fieldset>
      <legend>${factDetail('Mods', 'Each set of mods keeps its own saved world.')}</legend>
      ${bundledModChoices.map(
        (mod) =>
          html`<label data-bundled-mod=${mod.id}><input type="checkbox" .checked=${active.includes(mod.id)} @change=${(e: Event) => change(mod.id, (e.target as HTMLInputElement).checked)} /> ${factDetail(mod.label, mod.detail)}</label>`,
      )}
    </fieldset>`,
    root,
  );
};
