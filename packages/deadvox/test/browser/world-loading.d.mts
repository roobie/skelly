interface LoadingPage {
  evaluate: (observe: () => Promise<void>) => Promise<void>;
}

export function waitForWorldLoaded(page: LoadingPage): Promise<void>;
