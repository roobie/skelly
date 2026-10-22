import { html, render } from 'lit-html';
import type { HandedCharacter } from '../core/character.ts';
import { type Registry, requireDayCycle } from '../core/content.ts';
import {
  type ActiveBrowserMod,
  type ActiveBundledMod,
  contentPackDifferences,
  currentSaveVersionIdentity,
  decodeSave,
  readSaveVersionMetadata,
  type SaveContentKind,
  type SaveVersionIdentity,
  type SaveWorldIdentity,
  type SaveWorldOptions,
} from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { KNOWN_SCHEDULER_IDS } from '../core/schedulerIds.ts';
import { type RealTimestamp, realTimestamp } from '../core/time.ts';
import {
  type SaveBackendPreference,
  type SaveLoadResult,
  SaveStorage,
  type SaveStorageStatus,
} from '../game/saveStorage.ts';
import { SaveCorruptionError } from '../game/saveStorageProtocol.ts';
import { CheckpointSchedule } from './checkpointSchedule.ts';
import { factDetail } from './factDetail.ts';
import { computeMenuState } from './menuState.ts';

const BROWSER_MOD_DIFFERENCE_PREFIX = /^(Missing|Different|Additional) mod: browser\./;
const CONTINUE_KEY = 'deadvox.continue-namespace';
const RESTORE_REFUSAL_KEY = 'deadvox.restore-refusal';
const DEAD_WORLD_KEY = 'deadvox.dead-world';

export const contentLookup = (registry: Registry, kind: SaveContentKind, id: string): boolean => {
  switch (kind) {
    case 'block':
      return registry.blockIds.has(id);
    case 'item':
      return registry.items.has(id);
    case 'furniture':
      return registry.furniture.has(id);
    case 'climbable':
      return Boolean(registry.furniture.get(id)?.climbable);
    case 'zombie':
      return registry.zombies.has(id);
    case 'sound':
      return registry.sounds.has(id);
    case 'scheduler':
      return KNOWN_SCHEDULER_IDS.has(id);
    case 'skill':
      return registry.skills.has(id);
    case 'recipe':
      return registry.recipes.has(id);
    case 'scenario':
      return registry.scenarios.has(id);
    default:
      return false;
  }
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export interface SaveMessages {
  readonly insecurePage: string;
  readonly apisUnavailable: string;
  readonly noSavedWorld: string;
}

const saveEnvironmentProblem = (messages: SaveMessages): string | undefined => {
  if (!globalThis.isSecureContext) {
    return messages.insecurePage;
  }
  if (
    typeof globalThis.crypto?.randomUUID !== 'function' ||
    typeof globalThis.crypto?.subtle?.digest !== 'function' ||
    !navigator.storage ||
    !globalThis.indexedDB
  ) {
    return messages.apisUnavailable;
  }
  return undefined;
};

const versionLabel = (saved: Partial<SaveVersionIdentity> | undefined | null): string =>
  saved === null
    ? 'unreadable version metadata'
    : `${saved?.buildRevision ?? 'unknown build'} · ${saved?.digest?.slice(0, 12) ?? 'unknown version'}`;

/** Title-screen discovery, checkpoint scheduling and lifecycle save triggers. */
export class SaveController {
  readonly storage: SaveStorage;
  private readonly identity: Promise<SaveVersionIdentity> | undefined;
  private identityValue: SaveVersionIdentity | undefined;
  namespace = '';
  restored: Readonly<SaveSnapshot> | undefined;
  restoreWorldOptions: SaveWorldIdentity | undefined;
  storageStatus: SaveStorageStatus | undefined;
  private currentRecord: SaveLoadResult | undefined;
  private savedGeneration = 0;
  private lastSaveCompletedAtRealTimestamp: RealTimestamp | undefined;
  private candidate: SaveLoadResult | undefined;
  private oldVersionLabel = '';
  private failure = '';
  private storageUnavailable = false;
  private protectedCurrent = false;
  private corruptRecords = false;
  private requestedContinue = false;
  private deadRecord = false;
  private entered = false;
  private ready = false;
  private newWorldLauncher: ((creation: HandedCharacter) => Promise<{ enter: () => void }>) | undefined;
  private newWorldGoLabel = 'New world';
  private statusText = 'Checking saved worlds…';
  private snapshot: (() => Readonly<SaveSnapshot>) | undefined;
  private simTime: (() => number) | undefined;
  private worldOptions: SaveWorldOptions | undefined;
  private recordSnapshotDuration: ((durationMs: number) => void) | undefined;
  private worldId = '';
  private characterId = '';
  private readonly messages: SaveMessages;
  private readonly environmentProblem: string | undefined;
  private checkpoints: CheckpointSchedule | undefined;
  private queued: { snapshot: Readonly<SaveSnapshot>; reason: string } | undefined;
  private writing = false;
  private requestingPersistence = false;
  private pageIsLeaving = false;
  private playHalted = false;
  private acknowledgedWin = false;

  get winCheckpointStatus(): 'saved' | 'pending' | 'failed' | 'unavailable' {
    if (this.acknowledgedWin) {
      return 'saved';
    }
    if (this.storageUnavailable || !this.namespace) {
      return 'unavailable';
    }
    return this.failure ? 'failed' : 'pending';
  }

  finishWin(): void {
    this.capture('scenario won');
  }

  constructor(
    messages: SaveMessages,
    backend: SaveBackendPreference = 'auto',
    bundledMods: readonly ActiveBundledMod[] = [],
    browserMods: readonly ActiveBrowserMod[] = [],
  ) {
    this.messages = messages;
    this.environmentProblem = saveEnvironmentProblem(messages);
    if (!this.environmentProblem) {
      this.identity = currentSaveVersionIdentity(bundledMods, browserMods);
      this.worldId = globalThis.crypto.randomUUID();
      this.characterId = globalThis.crypto.randomUUID();
    }
    this.storage = new SaveStorage({ backend });
    $('continue').addEventListener('click', (event) => this.continueWorld(event));
    $('overlay').addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : undefined;
        if (target?.closest('#go') || (target === $('overlay') && !this.restored)) {
          this.newWorld(event);
        }
      },
      { capture: true },
    );
    $('save-persist')?.addEventListener('click', () =>
      this.requestPersistence().catch((error: unknown) => this.reportFailure('Save storage request failed', error)),
    );
    $('save-export')?.addEventListener('click', () =>
      this.exportCurrentRecords().catch((error: unknown) => this.reportFailure('Save export failed', error)),
    );
    $('save-replace-confirm').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!$('save-confirmation').hidden) {
        this.confirmNewWorld();
      }
    });
    $('save-retry').addEventListener('click', () => this.retrySave());
    $('save-rescan').addEventListener('click', () => location.reload());
    $('save-export-current').addEventListener('click', () =>
      this.exportCurrentSnapshot().catch((error: unknown) => this.reportFailure('Save export failed', error)),
    );
    $('save-replace-cancel').addEventListener('click', () => {
      $('save-confirmation').hidden = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.pageIsLeaving) {
        this.capture('visibilitychange');
      }
    });
    globalThis.addEventListener('pagehide', (event) => {
      this.pageIsLeaving = true;
      if (!event.persisted) {
        this.capture('pagehide');
      }
    });
    globalThis.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        this.pageIsLeaving = false;
      }
    });
  }

  /** Reads the current namespace and diagnoses, but never opens or overwrites, old versions. */
  async prepare(): Promise<SaveWorldIdentity | undefined> {
    if (this.environmentProblem) {
      this.storageUnavailable = true;
      this.statusText = this.environmentProblem;
      this.ready = true;
      this.render();
      return undefined;
    }
    try {
      await this.discoverSaves();
    } catch (error) {
      this.storageUnavailable = true;
      this.failure = `Save storage unavailable: ${errorMessage(error)} This session will not be saved.`;
      this.statusText = this.failure;
    }
    this.render();
    return this.resolveContinueRequest();
  }

  private async discoverSaves(): Promise<void> {
    this.statusText = 'Checking save compatibility…';
    this.render();
    this.identityValue = await this.identity!;
    this.namespace = this.identityValue.digest;
    this.statusText = 'Checking browser save storage…';
    this.render();
    this.storageStatus = await this.storage.status();
    this.statusText = 'Scanning saved-world versions…';
    this.render();
    const namespaces = await this.storage.listNamespaces();
    await this.inspectCurrentNamespace();
    await this.inspectOtherNamespaces(namespaces);
    this.statusText = [this.statusText, this.storageSummary()].filter(Boolean).join(' ');
    const refusal = sessionStorage.getItem(`${RESTORE_REFUSAL_KEY}:${this.namespace}`);
    if (refusal) {
      this.protectedCurrent = true;
      this.candidate = undefined;
      this.restoreWorldOptions = undefined;
      this.restored = undefined;
      this.failure = refusal;
      this.statusText = refusal;
    }
    const requested = sessionStorage.getItem(CONTINUE_KEY);
    this.requestedContinue = !(refusal || this.deadRecord) && requested === this.namespace;
    if (requested !== null && !this.requestedContinue) {
      sessionStorage.removeItem(CONTINUE_KEY);
    }
  }

  private resolveContinueRequest(): SaveWorldIdentity | undefined {
    if (!this.requestedContinue) {
      return undefined;
    }
    if (this.candidate && this.restoreWorldOptions && !this.protectedCurrent) {
      return this.restoreWorldOptions;
    }
    sessionStorage.removeItem(CONTINUE_KEY);
    this.requestedContinue = false;
    this.failure = 'Continue was requested, but no compatible saved world is available.';
    this.render();
    return undefined;
  }

  private async inspectCurrentNamespace(): Promise<void> {
    try {
      this.currentRecord = await this.storage.load(this.namespace);
    } catch (error) {
      if (!(error instanceof SaveCorruptionError)) {
        throw error;
      }
      this.protectedCurrent = true;
      this.corruptRecords = true;
      this.failure = error.message;
      this.statusText = `${error.message}; raw records are available for export.`;
      return;
    }
    if (!this.currentRecord) {
      this.statusText = this.messages.noSavedWorld;
      return;
    }
    this.candidate = this.currentRecord;
    this.savedGeneration = this.currentRecord.generation;
    this.corruptRecords = this.currentRecord.corruptSlots.length > 0;
    try {
      const decoded = await decodeSave(this.currentRecord.payload, {
        version: this.identityValue!.components,
        contentLookup: () => true,
      });
      const markedDeadWorld = this.readDeadWorldId();
      this.deadRecord =
        decoded.snapshot.character.simulation.dead !== undefined || markedDeadWorld === decoded.snapshot.world.id;
      if (this.deadRecord) {
        this.candidate = undefined;
        this.restoreWorldOptions = undefined;
        this.restored = undefined;
        this.statusText = 'The saved survivor died.';
        return;
      }
      if (markedDeadWorld) {
        this.clearDeadWorldMarker();
      }
      this.restoreWorldOptions = decoded.worldOptions;
      this.statusText = `Saved world available · ${versionLabel(decoded.versionIdentity)}${this.currentRecord.corruptSlots.length > 0 ? ` · inactive slot(s) ${this.currentRecord.corruptSlots.join(', ')} are corrupt but retained` : ''}`;
    } catch (error) {
      this.protectedCurrent = true;
      this.statusText = `Saved world cannot be loaded and was left untouched: ${errorMessage(error)}`;
    }
  }

  private deadWorldStorageKey(): string {
    return `${DEAD_WORLD_KEY}:${this.namespace}`;
  }

  private readDeadWorldId(): string | undefined {
    try {
      return globalThis.localStorage.getItem(this.deadWorldStorageKey()) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private clearDeadWorldMarker(): void {
    try {
      globalThis.localStorage.removeItem(this.deadWorldStorageKey());
    } catch {
      // Save discovery must remain available when browser preferences are blocked.
    }
  }

  private async inspectOtherNamespaces(namespaces: readonly string[]): Promise<void> {
    const requested = sessionStorage.getItem(CONTINUE_KEY);
    const namespace =
      namespaces.find((candidate) => candidate === requested && candidate !== this.namespace) ??
      namespaces.find((candidate) => candidate !== this.namespace);
    if (!namespace) {
      return;
    }
    try {
      const record = await this.storage.load(namespace);
      if (record) {
        const saved = await readSaveVersionMetadata(record.payload).catch(() => null);
        this.oldVersionLabel = `An older or different-version save is preserved · ${namespace.slice(0, 12)} · ${versionLabel(saved)}`;
        try {
          const differences = contentPackDifferences(
            saved!.components!.contentPacks,
            this.identityValue!.components.contentPacks,
          ).map((difference) => difference.replace(BROWSER_MOD_DIFFERENCE_PREFIX, '$1 mod: '));
          if (differences.length > 0) {
            this.oldVersionLabel += ` · ${differences.join('; ')}`;
          }
        } catch {
          // Unreadable pack metadata must not hide a preserved save.
        }
      }
    } catch {
      this.oldVersionLabel = `A damaged older-version save is preserved · ${namespace.slice(0, 12)}`;
    }
  }

  private storageSummary(): string {
    if (!this.storageStatus) {
      return '';
    }
    if (this.storageStatus.persistent === true) {
      return `Persistent ${this.storageStatus.backend} storage · ${this.storageStatus.quota.availableBytes ?? 0} bytes available.`;
    }
    return `Best-effort ${this.storageStatus.backend} storage · saves may be evicted by the browser.`;
  }

  /** Runs full content-reference validation after the running registry has been built. */
  async validateContent(registry: Registry): Promise<Readonly<SaveSnapshot> | undefined> {
    const { candidate } = this;
    if (!candidate || this.protectedCurrent) {
      this.ready = true;
      this.render();
      return undefined;
    }
    try {
      const decoded = await decodeSave(candidate.payload, {
        version: this.identityValue!.components,
        contentLookup: (kind, id) => contentLookup(registry, kind, id),
      });
      const { ratio } = decoded.snapshot.character.simulation.clock;
      if (ratio !== requireDayCycle(registry).clockRatio) {
        throw new Error('the save was made under a different clock ratio');
      }
      this.restored = decoded.snapshot;
      this.acknowledgedWin = Boolean(
        decoded.snapshot.character.scenarioRun &&
          decoded.snapshot.character.scenarioRun.completedAtGameTimestamp !== null,
      );
      if (candidate.corruptSlots.length > 0) {
        this.statusText = `A valid generation is available; corrupt inactive slot(s) ${candidate.corruptSlots.join(', ')} are retained.`;
      }
      if (this.requestedContinue) {
        sessionStorage.removeItem(CONTINUE_KEY);
        this.entered = true;
        this.lastSaveCompletedAtRealTimestamp = realTimestamp(performance.now() / 1000);
        this.worldId = decoded.snapshot.world.id;
        this.characterId = decoded.snapshot.character.id;
        this.statusText = 'Saved world continued.';
      }
    } catch (error) {
      this.protectedCurrent = true;
      this.failure = `Saved world is incompatible with the running content and was left untouched: ${errorMessage(error)}`;
      this.statusText = this.failure;
      if (this.requestedContinue) {
        sessionStorage.removeItem(CONTINUE_KEY);
        this.requestedContinue = false;
      }
    }
    this.ready = true;
    this.render();
    return this.restored;
  }

  get isRestored(): boolean {
    return this.requestedContinue && this.restored !== undefined;
  }

  get isEntered(): boolean {
    return this.entered;
  }

  get canSaveCurrentGame(): boolean {
    return this.entered && !this.playHalted && !this.storageUnavailable && Boolean(this.namespace);
  }

  get lastCompletedSaveRealTimestamp(): RealTimestamp | undefined {
    return this.lastSaveCompletedAtRealTimestamp;
  }

  setNewWorldLauncher(launcher: (creation: HandedCharacter) => Promise<{ enter: () => void }>): void {
    this.newWorldLauncher = launcher;
    this.render();
  }

  /** The controller owns title labels so storage warnings cannot be overwritten. */
  setGoLabel(label: string): void {
    if (!this.entered && this.newWorldLauncher) {
      this.renderGoLabel();
      return;
    }
    render(html`${label}`, $('go'));
  }

  setNewWorldGoLabel(label: string): void {
    this.newWorldGoLabel = label;
    this.renderGoLabel();
  }

  private renderGoLabel(): void {
    let label = this.titleNewWorldLabel === 'New world' ? this.newWorldGoLabel : this.titleNewWorldLabel;
    if (this.restored) {
      label = 'New character — replace saved world';
    }
    render(html`${label}`, $('go'));
  }

  /** Protects a decoded save when generating the restored world fails, so autosave cannot overwrite it. */
  refuseRestore(error: unknown): boolean {
    if (!(this.isRestored && this.namespace)) {
      return false;
    }
    const refusal = `Saved world unreadable and left untouched: ${errorMessage(error)}`;
    this.protectedCurrent = true;
    this.entered = false;
    this.requestedContinue = false;
    this.candidate = undefined;
    this.restored = undefined;
    this.failure = refusal;
    this.statusText = refusal;
    sessionStorage.removeItem(CONTINUE_KEY);
    sessionStorage.setItem(`${RESTORE_REFUSAL_KEY}:${this.namespace}`, refusal);
    try {
      this.render();
    } catch {
      // The refusal marker is durable; reload must recover even if title presentation fails.
    } finally {
      location.reload();
    }
    return true;
  }

  get titleNewWorldLabel(): string {
    if (this.protectedCurrent) {
      return 'Saved world needs recovery';
    }
    return this.storageUnavailable ? 'Play without saving' : 'New world';
  }

  bindSession(
    snapshot: () => Readonly<SaveSnapshot>,
    simTime: () => number,
    worldOptions: SaveWorldOptions,
    options: { checkpointSimSeconds: number; recordSnapshotDuration?: (durationMs: number) => void },
  ): { worldId: string; characterId: string } {
    this.snapshot = snapshot;
    this.simTime = simTime;
    this.worldOptions = worldOptions;
    this.recordSnapshotDuration = options.recordSnapshotDuration;
    this.checkpoints = new CheckpointSchedule(options.checkpointSimSeconds, simTime());
    return { worldId: this.worldId, characterId: this.characterId };
  }

  /** Stops this session from capturing or retrying saves after an unrecoverable play error. */
  halt(): void {
    this.playHalted = true;
    this.queued = undefined;
  }

  /** Move the next checkpoint to the first interval after an explicit forward debug-time seek. */
  rearmAutosaveAfterTimeSeek(): void {
    const time = this.simTime?.();
    if (time !== undefined) {
      this.checkpoints?.rearm(time);
    }
  }

  /** Called after each simulation frame, paused or not. */
  afterFrame(): void {
    const time = this.simTime?.();
    if (time !== undefined && this.checkpoints?.due(time)) {
      this.capture('periodic checkpoint');
    }
  }

  /** Called synchronously before beginning a sleep action. */
  beforeSleep(): void {
    this.capture('before sleep');
  }

  private capture(reason: string): void {
    if (
      this.playHalted ||
      !(this.snapshot && this.namespace && this.entered) ||
      this.protectedCurrent ||
      this.storageUnavailable
    ) {
      return;
    }
    const startedAt = performance.now();
    const snapshot = this.snapshot();
    this.recordSnapshotDuration?.(performance.now() - startedAt);
    this.queued = { snapshot, reason };
    if (!this.writing) {
      this.startFlush();
    }
  }

  private startFlush(): void {
    this.flush().catch((error: unknown) => {
      // A throw past the save's own handler (presentation) must not leave `writing` set and block every later save.
      this.writing = false;
      this.reportFailure('Save failed', error);
    });
  }

  /** Puts a failure no handler owned in the status line, the way a failed save is shown. */
  private reportFailure(what: string, error: unknown): void {
    this.failure = `${what}: ${errorMessage(error)}`;
    this.statusText = this.failure;
    try {
      this.render();
    } catch {
      // The failure text is kept for the next render; presentation is what just failed.
    }
  }

  private async flush(): Promise<void> {
    if (this.playHalted) {
      this.queued = undefined;
      this.writing = false;
      return;
    }
    const task = this.queued;
    if (!task) {
      this.writing = false;
      return;
    }
    this.writing = true;
    this.queued = undefined;
    try {
      const result = await this.storage.save(this.namespace, (generation) =>
        this.storage.encodeSnapshot(task.snapshot, generation, {
          worldOptions: this.worldOptions!,
          version: this.identityValue!.components,
          buildRevision: this.identityValue!.buildRevision,
        }),
      );
      this.savedGeneration = result.generation;
      if (
        task.snapshot.world.id === this.worldId &&
        task.snapshot.character.id === this.characterId &&
        task.snapshot.character.scenarioRun &&
        task.snapshot.character.scenarioRun.completedAtGameTimestamp !== null
      ) {
        this.acknowledgedWin = true;
      }
      this.lastSaveCompletedAtRealTimestamp = realTimestamp(performance.now() / 1000);
      if (this.readDeadWorldId() && this.readDeadWorldId() !== task.snapshot.world.id) {
        this.clearDeadWorldMarker();
      }
      this.statusText = `Saved generation ${result.generation} · ${task.reason}`;
      this.failure = '';
    } catch (error) {
      this.failure = `Save failed (${task.reason}): ${errorMessage(error)}`;
      this.statusText = this.failure;
    }
    this.writing = false;
    this.render();
    if (this.queued) {
      this.startFlush();
    }
  }

  private newWorld(event: Event): void {
    if (this.entered) {
      return;
    }
    if (!(this.ready && this.newWorldLauncher)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.protectedCurrent) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.statusText = 'Saved world needs recovery.';
      this.render();
      return;
    }
    if (this.currentRecord && !this.deadRecord) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('save-confirmation').hidden = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.confirmNewWorld();
  }

  private confirmNewWorld(): void {
    this.launchNewWorld().catch((error: unknown) => this.failNewWorld(error));
  }

  private failNewWorld(error: unknown): void {
    this.ready = false;
    this.entered = false;
    this.newWorldLauncher = undefined;
    this.snapshot = undefined;
    this.simTime = undefined;
    this.worldOptions = undefined;
    this.failure = `Could not start the world: ${errorMessage(error)}`;
    this.statusText = this.failure;
    this.render();
  }

  private async launchNewWorld(): Promise<void> {
    if (this.entered || !this.ready || !this.newWorldLauncher || this.protectedCurrent) {
      return;
    }
    const handedness = ($('dominant-hand') as HTMLSelectElement).value;
    if (handedness !== 'right' && handedness !== 'left') {
      this.statusText = 'Choose a valid dominant hand before starting a new character.';
      this.render();
      return;
    }
    const creation: HandedCharacter = Object.freeze({ handedness });
    this.ready = false;
    this.render();
    const entry = await this.newWorldLauncher(creation);
    this.ready = true;
    this.deadRecord = false;
    this.acknowledgedWin = false;
    this.entered = true;
    $('save-confirmation').hidden = true;
    $('continue').hidden = true;
    this.statusText = this.storageUnavailable
      ? `New world ready. ${this.environmentProblem ?? 'Save storage is unavailable; this session will not be saved.'}`
      : 'New world ready.';
    this.render();
    entry.enter();
  }

  /** Durably marks this survivor dead before queuing the final snapshot. */
  finishDeath(): void {
    this.deadRecord = true;
    if (this.namespace && this.worldId) {
      try {
        globalThis.localStorage.setItem(this.deadWorldStorageKey(), this.worldId);
      } catch {
        // The final checkpoint below still records death when local storage is unavailable.
      }
    }
    this.capture('death');
    this.render();
  }

  private continueWorld(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!(this.ready && this.restored) || this.deadRecord || this.protectedCurrent || this.storageUnavailable) {
      return;
    }
    sessionStorage.setItem(CONTINUE_KEY, this.namespace);
    location.reload();
  }

  private retrySave(): void {
    if (this.playHalted || !(this.entered && this.snapshot) || this.protectedCurrent || this.storageUnavailable) {
      return;
    }
    this.queued = { snapshot: this.snapshot(), reason: 'manual retry' };
    this.failure = '';
    if (!this.writing) {
      this.startFlush();
    }
    this.render();
  }

  /** Encodes the live snapshot in the save worker and downloads it without attempting a backend write. */
  private async exportCurrentSnapshot(): Promise<void> {
    try {
      if (!(this.snapshot && this.identityValue && this.worldOptions)) {
        throw new Error('No live world snapshot is available');
      }
      const payload = await this.storage.encodeSnapshot(
        this.snapshot(),
        Math.max(this.currentRecord?.generation ?? 0, this.savedGeneration) + 1,
        {
          worldOptions: this.worldOptions,
          version: this.identityValue.components,
          buildRevision: this.identityValue.buildRevision,
        },
      );
      const url = URL.createObjectURL(
        new Blob([payload.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }),
      );
      const link = $('save-download') as HTMLAnchorElement;
      link.href = url;
      link.download = `deadvox-current-${this.namespace}.bin`;
      link.click();
      URL.revokeObjectURL(url);
      this.statusText = 'Current world snapshot exported.';
    } catch (error) {
      this.statusText = `Could not export current snapshot: ${errorMessage(error)}`;
    }
    this.render();
  }

  private async requestPersistence(): Promise<void> {
    if (this.requestingPersistence) {
      return;
    }
    this.requestingPersistence = true;
    this.render();
    try {
      const persistent = await this.storage.requestPersistence();
      this.storageStatus = await this.storage.status();
      if (persistent === true) {
        this.statusText = 'Persistent storage granted.';
      } else if (persistent === false) {
        this.statusText = 'Persistent storage was refused; saves remain best-effort and may be evicted.';
      } else {
        this.statusText = 'This browser does not support persistent storage.';
      }
    } catch (error) {
      this.statusText = `Could not request persistent storage: ${errorMessage(error)}`;
    } finally {
      this.requestingPersistence = false;
      this.render();
    }
  }

  private async exportCurrentRecords(): Promise<void> {
    try {
      const slots = await this.storage.readRawSlots(this.namespace);
      for (const slot of ['a', 'b'] as const) {
        const bytes = slots[slot];
        if (!bytes) {
          continue;
        }
        const url = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }),
        );
        const link = $('save-download') as HTMLAnchorElement;
        link.href = url;
        link.download = `deadvox-${this.namespace}-${slot}.bin`;
        link.click();
        URL.revokeObjectURL(url);
      }
      this.statusText = 'Raw save records exported for recovery.';
    } catch (error) {
      this.statusText = `Could not export save records: ${errorMessage(error)}`;
    }
    this.render();
  }

  private menuAction(): 'title' | 'continue' | 'new-world' | 'error' {
    if (this.entered) {
      return this.failure ? 'error' : 'new-world';
    }
    return this.requestedContinue ? 'continue' : 'title';
  }

  private get showSavedChoice(): boolean {
    return !(this.entered || this.requestedContinue) && this.restored !== undefined;
  }

  private render(): void {
    const status = $('save-status');
    const button = $('continue') as HTMLButtonElement;
    if (!this.entered) {
      this.renderGoLabel();
    }
    const controls = computeMenuState({
      started: false,
      mainMenuOpen: true,
      inventoryOpen: false,
      debugMenuOpen: false,
      pointerLocked: false,
      dead: false,
      saveMenu: {
        action: this.menuAction(),
        hasCompatibleSave: this.restored !== undefined,
        hasSavedData: Boolean(this.currentRecord),
        storageError: this.storageUnavailable || (Boolean(this.failure) && this.restored === undefined),
      },
    }).saveMenu!;
    render(html`${[this.statusText, this.oldVersionLabel, this.failure].filter(Boolean).join('\n')}`, status);
    // Title and pause reuse the same card, so this copy has one rendering site.
    render(
      factDetail(
        'Save storage',
        'Saves are kept in this browser. When two tabs play the same world, the last one to save wins.',
      ),
      $('save-note'),
    );
    const savedChoice = this.showSavedChoice;
    $('overlay').classList.toggle('saved-choice', savedChoice);
    $('title-choice-heading').hidden = !savedChoice;
    $('new-character-options').hidden = this.entered || this.requestedContinue;
    $('go').setAttribute('aria-disabled', String(!(this.entered || (this.ready && this.newWorldLauncher))));
    button.disabled = !(this.ready && controls.continueEnabled);
    button.hidden = !(controls.showTitleControls && this.restored) || this.entered;
    $('save-rescan').hidden = this.entered || !this.storageUnavailable || Boolean(this.environmentProblem);
    const persist = $('save-persist');
    if (persist) {
      persist.hidden = !this.storage.canRequestPersistence || this.storageStatus?.persistent === true;
      (persist as HTMLButtonElement).disabled = this.requestingPersistence;
    }
    const exportButton = $('save-export');
    if (exportButton) {
      exportButton.hidden = !(this.protectedCurrent || this.corruptRecords);
    }
    $('save-recovery').hidden = !(this.entered && this.failure);
    render(html`${this.failure}`, $('save-recovery-message'));
  }
}

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}
