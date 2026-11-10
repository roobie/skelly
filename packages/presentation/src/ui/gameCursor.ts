import { html, render } from 'lit-html';

const template = html`<div id="game-cursor" aria-hidden="true"></div>`;

export const mountGameCursor = (root: HTMLElement): HTMLElement => {
  render(template, root);
  return root.firstElementChild as HTMLElement;
};
