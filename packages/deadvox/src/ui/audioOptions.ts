import { html, render, type TemplateResult } from 'lit-html';

const AUDIO_VOLUME_CATEGORIES = ['master', 'world', 'body', 'ui'] as const;
export type AudioVolumeCategory = (typeof AUDIO_VOLUME_CATEGORIES)[number];
export type AudioVolumes = Readonly<Record<AudioVolumeCategory, number>>;

const LABELS: Record<AudioVolumeCategory, string> = {
  master: 'Master',
  world: 'World',
  body: 'Body',
  ui: 'UI',
};

const optionsTemplate = (
  volumes: AudioVolumes,
  change: (category: AudioVolumeCategory, value: number) => void,
): TemplateResult => html`
  <section class="audio-options">
    <h2>Audio</h2>
    ${AUDIO_VOLUME_CATEGORIES.map((category) => {
      const setFromPointer = (event: MouseEvent | PointerEvent): void => {
        if (event.clientX === 0) {
          return;
        }
        const input = event.currentTarget as HTMLInputElement;
        const bounds = input.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        input.value = (Math.round(ratio * 100) / 100).toFixed(2);
        change(category, Number(input.value));
      };
      return html`
        <label class="audio-options__row" for="audio-volume-${category}">
          <span>${LABELS[category]}</span>
          <input
            id="audio-volume-${category}"
            type="range"
            min="0"
            max="1"
            step="0.01"
            .value=${String(volumes[category])}
            aria-label="${LABELS[category]} volume"
            @input=${(event: Event) => change(category, Number((event.currentTarget as HTMLInputElement).value))}
            @pointerdown=${setFromPointer}
            @click=${setFromPointer}
          />
          <output>${volumes[category].toFixed(2)}</output>
        </label>
      `;
    })}
  </section>
`;

/** Renders persistent audio controls into the lit-html main menu. */
export const renderAudioOptions = (
  root: HTMLElement,
  initial: AudioVolumes,
  setVolume: (category: AudioVolumeCategory, value: number) => void,
): void => {
  let volumes = { ...initial };
  const change = (category: AudioVolumeCategory, value: number): void => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolume(category, clamped);
    volumes = { ...volumes, [category]: clamped };
    render(optionsTemplate(volumes, change), root);
  };
  render(optionsTemplate(volumes, change), root);
};
