import { html, render } from 'lit-html';
import type { Tutorial } from '../game/tutorial.ts';

export const mountTutorial = (tutorial: Tutorial, exit: () => void, restart: () => void): (() => void) => {
  const box = document.getElementById('tutorial-objective')!;
  box.hidden = false;
  render(
    html`
    <button type="button" @click=${restart}>Restart practice</button>
    <button type="button" @click=${exit}>Exit practice</button>
  `,
    document.getElementById('tutorial-actions')!,
  );
  return () => {
    const prompts: Record<Tutorial['stage'], string> = {
      move: 'Supply station',
      door: 'Station door',
      loot: 'Supplies',
      hands: 'Beans in hand',
      eat: 'Eat',
      drink: 'Drink',
      light: 'Flashlight',
      escape: 'Escape path',
      pause: 'Open the pause menu',
    };
    render(
      html`
      <p class="tutorial-copy">${prompts[tutorial.stage]}</p>
      <p class="tutorial-copy tutorial-note">Unsaved practice</p>
    `,
      box,
    );
  };
};
