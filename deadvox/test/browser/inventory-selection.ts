// A missing DOM selection must use the same empty value as the caller's pre-key sample.
export const inventorySelectionChanged = (previous: string | null): boolean =>
  (document.querySelector('#inventory [data-uid].selected')?.getAttribute('data-uid') ?? null) !== previous;
