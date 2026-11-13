import { html, render } from 'lit-html';

const log = (): HTMLElement => document.getElementById('errors')!;
const copyButton = (): HTMLButtonElement => document.getElementById('errors-copy') as HTMLButtonElement;

let logged = '';

const show = (): void => {
  render(html`${logged}`, log());
  copyButton().hidden = logged === '';
};

/**
 * The one place a startup, content or run error lands. The log sits above the startup screen so its text can be
 * selected, and its copy button puts everything logged so far on the clipboard.
 */
export const appendError = (message: string): void => {
  logged = [logged, message].filter(Boolean).join('\n');
  show();
};

/** Replaces the whole log, as a refused startup does with the single reason the run cannot begin. */
export const setError = (message: string): void => {
  logged = message;
  show();
};

export const errorLogText = (): string => logged;

export const installErrorLogCopy = (): void => {
  copyButton().addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(logged);
    } catch {
      // Selecting the text by hand still works when the clipboard is unavailable.
    }
  });
  show();
};
