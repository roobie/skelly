import type { Vec3 } from '../core/coords.ts';
import type { Rect } from '../core/site.ts';

export interface TutorialObservation {
  position: Vec3;
  yaw: number;
  crouching: boolean;
  doorOpen: boolean;
  searched: boolean;
  looted: boolean;
  wielded: boolean;
  lightOn: boolean;
  paused: boolean;
}

/** A presentation projection: ordinary action owners supply outcomes, never commands. */
export class Tutorial {
  private readonly achieved = new Set<string>();
  private lightWasOn = false;
  private completed = false;

  private readonly spawn: Vec3;
  private readonly startingYaw: number;
  private readonly exit: Rect;
  private readonly onComplete: () => void;

  constructor(spawn: Vec3, startingYaw: number, exit: Rect, onComplete: () => void) {
    this.spawn = spawn;
    this.startingYaw = startingYaw;
    this.exit = exit;
    this.onComplete = onComplete;
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
    if (this.stage === 'pause' && state.paused && !this.completed) {
      this.completed = true;
      this.onComplete();
    }
  }

  get stage(): 'move' | 'door' | 'loot' | 'hands' | 'open' | 'eat' | 'drink' | 'light' | 'escape' | 'pause' {
    const outcomes: [Tutorial['stage'], boolean][] = [
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

export const tutorialRequested = (params: URLSearchParams): boolean =>
  params.get('tutorial') === '1' || params.get('site') === 'tutorial';

export const tutorialUrl = (href: string, practice: boolean): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  for (const name of ['render', 'radius', 'actors', 'save-backend', 'mods']) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      presentation.set(name, value);
    }
  }
  const site = url.searchParams.get('site');
  if (site !== null && site !== 'tutorial') {
    presentation.set('site', site);
  }
  url.search = presentation.toString();
  url.hash = '';
  if (practice) {
    url.searchParams.set('tutorial', '1');
  }
  return url.href;
};
