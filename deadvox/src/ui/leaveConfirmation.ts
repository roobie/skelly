import { type RealSeconds, type RealTimestamp, realSeconds } from '../core/time.ts';

export interface LeaveConfirmationState {
  readonly gameRunning: boolean;
  readonly gameDead: boolean;
  readonly saveAvailable: boolean;
  readonly lastSaveCompletedAtRealTimestamp: RealTimestamp | undefined;
  readonly nowRealTimestamp: RealTimestamp;
  readonly confirmationWindowRealSeconds: RealSeconds;
}

export const shouldConfirmPageLeave = ({
  gameRunning,
  gameDead,
  saveAvailable,
  lastSaveCompletedAtRealTimestamp,
  nowRealTimestamp,
  confirmationWindowRealSeconds,
}: LeaveConfirmationState): boolean => {
  if (!gameRunning || gameDead || !saveAvailable) {
    return false;
  }
  return (
    lastSaveCompletedAtRealTimestamp === undefined ||
    realSeconds(nowRealTimestamp - lastSaveCompletedAtRealTimestamp) > confirmationWindowRealSeconds
  );
};
