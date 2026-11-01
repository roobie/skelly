import { html, render } from 'lit-html';
import type { ItemAction } from '../game/itemActions.ts';

/** Meta choice surface: the target's geometry cannot show which operation release will use. */
export const mountFurnitureRadial =
  (root: HTMLElement) =>
  (actions: readonly ItemAction[], selectedId: string | undefined, radiusPixels: number): void => {
    root.hidden = actions.length === 0;
    render(
      html`${actions.map((action, index) => {
        const angle = (index / actions.length) * Math.PI * 2;
        const x = Math.sin(angle) * radiusPixels;
        const y = -Math.cos(angle) * radiusPixels;
        return html`<div
          class=${action.id === selectedId ? 'radial-entry selected' : 'radial-entry'}
          style=${`transform: translate(-50%, -50%) translate(${x}px, ${y}px)`}
        >${action.label}</div>`;
      })}`,
      root,
    );
  };
