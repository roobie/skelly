const frameTime = performance.now();
declare const ctx: AudioContext;
const audioTime = ctx.currentTime;

export { audioTime, frameTime };
