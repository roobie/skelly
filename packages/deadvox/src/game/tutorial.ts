import type { Vec3 } from '../core/coords.ts';
import type { LightPracticeDef } from '../core/schema.ts';
import type { Rect } from '../core/site.ts';
import { TutorialWeapons } from './tutorialWeapons.ts';

export interface TutorialObservation {
  position: Vec3;
  yaw: number;
  crouching: boolean;
  doorOpen: boolean;
  searched: boolean;
  looted: boolean;
  wielded: boolean;
  lightOn: boolean;
  /** The type of the light that is on, if any. */
  litType: string | undefined;
  paused: boolean;
}

const LIGHT_STAGES = ['light-on', 'light-swap', 'light-relight'] as const;

type EssentialsStage = 'move' | 'door' | 'loot' | 'hands' | 'open' | 'eat' | 'drink' | 'light' | 'escape' | 'pause';

/** A presentation projection: ordinary action owners supply outcomes, never commands. */
export class Tutorial {
  private readonly achieved = new Set<string>();
  private lightWasOn = false;
  private essentialsDone = false;
  private lightStarted = false;
  private weaponsChosen = false;
  readonly weapons = new TutorialWeapons();

  chooseWeapons(): void {
    if (this.stage === 'finish') {
      this.weaponsChosen = true;
    }
  }

  private readonly spawn: Vec3;
  private readonly startingYaw: number;
  private readonly exit: Rect;
  readonly lightKit: LightPracticeDef;

  constructor(spawn: Vec3, startingYaw: number, exit: Rect, lightKit: LightPracticeDef) {
    this.spawn = spawn;
    this.startingYaw = startingYaw;
    this.exit = exit;
    this.lightKit = lightKit;
  }

  /** The essentials route is finished and the optional light module can be chosen. */
  get canStartLight(): boolean {
    return this.essentialsDone && !this.lightStarted && (this.stage === 'finish' || this.stage === 'complete');
  }

  startLight(): void {
    if (this.canStartLight) {
      this.lightStarted = true;
    }
  }

  /** The battery owner finished a swap; swaps before the module starts teach nothing. */
  batterySwapped(lightType: string): void {
    if (this.lightStarted && lightType === this.lightKit.light) {
      this.achieved.add('light-swap');
    }
  }

  opened(type: string): void {
    this.achieved.add(`opened:${type}`);
  }

  consumed(type: string): void {
    this.achieved.add(`consumed:${type}`);
  }

  observe(state: TutorialObservation): void {
    const remember = (id: string, outcome: boolean) => {
      if (outcome) {
        this.achieved.add(id);
      }
    };
    remember('move', Math.hypot(state.position[0] - this.spawn[0], state.position[2] - this.spawn[2]) >= 6);
    remember('look', Math.abs(state.yaw - this.startingYaw) > 0.25);
    remember('door', state.doorOpen);
    remember('loot', state.searched && state.looted);
    remember('hands', state.wielded);
    this.lightWasOn ||= state.lightOn;
    remember('light', this.lightWasOn && !state.lightOn);
    remember('crouch', state.crouching);
    remember(
      'escape',
      state.position[0] >= this.exit.x0 &&
        state.position[0] < this.exit.x1 &&
        state.position[2] >= this.exit.z0 &&
        state.position[2] < this.exit.z1,
    );
    if (this.lightStarted && state.litType === this.lightKit.light) {
      this.achieved.add('light-on');
      // Lit after a swap: on again, whether it stayed on through the swap or was switched back on.
      remember('light-relight', this.achieved.has('light-swap'));
    }
    if (this.stage === 'pause' && state.paused) {
      this.essentialsDone = true;
    }
  }

  get stage(): EssentialsStage | 'finish' | 'revolver' | 'pump' | 'melee' | 'complete' | (typeof LIGHT_STAGES)[number] {
    const essentials = this.essentialsStage;
    if (essentials !== 'pause' || !this.essentialsDone) {
      return essentials;
    }
    if (this.lightStarted) {
      const light = LIGHT_STAGES.find((id) => !this.achieved.has(id));
      if (light) {
        return light;
      }
    }
    if (!this.weaponsChosen) {
      return 'finish';
    }
    if (this.weapons.lesson('revolver')) {
      return 'revolver';
    }
    if (this.weapons.lesson('pump')) {
      return 'pump';
    }
    return this.weapons.melee ? 'complete' : 'melee';
  }

  private get essentialsStage(): EssentialsStage {
    const outcomes: [EssentialsStage, boolean][] = [
      ['move', this.achieved.has('move') && this.achieved.has('look')],
      ['door', this.achieved.has('door')],
      ['loot', this.achieved.has('loot')],
      ['hands', this.achieved.has('hands') || this.achieved.has('opened:canned_beans')],
      ['open', this.achieved.has('opened:canned_beans')],
      ['eat', this.achieved.has('consumed:beans')],
      ['drink', this.achieved.has('consumed:water_bottle')],
      ['light', this.achieved.has('light')],
      ['escape', this.achieved.has('escape') && this.achieved.has('crouch')],
    ];
    return outcomes.find(([, achieved]) => !achieved)?.[0] ?? 'pause';
  }
}
