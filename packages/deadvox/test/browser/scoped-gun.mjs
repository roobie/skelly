// No stock gun ships scoped, so a browser fixture fits an optic onto a gun in place of the sights it ships with. The
// authoring tool certifies particular gun, optic and station triples, so a fixture trials the fit and a refusal throws.

// Both run inside the page, so they close over nothing but `r`, the page's `globalThis.primaryActionTest`.
const scopedGun = (r, gunType, station, opticType) => {
  const { inventory } = r;
  const gun = inventory.create(gunType);
  for (const [slot, child] of Object.entries(gun.slots ?? {})) {
    const kind = inventory.registry.models.get(inventory.registry.items.get(child?.type)?.model)?.gun?.attachment?.kind;
    if (kind === 'iron-sight' || kind === 'optic') {
      inventory.fitSlot(gun, slot, undefined);
    }
  }
  inventory.fitSlot(gun, station, inventory.create(opticType));
  return gun;
};

const scopedGunAtAnyStation = (r, gunType, opticType) => {
  const { inventory } = r;
  const stations = inventory.registry.models
    .get(inventory.registry.items.get(gunType).model)
    .gun.attachmentSlots.map(({ id }) => id);
  for (const station of stations) {
    try {
      return r.scopedGun(gunType, station, opticType);
    } catch {
      // Another station may fit.
    }
  }
  throw new Error(`Could not fit ${opticType} onto ${gunType}`);
};

/**
 * Defines `primaryActionTest.scopedGun(gunType, station, opticType)` and
 * `primaryActionTest.scopedGunAtAnyStation(gunType, opticType)` in a page that has the test hook.
 */
export const installScopedGun = (page) =>
  page.evaluate(`{
    const r = globalThis.primaryActionTest;
    const scopedGun = ${scopedGun};
    const scopedGunAtAnyStation = ${scopedGunAtAnyStation};
    r.scopedGun = (...fit) => scopedGun(r, ...fit);
    r.scopedGunAtAnyStation = (...fit) => scopedGunAtAnyStation(r, ...fit);
  }`);
