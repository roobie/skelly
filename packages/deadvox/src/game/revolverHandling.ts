import { type ActionText, actionText, fillText } from '../core/actionText.ts';
import type { CylinderState } from '../core/firearmState.ts';
import type { HandlingQueue, JobParams } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

const REVOLVER_STEPS = ['open', 'eject', 'pick', 'load', 'close', 'cock', 'pull'] as const;
export type RevolverStep = (typeof REVOLVER_STEPS)[number];
export interface RevolverFrame {
  readonly step: RevolverStep;
  readonly chamber?: number;
}
interface RevolverHooks {
  readonly factor: () => number;
  readonly sound: (event: SoundEventId, time: number) => void;
  readonly eject: (gun: Item, chamber: number, type: string, time: number) => void;
  readonly caseType: (gun: Item) => string;
}
// The trigger pull's click is the gun's content-selected dry-fire sound.
const sounds: Record<Exclude<RevolverStep, 'pull'>, SoundEventId> = {
  open: 'revolver_crane_open',
  eject: 'revolver_eject',
  pick: 'revolver_case_pick',
  load: 'revolver_round_insert',
  close: 'revolver_crane_close',
  cock: 'revolver_hammer_cock',
};
const firingOrder = (cylinder: CylinderState): number[] =>
  cylinder.chambers.map((_, index) => (cylinder.aligned + 1 + index) % cylinder.chambers.length);

export class RevolverHandling {
  private readonly releasing = new Set<number>();
  private readonly dumping = new Set<number>();
  private readonly pulls = new Map<number, () => void>();
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly hooks: RevolverHooks;
  private readonly text: ActionText;

  constructor(inventory: Inventory, queue: HandlingQueue, hooks: RevolverHooks) {
    this.inventory = inventory;
    this.queue = queue;
    this.hooks = hooks;
    this.text = actionText(inventory.registry);
    for (const step of REVOLVER_STEPS) {
      queue.registerAction(`revolver.${step}`, (params) => this.complete(step, params));
    }
  }

  private complete(step: RevolverStep, params: JobParams): string | undefined {
    const gun = typeof params.uid === 'number' ? this.inventory.itemByUid(params.uid) : undefined;
    if (!(gun && this.held(gun.uid))) {
      return this.text.common.notHeld;
    }
    const cylinder = gun.firearm?.cylinder;
    if (!cylinder) {
      return 'No cylinder';
    }
    const reason = this.applyStep(gun, step, params);
    if (reason || step === 'pull') {
      return reason;
    }
    const time = Number(params.at);
    if (step !== 'open' && !params.cuePlayed) {
      this.hooks.sound(sounds[step], step === 'eject' ? Number(params.cueAt) : time);
    }
    this.afterStep(gun, step, time);
    return undefined;
  }

  private applyStep(gun: Item, step: RevolverStep, params: JobParams): string | undefined {
    const cylinder = gun.firearm!.cylinder!;
    switch (step) {
      case 'open':
        cylinder.open = true;
        cylinder.cocked = false;
        return;
      case 'close':
        cylinder.open = false;
        return;
      case 'cock':
        if (cylinder.open) {
          return this.text.firearm.cylinderOpen;
        }
        cylinder.aligned = (cylinder.aligned + 1) % cylinder.chambers.length;
        cylinder.cocked = true;
        return;
      case 'pull': {
        const pull = this.pulls.get(gun.uid);
        this.pulls.delete(gun.uid);
        if (!cylinder.open) {
          pull?.();
        }
        return;
      }
      default:
        return this.applyOpenStep(gun, step, params);
    }
  }

  private applyOpenStep(gun: Item, step: 'eject' | 'pick' | 'load', params: JobParams): string | undefined {
    const cylinder = gun.firearm!.cylinder!;
    if (!cylinder.open) {
      return this.text.firearm.cylinderClosed;
    }
    if (step === 'load') {
      return this.insert(gun, params);
    }
    let indices = firingOrder(cylinder);
    if (step === 'pick') {
      indices = typeof params.chamber === 'number' ? [params.chamber] : [];
    }
    for (const index of indices) {
      const chamber = cylinder.chambers[index]!;
      if (chamber.state === 'empty' || (step === 'pick' && chamber.state !== 'case')) {
        continue;
      }
      this.hooks.eject(
        gun,
        index,
        chamber.state === 'round' ? chamber.roundType : this.hooks.caseType(gun),
        Number(params.at),
      );
      cylinder.chambers[index] = { state: 'empty' };
    }
    return undefined;
  }

  private insert(gun: Item, params: JobParams): string | undefined {
    if (!this.loadingHandFree(gun)) {
      return this.text.loading.otherHandFull;
    }
    const cylinder = gun.firearm!.cylinder!;
    const ammo = typeof params.ammoUid === 'number' ? this.inventory.itemByUid(params.ammoUid) : undefined;
    const index = typeof params.chamber === 'number' ? params.chamber : undefined;
    if (
      index === undefined ||
      cylinder.chambers[index]?.state !== 'empty' ||
      !ammo ||
      !this.carried(ammo) ||
      !this.matches(gun, ammo) ||
      !this.inventory.consume(ammo, 1)
    ) {
      return this.text.loading.roundsNotCarried;
    }
    cylinder.chambers[index] = { state: 'round', roundType: ammo.type };
    return undefined;
  }

  private afterStep(gun: Item, step: RevolverStep, time: number): void {
    if (this.dumping.has(gun.uid)) {
      if (step === 'open') {
        this.enqueue(gun, 'eject', time);
      } else {
        this.dumping.delete(gun.uid);
      }
    } else if (this.releasing.delete(gun.uid) && gun.firearm!.cylinder!.open && step !== 'close') {
      this.enqueue(gun, 'close', time);
    }
  }

  private held(uid: number): boolean {
    return Object.values(this.inventory.hands).some((item) => item?.uid === uid);
  }

  private carried(item: Item): boolean {
    let location = this.inventory.locate(item);
    while (location?.kind === 'pocket') {
      location = this.inventory.locate(location.owner);
    }
    return location?.kind === 'hand' || location?.kind === 'worn';
  }

  private matches(gun: Item, ammo: Item): boolean {
    return defOf(this.inventory.registry, ammo.type).ammo?.calibre === this.model(gun)?.gun?.calibre;
  }

  private model(gun: Item) {
    const id = defOf(this.inventory.registry, gun.type).model;
    return id ? this.inventory.registry.models.get(id) : undefined;
  }

  private enqueue(gun: Item, step: RevolverStep, time: number, source: { chamber?: number; ammo?: Item } = {}): void {
    const tuning = defOf(this.inventory.registry, gun.type).firearm!.revolver!;
    const seconds = step === 'pull' ? tuning.doubleActionPullSimSeconds : tuning[`${step}SimSeconds`];
    const duration = seconds * this.hooks.factor();
    const cylinder = gun.firearm!.cylinder!;
    const label =
      step === 'load'
        ? fillText(this.text.loading.loadRound, {
            count: cylinder.chambers.filter((entry) => entry.state === 'round').length + 1,
            capacity: cylinder.chambers.length,
          })
        : this.text.revolver[step];
    this.queue.enqueueAction(`revolver.${step}`, label, duration, {
      uid: gun.uid,
      at: time + duration,
      cueAt: time + duration / 2,
      ...(source.chamber === undefined ? {} : { chamber: source.chamber }),
      ...(source.ammo ? { ammoUid: source.ammo.uid } : {}),
    });
    if (step === 'open') {
      this.hooks.sound(sounds.open, time);
    }
  }

  load(gun: Item, time: number): string | undefined {
    if (this.queue.busy) {
      return this.text.common.busy;
    }
    const cylinder = gun.firearm!.cylinder!;
    this.releasing.delete(gun.uid);
    this.dumping.delete(gun.uid);
    if (cylinder.chambers.every((chamber) => chamber.state === 'round')) {
      if (cylinder.open) {
        this.enqueue(gun, 'close', time);
        return;
      }
      return this.text.loading.full;
    }
    return this.loadStep(gun, time);
  }

  private loadingHandFree(gun: Item): boolean {
    const other = this.inventory.hands.right?.uid === gun.uid ? 'left' : 'right';
    return !this.inventory.hands[other];
  }

  private loadStep(gun: Item, time: number): string | undefined {
    const cylinder = gun.firearm!.cylinder!;
    const [ammo] = [...this.inventory.items()]
      .map(({ item }) => item)
      .filter((item) => this.carried(item) && this.matches(gun, item))
      .sort((a, b) => a.uid - b.uid);
    if (!(cylinder.open || ammo || cylinder.chambers.some((chamber) => chamber.state === 'case'))) {
      const calibre = this.model(gun)?.gun?.calibre;
      const round = [...this.inventory.registry.items.values()].find((item) => item.ammo?.calibre === calibre);
      return round ? fillText(this.text.loading.noRoundsOf, { round: round.name }) : this.text.loading.noRounds;
    }
    const order = firingOrder(cylinder);
    const spent = order.find((index) => cylinder.chambers[index]!.state === 'case');
    if (ammo && spent === undefined && !this.loadingHandFree(gun)) {
      return this.text.loading.otherHandFull;
    }
    if (!cylinder.open) {
      this.enqueue(gun, 'open', time);
      return;
    }
    if (spent !== undefined) {
      this.enqueue(gun, cylinder.chambers.some((entry) => entry.state === 'round') ? 'pick' : 'eject', time, {
        chamber: spent,
      });
      return;
    }
    if (!ammo) {
      this.enqueue(gun, 'close', time);
      return;
    }
    const chamberIndex = order.find((index) => cylinder.chambers[index]!.state === 'empty')!;
    this.enqueue(gun, 'load', time, { chamber: chamberIndex, ammo });
    return undefined;
  }

  release(uid: number, time: number): void {
    const gun = this.inventory.itemByUid(uid);
    if (!(gun && this.held(uid))) {
      return;
    }
    if (this.job(uid)) {
      this.releasing.add(uid);
    } else if (gun.firearm?.cylinder?.open) {
      this.enqueue(gun, 'close', time);
    }
  }

  cancelUnheld(): void {
    // Only these owner-held continuations can be changed by cancellation; idle world items cannot.
    const candidates = new Set([...this.releasing, ...this.dumping, ...this.pulls.keys()]);
    for (const job of this.queue.jobs) {
      if (job.kind === 'action' && job.jobType.startsWith('revolver.') && typeof job.params.uid === 'number') {
        candidates.add(job.params.uid);
      }
    }
    for (const uid of candidates) {
      if (!this.held(uid) && this.inventory.itemByUid(uid)?.firearm?.cylinder) {
        this.cancel(uid);
      }
    }
  }

  cancel(uid: number): void {
    const job = this.job(uid);
    if (job) {
      this.queue.cancelJob(job);
    }
    this.releasing.delete(uid);
    this.dumping.delete(uid);
    this.pulls.delete(uid);
  }

  cock(gun: Item, time: number): string | undefined {
    if (this.queue.busy) {
      return this.text.common.busy;
    }
    const cylinder = gun.firearm!.cylinder!;
    if (!cylinder.open && cylinder.cocked) {
      return;
    }
    this.enqueue(gun, cylinder.open ? 'close' : 'cock', time);
    return undefined;
  }

  dump(gun: Item, time: number): string | undefined {
    if (this.queue.busy) {
      return this.text.common.busy;
    }
    this.releasing.delete(gun.uid);
    this.dumping.add(gun.uid);
    this.enqueue(gun, gun.firearm!.cylinder!.open ? 'eject' : 'open', time);
    return undefined;
  }

  pull(gun: Item, time: number, commit: () => void): void {
    this.pulls.set(gun.uid, commit);
    this.enqueue(gun, 'pull', time);
  }

  advance(): void {
    for (const [uid] of this.pulls) {
      if (!this.job(uid)) {
        this.pulls.delete(uid);
      }
    }
    const [job] = this.queue.jobs;
    if (
      job?.kind === 'action' &&
      job.jobType === 'revolver.eject' &&
      !job.params.cuePlayed &&
      job.elapsed >= job.duration / 2
    ) {
      job.params.cuePlayed = true;
      this.hooks.sound('revolver_eject', Number(job.params.cueAt));
    }
  }

  job(uid: number) {
    return this.queue.jobs.find(
      (job) => job.kind === 'action' && job.params.uid === uid && job.jobType.startsWith('revolver.'),
    );
  }
}
