import type { ConditionBand } from '@skelly/engine/inventory';
import { html, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';

/**
 * A condition band word with its content colour blip beside it, the one render every surface that names a band uses
 * (`packages/deadvox/INTERFACE.md`, "Condition"). `word` replaces the band's own word where a line capitalises it.
 */
export const conditionMark = (band: ConditionBand, word: string = band.word): TemplateResult =>
  html`<span class="condition-mark"><span class="condition-blip" style=${styleMap({ '--blip': band.color })}></span>${word}</span>`;
