import { html, nothing, render } from 'lit-html';
import type { ContentFile } from '../core/schema.ts';
import type { RadialAction } from '../game/furnitureActions.ts';

type RadialTuning = NonNullable<ContentFile['ui']>[number]['furnitureRadial'];

/** Meta choice surface: the target's geometry cannot show which operation release will use. */
export const mountFurnitureRadial =
  (root: HTMLElement) =>
  (actions: readonly RadialAction[], selectedId: string | undefined, tuning: RadialTuning): void => {
    root.hidden = actions.length === 0;
    const selected = actions.find((action) => action.id === selectedId);
    const direction = selected ? selected.angleRadians - Math.PI / 2 : undefined;
    const style = `--radial-radius: ${tuning.radiusPixels}px;
      --radial-dead-zone: ${tuning.deadZonePixels}px;
      --radial-stroke: ${tuning.strokePixels}px;
      --radial-selected-label-scale: ${tuning.selectedLabelScale};
      --radial-label-padding: ${tuning.labelPaddingRem}rem;
      --radial-label-radius: ${tuning.labelRadiusRem}rem`;
    render(
      html`<div class="radial-face" style=${style}>
        <div class=${selected ? 'radial-centre armed' : 'radial-centre'}></div>
        ${
          selected
            ? html`<div class="radial-pointer" style=${`transform: rotate(${direction}rad)`}>
          <div class="radial-spoke"></div>
        </div>`
            : nothing
        }
        ${actions.map((action) => {
          const angle = action.angleRadians;
          const x = Math.sin(angle) * tuning.radiusPixels;
          const y = -Math.cos(angle) * tuning.radiusPixels;
          return html`<div
            data-action=${action.id}
            class=${action.id === selectedId ? 'radial-entry selected' : 'radial-entry'}
            style=${`transform: translate(-50%, -50%) translate(${x}px, ${y}px)`}
          >${action.label}</div>`;
        })}
      </div>`,
      root,
    );
  };
