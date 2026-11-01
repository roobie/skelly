import { html, render } from 'lit-html';
import type { ItemAction } from '../game/itemActions.ts';

export const mountTreatmentChoices =
  (root: HTMLElement, choose: (id: string | undefined) => void) =>
  (actions: readonly ItemAction[] | undefined, labels: { treat: string; back: string }): void => {
    const opening = root.hidden && actions !== undefined;
    root.hidden = actions === undefined;
    render(
      actions === undefined
        ? html``
        : html`
      <section class="card" aria-label=${labels.treat}>
        <h2 class="treatment-choice-title">${labels.treat}</h2>
        ${actions.map((action) => html`<button class="inv-option" data-action=${action.id} @click=${() => choose(action.id)}>${action.label}</button>`)}
        <button class="inv-option" data-action="back" @click=${() => choose(undefined)}>${labels.back}</button>
      </section>
    `,
      root,
    );
    if (opening) {
      root.querySelector('button')?.focus();
    }
  };
