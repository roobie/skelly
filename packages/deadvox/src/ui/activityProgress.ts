import { html, nothing, type TemplateResult } from 'lit-html';

const RING_CIRCUMFERENCE = 276.46;

export interface ActivityProgressOptions {
  readonly label: string;
  readonly percent: number;
  readonly progressText: string;
  readonly minimumPercent?: number;
  readonly detail?: TemplateResult | typeof nothing;
  readonly controls?: TemplateResult | typeof nothing;
}

export const activityProgress = ({
  label,
  percent,
  progressText,
  minimumPercent,
  detail = nothing,
  controls = nothing,
}: ActivityProgressOptions): TemplateResult => {
  const progress = Math.max(0, Math.min(100, percent));
  return html`<section class="activity-progress">
    <div
      class="activity-progress-gauge"
      role="progressbar"
      aria-label=${label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${progress}
    >
      <svg class="activity-progress-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle class="activity-progress-track" cx="50" cy="50" r="44"></circle>
        <circle
          class="activity-progress-value"
          cx="50"
          cy="50"
          r="44"
          style=${`stroke-dashoffset: ${RING_CIRCUMFERENCE * (1 - progress / 100)}`}
        ></circle>
      </svg>
      ${
        minimumPercent === undefined
          ? nothing
          : html`<span
              class="activity-progress-minimum"
              aria-hidden="true"
              style=${`--minimum-angle: ${minimumPercent * 3.6}deg`}
            ></span>`
      }
    </div>
    <div class="activity-progress-copy">
      <strong>${label}</strong>
      <span>${progressText}</span>
      ${minimumPercent === undefined ? nothing : html`<span>Minimum release ${minimumPercent}%</span>`}
      ${detail}
    </div>
    ${controls === nothing ? nothing : html`<div class="activity-progress-controls">${controls}</div>`}
  </section>`;
};
