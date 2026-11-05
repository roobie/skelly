local accounting = {
  countPaused: false,
  countHidden: false,
  compressionThreshold: 1,
  persistIntervalRealMs: 5000,
  persistOnInterruption: true,
  limits: { history: 512, pockets: 128, marks: 128 },
};
{
  persistent: accounting + { resumeStored: true, persist: true, exportFormat: 'metrics' },
  practice: accounting + { resumeStored: true, persist: false, exportFormat: 'metrics' },
  run: accounting + { resumeStored: false, persist: false, exportFormat: 'attempt' },
}
