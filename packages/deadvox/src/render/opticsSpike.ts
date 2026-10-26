export type OpticsSpike = 'effect' | 'world';

export const opticsSpikeFromSearch = (search: string): OpticsSpike | undefined => {
  const choice = new URLSearchParams(search).get('optics');
  return choice === 'effect' || choice === 'world' ? choice : undefined;
};

// The magnified scene must not magnify the close-eye gun or worn gear a second time.
export const OPTICS_SPIKE_LAYER = 2;
