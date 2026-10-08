export interface StartupHintLatch {
  readonly pending: boolean;
  readonly visible: boolean;
}

export const updateStartupHintLatch = (pending: boolean, unmeshedColumns: number): StartupHintLatch => {
  if (!pending || unmeshedColumns === 0) {
    return { pending: false, visible: false };
  }
  return { pending: true, visible: true };
};
