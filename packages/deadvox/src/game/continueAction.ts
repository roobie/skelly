import type { LongJob } from '@skelly/engine/sim';

export const continueActionResumesJob = (jobType: LongJob['jobType'] | undefined): boolean =>
  jobType === 'wait' ||
  jobType === 'reading' ||
  jobType === 'forceDoor' ||
  jobType === 'treatment' ||
  jobType === 'vehicleWork';
