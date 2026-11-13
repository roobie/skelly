import { html, type TemplateResult } from 'lit-html';
import { listenForFactDetailPlacement } from './factDetailPlacement.ts';

export const factDetail = (label: string, fact: string): TemplateResult => {
  listenForFactDetailPlacement();
  return html`
  <span class="fact-detail" tabindex="0">${label}<span class="fact-detail-copy" role="tooltip">${fact}</span></span>
`;
};
