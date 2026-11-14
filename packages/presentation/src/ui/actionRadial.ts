import type { ActionMenuTuning } from '@skelly/engine/content';
import type { RadialAction } from '@skelly/engine/sim';
import { html, nothing, render } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';

export const radialLabelRadius = (
  boxes: readonly Readonly<{ angleRadians: number; width: number; height: number }>[],
  radius: number,
  gap: number,
): number => {
  let fit = radius;
  for (const [index, box] of boxes.entries()) {
    for (const other of boxes.slice(0, index)) {
      const dx = Math.abs(Math.sin(box.angleRadians) - Math.sin(other.angleRadians));
      const dy = Math.abs(Math.cos(box.angleRadians) - Math.cos(other.angleRadians));
      fit = Math.max(
        fit,
        Math.min(((box.width + other.width) / 2 + gap) / dx, ((box.height + other.height) / 2 + gap) / dy),
      );
    }
  }
  return Math.ceil(fit);
};

/**
 * The radial action menu. The centre ring stays dashed until the pull selects an entry, so the player can tell a
 * release in the dead zone will choose no entry; the pull dot shows which way the pointer leans before it gets there.
 */
export const mountActionRadial =
  (root: HTMLElement, tuning: ActionMenuTuning) =>
  (
    entries: readonly RadialAction[],
    selectedId: string | undefined,
    pull: Readonly<{ x: number; y: number }>,
    /** What a release at the centre does, for a ring where that is more than cancelling. */
    centreLabel?: string,
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
        <div class=${selected ? 'radial-centre selected' : 'radial-centre'}>${
          centreLabel === undefined ? nothing : html`<span class="radial-centre-label">${centreLabel}</span>`
        }</div>
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
    const labels = [...root.querySelectorAll<HTMLElement>('.radial-entry')];
    // Reserve the larger font for every entry so selecting a label cannot push its neighbours around.
    for (const label of labels) {
      label.classList.toggle('selected', tuning.selectedLabelScale >= 1);
    }
    const placed = entries.map((entry, index) => {
      const label = labels[index];
      if (!label) {
        throw new Error(`Missing radial label for ${entry.id}`);
      }
      return { entry, label };
    });
    const boxes = placed.map(({ entry, label }) => {
      const { width, height } = label.getBoundingClientRect();
      return { angleRadians: entry.angleRadians, width, height };
    });
    const radius = radialLabelRadius(boxes, tuning.radiusPixels, tuning.strokePixels);
    for (const { entry, label } of placed) {
      label.classList.toggle('selected', entry === selected);
      label.style.transform = `translate(-50%, -50%) translate(${Math.sin(entry.angleRadians) * radius}px, ${-Math.cos(entry.angleRadians) * radius}px)`;
    }
    root.querySelector<HTMLElement>('.radial-face')?.style.setProperty('--radial-radius', `${radius}px`);
  };
