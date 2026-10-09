import type { LongJob } from '../core/longAction.ts';

export const continueActionResumesJob = (jobType: LongJob['jobType'] | undefined): boolean =>
  jobType === 'wait' || jobType === 'reading' || jobType === 'pry' || jobType === 'treatment';
