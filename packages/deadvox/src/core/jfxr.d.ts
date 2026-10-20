// The jfxr package ships no types; this declares only the part `src/core/soundSynth.ts` uses.
// biome-ignore-all lint/style/noExcessiveClassesPerFile: the declarations mirror the classes of one library module.
declare module 'jfxr' {
  export interface Parameter {
    type: 'float' | 'int' | 'enum' | 'boolean';
    values: Record<string, string> | null;
    minValue: number | null;
    maxValue: number | null;
  }

  export class Sound {
    parse(json: string): void;
    duration(): number;
    forEachParam(func: (key: string, param: Parameter) => void): void;
  }

  export class Clip {
    toFloat32Array(): Float32Array<ArrayBuffer>;
    getSampleRate(): number;
  }

  export class Synth {
    constructor(json: string, defer?: (callback: () => void) => void);
    run(doneCallback: (clip: Clip) => void): void;
  }
}
