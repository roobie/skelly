// Loading a wielded magazine round by round, like DayZ (SLICE-3.md, 3.2: "magazines are real, you load
// them one by one"). Each round is one handling job, so a cancelled press loses no ammunition.
import type { Vec3 } from '../core/coords.ts';
import type { HandlingQueue } from '../core/handling.ts';
import { dropSpots, type Inventory, type Target } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { magazineSpec } from '../core/magazine.ts';
import { playerPockets } from '../core/options.ts';
import type { SoundEventId } from '../core/soundEvents.ts';

/** Gameplay handling estimates per round, before the firearms skill's reload factor. */
export const ROUND_LOAD_SIM_SECONDS = 0.8;
export const ROUND_STRIP_SIM_SECONDS = 0.5;
const LOAD_ACTION = 'magazine.load';
const STRIP_ACTION = 'magazine.strip';

export class MagazineHandling {
  private readonly inventory: Inventory;
  private readonly queue: HandlingQueue;
  private readonly feet: () => Vec3;
  /** The firearms skill's reload-duration factor (DESIGN.md, "Firearms"). */
  private readonly reloadDurationScale: () => number;
  private readonly onSound: (event: SoundEventId, time: number) => void;

  constructor(
    inventory: Inventory,
    queue: HandlingQueue,
    {
      feet,
      reloadDurationScale,
      onSound = () => undefined,
    }: {
      feet: () => Vec3;
      reloadDurationScale: () => number;
      onSound?: (event: SoundEventId, time: number) => void;
    },
  ) {
    this.inventory = inventory;
    this.queue = queue;
    this.feet = feet;
    this.reloadDurationScale = reloadDurationScale;
    this.onSound = onSound;
    queue.registerAction(LOAD_ACTION, (params) => this.completeLoad(params.uid, params.ammoUid));
    queue.registerAction(STRIP_ACTION, (params) => this.completeStrip(params.uid));
  }

  /** A wielded magazine, which R loads and strips. */
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
      LOAD_ACTION,
      `Load round ${magazine.cartridges!.length + 1}/${spec.capacity}`,
      ROUND_LOAD_SIM_SECONDS * this.reloadDurationScale(),
      { uid: magazine.uid, ammoUid: round.uid },
    );
    this.onSound('magazine_round_insert', time);
    return undefined;
  }

  /** Strips the top round into a pocket, or onto the ground at the player's feet. */
  strip(uid: number, time: number): string | undefined {
    const magazine = this.heldMagazine(uid);
    if (!magazine) {
      return 'Magazine is no longer held';
    }
    if (this.queue.busy) {
      return 'Already handling something';
    }
    if (magazine.cartridges!.length === 0) {
      return 'Magazine is empty';
    }
    this.queue.enqueueAction(STRIP_ACTION, 'Strip a round', ROUND_STRIP_SIM_SECONDS * this.reloadDurationScale(), {
      uid: magazine.uid,
    });
    this.onSound('magazine_round_strip', time);
    return undefined;
  }

  cancelLoad(uid: number): void {
    const job = this.queue.jobs.find(
      (entry) => entry.kind === 'action' && entry.jobType === LOAD_ACTION && entry.params.uid === uid,
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
      return 'Magazine is no longer held';
    }
    const [type] = magazine.cartridges!;
    if (type === undefined) {
      return 'Magazine is empty';
    }
    const round = this.inventory.create(type);
    const target =
      this.pocketFor(round) ??
      dropSpots(this.feet())
        .map((pos): Target => ({ kind: 'pile', pos }))
        .find((spot) => this.inventory.planAdd(round, spot).ok);
    if (!(target && this.inventory.add(round, target))) {
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

  private pocketFor(item: Item): Target | undefined {
    return playerPockets(this.inventory)
      .map(({ owner, pocket }): Target => ({ kind: 'pocket', owner, pocket }))
      .find((target) => this.inventory.planAdd(item, target).ok);
  }
}
