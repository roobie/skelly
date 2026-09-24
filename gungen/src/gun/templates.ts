// Archetype templates (PROJECT.md §6). Each lists the parts an archetype is
// built from and the choices the generator may make. Templates don't promise
// valid results: some choices clash on purpose (a sight over a top-loading
// port, a wide handguard under a low sight), and the validator sorts them out.
//
// Params left out are default or inherited: a barrel's bore follows its
// receiver, and a clamped handguard or tube magazine follows the barrel.

import type { Template } from '../core/template.ts';

const SML = ['S', 'M', 'L'] as const;

export const rifle: Template = {
  name: 'rifle',
  description: 'Rifle, conventional layout: magazine ahead of the pistol grip, straight stock.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: ['M', 'L'] } },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    { id: 'handguard', family: 'handguard', params: { inner: ['M', 'L'] }, chance: 0.8 },
    { id: 'grip', family: 'grip', params: { length: SML } },
    { id: 'magazine', family: 'magazine', params: { length: SML } },
    { id: 'stock', family: 'stock', params: { length: SML, style: 'straight' }, chance: 0.9 },
    { id: 'sight', family: 'sight', chance: 0.9 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', chance: 0.7 },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: ['receiver.rail', 'handguard.rail'], to: 'sight.base', slot: 'any' },
  ],
};

export const smg: Template = {
  name: 'smg',
  description: 'Submachine gun: the rifle layout at small bore, short barrel, stock optional.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: 'S' } },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: ['S', 'M'] } },
    { id: 'handguard', family: 'handguard', params: { inner: 'M' }, chance: 0.7 },
    { id: 'grip', family: 'grip', params: { length: ['S', 'M'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['M', 'L'] } },
    { id: 'stock', family: 'stock', params: { length: ['S', 'M'], style: 'straight' }, chance: 0.6 },
    { id: 'sight', family: 'sight', chance: 0.8 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', chance: 0.8 },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.rail', to: 'sight.base', slot: 'any' },
  ],
};

export const boltRifle: Template = {
  name: 'bolt-rifle',
  description: 'Bolt-action rifle loaded from the top: sporting stock, long handguard.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'bolt', feed: 'top', bore: ['M', 'L'] } },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    { id: 'handguard', family: 'handguard', params: { inner: 'M' }, chance: 0.9 },
    { id: 'magazine', family: 'magazine', params: { length: 'S' } },
    { id: 'stock', family: 'stock', params: { length: ['M', 'L'], style: 'sporting' } },
    { id: 'sight', family: 'sight', chance: 0.8 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp', chance: 0.8 },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    // Over the receiver, a sight can block the loading port; ahead of it, it can't.
    { from: ['receiver.rail', 'handguard.rail'], to: 'sight.base', slot: 'any' },
  ],
};

export const boltRifleBox: Template = {
  name: 'bolt-rifle-box',
  description: 'Bolt-action rifle with a detachable box magazine, pistol grip and sporting stock.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'bolt', feed: 'box', bore: ['M', 'L'] } },
    { id: 'lower', family: 'lower', params: { layout: 'conventional' } },
    { id: 'barrel', family: 'barrel', params: { length: ['M', 'L'] } },
    // Free-floating, so its length is set rather than read from the barrel.
    { id: 'handguard', family: 'handguard', params: { length: ['M', 'L'], inner: 'M' }, chance: 0.7 },
    { id: 'grip', family: 'grip', params: { length: ['M', 'L'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['S', 'M'] } },
    { id: 'stock', family: 'stock', params: { length: ['M', 'L'], style: 'sporting' } },
    { id: 'sight', family: 'sight', chance: 0.9 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'receiver.rail', to: 'sight.base', slot: 'any' },
  ],
};

export const pumpShotgun: Template = {
  name: 'pump-shotgun',
  description: 'Pump-action shotgun: tube magazine and forend under the barrel, trigger-only lower.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'pump', feed: 'tube', bore: 'L' } },
    { id: 'lower', family: 'lower', params: { layout: 'trigger' } },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    { id: 'tube', family: 'tube-magazine' },
    { id: 'forend', family: 'forend' },
    { id: 'stock', family: 'stock', params: { length: SML, style: 'sporting' } },
    // Some pump guns add a pistol grip to the trigger lower.
    { id: 'grip', family: 'grip', params: { length: ['S', 'M'] }, chance: 0.3 },
    { id: 'sight', family: 'sight', chance: 0.3 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.tube', to: 'tube.rear' },
    { from: 'tube.cap', to: 'barrel.lug' },
    { from: 'tube.forend', to: 'forend.rear' },
    { from: 'receiver.stock', to: 'stock.front' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'receiver.rail', to: 'sight.base', slot: 'any' },
  ],
};

export const bullpup: Template = {
  name: 'bullpup',
  description: 'Bullpup: grip ahead of the magazine, butt built into the lower.',
  root: 'receiver',
  slots: [
    { id: 'receiver', family: 'receiver', params: { action: 'auto', feed: 'box', bore: 'M' } },
    { id: 'lower', family: 'lower', params: { layout: 'bullpup' } },
    { id: 'barrel', family: 'barrel', params: { length: SML } },
    { id: 'handguard', family: 'handguard', params: { inner: 'M' }, chance: 0.3 },
    { id: 'grip', family: 'grip', params: { length: ['M', 'L'] } },
    { id: 'magazine', family: 'magazine', params: { length: ['M', 'L'] } },
    { id: 'sight', family: 'sight', chance: 0.9 },
  ],
  connections: [
    { from: 'receiver.lower', to: 'lower.top' },
    { from: 'receiver.barrel', to: 'barrel.rear' },
    { from: 'receiver.handguard', to: 'handguard.rear' },
    { from: 'handguard.front', to: 'barrel.clamp' },
    { from: 'lower.grip', to: 'grip.top' },
    { from: 'lower.magazine', to: 'magazine.top' },
    { from: ['receiver.rail', 'handguard.rail'], to: 'sight.base', slot: 'any' },
  ],
};

export const TEMPLATES: readonly Template[] = [rifle, smg, boltRifle, boltRifleBox, pumpShotgun, bullpup];
