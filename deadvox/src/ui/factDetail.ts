import { html, type TemplateResult } from 'lit-html';

export const factDetail = (label: string, fact: string): TemplateResult => html`
  <span class="fact-detail" tabindex="0">${label}<span class="fact-detail-copy" role="tooltip">${fact}</span></span>
`;
