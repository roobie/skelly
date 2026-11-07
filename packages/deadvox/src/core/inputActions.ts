export const INPUT_CONTEXTS = {
  title: false,
  menu: false,
  inventory: false,
  reading: false,
  spawn: true,
  'debug-panel': true,
  'review-map': true,
  build: true,
  noclip: true,
  play: false,
  carrying: false,
  interrupted: false,
} as const satisfies Record<string, boolean>;
export type InputContext = keyof typeof INPUT_CONTEXTS;
export const DEBUG_ONLY_CONTEXTS: ReadonlySet<InputContext> = new Set(
  (Object.keys(INPUT_CONTEXTS) as InputContext[]).filter((context) => INPUT_CONTEXTS[context]),
);
type PressKind = 'press' | 'held-state' | 'hold' | 'double-press' | 'tap-then-hold' | 'tap-or-hold';
export type Modifier = 'shift' | 'alt' | 'ctrl' | 'meta';
export interface Chord {
  readonly code: string;
  readonly modifier?: Modifier;
}
export interface Binding {
  readonly id: string;
  readonly device?: 'keyboard' | 'pointer';
  readonly description: string;
  readonly contexts: readonly InputContext[];
  readonly commands: readonly { readonly id: string; readonly kind: PressKind }[];
  readonly defaults: readonly Chord[];
  readonly gate?: string;
  readonly debug?: boolean;
  readonly repeat?: boolean;
  readonly text?: boolean;
  readonly plainKey?: boolean;
  readonly holdMs?: number;
}
export const bindingIsDebugOnly = (binding: Binding): boolean =>
  binding.debug === true || binding.contexts.every((context) => DEBUG_ONLY_CONTEXTS.has(context));
export const contextsForRun = (binding: Binding, debugRun: boolean): readonly InputContext[] =>
  debugRun ? binding.contexts : binding.contexts.filter((context) => !DEBUG_ONLY_CONTEXTS.has(context));
const world: readonly InputContext[] = ['play', 'carrying', 'noclip'];
const moving: readonly InputContext[] = [...world, 'build'];
const movingWhileReading: readonly InputContext[] = [...moving, 'reading'];
const entered: readonly InputContext[] = [
  'menu',
  'inventory',
  'reading',
  'spawn',
  'debug-panel',
  ...moving,
  'interrupted',
];
const all: readonly InputContext[] = ['title', ...entered];
const HUD_TOGGLE_HOLD_MS = 1000;
type Action = Omit<Binding, 'defaults'>;
// biome-ignore lint/complexity/useMaxParams: compact declarations keep gesture metadata in one catalogue.
const row = (
  id: string,
  description: string,
  contexts: readonly InputContext[],
  kind: PressKind = 'press',
  extra: Partial<Action> = {},
): Action => ({
  id,
  description,
  contexts,
  commands: [{ id, kind }],
  ...extra,
});
const debugRow = (id: string, description: string, contexts: readonly InputContext[] = entered): Action =>
  row(id, description, contexts, 'press', { debug: true, gate: 'debug.gate' });
/** Modal navigation of the review-map page, like the spawn menu's: no debug gate held, never reaches the game. */
const mapRow = (id: string, description: string): Action =>
  row(id, description, ['review-map'], 'press', { repeat: true });
export const INVENTORY_TAB_BINDINGS = [
  { action: 'ui.inventory-tab-items', description: 'Open / select Items tab', tab: 'items' },
  { action: 'ui.inventory-tab-skills', description: 'Open / select Skills tab', tab: 'skills' },
  { action: 'ui.inventory-tab-crafting', description: 'Open / select Crafting tab', tab: 'crafting' },
  { action: 'ui.inventory-tab-actions', description: 'Open / select Actions tab', tab: 'actions' },
] as const;
export const inventoryTabForAction = (action: string) =>
  INVENTORY_TAB_BINDINGS.find((binding) => binding.action === action)?.tab;

const inventoryGesture = (id: string, description: string, held: string): Action =>
  row(id, description, ['inventory'], 'tap-or-hold', {
    commands: [
      { id, kind: 'tap-or-hold' },
      { id: held, kind: 'hold' },
    ],
  });

export const INPUT_ACTIONS: readonly Action[] = [
  row('stance.ready', 'Hold to ready a firearm or enter en-garde', world, 'held-state', { device: 'pointer' }),
  row('aim.ads-toggle', 'Toggle sights while firearm is ready', world, 'press', { device: 'pointer' }),
  row('view.free-look', 'Free look', world, 'held-state'),
  row('movement.forward', 'Move forward', movingWhileReading, 'held-state'),
  row('movement.back', 'Move backward', movingWhileReading, 'held-state'),
  row('movement.left', 'Move left', movingWhileReading, 'held-state'),
  row('movement.right', 'Move right', movingWhileReading, 'held-state'),
  row('movement.sprint', 'Sprint; hold breath while aiming down sights', moving, 'held-state'),
  row('player.lean-left', 'Lean left', world, 'held-state'),
  row('player.lean-right', 'Lean right', world, 'held-state'),
  row('movement.walk-toggle', 'Walk / jog', moving),
  row(
    'player.crouch-toggle',
    'Tap to toggle crouch; hold to lie down or rise to a crouch',
    ['play', 'carrying', 'build'],
    'tap-or-hold',
    {
      commands: [
        { id: 'player.crouch-toggle', kind: 'tap-or-hold' },
        { id: 'player.prone-toggle', kind: 'hold' },
      ],
    },
  ),
  row('player.throw', 'Tap to toggle throwing stance; hold to drop a held item', ['play']),
  row('movement.jump', 'Jump', ['play', 'carrying', 'build'], 'held-state'),
  row('carry.tip', 'Tip the carried piece over', ['carrying']),
  row('carry.turn', 'Turn the carried piece', ['carrying']),
  row('noclip.ascend', 'Ascend while flying', ['noclip'], 'held-state'),
  row('noclip.descend', 'Descend while flying', ['noclip'], 'held-state'),
  row('hand.use-off', 'Use off hand', world),
  row('light.worn-toggle', 'Hold to switch worn lights on or off', world, 'hold'),
  row('world.interact', 'Tap to interact or pocket a ground item; hold to wield it or lift furniture', world),
  row(
    'firearm.reload',
    'Hold to load or change to the fullest carried magazine; double-press to work the charging handle or rack; tap, then hold to remove the magazine; tap does nothing',
    ['play', 'noclip'],
    'hold',
    {
      commands: [
        { id: 'firearm.load', kind: 'hold' },
        { id: 'firearm.rack', kind: 'double-press' },
        { id: 'firearm.remove', kind: 'tap-then-hold' },
      ],
    },
  ),
  row('ui.inventory-toggle', 'Open / close inventory', [...moving, 'inventory']),
  ...INVENTORY_TAB_BINDINGS.map(({ action, description }) => row(action, description, [...moving, 'inventory'])),
  row('ui.main-menu-toggle', 'Main menu', entered, 'press', { text: true }),
  row('hud.toggle', 'Hold to hide or show the HUD', entered, 'hold', { holdMs: HUD_TOGGLE_HOLD_MS }),
  row('handling.stop', 'Stop handling or a long action', [...moving, 'inventory', 'interrupted']),
  row('craft.continue', 'Continue stopped crafting', ['play', 'carrying']),
  row('compression.continue', 'Continue after an interruption', ['interrupted']),
  ...Array.from({ length: 5 }, (_, i) =>
    row(`quickbar.use.${i + 1}`, `Quickbar ${i + 1}: tap to take or put away; hold to use`, world, 'hold'),
  ),
  ...Array.from({ length: 5 }, (_, i) => row(`quickbar.assign.${i + 1}`, `Assign quickbar ${i + 1}`, ['inventory'])),
  row('inventory.previous', 'Select previous item', ['inventory'], 'press', { repeat: true }),
  row('inventory.next', 'Select next item', ['inventory'], 'press', { repeat: true }),
  row('inventory.search', 'Search next container', ['inventory']),
  inventoryGesture(
    'inventory.put-target',
    'Put selected item into the chosen container; hold to select or clear put-target',
    'inventory.select-target',
  ),
  inventoryGesture('inventory.find', 'Find items by name or keyword; hold to clear filter', 'inventory.clear-find'),
  inventoryGesture('inventory.hands', 'Wield selected item; hold to hold in offhand', 'inventory.offhand'),
  row('inventory.wear', 'Wear or remove', ['inventory']),
  row('inventory.drop', 'Drop selected item', ['inventory']),
  row('inventory.rotate', 'Rotate selected or dragged item', ['inventory']),
  row('inventory.best-pocket', 'Move to best pocket', ['inventory']),
  inventoryGesture('inventory.take', 'Take selected item; hold to take all like it', 'inventory.take-all-like'),
  row('inventory.activate', 'Activate selected item', ['inventory']),
  // Pressed over an item card it views that card; as a key it views the selected item.
  row('inventory.view-item', 'View an item in 3D', ['inventory'], 'press', { device: 'pointer' }),
  row('reading.close', 'Put away reading', ['reading']),
  row('reading.line-up', 'Read previous line', ['reading'], 'press', { repeat: true }),
  row('reading.line-down', 'Read next line', ['reading'], 'press', { repeat: true }),
  row('reading.page-up', 'Read previous page', ['reading'], 'press', { repeat: true }),
  row('reading.page-down', 'Read next page', ['reading'], 'press', { repeat: true }),
  row('reading.first', 'Read from beginning', ['reading'], 'press', { repeat: true }),
  row('reading.last', 'Read to end', ['reading'], 'press', { repeat: true }),
  row('spawn.previous', 'Select previous spawn item', ['spawn'], 'press', { repeat: true, text: true }),
  row('spawn.next', 'Select next spawn item', ['spawn'], 'press', { repeat: true, text: true }),
  row('spawn.dismiss', 'Close spawn menu', ['spawn'], 'press', { text: true }),
  row('spawn.confirm', 'Spawn selected item', ['spawn'], 'press', { debug: true, text: true }),
  row('debug.gate', 'Hold for debug commands', [...all, 'review-map'], 'held-state', { debug: true, text: true }),
  debugRow('debug.panel-toggle', 'Debug panel', all),
  debugRow('debug.input-replay-export', 'Export input replay'),
  debugRow('debug.input-replay-import', 'Import input replay'),
  debugRow('debug.performance-toggle', 'Performance overlay', all),
  debugRow('debug.interaction-ray-toggle', 'Interaction ray', all),
  debugRow('debug.build-toggle', 'Build tools'),
  debugRow('debug.build-damage', 'Damage target block', ['build']),
  debugRow('debug.build-destroy', 'Destroy target block with floor loss', ['build']),
  debugRow('debug.impact-laser', 'Impact laser'),
  debugRow('debug.spawn-menu-toggle', 'Spawn item menu'),
  debugRow('debug.god-toggle', 'God mode'),
  debugRow('debug.noclip-toggle', 'Noclip'),
  debugRow('debug.spectator-camera-toggle', 'Spectator camera'),
  debugRow('debug.spectator-teleport', 'Teleport avatar to spectator camera'),
  debugRow('debug.third-person-toggle', 'Third-person avatar view'),
  debugRow('debug.gun-pose-relaxed', 'Relaxed gun pose'),
  debugRow('debug.gun-pose-hip', 'Hip-aim gun pose'),
  debugRow('debug.gun-pose-ads', 'ADS gun pose'),
  debugRow('debug.mannequin-previous', 'Mannequin pose −'),
  debugRow('debug.mannequin-next', 'Mannequin pose +'),
  debugRow('debug.mannequin-place', 'Place mannequin here'),
  debugRow('debug.perception-labels-toggle', 'Perception labels'),
  debugRow('debug.spawn-unaware-shambler', 'Spawn unaware shambler'),
  debugRow('debug.test-noise', 'Test noise'),
  debugRow('debug.compression-test', 'Compression test'),
  debugRow('debug.interruption-test', 'Emit interruption'),
  debugRow('debug.hurt', 'Take damage'),
  debugRow('debug.spawn-shamblers', 'Spawn shamblers'),
  debugRow('debug.spawn-actor.runner', 'Spawn runner'),
  debugRow('debug.spawn-actor.crawler', 'Spawn crawler'),
  debugRow('debug.spawn-actor.amalgam', 'Spawn amalgam'),
  debugRow('debug.spawn-actor.acid_zombie', 'Spawn acid zombie'),
  debugRow('debug.melee-aim-toggle', 'Melee aim boxes'),
  debugRow('debug.freeze-shamblers', 'Freeze shamblers'),
  debugRow('debug.review-map-toggle', 'Review map', ['play', 'carrying', 'noclip', 'review-map']),
  mapRow('debug.map-slice-down', 'Review map: cut lower'),
  mapRow('debug.map-slice-up', 'Review map: cut higher'),
  mapRow('debug.map-slice-surface', 'Review map: back to the surface'),
  debugRow('debug.freeze-game', 'Freeze game'),
  debugRow('debug.tone-cycle', 'Tone mapping'),
  debugRow('debug.exposure-decrease', 'Exposure −'),
  debugRow('debug.exposure-increase', 'Exposure +'),
  debugRow('debug.linear-colours-toggle', 'sRGB block colours'),
  debugRow('debug.patterns-toggle', 'Surface patterns'),
  debugRow('debug.ambient-occlusion-toggle', 'Wide ambient occlusion'),
  debugRow('debug.post-toggle', 'Mood post-processing'),
  debugRow('debug.bloom-toggle', 'Bloom'),
  debugRow('debug.bloom-clip-decrease', 'Bloom clip −'),
  debugRow('debug.bloom-clip-increase', 'Bloom clip +'),
  debugRow('debug.torch-decrease', 'Flashlight strength −'),
  debugRow('debug.torch-increase', 'Flashlight strength +'),
  debugRow('debug.film-toggle', 'Film'),
  debugRow('debug.sun-shadow-toggle', 'Sun shadows'),
  debugRow('debug.torch-shadow-toggle', 'Flashlight shadows'),
  debugRow('debug.shadow-distance-cycle', 'Sun shadow distance'),
  debugRow('debug.crack-check-toggle', 'Crack check'),
  debugRow('debug.hot-pixel-check-toggle', 'Hot pixel check'),
  debugRow('debug.fog-decrease', 'Fogginess −'),
  debugRow('debug.fog-increase', 'Fogginess +'),
  debugRow('debug.grade-decrease', 'Grade −'),
  debugRow('debug.grade-increase', 'Grade +'),
  debugRow('debug.skip-long', 'Skip to preceding hour tomorrow'),
  debugRow('debug.skip-hour', 'Skip one hour'),
  ...Array.from({ length: 9 }, (_, i) =>
    debugRow(`debug.build-slot.${i + 1}`, `Select build slot ${i + 1}`, ['build']),
  ),
];

export const POINTER_ACTIONS = [
  { id: 'hand.use-dominant', description: 'Use dominant hand; hold to fire automatically when ready' },
  { id: 'hand.off-instant', description: 'Instant off-hand use' },
  { id: 'pointer.look', description: 'Look' },
  { id: 'inventory.wield-or-pocket', description: 'Wield item if possible, otherwise stow in inventory (inventory)' },
] as const;
