import type { Registry, SoundDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { SoundEventId } from '../core/soundEvents.ts';
import { soundOcclusion } from '../core/soundOcclusion.ts';
import type { SoundEmission } from '../core/soundPicker.ts';
import {
  HEARTBEAT_FILES,
  type HeartbeatTarget,
  heartbeatForStamina,
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

const DEFAULT_VOLUMES: AudioVolumes = { master: 0.8, world: 0.8, body: 0.8, ui: 0.8 };
const VOICE_CAPS = new Map<SoundEventId, number>([
  ['gunshot', 32],
  ['gunshot_pbs1_reference', 32],
]);
const VOICE_FADE_SECONDS = 0.01;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopAt?: number;
  finish: () => void;
}

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));

const readVolumes = (): AudioVolumes => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_VOLUMES };
    }
    const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
    return {
      master: typeof parsed.master === 'number' ? clampVolume(parsed.master) : DEFAULT_VOLUMES.master,
      world: typeof parsed.world === 'number' ? clampVolume(parsed.world) : DEFAULT_VOLUMES.world,
      body: typeof parsed.body === 'number' ? clampVolume(parsed.body) : DEFAULT_VOLUMES.body,
      ui: typeof parsed.ui === 'number' ? clampVolume(parsed.ui) : DEFAULT_VOLUMES.ui,
    };
  } catch {
    return { ...DEFAULT_VOLUMES };
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
  report: (message: string) => void;
}

export interface HeardSound {
  readonly event: SoundEventId;
  readonly file: string;
  readonly sourceLabel: string | null;
  readonly distanceMetres: number;
  readonly wallRuns: number;
  readonly lowpassHz: number | null;
  /** Combined sample, occlusion, saved master/category settings, and inverse-distance gain. */
  readonly gain: number;
  readonly emittedAsNoise: boolean;
  readonly noiseRadiusMetres: number | null;
}

interface SourceStartOptions {
  context: AudioContext;
  nodes: Nodes;
  event: SoundEventId;
  sound: SoundDef;
  pick: { file: string; gain: number; pitch: number };
  buffer: AudioBuffer;
  positionMetres: Vec3;
  emittedAsNoise: boolean;
  sourceLabel: string | null;
  listenerRelative: boolean;
}

/** Thin Web Audio adapter; sound choices and occlusion calculations live in pure core modules. */
export class GameAudio {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly volumes = readVolumes();
  private context: AudioContext | undefined;
  private nodes: Nodes | undefined;
  private listenerPosition: Vec3 = [0, 0, 0];
  private listenerForward: Vec3 = [0, 0, -1];
  private readonly registry: Registry;
  private readonly blockSize: number;
  private readonly isSolid: SolidAt;
  private readonly report: (message: string) => void;
  private readonly recentSounds: HeardSound[] = [];
  private readonly voices = new Map<SoundEventId, Set<Voice>>();
  // Up to one cap's worth of 10ms tails: a 40-shot cold burst can fade every retiree.
  private readonly retiring = new Map<SoundEventId, Set<Voice>>();
  private heartbeatTarget: HeartbeatTarget = heartbeatForStamina(100);
  private heartbeatNextAt = Number.NEGATIVE_INFINITY;
  private heartbeatLoading = false;
  private heartbeatUnavailable = false;
  private disposed = false;

  constructor({ registry, blockSize, isSolid, report }: GameAudioOptions) {
    this.registry = registry;
    this.blockSize = blockSize;
    this.isSolid = isSolid;
    this.report = report;
  }

  dispose(): void {
    this.disposed = true;
  }

  get settings(): AudioVolumes {
    return { ...this.volumes };
  }

  get heardSounds(): readonly HeardSound[] {
    return [...this.recentSounds];
  }

  /** Must be called synchronously from a user gesture. */
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
    const origin = this.registry.soundOrigins.get(event);
    const packPath = origin?.source.slice(0, origin.source.lastIndexOf('/'));
    const url = packPath ? PACK_FILES[`${packPath}/${pick.file}`] : undefined;
    if (!url) {
      this.report(`sound file "${pick.file}" is not bundled for "${event}"`);
      return;
    }
    const { context, nodes } = this;
    if (context && nodes && context.state === 'running') {
      this.loadBuffer(context, pick.file, url).then((buffer) => {
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

  /** Plays one exact manifest variant at the event's base gain, with no picker jitter or cooldown. */
  preview(event: SoundEventId, file: string): boolean {
    const sound = this.registry.sounds.get(event);
    if (!sound?.variants.includes(file)) {
      return false;
    }
    const origin = this.registry.soundOrigins.get(event);
    const packPath = origin?.source.slice(0, origin.source.lastIndexOf('/'));
    const url = packPath ? PACK_FILES[`${packPath}/${file}`] : undefined;
    const { context, nodes } = this;
    if (!(url && context && nodes)) {
      this.report(`sound file "${file}" is not bundled for "${event}"`);
      return false;
    }
    const pick = { file, gain: sound.gain, pitch: 1 };
    const positionMetres = [...this.listenerPosition] as Vec3;
    this.loadBuffer(context, file, url).then(async (buffer) => {
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

  /** Playback voice allocation happens after decoding; pending loads consume no playback slots. */
  private stealOldestVoice(event: SoundEventId, context: AudioContext): void {
    const cap = VOICE_CAPS.get(event);
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
    this.nodes.master.gain.value = this.volumes.master;
    for (const category of CATEGORIES) {
      this.nodes.categories.get(category)!.gain.value = this.volumes[category];
    }
  }

  updateHeartbeat(stamina: number): void {
    if (this.disposed) {
      return;
    }
    this.heartbeatTarget = heartbeatForStamina(stamina);
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
    const files = Object.values(HEARTBEAT_FILES);
    const buffers = files.map((file) => {
      const url = PACK_FILES[`../content/base/${file}`];
      if (!url) {
        this.report(`heartbeat file "${file}" is not bundled`);
        return Promise.resolve(null);
      }
      return this.loadBuffer(context, file, url);
    });
    Promise.all(buffers).then(([slow, fast]) => {
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
      const body = nodes.categories.get('body')!;
      // Use the recording that fits one scheduled beat; the law controls tempo, not pitch.
      this.startHeartbeat({
        context,
        body,
        buffer: slow.duration <= interval ? slow : fast,
        gainValue: target.gain,
        when,
      });
      this.heartbeatNextAt = when + interval;
    });
  }

  private startHeartbeat({
    context,
    body,
    buffer,
    gainValue,
    when,
  }: {
    context: AudioContext;
    body: GainNode;
    buffer: AudioBuffer;
    gainValue: number;
    when: number;
  }): void {
    if (gainValue === 0) {
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(body);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
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
    this.stealOldestVoice(event, context);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = pick.pitch;
    gain.gain.value = pick.gain;
    source.connect(gain);
    const connectedNodes: AudioNode[] = [source, gain];

    const category = nodes.categories.get(sound.category)!;
    const listenerBlocks: Vec3 = this.listenerPosition.map((v) => v / this.blockSize) as Vec3;
    const sourceBlocks: Vec3 = positionMetres.map((v) => v / this.blockSize) as Vec3;
    const headLocked = listenerRelative || sound.category === 'ui';
    const occlusion = headLocked
      ? { wallRuns: 0, gain: 1, cutoffHz: Number.POSITIVE_INFINITY }
      : soundOcclusion(listenerBlocks, sourceBlocks, this.isSolid);
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
    if (VOICE_CAPS.has(event)) {
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
      wallRuns: occlusion.wallRuns,
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
