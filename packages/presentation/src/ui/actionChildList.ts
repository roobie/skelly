import type { ItemAction } from '@skelly/engine/inventory';
import { html, render } from 'lit-html';

/**
 * The list a radial entry opens when it stands for several actions. Back returns to the ring rather than closing the
 * menu, so a wrong entry costs one step.
 */
export const mountActionChildList =
  (root: HTMLElement, choose: (id: string | undefined) => void) =>
  (heading: string, children: readonly ItemAction[] | undefined, back: string): void => {
    const opening = root.hidden && children !== undefined;
    root.hidden = children === undefined;
    render(
      children === undefined
        ? html``
        : html`<section class="card" aria-label=${heading}>
            <h2 class="action-child-heading">${heading}</h2>
            ${children.map(
              (child) =>
                html`<button class="inv-option" data-action=${child.id} @click=${() => choose(child.id)}>${child.label}</button>`,
            )}
            <button class="inv-option" data-action="back" @click=${() => choose(undefined)}>${back}</button>
          </section>`,
      root,
    );
    if (opening) {
      root.querySelector('button')?.focus();
    }
  };
