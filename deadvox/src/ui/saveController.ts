import { html, render } from 'lit-html';
import type { ClockSettings } from '../core/clock.ts';
import { defaultClock, simSecondsPerHour } from '../core/clock.ts';
import type { Registry } from '../core/content.ts';
import {
  currentSaveVersionIdentity,
  decodeSave,
  type SaveContentKind,
  type SaveVersionIdentity,
  type SaveWorldIdentity,
  type SaveWorldOptions,
} from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import {
  type SaveBackendPreference,
  type SaveLoadResult,
  SaveStorage,
  type SaveStorageStatus,
} from '../game/saveStorage.ts';
import { SaveCorruptionError } from '../game/saveStorageProtocol.ts';
import { computeMenuState } from './menuState.ts';

const SCHEDULER_IDS = new Set(['needs', 'long-action', 'lights', 'zombies', 'player', 'handling', 'firearms']);
const SAVE_CHECKPOINT_GAME_HOURS = 2;
export const saveCheckpointInterval = (clock: ClockSettings): number =>
  SAVE_CHECKPOINT_GAME_HOURS * simSecondsPerHour(clock);
const CONTINUE_KEY = 'deadvox.continue-namespace';
const RESTORE_REFUSAL_KEY = 'deadvox.restore-refusal';

const contentLookup = (registry: Registry, kind: SaveContentKind, id: string): boolean => {
  switch (kind) {
    case 'block':
      return registry.blockIds.has(id);
    case 'item':
      return registry.items.has(id);
    case 'furniture':
      return registry.furniture.has(id);
    case 'zombie':
      return registry.zombies.has(id);
    case 'sound':
      return registry.sounds.has(id);
    case 'scheduler':
      return SCHEDULER_IDS.has(id);
    case 'skill':
      return registry.skills.has(id);
    case 'recipe':
      return registry.recipes.has(id);
    default:
      return false;
  }
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const INSECURE_CONTEXT_MESSAGE = "Saves need a secure (https) page; this session won't be saved";

const saveEnvironmentProblem = (): string | undefined => {
  if (!globalThis.isSecureContext) {
    return INSECURE_CONTEXT_MESSAGE;
  }
  if (
    typeof globalThis.crypto?.randomUUID !== 'function' ||
    typeof globalThis.crypto?.subtle?.digest !== 'function' ||
    !navigator.storage ||
    !globalThis.indexedDB
  ) {
    return 'Required save APIs are unavailable; this session will not be saved.';
  }
  return undefined;
};

const versionLabel = (payload: Uint8Array): string => {
  try {
    const envelope = JSON.parse(new TextDecoder().decode(payload)) as {
      versionIdentity?: { digest?: string; buildRevision?: string };
    };
    const revision = envelope.versionIdentity?.buildRevision;
    const digest = envelope.versionIdentity?.digest;
    return `${revision ?? 'unknown build'} · ${digest?.slice(0, 12) ?? 'unknown version'}`;
  } catch {
    return 'unreadable version metadata';
  }
};

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
  private candidate: SaveLoadResult | undefined;
  private oldVersionLabel = '';
  private failure = '';
  private storageUnavailable = false;
  private protectedCurrent = false;
  private corruptRecords = false;
  private requestedContinue = false;
  private entered = false;
  private ready = false;
  private statusText = 'Checking saved worlds…';
  private snapshot: (() => Readonly<SaveSnapshot>) | undefined;
  private simTime: (() => number) | undefined;
  private worldOptions: SaveWorldOptions | undefined;
  private recordSnapshotDuration: ((durationMs: number) => void) | undefined;
  private worldId = '';
  private characterId = '';
  private readonly environmentProblem: string | undefined;
  private nextAutosaveAt = 0;
  private queued: { snapshot: Readonly<SaveSnapshot>; reason: string } | undefined;
  private checkpointInterval = SAVE_CHECKPOINT_GAME_HOURS * 450;
  private writing = false;
  private requestingPersistence = false;

  constructor(backend: SaveBackendPreference = 'auto') {
    this.environmentProblem = saveEnvironmentProblem();
    if (!this.environmentProblem) {
      this.identity = currentSaveVersionIdentity();
      this.worldId = globalThis.crypto.randomUUID();
      this.characterId = globalThis.crypto.randomUUID();
    }
    this.storage = new SaveStorage({ backend });
    $('continue').addEventListener('click', (event) => this.continueWorld(event));
    $('overlay').addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : undefined;
        if (target?.closest('#go') || target === $('overlay')) {
          this.newWorld(event);
        }
      },
      { capture: true },
    );
    $('save-persist')?.addEventListener('click', () => this.requestPersistence().catch(() => undefined));
    $('save-export')?.addEventListener('click', () => this.exportCurrentRecords().catch(() => undefined));
    $('save-replace-confirm').addEventListener('click', () => this.confirmNewWorld());
    $('save-retry').addEventListener('click', () => this.retrySave());
    $('save-rescan').addEventListener('click', () => location.reload());
    $('save-export-current').addEventListener('click', () => this.exportCurrentSnapshot().catch(() => undefined));
    $('save-replace-cancel').addEventListener('click', () => {
      $('save-confirmation').hidden = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.capture('visibilitychange');
      }
    });
    globalThis.addEventListener('pagehide', () => this.capture('pagehide'));
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
    this.requestedContinue = !refusal && requested === this.namespace;
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
      this.statusText = 'No saved world found. Choose New world to begin.';
      return;
    }
    this.candidate = this.currentRecord;
    this.savedGeneration = this.currentRecord.generation;
    this.corruptRecords = this.currentRecord.corruptSlots.length > 0;
    try {
      const decoded = await decodeSave(this.currentRecord.payload, { contentLookup: () => true });
      this.restoreWorldOptions = decoded.worldOptions;
      this.statusText = `Saved world available · ${versionLabel(this.currentRecord.payload)}${this.currentRecord.corruptSlots.length > 0 ? ` · inactive slot(s) ${this.currentRecord.corruptSlots.join(', ')} are corrupt but retained` : ''}`;
    } catch (error) {
      this.protectedCurrent = true;
      this.statusText = `Saved world cannot be loaded and was left untouched: ${errorMessage(error)}`;
    }
  }

  private async inspectOtherNamespaces(namespaces: readonly string[]): Promise<void> {
    const namespace = namespaces.find((candidate) => candidate !== this.namespace);
    if (!namespace) {
      return;
    }
    try {
      const record = await this.storage.load(namespace);
      if (record) {
        this.oldVersionLabel = `An older or different-version save is preserved · ${namespace.slice(0, 12)} · ${versionLabel(record.payload)}`;
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
      this.statusText = `${this.statusText} Title screen ready.`;
      this.render();
      return undefined;
    }
    try {
      const decoded = await decodeSave(candidate.payload, {
        contentLookup: (kind, id) => contentLookup(registry, kind, id),
      });
      this.restored = decoded.snapshot;
      if (candidate.corruptSlots.length > 0) {
        this.statusText = `A valid generation is available; corrupt inactive slot(s) ${candidate.corruptSlots.join(', ')} are retained.`;
      }
      if (this.requestedContinue) {
        sessionStorage.removeItem(CONTINUE_KEY);
        this.entered = true;
        this.worldId = decoded.snapshot.world.id;
        this.characterId = decoded.snapshot.character.id;
        this.statusText = 'Saved world continued. It starts paused; debug tools are off.';
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
    this.statusText = `${this.statusText} Title screen ready.`;
    this.render();
    return this.restored;
  }

  get isRestored(): boolean {
    return this.requestedContinue && this.restored !== undefined;
  }

  get isEntered(): boolean {
    return this.entered;
  }

  /** The controller is the sole writer of #go; play supplies the derived menu label here. */
  setGoLabel(label: string): void {
    render(html`${label}`, $('go'));
  }

  /** Protects a decoded save when lazy chunk-diff restoration finds a different generated base. */
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
    options: { clock?: ClockSettings; recordSnapshotDuration?: (durationMs: number) => void } = {},
  ): { worldId: string; characterId: string } {
    this.snapshot = snapshot;
    this.simTime = simTime;
    this.worldOptions = worldOptions;
    this.recordSnapshotDuration = options.recordSnapshotDuration;
    const interval = saveCheckpointInterval(options.clock ?? defaultClock);
    this.checkpointInterval = interval;
    this.nextAutosaveAt = (Math.floor(simTime() / interval) + 1) * interval;
    return { worldId: this.worldId, characterId: this.characterId };
  }

  /** Move the next checkpoint to the first interval after an explicit forward debug-time seek. */
  rearmAutosaveAfterTimeSeek(): void {
    const time = this.simTime?.();
    if (time !== undefined) {
      this.nextAutosaveAt = (Math.floor(time / this.checkpointInterval) + 1) * this.checkpointInterval;
    }
  }

  /** Called after each simulation frame; thresholds are in simulated seconds. */
  afterFrame(): void {
    const time = this.simTime?.();
    if (time !== undefined && time >= this.nextAutosaveAt) {
      this.nextAutosaveAt = (Math.floor(time / this.checkpointInterval) + 1) * this.checkpointInterval;
      this.capture('two-game-hour checkpoint');
    }
  }

  /** Called synchronously before beginning a sleep action. */
  beforeSleep(): void {
    this.capture('before sleep');
  }

  private capture(reason: string): void {
    if (!(this.snapshot && this.namespace && this.entered) || this.protectedCurrent || this.storageUnavailable) {
      return;
    }
    const startedAt = performance.now();
    const snapshot = this.snapshot();
    this.recordSnapshotDuration?.(performance.now() - startedAt);
    this.queued = { snapshot, reason };
    if (!this.writing) {
      this.flush().catch(() => undefined);
    }
  }

  private async flush(): Promise<void> {
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
      this.statusText = `Saved generation ${result.generation} · ${task.reason}`;
      this.failure = '';
    } catch (error) {
      this.failure = `Save failed (${task.reason}): ${errorMessage(error)}. The previous A/B generation remains available.`;
      this.statusText = this.failure;
    }
    this.render();
    this.writing = false;
    if (this.queued) {
      this.flush().catch(() => undefined);
    }
  }

  private newWorld(event: Event): void {
    if (this.entered) {
      return;
    }
    if (!this.ready) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.protectedCurrent) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.statusText = 'New world is blocked so the existing save can be recovered first.';
      this.render();
      return;
    }
    if (this.currentRecord) {
      event.preventDefault();
      event.stopImmediatePropagation();
      $('save-confirmation').hidden = false;
      return;
    }
    this.confirmNewWorld();
  }

  private confirmNewWorld(): void {
    this.entered = true;
    $('save-confirmation').hidden = true;
    $('continue').hidden = true;
    this.statusText = this.storageUnavailable
      ? `New world ready. ${this.environmentProblem ?? 'Save storage is unavailable; this session will not be saved.'}`
      : 'New world ready. The existing save is retained until the first checkpoint commits.';
    this.render();
  }

  private continueWorld(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!(this.ready && this.restored) || this.protectedCurrent || this.storageUnavailable) {
      return;
    }
    sessionStorage.setItem(CONTINUE_KEY, this.namespace);
    location.reload();
  }

  private retrySave(): void {
    if (!(this.entered && this.snapshot) || this.protectedCurrent || this.storageUnavailable) {
      return;
    }
    this.queued = { snapshot: this.snapshot(), reason: 'manual retry' };
    this.failure = '';
    if (!this.writing) {
      this.flush().catch(() => undefined);
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
      this.statusText = 'Current world snapshot exported from the save worker.';
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

  private render(): void {
    const status = $('save-status');
    const button = $('continue') as HTMLButtonElement;
    if (!this.entered) {
      this.setGoLabel(this.titleNewWorldLabel);
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
      html`Saves are kept in this browser. When two tabs play the same world, the last one to save wins.`,
      $('save-note'),
    );
    button.disabled = !(this.ready && controls.continueEnabled);
    button.hidden = !(controls.showTitleControls && this.restored) || this.entered;
    $('save-rescan').hidden = this.entered || !this.storageUnavailable || Boolean(this.environmentProblem);
    const persist = $('save-persist');
    if (persist) {
      persist.hidden = !this.storage.canRequestPersistence || this.storageStatus?.persistent === true;
      (persist as HTMLButtonElement).disabled = this.requestingPersistence;
      $('save-persist-note').hidden = persist.hidden;
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
