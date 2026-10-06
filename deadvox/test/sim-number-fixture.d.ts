import '../src/core/sim.ts';

// Tests supply numeric Sim-second fixtures for brevity; production modules use the branded frame API.
// Keep this augmentation in test/ so RealSeconds and GameSeconds remain rejected in game code.
declare module '../src/core/sim.ts' {
  interface Simulation {
    frame(simDt: number, until?: number): number;
  }
}
export {};
