import { html, render } from 'lit-html';
import { labelForAction } from '../game/inputBindings.ts';
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
    const key = labelForAction;
    const prompts: Record<Tutorial['stage'], string> = {
      move: `Supply station ahead: click to look around, then walk toward its door (${key('movement.forward')}). ${key('movement.sprint')} sprints; save stamina for escape.`,
      door: `Look at the station door and use ${key('world.interact')} to open it. Get close enough for the live prompt.`,
      loot: `Inside, search the supply cabinet with ${key('world.interact')}. Open inventory (${key('ui.inventory-toggle')}) and drag a supply from Around into a worn pocket. Wait for handling to finish.`,
      hands: 'Drag the beans into an empty hand and wait for handling. Owning food is not eating it.',
      eat: `With beans in hand, close inventory and use that hand (${key('hand.use-dominant')}: dominant; ${key('hand.use-off')}: off hand). Watch your needs in inventory.`,
      drink:
        'Put the water bottle in a hand; close inventory and use that hand to drink. Fatigue needs rest, not food.',
      light:
        'The roofed station is dim: wield the flashlight, use its hand to switch it on, then switch it off. Battery charge is finite; visible light attracts threats.',
      escape: `A shambler is east of the station. Do not fight: crouch (${key('player.crouch-toggle')}) and follow the dirt path west, then north to its end. Keep the station between you and it. Crouching is not invisibility. If hurt, wield a bandage and use its treatment action.`,
      pause: `You made it. Open the pause menu (${key('ui.main-menu-toggle')}) to finish. Normal play autosaves in this browser; Continue restores a compatible checkpoint. Storage can fail and death is permanent. Practice is never saved.`,
    };
    render(
      html`
      <p class="tutorial-copy">${prompts[tutorial.stage]}</p>
      <p class="tutorial-copy tutorial-note">Unsaved practice — your saved world is untouched. Inventory does not pause danger. ${key('ui.main-menu-toggle')} opens the pause menu.</p>
    `,
      box,
    );
  };
};
