// Loading owns its work-scaled deadline; the enclosing browser stage bounds a missing verdict.
// An animation-frame poll or another readiness deadline would fail on renderer speed instead of loading work.
/** @typedef {{ evaluate: (observe: () => Promise<void>) => Promise<void> }} LoadingPage */
/**
 * @param {LoadingPage} page
 * @returns {Promise<void>}
 */
export const waitForWorldLoaded = (page) =>
  page.evaluate(
    () =>
      new Promise((/** @type {(value: void) => void} */ done, reject) => {
        const loading = document.querySelector('#world-loading');
        if (!(loading instanceof HTMLElement)) {
          throw new Error('No #world-loading mask is on the page');
        }
        const check = () => {
          if (loading.dataset.state !== 'ready' && loading.dataset.state !== 'failed') {
            return;
          }
          observer.disconnect();
          if (loading.dataset.state === 'failed') {
            reject(new Error(loading.textContent));
          } else if (loading.hidden) {
            done();
          } else {
            reject(new Error('World loading reported ready but the loading mask is still visible'));
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(loading, { attributes: true, attributeFilter: ['data-state'] });
        check();
      }),
  );
