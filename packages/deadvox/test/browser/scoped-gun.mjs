// No stock gun ships scoped, so a browser fixture fits an optic onto a gun in place of the sights it ships with. The
// authoring tool certifies particular gun, optic and station triples, so a fixture trials the fit and a refusal throws.

/**
 * @import { Page } from 'playwright'
 * @import { Item } from '@skelly/engine/inventory'
 */
/** @typedef {typeof globalThis.primaryActionTest} PrimaryActionTest */

// All run inside the page, so they close over nothing but `r`, the page's `globalThis.primaryActionTest`, and each
// other, which `installScopedGun` defines alongside them.
/**
 * @param {PrimaryActionTest} r
 * @param {string} gunType
 * @returns {string[]}
 */
const attachmentStations = (r, gunType) => {
  const { registry } = r.inventory;
  const model = registry.items.get(gunType)?.model;
  const gun = model === undefined ? undefined : registry.models.get(model)?.gun;
  if (!gun?.attachmentSlots) {
    throw new Error(`${gunType} has no gun model with attachment stations`);
  }
  return gun.attachmentSlots.map(({ id }) => id);
};

/**
 * @param {PrimaryActionTest} r
 * @param {Item} gun
 * @returns {void}
 */
const stripSights = (r, gun) => {
  const { inventory } = r;
  for (const [slot, child] of Object.entries(gun.slots ?? {})) {
    const model = child && inventory.registry.items.get(child.type)?.model;
    const kind = model === undefined ? undefined : inventory.registry.models.get(model)?.gun?.attachment?.kind;
    if (kind === 'iron-sight' || kind === 'optic') {
      inventory.fitSlot(gun, slot, undefined);
    }
  }
};

/**
 * @param {PrimaryActionTest} r
 * @param {string} gunType
 * @param {string} station
 * @param {string} opticType
 * @returns {Item}
 */
const scopedGun = (r, gunType, station, opticType) => {
  const { inventory } = r;
  const gun = inventory.create(gunType);
  r.stripSights(gun);
  inventory.fitSlot(gun, station, inventory.create(opticType));
  return gun;
};

/**
 * @param {PrimaryActionTest} r
 * @param {Item} gun
 * @param {Item} item
 * @returns {void}
 */
const fitAtAnyStation = (r, gun, item) => {
  const { inventory } = r;
  for (const station of attachmentStations(r, gun.type)) {
    try {
      inventory.fitSlot(gun, station, item);
      return;
    } catch {
      // Another station may fit.
    }
  }
  throw new Error(`Could not fit ${item.type} onto ${gun.type}`);
};

/**
 * @param {PrimaryActionTest} r
 * @param {string} gunType
 * @param {string} opticType
 * @returns {Item}
 */
const scopedGunAtAnyStation = (r, gunType, opticType) => {
  for (const station of attachmentStations(r, gunType)) {
    try {
      return r.scopedGun(gunType, station, opticType);
    } catch {
      // Another station may fit.
    }
  }
  throw new Error(`Could not fit ${opticType} onto ${gunType}`);
};

/**
 * @template Fixture
 * @typedef {Fixture extends (r: PrimaryActionTest, ...fit: infer Fit) => infer Result ? (...fit: Fit) => Result : never} Bound
 */
/**
 * @typedef {{
 *   stripSights: Bound<typeof stripSights>,
 *   scopedGun: Bound<typeof scopedGun>,
 *   scopedGunAtAnyStation: Bound<typeof scopedGunAtAnyStation>,
 *   fitAtAnyStation: Bound<typeof fitAtAnyStation>,
 * }} ScopedGunHooks
 */

/**
 * Defines `primaryActionTest.stripSights(gun)`, `scopedGun(gunType, station, opticType)`,
 * `scopedGunAtAnyStation(gunType, opticType)` and `fitAtAnyStation(gun, item)` in a page that has the test hook.
 * @param {Page} page
 * @returns {Promise<void>}
 */
export const installScopedGun = (page) =>
  page.evaluate(`{
    const r = globalThis.primaryActionTest;
    const attachmentStations = ${attachmentStations};
    const stripSights = ${stripSights};
    const scopedGun = ${scopedGun};
    const scopedGunAtAnyStation = ${scopedGunAtAnyStation};
    const fitAtAnyStation = ${fitAtAnyStation};
    r.stripSights = (...fit) => stripSights(r, ...fit);
    r.scopedGun = (...fit) => scopedGun(r, ...fit);
    r.scopedGunAtAnyStation = (...fit) => scopedGunAtAnyStation(r, ...fit);
    r.fitAtAnyStation = (...fit) => fitAtAnyStation(r, ...fit);
  }`);
