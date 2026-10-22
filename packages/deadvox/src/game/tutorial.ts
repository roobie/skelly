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
  /** Present only while the optional combat module can observe; the essentials route never reads it. */
  combat?: CombatObservation;
}

/** What the firearm owners report for the guns the combat module teaches. */
export interface CombatObservation {
  revolverHeld: boolean;
  /** Live cartridges in the cylinder. */
  revolverRounds: number;
  /** A firearm in hand is raised and ready to shoot. */
  aiming: boolean;
  shotgunHeld: boolean;
  /** Shells in the tube and chamber. */
  shotgunRounds: number;
  shotgunChambered: boolean;
  inventoryOpen: boolean;
  /** A shambler is still alive to shoot at. */
  targetAlive: boolean;
}

/** A downed shambler is still in the store, so only one that is not incapacitated is something to shoot at. */
export const targetRemains = (zombies: Iterable<{ readonly incapacitated: boolean }>): boolean => {
  for (const zombie of zombies) {
    if (!zombie.incapacitated) {
      return true;
    }
  }
  return false;
};

/** The practice guns, named by the layout's content rather than chosen here. */
export interface CombatKit {
  readonly revolver: string;
  readonly shotgun: string;
}

const COMBAT_STAGES = [
  'revolver-wield',
  'revolver-load',
  'revolver-aim',
  'revolver-fire',
  'pump-wield',
  'pump-load',
  'pump-rack',
  'pump-fire',
  'down',
  'ammo',
] as const;

type EssentialsStage = 'move' | 'door' | 'loot' | 'hands' | 'open' | 'eat' | 'drink' | 'light' | 'escape' | 'pause';

/** A presentation projection: ordinary action owners supply outcomes, never commands. */
export class Tutorial {
  private readonly achieved = new Set<string>();
  private lightWasOn = false;
  private essentialsDone = false;
  private combatStarted = false;
  private shotSinceDowning = false;
  private armedForAmmo = false;
  private targetAlive = true;

  private readonly spawn: Vec3;
  private readonly startingYaw: number;
  private readonly exit: Rect;
  readonly kit: CombatKit;

  constructor(spawn: Vec3, startingYaw: number, exit: Rect, kit: CombatKit) {
    this.spawn = spawn;
    this.startingYaw = startingYaw;
    this.exit = exit;
    this.kit = kit;
  }

  /** The module is on its shooting step with nothing left to shoot, so the game places the content's target. */
  get needsTarget(): boolean {
    return this.stage === 'down' && !this.targetAlive;
  }

  /** The essentials route is finished and the optional combat module can be chosen. */
  get canStartCombat(): boolean {
    return this.essentialsDone && !this.combatStarted;
  }

  startCombat(): void {
    if (this.essentialsDone) {
      this.combatStarted = true;
    }
  }

  /** The firearm owner admitted a shot; shots before the module starts teach nothing. */
  fired(type: string): void {
    if (!this.combatStarted) {
      return;
    }
    this.achieved.add(`fired:${type}`);
    this.shotSinceDowning = true;
  }

  /** A shambler went down; it counts for the module only after a firearm shot since the last one. */
  zombieDowned(): void {
    if (!this.combatStarted) {
      return;
    }
    if (this.shotSinceDowning) {
      this.achieved.add('downed');
    }
    this.shotSinceDowning = false;
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
    if (this.combatStarted && state.combat) {
      this.observeCombat(state.combat);
    }
    if (this.stage === 'pause' && state.paused) {
      this.essentialsDone = true;
    }
  }

  private observeCombat(combat: CombatObservation): void {
    const remember = (id: string, outcome: boolean) => {
      if (outcome) {
        this.achieved.add(id);
      }
    };
    remember('revolver-wield', combat.revolverHeld);
    remember('revolver-load', combat.revolverRounds > 0);
    remember('revolver-aim', combat.revolverHeld && combat.aiming);
    remember('pump-wield', combat.shotgunHeld);
    remember('pump-load', combat.shotgunRounds > 0);
    remember('pump-rack', combat.shotgunChambered);
    this.targetAlive = combat.targetAlive;
    if (this.stage !== 'ammo') {
      return;
    }
    // Loading from the cabinet keeps a screen open, so reading the ammo counts only as opening it afresh
    // once the step is current.
    if (!combat.inventoryOpen) {
      this.armedForAmmo = true;
    } else if (this.armedForAmmo && (combat.revolverHeld || combat.shotgunHeld)) {
      this.achieved.add('ammo');
    }
  }

  get stage(): EssentialsStage | 'finish' | (typeof COMBAT_STAGES)[number] {
    const essentials = this.essentialsStage;
    if (essentials !== 'pause' || !this.essentialsDone) {
      return essentials;
    }
    const outcomes: Record<(typeof COMBAT_STAGES)[number], boolean> = {
      'revolver-wield': this.achieved.has('revolver-wield'),
      'revolver-load': this.achieved.has('revolver-load'),
      'revolver-aim': this.achieved.has('revolver-aim'),
      'revolver-fire': this.achieved.has(`fired:${this.kit.revolver}`),
      'pump-wield': this.achieved.has('pump-wield'),
      'pump-load': this.achieved.has('pump-load'),
      'pump-rack': this.achieved.has('pump-rack'),
      'pump-fire': this.achieved.has(`fired:${this.kit.shotgun}`),
      down: this.achieved.has('downed'),
      ammo: this.achieved.has('ammo'),
    };
    return this.combatStarted ? (COMBAT_STAGES.find((id) => !outcomes[id]) ?? 'finish') : 'finish';
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
