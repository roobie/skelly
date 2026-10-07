// Archetype templates (PROJECT.md §6). Each lists the parts an archetype is
// built from and the choices the generator may make. Templates don't promise
// valid results: some choices clash on purpose (a sight over a top-loading
// port, a wide handguard under a low sight), and the validator sorts them out.
//
// Params left out are default or inherited: a barrel's bore follows its
// receiver, and a clamped handguard or tube magazine follows the barrel.

import type { Template } from '../core/template.ts';
import { AK_MAGAZINE_VARIANT_BY_CALIBRE } from './akMagazineCalibre.ts';
import type { OpticTypeId } from './optics.ts';

const sightMix = (...weights: readonly (readonly [OpticTypeId, number])[]): readonly OpticTypeId[] =>
  weights.flatMap(([type, weight]) => Array.from({ length: weight }, () => type));

const SML = ['S', 'M', 'L'] as const;
const BATTLE_MAGAZINE_ORIENTATIONS = ['straight', 'tilt', 'slant-5', 'slant-8', 'slant-10'] as const;
const GENERATED_AK_CALIBRE = '7.62x39';

export const battleRifle: Template = {
  name: 'battle-rifle',
  description: 'Battle rifle with straight, tilted, or bottom-slanted magazines ahead of the pistol grip.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: ['M', 'L'] } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'barrett', handleStyle: 'battle' } },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    {
      id: 'handguard',
      family: 'handguard',
      params: {
        mount: ['clamped', 'free-float'],
        length: { fromSlot: 'barrel', param: 'length' },
        clearance: ['M', 'L'],
      },
      chance: 0.8,
    },
    { id: 'grip', family: 'grip', params: { length: SML } },
    { id: 'magazine', family: 'magazine', params: { length: SML, orientation: BATTLE_MAGAZINE_ORIENTATIONS } },
    { id: 'stock', family: 'stock', params: { length: SML, style: 'straight' }, chance: 0.9 },
    {
      id: 'sight',
      family: 'sight',
      params: {
        type: sightMix(
          ['mini-reflex', 3],
          ['tube-dot', 3],
          ['holographic', 2],
          ['fixed-prism-4x', 5],
          ['lpvo-1-6x', 5],
          ['high-mag-5-25x', 2],
        ),
      },
      chance: 0.9,
      when: { part: 'stock', param: 'style', equals: 'straight' },
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    {
      from: 'handguard.front',
      to: 'barrel.clamp',
      chance: 0.7,
      when: { part: 'handguard', param: 'mount', equals: 'clamped' },
    },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    // A shared station keeps swaps mounted on the receiver without rewiring.
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
  ],
};

export const ar: Template = {
  name: 'ar',
  description:
    'AR-pattern rifle: clamped A2 front sight or a free-float handguard with an optional rail-mounted front post.',
  root: 'receiver',
  slots: [
    {
      id: 'receiver',
      family: 'receiver',
      params: {
        action: 'auto',
        feed: 'box',
        bore: ['S', 'M'],
        chargingHandle: 'rear-top',
        rail: 'full',
        section: 'ar',
      },
    },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'ar' } },
    { id: 'charging-handle', family: 'ar-charging-handle' },
    { id: 'lower', family: 'lower', params: { layout: 'ar' } },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    {
      id: 'handguard',
      family: 'handguard',
      params: {
        mount: ['free-float', 'free-float', 'free-float', 'clamped'],
        layout: 'ar',
        length: { fromSlot: 'barrel', param: 'length' },
      },
    },
    { id: 'grip', family: 'grip', params: { length: ['S', 'M'] } },
    { id: 'magazine', family: 'magazine', params: { length: 'M', profile: 'stanag-curved' } },
    { id: 'stock', family: 'stock', params: { length: 'M', style: 'm4' } },
    {
      id: 'front-sight',
      family: 'front-sight',
      params: { style: 'ar' },
      when: { part: 'handguard', param: 'mount', equals: 'clamped' },
    },
    {
      id: 'rail-front-sight',
      family: 'rail-front-sight',
      chance: 0.8,
      when: { part: 'handguard', param: 'mount', equals: 'free-float' },
    },
    {
      id: 'sight',
      family: 'sight',
      params: {
        type: sightMix(
          ['mini-reflex', 5],
          ['tube-dot', 4],
          ['holographic', 3],
          ['fixed-prism-4x', 3],
          ['lpvo-1-6x', 5],
        ),
      },
      chance: 0.7,
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', when: { part: 'handguard', param: 'mount', equals: 'clamped' } },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
    { from: 'receiver.charging-handle', to: 'charging-handle.mount' },
    {
      from: 'barrel.front-sight',
      to: 'front-sight.base',
      when: { part: 'handguard', param: 'mount', equals: 'clamped' },
    },
    {
      from: 'handguard.rail',
      slot: 7,
      to: 'rail-front-sight.base',
      when: { part: 'barrel', param: 'length', equals: 'S' },
    },
    {
      from: 'handguard.rail',
      slot: 10,
      to: 'rail-front-sight.base',
      when: { part: 'barrel', param: 'length', equals: 'M' },
    },
    {
      from: 'handguard.rail',
      slot: 13,
      to: 'rail-front-sight.base',
      when: { part: 'barrel', param: 'length', equals: 'L' },
    },
  ],
};

export const ak: Template = {
  name: 'ak',
  description:
    'AK-pattern rifle: dust cover, exposed gas block and gas cylinder, forward-leaning curved magazine, wooden buttstock, and block sights.',
  calibre: GENERATED_AK_CALIBRE,
  calibreParams: [{ slot: 'magazine', param: 'variant', byCalibre: AK_MAGAZINE_VARIANT_BY_CALIBRE }],
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'ak-receiver', params: { bore: ['S', 'M'] } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'ak' } },
    { id: 'lower', family: 'lower', params: { layout: 'ak' } },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    { id: 'muzzle-device', family: 'ak-muzzle-device', params: { style: ['slant', 'ak74'] } },
    { id: 'handguard', family: 'handguard', params: { layout: ['ak', 'standard'], clearance: ['M', 'L'] } },
    { id: 'gas-cylinder', family: 'gas-cylinder' },
    { id: 'gas-block', family: 'gas-block' },
    { id: 'grip', family: 'grip', params: { length: ['S', 'M'] } },
    {
      id: 'magazine',
      family: 'magazine',
      params: { length: 'L', profile: 'ak-curved', variant: ['ak74', 'akm'] },
    },
    { id: 'stock', family: 'stock', params: { length: ['M', 'L'], style: 'ak-buttstock' } },
    { id: 'rear-sight', family: 'ak-rear-sight' },
    { id: 'front-sight', family: 'front-sight', params: { style: 'ak' } },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'barrel.muzzle', to: 'muzzle-device.base' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', when: { part: 'handguard', param: 'mount', equals: 'clamped' } },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.gas-cylinder', to: 'gas-cylinder.rear' },
    { from: 'barrel.gas-port', to: 'gas-block.barrel' },
    { from: 'gas-block.gas-cylinder', to: 'gas-cylinder.front' },
    { from: 'gas-cylinder.handguard', to: 'handguard.gas-cylinder' },
    { from: 'receiver.rear-sight', to: 'rear-sight.base' },
    { from: 'barrel.front-sight', to: 'front-sight.base' },
  ],
};

export const pistol: Template = {
  name: 'pistol',
  description: 'Semi-automatic pistol: integrated frame/grip, hollow slide, internal barrel, and a short crown.',
  root: 'frame',
  slots: [
    { id: 'frame', family: 'frame', params: { bore: ['S', 'M'], gripLength: SML } },
    { id: 'slide', family: 'slide' },
    { id: 'barrel', family: 'barrel', params: { length: ['S', 'M'], profile: 'pistol' } },
    { id: 'magazine', family: 'magazine', params: { length: 'S', profile: 'pistol' } },
    { id: 'sight', family: 'sight', params: { type: 'mini-reflex' }, chance: 0.65 },
  ],
  connections: [
    { from: 'frame.slide', to: 'slide.frame' },
    { from: 'slide.barrel', to: 'barrel.rear' },
    { from: 'frame.barrel', to: 'barrel.frame' },
    { from: 'frame.magazine', to: 'magazine.top' },
    { from: 'slide.rail', slot: 1, to: 'sight.base' },
  ],
};

const revolver: Template = {
  name: 'revolver',
  description: 'Photo-led K/L-frame revolver with an aligned six-chamber cylinder and raked grip.',
  root: 'frame',
  slots: [
    {
      id: 'frame',
      family: 'revolver-frame',
      params: { bore: ['S', 'M'], frameSize: SML, butt: ['round', 'square'] },
    },
    { id: 'barrel', family: 'revolver-barrel', params: { length: SML, style: ['classic', 'vented'] } },
    { id: 'cylinder', family: 'revolver-cylinder', params: { chamberCount: '6', chamberIndex: '0' } },
    { id: 'grip', family: 'revolver-grip', params: { length: SML } },
  ],
  connections: [
    { from: 'frame.barrel', to: 'barrel.frame' },
    { from: 'frame.cylinder', to: 'cylinder.frame' },
    { from: 'barrel.cylinder', to: 'cylinder.barrel' },
    { from: 'frame.grip-frame', to: 'grip.frame-joint' },
  ],
};

export const smg: Template = {
  name: 'smg',
  description: 'Submachine gun: the battle-rifle layout at small bore, short barrel, stock optional.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: 'S' } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'smg' } },
    { id: 'smg-handle', family: 'smg-handle' },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: ['S', 'M'] } },
    { id: 'handguard', family: 'handguard', params: { clearance: 'M', handleStyle: 'smg' } },
    { id: 'front-sight', family: 'front-sight', params: { style: 'ar' } },
    { id: 'grip', family: 'grip', params: { length: ['S', 'M'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['M', 'L'], profile: 'smg' } },
    { id: 'stock', family: 'stock', params: { length: ['S', 'M'], style: 'straight' }, chance: 0.6 },
    {
      id: 'sight',
      family: 'sight',
      params: { type: sightMix(['mini-reflex', 5], ['tube-dot', 3], ['holographic', 2]) },
      chance: 0.8,
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    {
      from: 'handguard.front',
      to: 'barrel.clamp',
      chance: 0.8,
      when: { part: 'handguard', param: 'mount', equals: 'clamped' },
    },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'handguard.smg-handle', to: 'smg-handle.mount' },
    { from: 'barrel.front-sight', to: 'front-sight.base' },
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
  ],
};

export const boltRifle: Template = {
  name: 'bolt-rifle',
  description: 'Bolt-action rifle loaded from the top: sporting or thumbhole stock, long handguard.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'bolt', feed: 'top', bore: ['M', 'L'] } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'bolt' } },
    { id: 'bolt-handle-arm', family: 'bolt-handle-arm' },
    { id: 'bolt-handle-knob', family: 'bolt-handle-knob' },
    { id: 'stock', family: 'stock', params: { length: ['M', 'L'], style: ['sporting', 'thumbhole'] } },
    {
      id: 'lower',
      family: 'lower',
      params: {
        layout: {
          when: { part: 'stock', param: 'style', equals: 'thumbhole' },
          onMatch: 'thumbhole',
          onMismatch: 'conventional',
        },
      },
    },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    { id: 'handguard', family: 'handguard', params: { clearance: 'M' }, chance: 0.9 },
    { id: 'magazine', family: 'magazine', params: { length: 'S' } },
    {
      id: 'sight',
      family: 'sight',
      params: {
        type: sightMix(['fixed-prism-4x', 4], ['lpvo-1-6x', 10], ['high-mag-5-25x', 22], ['digital-thermal', 4]),
      },
      chance: 0.8,
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    {
      from: 'handguard.front',
      to: 'barrel.clamp',
      chance: 0.8,
      when: { part: 'handguard', param: 'mount', equals: 'clamped' },
    },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'bolt-carrier.handle', to: 'bolt-handle-arm.base' },
    { from: 'bolt-handle-arm.tip', to: 'bolt-handle-knob.base' },
    // Paired bases sit fore and aft of the loading opening; the scope bridges it.
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
  ],
};

export const boltRifleBox: Template = {
  name: 'bolt-rifle-box',
  description:
    'Bolt-action rifle with a recessed well, compact 5- or 10-round magazine, pistol grip and sporting stock.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'bolt', feed: 'box', bore: ['M', 'L'] } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'bolt' } },
    { id: 'bolt-handle-arm', family: 'bolt-handle-arm' },
    { id: 'bolt-handle-knob', family: 'bolt-handle-knob' },
    { id: 'lower', family: 'lower', params: { layout: 'conventional', magazineWell: 'recessed' } },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    // Free-floating, so its length is set rather than read from the barrel.
    { id: 'handguard', family: 'handguard', params: { length: ['M', 'L'], clearance: 'M' }, chance: 0.7 },
    { id: 'grip', family: 'grip', params: { length: ['M', 'L'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['5-round', '10-round'] } },
    { id: 'stock', family: 'stock', params: { length: ['M', 'L'], style: 'sporting' } },
    {
      id: 'sight',
      family: 'sight',
      params: { type: sightMix(['lpvo-1-6x', 2], ['high-mag-5-25x', 7], ['digital-thermal', 1]) },
      chance: 0.9,
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'bolt-carrier.handle', to: 'bolt-handle-arm.base' },
    { from: 'bolt-handle-arm.tip', to: 'bolt-handle-knob.base' },
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
  ],
};

export const boltRifleThumbhole: Template = {
  ...boltRifleBox,
  name: 'bolt-rifle-thumbhole',
  description:
    'AWM-type bolt-action rifle with a heavy barrel, detachable box magazine, thumbhole stock, and optic rail.',
  slots: boltRifleBox.slots
    .filter((slot) => slot.id !== 'grip')
    .map((slot) => (slot.id === 'receiver' ? { ...slot, params: { ...slot.params, bore: 'M' } } : slot))
    .map((slot) => (slot.id === 'lower' ? { ...slot, params: { ...slot.params, layout: 'thumbhole' } } : slot))
    .map((slot) => (slot.id === 'stock' ? { ...slot, params: { ...slot.params, style: 'thumbhole' } } : slot))
    .map((slot) => (slot.id === 'bolt-carrier' ? { ...slot, params: { ...slot.params, handleProfile: 'awm' } } : slot))
    .map((slot) => {
      if (slot.id !== 'handguard') {
        return slot;
      }
      return { ...slot, params: { ...slot.params, barrelBore: 'L', clearance: 'L' } };
    })
    .map((slot) =>
      slot.id === 'barrel' ? { ...slot, params: { ...slot.params, profile: 'heavy', length: 'L' } } : slot,
    )
    .map((slot) =>
      slot.id === 'sight'
        ? {
            ...slot,
            params: {
              ...slot.params,
              type: sightMix(['lpvo-1-6x', 3], ['high-mag-5-25x', 14], ['digital-thermal', 3]),
            },
          }
        : slot,
    ),
  connections: boltRifleBox.connections.filter((connection) => connection.from !== 'lower.grip'),
};

export const pumpShotgun: Template = {
  name: 'pump-shotgun',
  description: 'Pump shotgun with either a stock-grip or separate-pistol-grip lower.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'pump', feed: 'tube', bore: 'L', section: 'pump' } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'pump' } },
    {
      id: 'lower',
      family: 'lower',
      // Keep the former ~30% pistol-grip rate: seven stock-grip choices for three trigger/grip choices.
      params: { layout: ['pump', 'pump', 'pump', 'pump', 'pump', 'pump', 'pump', 'trigger', 'trigger', 'trigger'] },
    },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    {
      id: 'tube',
      family: 'tube-magazine',
      // Larger hand furniture must fit ahead of its stroke and behind the fixed cap.
      params: {
        lengthPercent: {
          when: { part: 'barrel', param: 'length', equals: 'S' },
          onMatch: '100',
          onMismatch: ['75', '100'],
        },
      },
    },
    { id: 'forend', family: 'forend' },
    {
      id: 'grip',
      family: 'grip',
      params: { length: ['S', 'M'] },
      when: { part: 'lower', param: 'layout', equals: 'trigger' },
    },
    {
      // The stock is the firing grip on the grip-less pump lower: tapered, and
      // sawed off only with the shortest barrel.
      id: 'stock',
      family: 'stock',
      params: {
        length: ['M', 'L'],
        style: {
          when: { part: 'barrel', param: 'length', equals: 'S' },
          onMatch: ['tapered', 'tapered-sawed'],
          onMismatch: 'tapered',
        },
      },
      when: { part: 'lower', param: 'layout', equals: 'pump' },
    },
    {
      id: 'stock-pistol',
      family: 'stock',
      params: { length: SML, style: 'straight' },
      when: { part: 'lower', param: 'layout', equals: 'trigger' },
    },
    {
      id: 'sight',
      family: 'sight',
      params: { type: sightMix(['mini-reflex', 9], ['tube-dot', 7], ['holographic', 4]) },
      chance: 0.3,
    },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'receiver.tube', to: 'tube.rear' },
    { from: 'tube.cap', to: 'barrel.lug' },
    {
      from: 'tube.support',
      to: 'barrel.support-lug',
      when: { part: 'tube', param: 'lengthPercent', equals: '75' },
    },
    {
      from: 'tube.support',
      to: 'barrel.support-lug',
      when: { part: 'tube', param: 'lengthPercent', equals: '100' },
    },
    { from: 'tube.forend', to: 'forend.rear' },
    { from: 'receiver.stock', to: 'stock.front', when: { part: 'lower', param: 'layout', equals: 'pump' } },
    {
      from: 'receiver.stock',
      to: 'stock-pistol.front',
      when: { part: 'lower', param: 'layout', equals: 'trigger' },
    },
    { from: 'lower.grip', to: 'grip.top', when: { part: 'lower', param: 'layout', equals: 'trigger' } },
    { from: 'receiver.rail', to: 'sight.base', slot: 3 },
  ],
};

const bullpup: Template = {
  name: 'bullpup',
  description: 'Bullpup: grip ahead of the magazine, butt built into the lower.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: 'M' } },
    { id: 'bolt-carrier', family: 'bolt-carrier', params: { pattern: 'barrett', handleStyle: 'bullpup' } },
    { id: 'lower', family: 'lower', params: { layout: 'bullpup' } },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    { id: 'handguard', family: 'handguard', params: { clearance: 'M' }, chance: 0.3 },
    { id: 'grip', family: 'grip', params: { length: ['M', 'L'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['M', 'L'] } },
    { id: 'sight', family: 'sight', chance: 0.9 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', when: { part: 'handguard', param: 'mount', equals: 'clamped' } },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: ['receiver.rail', 'handguard.rail'], to: 'sight.base', slot: 'any' },
  ],
};

/** Remove a name here to restore its template to generation, statistics, sweeps, and the viewer. */
export const SUSPENDED_TEMPLATE_NAMES: ReadonlySet<string> = new Set(['bullpup']);

export const antiMateriel: Template = {
  name: 'anti-materiel',
  description:
    'Semi-automatic anti-materiel rifle: perforated box shroud, two-chamber arrowhead muzzle brake, folding bipod, strut-mounted carry handle, recoil-pad stock with optional monopod.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'heavy-receiver', params: { action: 'auto', feed: 'box', bore: 'L' } },
    { id: 'bolt-carrier', family: 'heavy-bolt-carrier' },
    { id: 'lower', family: 'heavy-lower' },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    { id: 'shroud', family: 'barrel-shroud', params: { length: ['M', 'L'] } },
    { id: 'brake', family: 'muzzle-brake', params: { length: ['M', 'L'] } },
    { id: 'grip', family: 'grip', params: { length: ['M', 'L'] } },
    { id: 'magazine', family: 'heavy-magazine' },
    { id: 'stock', family: 'recoil-stock', params: { length: ['M', 'L'] } },
    { id: 'sight', family: 'sight', params: { type: 'high-mag-5-25x' }, chance: 0.9 },
    // The handle's three parts come together or not at all, so they are always present (a slot has no way to
    // depend on another slot's chance, and a strut without its trunnion would leave required ports empty).
    // Only the trunnion carries the pose; the strut and bar inherit it.
    { id: 'trunnion', family: 'handle-trunnion', params: { pose: ['carry', 'stowed'] } },
    { id: 'strut', family: 'handle-strut' },
    { id: 'bar', family: 'handle-bar' },
    { id: 'bipod', family: 'bipod', params: { legs: ['M', 'L'], pose: ['folded', 'deployed'] } },
    { id: 'monopod', family: 'monopod', params: { pose: ['folded', 'deployed'] }, chance: 0.5 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.bolt-carrier', to: 'bolt-carrier.mount' },
    { from: 'receiver.handguard', to: 'shroud.rear' },
    { from: 'barrel.muzzle', to: 'brake.base' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    // The sight sits on the receiver rail (slots x = -14, -12). The carry handle's trunnion bolts to the shroud's left
    // wall, and its strut and bar stand to the left, clear of a full-size scope mounted where the sight is.
    { from: 'receiver.rail', to: 'sight.base', slot: [4, 5] },
    { from: 'shroud.trunnion', to: 'trunnion.base' },
    { from: 'trunnion.strut', to: 'strut.base' },
    { from: 'strut.top', to: 'bar.base' },
    { from: 'shroud.bipod', to: 'bipod.base' },
    { from: 'stock.monopod', to: 'monopod.base' },
  ],
};

const ALL_TEMPLATES: readonly Template[] = [
  battleRifle,
  ar,
  ak,
  pistol,
  revolver,
  smg,
  boltRifle,
  boltRifleBox,
  boltRifleThumbhole,
  pumpShotgun,
  bullpup,
  antiMateriel,
];

export const SUSPENDED_TEMPLATES = ALL_TEMPLATES.filter(({ name }) => SUSPENDED_TEMPLATE_NAMES.has(name));
export const TEMPLATES = ALL_TEMPLATES.filter(({ name }) => !SUSPENDED_TEMPLATE_NAMES.has(name));
