import type { Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { SenseDef, SoundDef, SoundRecipe } from '../core/schema.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { soundOcclusion } from '../core/soundOcclusion.ts';
import type { SoundEmission } from '../core/soundPicker.ts';
import { renderSoundRecipe, soundRecipeFor, soundVariantKey } from '../core/soundSynth.ts';
import {
  type HeartbeatTarget,
  type HeartbeatTuning,
  heartbeatForStamina,
  playerHeartbeat,
} from './audioPresentation.ts';

const SETTINGS_KEY = 'deadvox.audio.settings';
const CATEGORIES = ['world', 'body', 'ui'] as const;
type AudioCategory = (typeof CATEGORIES)[number];

export interface AudioVolumes {
  master: number;
  world: number;
  body: number;
  ui: number;
}

const VOICE_FADE_SECONDS = 0.01;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAt?: number;
  finish: () => void;
}

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));

const readVolumes = (defaults: Readonly<AudioVolumes>): AudioVolumes => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...defaults };
    }
    const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
    return {
      master: typeof parsed.master === 'number' ? clampVolume(parsed.master) : defaults.master,
      world: typeof parsed.world === 'number' ? clampVolume(parsed.world) : defaults.world,
      body: typeof parsed.body === 'number' ? clampVolume(parsed.body) : defaults.body,
      ui: typeof parsed.ui === 'number' ? clampVolume(parsed.ui) : defaults.ui,
    };
  } catch {
    return { ...defaults };
  }
};

const PACK_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../content/base/assets/audio/**/*.ogg', {
      eager: true,
      query: '?url',
      import: 'default',
    }),
  ).map(([path, url]) => [path, url]),
);

interface Nodes {
  master: GainNode;
  categories: Map<AudioCategory, GainNode>;
}

export interface GameAudioOptions {
  registry: Registry;
  blockSize: number;
  isSolid: SolidAt;
  tuning: SenseDef;
  report: (message: string) => void;
}

export interface HeardSound {
  readonly event: SoundId;
  readonly file: string;
  readonly sourceLabel: string | null;
  readonly distanceMetres: number;
  readonly occluded: boolean;
  readonly lowpassHz: number | null;
  /** Combined sample, occlusion, saved master/category settings, and inverse-distance gain. */
  readonly gain: number;
  readonly emittedAsNoise: boolean;
  readonly noiseRadiusMetres: number | null;
}

interface SourceStartOptions {
  context: AudioContext;
  nodes: Nodes;
  event: SoundId;
  sound: SoundDef;
  pick: { file: string; gain: number; pitch: number };
  buffer: AudioBuffer;
  positionMetres: Vec3;
  emittedAsNoise: boolean;
  sourceLabel: string | null;
  listenerRelative: boolean;
}

const connectSample = (
  context: AudioContext,
  source: AudioBufferSourceNode,
  gain: GainNode,
  sound: SoundDef,
): AudioNode[] => {
  if (!sound.lowShelf) {
    source.connect(gain);
    return [source, gain];
  }
  const body = context.createBiquadFilter();
  body.type = 'lowshelf';
  body.frequency.value = sound.lowShelf.frequencyHz;
  body.gain.value = sound.lowShelf.gainDb;
  source.connect(body);
  body.connect(gain);
  return [source, body, gain];
};

/** Thin Web Audio adapter; sound choices and occlusion calculations live in pure core modules. */
export class GameAudio {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly volumes: AudioVolumes;
  private context: AudioContext | undefined;
  private nodes: Nodes | undefined;
  private listenerPosition: Vec3 = [0, 0, 0];
  private listenerForward: Vec3 = [0, 0, -1];
  private readonly registry: Registry;
  private readonly blockSize: number;
  private readonly isSolid: SolidAt;
  private readonly tuning: SenseDef;
  private readonly report: (message: string) => void;
  private readonly recentSounds: HeardSound[] = [];
  private readonly voices = new Map<SoundId, Set<Voice>>();
  // Up to one cap's worth of 10ms tails: a 40-shot cold burst can fade every retiree.
  private readonly retiring = new Map<SoundId, Set<Voice>>();
  private readonly heartbeat: HeartbeatTuning;
  private heartbeatTarget: HeartbeatTarget;
  private heartbeatNextAt = Number.NEGATIVE_INFINITY;
  private heartbeatLoading = false;
  private heartbeatUnavailable = false;
  private disposed = false;
  private outputMuted = false;

  constructor({ registry, blockSize, isSolid, tuning, report }: GameAudioOptions) {
    this.registry = registry;
    this.blockSize = blockSize;
    this.isSolid = isSolid;
    this.tuning = tuning;
    this.report = report;
    this.volumes = readVolumes(registry.ui.get(CORE_CONTENT_IDS.coreUi)!.audioVolumes);
    this.heartbeat = playerHeartbeat(registry);
    this.heartbeatTarget = heartbeatForStamina(this.heartbeat, 100);
  }

  dispose(): void {
    this.disposed = true;
  }

  get settings(): AudioVolumes {
    return { ...this.volumes };
  }

  get isOutputMuted(): boolean {
    return this.outputMuted;
  }

  get heardSounds(): readonly HeardSound[] {
    return [...this.recentSounds];
  }

  /** Deferred entry may need a fresh gesture; play retries unlocking on its first pointerdown. */
  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      const master = this.context.createGain();
      const categories = new Map<AudioCategory, GainNode>();
      for (const category of CATEGORIES) {
        const gain = this.context.createGain();
        gain.connect(master);
        categories.set(category, gain);
      }
      master.connect(this.context.destination);
      this.nodes = { master, categories };
      this.applyVolumes();
      this.updateListener(this.listenerPosition, this.listenerForward);
    }
    if (this.context.state !== 'running') {
      this.context.resume().catch((error: unknown) => this.report(`audio context did not resume: ${String(error)}`));
    }
  }

  setOutputMuted(muted: boolean): void {
    if (this.outputMuted === muted) {
      return;
    }
    this.outputMuted = muted;
    this.applyVolumes();
  }

  setVolume(category: keyof AudioVolumes, value: number): void {
    this.volumes[category] = clampVolume(value);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.volumes));
    } catch {
      // Audio remains usable in private browsing modes that deny storage.
    }
    this.applyVolumes();
  }

  updateListener(positionMetres: Vec3, forward: Vec3): void {
    this.listenerPosition = [...positionMetres];
    this.listenerForward = [...forward];
    const listener = this.context?.listener;
    if (!listener) {
      return;
    }
    if (listener.positionX) {
      listener.positionX.value = positionMetres[0];
      listener.positionY.value = positionMetres[1];
      listener.positionZ.value = positionMetres[2];
    } else {
      listener.setPosition(positionMetres[0], positionMetres[1], positionMetres[2]);
    }
    if (listener.forwardX && listener.upX) {
      listener.forwardX.value = forward[0];
      listener.forwardY.value = forward[1];
      listener.forwardZ.value = forward[2];
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      listener.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
  }

  /** Playback only. The session has already selected/committed this event and its hearing stimulus. */
  play(emission: Readonly<SoundEmission>, positionMetres: Vec3): void {
    const { event, pick, emittedAsNoise, sourceLabel, listenerRelative } = emission;
    const sound = this.registry.sounds.get(event);
    if (!sound) {
      return;
    }
    const variant = this.variantSource(event, sound, pick.file);
    if (!variant) {
      this.report(`sound file "${pick.file}" is not bundled for "${event}"`);
      return;
    }
    const { context, nodes } = this;
    if (context && nodes && context.state === 'running') {
      this.variantBuffer(context, pick.file, variant).then((buffer) => {
        if (!buffer || this.context !== context || context.state !== 'running') {
          return;
        }
        this.startSource({
          context,
          nodes,
          event,
          sound,
          pick,
          buffer,
          positionMetres,
          emittedAsNoise,
          sourceLabel,
          listenerRelative,
        });
      });
    }
  }

  /** Plays one exact variant, keyed by `soundVariantKey`, at the event's base gain, with no picker jitter or cooldown. */
  preview(event: SoundId, file: string): boolean {
    const sound = this.registry.sounds.get(event);
    if (!sound?.variants.some((listed) => soundVariantKey(sound.id, listed) === file)) {
      return false;
    }
    const variant = this.variantSource(event, sound, file);
    const { context, nodes } = this;
    if (!(variant && context && nodes)) {
      this.report(`sound file "${file}" is not bundled for "${event}"`);
      return false;
    }
    const pick = { file, gain: sound.gain, pitch: 1 };
    const positionMetres = [...this.listenerPosition] as Vec3;
    this.variantBuffer(context, file, variant).then(async (buffer) => {
      if (!buffer || this.context !== context) {
        return;
      }
      if (context.state !== 'running') {
        try {
          await context.resume();
        } catch (error) {
          this.report(`audio context did not resume: ${String(error)}`);
        }
      }
      if (context.state === 'running') {
        this.startSource({
          context,
          nodes,
          event,
          sound,
          pick,
          buffer,
          positionMetres,
          emittedAsNoise: false,
          sourceLabel: null,
          listenerRelative: true,
        });
      }
    });
    return true;
  }

  /** Plays one heartbeat sound through the same category and buffer path as live beats. */
  previewHeartbeat(event: SoundId, gainValue: number): boolean {
    if (!Object.values(this.heartbeat.sounds).includes(event)) {
      return false;
    }
    const { context, nodes } = this;
    if (!(context && nodes)) {
      return false;
    }
    this.heartbeatBuffer(context, event).then(async (buffer) => {
      if (!buffer || this.context !== context) {
        return;
      }
      if (context.state !== 'running') {
        try {
          await context.resume();
        } catch (error) {
          this.report(`audio context did not resume: ${String(error)}`);
        }
      }
      if (context.state === 'running') {
        this.startHeartbeat({ context, nodes, event, buffer, gainValue, when: context.currentTime + 0.025 });
      }
    });
    return true;
  }

  /** Playback voice allocation happens after decoding; pending loads consume no playback slots. */
  private stealOldestVoice(event: SoundId, cap: number | undefined, context: AudioContext): void {
    const active = this.voices.get(event);
    if (cap === undefined || !active || active.size < cap) {
      return;
    }
    const now = context.currentTime;
    const tails = this.retiring.get(event) ?? new Set<Voice>();
    // A delayed ended callback need not keep an already-stopped node connected.
    for (const tail of tails) {
      if (tail.stopAt !== undefined && tail.stopAt <= now) {
        tail.finish();
      }
    }
    // The safety ceiling is 2*cap connected sources, including pathological >64-shot
    // same-quantum calls. Ordinary 75/100ms cadence never reaches this tail ceiling.
    if (tails.size >= cap) {
      const previousTail = tails.values().next().value!;
      previousTail.source.stop();
      previousTail.finish();
    }
    const oldest = active.values().next().value!;
    active.delete(oldest);
    tails.add(oldest);
    this.retiring.set(event, tails);
    oldest.stopAt = now + VOICE_FADE_SECONDS;
    oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, now);
    oldest.gain.gain.linearRampToValueAtTime(0, oldest.stopAt);
    oldest.source.stop(oldest.stopAt);
  }

  private applyVolumes(): void {
    if (!this.nodes) {
      return;
    }
    this.nodes.master.gain.value = this.outputMuted ? 0 : this.volumes.master;
    for (const category of CATEGORIES) {
      this.nodes.categories.get(category)!.gain.value = this.volumes[category];
    }
  }

  updateHeartbeat(stamina: number): void {
    if (this.disposed) {
      return;
    }
    this.heartbeatTarget = heartbeatForStamina(this.heartbeat, stamina);
    const { context, nodes } = this;
    if (
      this.heartbeatTarget.gain === 0 ||
      this.heartbeatUnavailable ||
      this.heartbeatLoading ||
      !context ||
      !nodes ||
      context.state !== 'running' ||
      context.currentTime < this.heartbeatNextAt
    ) {
      return;
    }
    this.heartbeatLoading = true;
    const { slow: slowEvent, fast: fastEvent } = this.heartbeat.sounds;
    Promise.all([this.heartbeatBuffer(context, slowEvent), this.heartbeatBuffer(context, fastEvent)]).then(
      ([slow, fast]) => {
        this.heartbeatLoading = false;
        if (!(slow && fast)) {
          this.heartbeatUnavailable = true;
          return;
        }
        if (this.disposed || this.context !== context || context.state !== 'running') {
          return;
        }
        const target = this.heartbeatTarget;
        if (target.gain === 0) {
          return;
        }
        const interval = 60 / target.bpm;
        const when = context.currentTime + 0.025;
        // Use the recording that fits one scheduled beat; the law controls tempo, not pitch.
        const slowFits = slow.duration <= interval;
        this.startHeartbeat({
          context,
          nodes,
          event: slowFits ? slowEvent : fastEvent,
          buffer: slowFits ? slow : fast,
          gainValue: target.gain,
          when,
        });
        this.heartbeatNextAt = when + interval;
      },
    );
  }

  /** A heartbeat sound's single variant, which content validation guarantees. */
  private heartbeatBuffer(context: AudioContext, event: SoundId): Promise<AudioBuffer | null> {
    const sound = this.registry.sounds.get(event)!;
    const file = soundVariantKey(sound.id, sound.variants[0]!);
    const variant = this.variantSource(event, sound, file);
    if (!variant) {
      this.report(`heartbeat sound file "${file}" is not bundled for "${event}"`);
      return Promise.resolve(null);
    }
    return this.variantBuffer(context, file, variant);
  }

  private startHeartbeat({
    context,
    nodes,
    event,
    buffer,
    gainValue,
    when,
  }: {
    context: AudioContext;
    nodes: Nodes;
    event: SoundId;
    buffer: AudioBuffer;
    gainValue: number;
    when: number;
  }): void {
    if (gainValue === 0) {
      return;
    }
    const sound = this.registry.sounds.get(event)!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    gain.gain.value = gainValue * sound.gain;
    source.connect(gain);
    gain.connect(nodes.categories.get(sound.category)!);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
  }

  /** A variant's recipe, or its bundled file's URL; undefined when the pack lacks the file. */
  private variantSource(event: SoundId, sound: SoundDef, file: string): SoundRecipe | string | undefined {
    const recipe = soundRecipeFor(sound, file);
    if (recipe) {
      return recipe;
    }
    const origin = this.registry.soundOrigins.get(event);
    const packPath = origin?.source.slice(0, origin.source.lastIndexOf('/'));
    return packPath ? PACK_FILES[`${packPath}/${file}`] : undefined;
  }

  private variantBuffer(
    context: AudioContext,
    file: string,
    variant: SoundRecipe | string,
  ): Promise<AudioBuffer | null> {
    if (typeof variant === 'string') {
      return this.loadBuffer(context, file, variant);
    }
    let buffer = this.buffers.get(file);
    if (!buffer) {
      try {
        const { samples, sampleRate } = renderSoundRecipe(variant);
        buffer = context.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
      } catch (error) {
        this.report(`sound recipe "${file}" did not render: ${String(error)}`);
        return Promise.resolve(null);
      }
      this.buffers.set(file, buffer);
    }
    return Promise.resolve(buffer);
  }

  private loadBuffer(context: AudioContext, file: string, url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) {
      return Promise.resolve(cached);
    }
    const existing = this.loading.get(file);
    if (existing) {
      return existing;
    }
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(file, buffer);
        return buffer;
      })
      .catch((error: unknown) => {
        this.report(`sound file "${file}" did not load: ${String(error)}`);
        return null;
      })
      .finally(() => this.loading.delete(file));
    this.loading.set(file, request);
    return request;
  }

  private startSource({
    context,
    nodes,
    event,
    sound,
    pick,
    buffer,
    positionMetres,
    emittedAsNoise,
    sourceLabel,
    listenerRelative,
  }: SourceStartOptions): void {
    this.stealOldestVoice(event, sound.voiceCap, context);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pick.pitch;
    gain.gain.value = pick.gain;
    const connectedNodes = connectSample(context, source, gain, sound);

    const category = nodes.categories.get(sound.category)!;
    const listenerBlocks: Vec3 = this.listenerPosition.map((v) => v / this.blockSize) as Vec3;
    const sourceBlocks: Vec3 = positionMetres.map((v) => v / this.blockSize) as Vec3;
    const headLocked = listenerRelative || sound.category === 'ui';
    const occlusion = headLocked
      ? { occluded: false, gain: 1, cutoffHz: Number.POSITIVE_INFINITY }
      : soundOcclusion({
          listener: listenerBlocks,
          source: sourceBlocks,
          isSolid: this.isSolid,
          globalWall: this.tuning.wall,
          soundWall: sound.wall,
        });
    const distanceMetres = headLocked
      ? 0
      : Math.hypot(
          positionMetres[0] - this.listenerPosition[0],
          positionMetres[1] - this.listenerPosition[1],
          positionMetres[2] - this.listenerPosition[2],
        );
    const distanceGain = headLocked ? 1 : 1 / Math.max(1, Math.min(64, distanceMetres));
    if (headLocked) {
      gain.connect(category);
    } else {
      const filter = context.createBiquadFilter();
      const wallGain = context.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = occlusion.cutoffHz;
      wallGain.gain.value = occlusion.gain;
      const panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 64;
      panner.rolloffFactor = 1;
      if (panner.positionX) {
        panner.positionX.value = positionMetres[0];
        panner.positionY.value = positionMetres[1];
        panner.positionZ.value = positionMetres[2];
      } else {
        panner.setPosition(positionMetres[0], positionMetres[1], positionMetres[2]);
      }
      connectedNodes.push(filter, wallGain, panner);
      gain.connect(filter);
      filter.connect(wallGain);
      wallGain.connect(panner);
      panner.connect(category);
    }
    let finished = false;
    const voice: Voice = {
      source,
      gain,
      finish: () => {
        if (finished) {
          return;
        }
        finished = true;
        const active = this.voices.get(event);
        active?.delete(voice);
        if (active?.size === 0) {
          this.voices.delete(event);
        }
        const tails = this.retiring.get(event);
        tails?.delete(voice);
        if (tails?.size === 0) {
          this.retiring.delete(event);
        }
        for (const node of connectedNodes) {
          node.disconnect();
        }
      },
    };
    if (sound.voiceCap !== undefined) {
      const active = this.voices.get(event) ?? new Set<Voice>();
      active.add(voice);
      this.voices.set(event, active);
    }
    source.onended = voice.finish;
    source.start();
    this.recentSounds.push({
      event,
      file: pick.file,
      sourceLabel,
      distanceMetres,
      occluded: occlusion.occluded,
      lowpassHz: headLocked ? null : occlusion.cutoffHz,
      gain: pick.gain * occlusion.gain * this.volumes.master * this.volumes[sound.category] * distanceGain,
      emittedAsNoise,
      noiseRadiusMetres: emittedAsNoise && sound.noise.enabled ? sound.noise.radiusMetres : null,
    });
    if (this.recentSounds.length > 8) {
      this.recentSounds.shift();
    }
  }
}
