// Browser frame wiring only. The fingerprinted caller owns elapsed-time policy,
// input sampling, simulation advancement, death and saves; this passes RAF timestamps unchanged.
export const startPlayFrames = (
  frame: (now: number) => boolean,
  request: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
): void => {
  const tick: FrameRequestCallback = (now) => {
    if (frame(now)) {
      request(tick);
    }
  };
  request(tick);
};
