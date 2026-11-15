import type { ConditionBand } from '@skelly/engine/inventory';
import { html, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';

/**
 * A condition band's content colour blip, the one render every surface that shows a condition uses
 * (`packages/deadvox/INTERFACE.md`, "Condition"). Only the selected item's card passes `word`, to show the band word
 * beside the blip; elsewhere the band word is only the blip's accessible name.
 */
export const conditionMark = (band: ConditionBand, word?: string): TemplateResult => {
  const blip = styleMap({ '--blip': band.color });
  return word === undefined
    ? html`<span class="condition-mark"><span class="condition-blip" role="img" aria-label=${band.word} style=${blip}></span></span>`
    : html`<span class="condition-mark"><span class="condition-blip" aria-hidden="true" style=${blip}></span>${word}</span>`;
};
