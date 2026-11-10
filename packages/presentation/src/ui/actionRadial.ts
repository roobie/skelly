import type { ActionMenuTuning } from '@skelly/engine/content';
import type { RadialAction } from '@skelly/engine/sim';
import { html, nothing, render } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';

/**
 * The radial action menu. The centre ring stays dashed until the pull selects an entry, so the player can tell a
 * release in the dead zone will do nothing; the pull dot shows which way the pointer leans before it gets there.
 */
export const mountActionRadial =
  (root: HTMLElement) =>
  (
    entries: readonly RadialAction[],
    selectedId: string | undefined,
    pull: Readonly<{ x: number; y: number }>,
    tuning: ActionMenuTuning,
  ): void => {
    root.hidden = entries.length === 0;
    const selected = entries.find((entry) => entry.id === selectedId);
    const pullLength = Math.hypot(pull.x, pull.y);
    const face = {
      '--radial-radius': `${tuning.radiusPixels}px`,
      '--radial-dead-zone': `${tuning.deadZonePixels}px`,
      '--radial-stroke': `${tuning.strokePixels}px`,
      '--radial-pull-size': `${tuning.pullIndicatorPixels}px`,
      '--radial-selected-label-scale': String(tuning.selectedLabelScale),
      '--radial-label-padding': `${tuning.labelPaddingRem}rem`,
      '--radial-label-radius': `${tuning.labelRadiusRem}rem`,
    };
    render(
      html`<div class="radial-face" style=${styleMap(face)}>
        <div class=${selected ? 'radial-centre selected' : 'radial-centre'}></div>
        ${
          pullLength > 0
            ? html`<div
                class="radial-pull"
                style=${styleMap({
                  left: `${(pull.x / pullLength) * tuning.deadZonePixels}px`,
                  top: `${(pull.y / pullLength) * tuning.deadZonePixels}px`,
                })}
              ></div>`
            : nothing
        }
        ${
          selected
            ? html`<div class="radial-pointer" style=${styleMap({ transform: `rotate(${selected.angleRadians - Math.PI / 2}rad)` })}>
                <div class="radial-spoke"></div>
              </div>`
            : nothing
        }
        ${entries.map((entry) => {
          const x = Math.sin(entry.angleRadians) * tuning.radiusPixels;
          const y = -Math.cos(entry.angleRadians) * tuning.radiusPixels;
          return html`<div
            data-action=${entry.id}
            class=${entry === selected ? 'radial-entry selected' : 'radial-entry'}
            style=${styleMap({ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` })}
          >${entry.label}</div>`;
        })}
      </div>`,
      root,
    );
  };
