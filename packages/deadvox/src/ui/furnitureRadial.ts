import { html, nothing, render } from 'lit-html';
import type { ContentFile } from '../core/schema.ts';
import type { ItemAction } from '../game/itemActions.ts';

type RadialTuning = NonNullable<ContentFile['ui']>[number]['furnitureRadial'];

/** Meta choice surface: the target's geometry cannot show which operation release will use. */
export const mountFurnitureRadial =
  (root: HTMLElement) =>
  (actions: readonly ItemAction[], selectedId: string | undefined, tuning: RadialTuning): void => {
    root.hidden = actions.length === 0;
    const selectedIndex = actions.findIndex((action) => action.id === selectedId);
    const direction = (selectedIndex / actions.length) * Math.PI * 2 - Math.PI / 2;
    const style = `--radial-radius: ${tuning.radiusPixels}px;
      --radial-dead-zone: ${tuning.deadZonePixels}px;
      --radial-stroke: ${tuning.strokePixels}px;
      --radial-selected-label-scale: ${tuning.selectedLabelScale};
      --radial-label-padding: ${tuning.labelPaddingRem}rem;
      --radial-label-radius: ${tuning.labelRadiusRem}rem`;
    render(
      html`<div class="radial-face" style=${style}>
        <div class=${selectedIndex < 0 ? 'radial-centre' : 'radial-centre armed'}></div>
        ${
          selectedIndex < 0
            ? nothing
            : html`<div class="radial-pointer" style=${`transform: rotate(${direction}rad)`}>
          <div class="radial-spoke"></div>
        </div>`
        }
        ${actions.map((action, index) => {
          const angle = (index / actions.length) * Math.PI * 2;
          const x = Math.sin(angle) * tuning.radiusPixels;
          const y = -Math.cos(angle) * tuning.radiusPixels;
          return html`<div
            class=${action.id === selectedId ? 'radial-entry selected' : 'radial-entry'}
            style=${`transform: translate(-50%, -50%) translate(${x}px, ${y}px)`}
          >${action.label}</div>`;
        })}
      </div>`,
      root,
    );
  };
