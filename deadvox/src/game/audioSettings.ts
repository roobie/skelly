import type { AudioVolumes, GameAudio } from './audio.ts';

const VOLUME_LABELS: Record<keyof AudioVolumes, string> = {
  master: 'Master',
  world: 'World',
  body: 'Body',
  ui: 'UI',
};

export const mountAudioSettings = (host: HTMLElement, audio: GameAudio, close: () => void): void => {
  host.replaceChildren();
  const heading = document.createElement('h2');
  heading.id = 'audio-settings-title';
  heading.textContent = 'Audio';
  host.append(heading);
  for (const [key, label] of Object.entries(VOLUME_LABELS) as [keyof AudioVolumes, string][]) {
    const row = document.createElement('label');
    row.className = 'audio-settings__row';
    const text = document.createElement('span');
    text.textContent = label;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.01';
    range.value = String(audio.settings[key]);
    range.setAttribute('aria-label', label);
    range.addEventListener('input', () => audio.setVolume(key, Number(range.value)));
    row.append(text, range);
    host.append(row);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'audio-settings-close';
  button.textContent = 'Close';
  button.addEventListener('click', close);
  host.append(button);
};
