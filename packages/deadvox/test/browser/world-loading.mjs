// Loading owns its work-scaled deadline; the enclosing browser stage bounds a missing verdict.
// An animation-frame poll or another readiness deadline would fail on renderer speed instead of loading work.
export const waitForWorldLoaded = (page) =>
  page.evaluate(
    () =>
      new Promise((done, reject) => {
        const loading = document.querySelector('#world-loading');
        const observer = new MutationObserver(check);
        function check() {
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
        }
        observer.observe(loading, { attributes: true, attributeFilter: ['data-state'] });
        check();
      }),
  );
