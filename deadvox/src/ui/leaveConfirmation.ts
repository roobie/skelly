export interface LeaveConfirmationState {
  readonly gameRunning: boolean;
  readonly gameDead: boolean;
  readonly saveAvailable: boolean;
  readonly lastSaveCompletedAtRealSeconds: number | undefined;
  readonly nowRealSeconds: number;
  readonly confirmationWindowRealSeconds: number;
}

export const shouldConfirmPageLeave = ({
  gameRunning,
  gameDead,
  saveAvailable,
  lastSaveCompletedAtRealSeconds,
  nowRealSeconds,
  confirmationWindowRealSeconds,
}: LeaveConfirmationState): boolean => {
  if (!gameRunning || gameDead || !saveAvailable) {
    return false;
  }
  return (
    lastSaveCompletedAtRealSeconds === undefined ||
    nowRealSeconds - lastSaveCompletedAtRealSeconds > confirmationWindowRealSeconds
  );
};
