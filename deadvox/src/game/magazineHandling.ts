// Loading a wielded magazine round by round, like DayZ (SLICE-3.md, 3.2: "magazines are real, you load
// them one by one"). Each round is one handling job, so a cancelled press loses no ammunition.
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';
import { stowTarget } from '../core/options.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

/** Gameplay handling estimates per round, before the firearms skill's reload factor. */
export const ROUND_LOAD_SIM_SECONDS = 0.8;
export const ROUND_STRIP_SIM_SECONDS = 0.5;
export const MAGAZINE_LOAD_ACTION = 'magazine.load';
export const MAGAZINE_STRIP_ACTION = 'magazine.strip';

export class MagazineHandling {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;
  /** The firearms skill's reload-duration factor (DESIGN.md, "Firearms"). */
  private readonly reloadFactor: () => number;
  private readonly onSound: (event: SoundEventId, time: number) => void;
  private heldStripUid: number | undefined;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      feet,
      reloadFactor,
      onSound = () => undefined,
    }: {
      feet: () => Vec3;
      reloadFactor: () => number;
      onSound?: (event: SoundEventId, time: number) => void;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    this.reloadFactor = reloadFactor;
    this.onSound = onSound;
    queue.registerAction(MAGAZINE_LOAD_ACTION, (params) => this.completeLoad(params.uid, params.ammoUid));
    queue.registerAction(MAGAZINE_STRIP_ACTION, (params) => this.completeStrip(params.uid));
  }

  /** A wielded magazine, which R loads; its strip item action unloads it. */
  reloadableUid(): number | undefined {
    return Object.values(this.inventory.hands).find((item) => item && magazineSpec(this.inventory.registry, item.type))
      ?.uid;
  }

  /** Loose carried cartridges only; ascending UID makes the source order save-stable. */
  loadNext(uid: number, time: number): string | undefined {
    const magazine = this.heldMagazine(uid);
    if (!magazine) {
      return 'Magazine is no longer held';
    }
    const [round] = [...this.inventory.items()]
      .map(({ item }) => item)
      .filter((item) => item !== magazine && this.carried(item) && this.fits(magazine, item))
      .sort((a, b) => a.uid - b.uid);
    if (!round) {
      return this.isFull(magazine) ? 'Magazine is full' : 'No loose matching cartridges are carried';
    }
    const reason = this.loadReason(magazine, round);
    if (reason) {
      return reason;
    }
    const spec = magazineSpec(this.inventory.registry, magazine.type)!;
    this.queue.enqueueAction(
      MAGAZINE_LOAD_ACTION,
      `Load round ${magazine.cartridges!.length + 1}/${spec.capacity}`,
      ROUND_LOAD_SIM_SECONDS * this.reloadFactor(),
      { uid: magazine.uid, ammoUid: round.uid },
    );
    this.onSound('magazine_round_insert', time);
    return undefined;
  }

  /** Strips the top round into a pocket, or onto the ground at the player's feet. */
  strip(uid: number, time: number, held = false): string | undefined {
    const magazine = this.heldMagazine(uid);
    if (!magazine) {
      this.heldStripUid = undefined;
      return 'Magazine is no longer held';
    }
    if (this.queue.busy) {
      return 'Already handling something';
    }
    if (magazine.cartridges!.length === 0) {
      this.heldStripUid = undefined;
      return 'Magazine is empty';
    }
    this.queue.enqueueAction(MAGAZINE_STRIP_ACTION, 'Strip a round', ROUND_STRIP_SIM_SECONDS * this.reloadFactor(), {
      uid: magazine.uid,
    });
    this.heldStripUid = held ? uid : undefined;
    this.onSound('magazine_round_strip', time);
    return undefined;
  }

  /** Queues the next round only after the previous simulated strip job has completed. */
  advanceHeldStrip(uid: number | undefined, time: number, held: boolean): string | undefined {
    if (!(held && uid !== undefined && uid === this.heldStripUid)) {
      this.heldStripUid = undefined;
      return undefined;
    }
    if (this.queue.busy) {
      return undefined;
    }
    const magazine = this.heldMagazine(uid);
    if (!magazine || magazine.cartridges!.length === 0) {
      this.heldStripUid = undefined;
      return undefined;
    }
    const reason = this.strip(uid, time, true);
    if (reason) {
      this.heldStripUid = undefined;
    }
    return reason;
  }

  cancelLoad(uid: number): void {
    const job = this.queue.jobs.find(
      (entry) => entry.kind === 'action' && entry.jobType === MAGAZINE_LOAD_ACTION && entry.params.uid === uid,
    );
    if (job) {
      this.queue.cancelJob(job);
    }
  }

  describe(item: Item): string[] {
    const spec = magazineSpec(this.inventory.registry, item.type);
    return spec ? [`Cartridges: ${item.cartridges!.length}/${spec.capacity}`] : [];
  }

  private loadReason(magazine: Item, round: Item, completing = false): string | undefined {
    if (!completing && this.queue.busy) {
      return 'Already handling something';
    }
    if (!(this.inventory.itemByUid(round.uid) === round && this.carried(round))) {
      return 'Carry the cartridges first';
    }
    if (!this.fits(magazine, round)) {
      return 'Wrong ammunition';
    }
    return this.isFull(magazine) ? 'Magazine is full' : undefined;
  }

  private completeLoad(uid: unknown, ammoUid: unknown): string | undefined {
    const magazine = typeof uid === 'number' ? this.heldMagazine(uid) : undefined;
    const round = typeof ammoUid === 'number' ? this.inventory.itemByUid(ammoUid) : undefined;
    if (!(magazine && round)) {
      return 'Magazine or cartridge is no longer held/carried';
    }
    const reason = this.loadReason(magazine, round, true);
    if (reason) {
      return reason;
    }
    const { type } = round;
    if (!this.inventory.consume(round, 1)) {
      return 'Cartridge is no longer carried';
    }
    magazine.cartridges!.unshift(type);
    return undefined;
  }

  private completeStrip(uid: unknown): string | undefined {
    const magazine = typeof uid === 'number' ? this.heldMagazine(uid) : undefined;
    if (!magazine) {
      this.heldStripUid = undefined;
      return 'Magazine is no longer held';
    }
    const [type] = magazine.cartridges!;
    if (type === undefined) {
      this.heldStripUid = undefined;
      return 'Magazine is empty';
    }
    const round = this.inventory.create(type);
    const target = stowTarget(this.inventory, round, this.feet());
    if (!(target && this.inventory.add(round, target))) {
      this.heldStripUid = undefined;
      return 'No room for the round nearby';
    }
    magazine.cartridges!.shift();
    return undefined;
  }

  private heldMagazine(uid: number): Item | undefined {
    const item = Object.values(this.inventory.hands).find((held) => held?.uid === uid);
    return item && magazineSpec(this.inventory.registry, item.type) ? item : undefined;
  }

  private fits(magazine: Item, round: Item): boolean {
    const calibre = this.inventory.registry.items.get(round.type)?.ammo?.calibre;
    return calibre !== undefined && calibre === magazineSpec(this.inventory.registry, magazine.type)?.calibre;
  }

  private isFull(magazine: Item): boolean {
    return magazine.cartridges!.length >= magazineSpec(this.inventory.registry, magazine.type)!.capacity;
  }

  private carried(item: Item): boolean {
    let location = this.inventory.locate(item);
    while (location?.kind === 'pocket') {
      location = this.inventory.locate(location.owner);
    }
    return location?.kind === 'hand' || location?.kind === 'worn';
  }
}
