local t = import 'guidance-text.libsonnet';
local gate(all=[], any=null, none=[], handling=null) = { all: all, none: none } + (if any == null then {} else { any: any }) + (if handling == null then {} else { handling: handling });
local never = gate(any=[]);
local action(id, label) = { action: id, label: label };
local text(label) = { text: label };
local wield(label) = { wield: label };
local use(item, label) = { use: item, label: label };
local inv = { inventory: true };
local dot = text(' · ');
local join(parts) = std.flattenArrays([ (if i == 0 then [] else [dot]) + parts[i] for i in std.range(0, std.length(parts)-1) ]);
local hint(parts, when={}) = { when: when, parts: parts };
local held(item, yes, no) = [hint(yes, { held: [item] }), hint(no)];
local wieldTopic = ['ui.inventory-toggle', 'inventory.hands'];
local handTopic = wieldTopic + ['inventory.activate', 'hand.use-dominant', 'hand.use-off'];
local menuTopic = ['ui.main-menu-toggle'];
local gunTopic = handTopic + ['inventory.best-pocket', 'inventory.wear', 'firearm.reload', 'stance.ready', 'aim.ads-toggle'];
local menu = [action('ui.main-menu-toggle', t.mainMenu)];
local step(id, complete, topics, hints, enabled=gate(), notes=[]) = { id: id, enabled: enabled, complete: complete, topics: topics, hints: hints, notes: notes };
local rule(id, when, enabled=gate(), at=[]) = { id: id, when: when, enabled: enabled, at: at };
local lessons = ['unpack', 'wield', 'inspect', 'partial', 'ready', 'reload', 'sighted', 'unload'];
local gunStep(kind, label, rackLabel) =
  local rack = [action('firearm.reload', rackLabel)];
  local load = [action('firearm.reload', t.load)];
  local fire = join([[action('stance.ready', t.ready)], [action('hand.use-dominant', t.fireDominant)], [action('hand.use-off', t.fireOff)]]);
  local prefix = [text(label + ' — ')];
  local hints = {
    unpack: join([[wield(t.boxedAmmunition)], [action('hand.use-dominant', t.unpackDominant)], [action('hand.use-off', t.unpackOff)]]),
    wield: [wield(label)],
    inspect: prefix + join([[text(t.ammunitionDetails)], [inv]]),
    partial: prefix + join([[text(t.partialLoad)], [inv], load, rack]),
    ready: prefix + join([[text(t.readyFire)], fire, [action('aim.ads-toggle', t.sightsOff)]]),
    reload: prefix + join([[text(t.reloadAfterFiring)], load, rack, fire]),
    sighted: prefix + join([[text(t.sightedFire)], [action('aim.ads-toggle', t.sights)], rack, fire]),
    unload: prefix + join([[text(t.unloadLiveRounds)], load, [action('firearm.reload', t.unload)], rack]),
  };
  step(kind, gate(handling=kind), gunTopic,
    [hint(prefix + join([[text(t.ammunitionDetails)], [action('inventory.hands', t.wieldAmmunitionBox)], [action('inventory.best-pocket', t.carryLooseAmmunition)], [action('inventory.wear', t.wearBackpack)], [inv]]), { inventoryOpen: true, lesson: { track: kind, id: 'unpack' } }),
     hint(prefix + join([[text(t.ammunitionDetails)], [action('inventory.hands', t.wieldSelectedItem)], [action('inventory.best-pocket', t.carryLooseAmmunition)], [action('inventory.wear', t.wearBackpack)], [inv]]), { inventoryOpen: true })] +
    [hint(hints[lesson], { lesson: { track: kind, id: lesson } }) for lesson in lessons] + [hint([])],
    notes=[t.rangeSupplies, t.loadingDetail, t.pumpingDetail]);
function(kit) {
  observe: { door: 'wood_door', searched: 'tutorial_cabinet', hands: ['canned_beans', 'can_opener'], light: 'flashlight' },
  rules: [
    rule('move', { kind: 'displacement', blocks: 6 }),
    rule('look', { kind: 'turn', radians: 0.25 }),
    rule('door', { kind: 'door' }), rule('loot', { kind: 'loot' }), rule('hands', { kind: 'hands' }),
    rule('opened', { kind: 'opened', item: 'canned_beans' }),
    rule('eaten', { kind: 'consumed', item: 'beans' }), rule('drunk', { kind: 'consumed', item: 'water_bottle' }),
    rule('light', { kind: 'light-cycle' }), rule('crouch', { kind: 'crouch' }), rule('escape', { kind: 'area' }),
    rule('paused', { kind: 'pause' }, at=['pause']),
    rule('light-on', { kind: 'lit', item: kit.light }, gate(['light-choice'])),
    rule('light-swap', { kind: 'battery-swapped', item: kit.light }, gate(['light-choice'])),
    rule('light-relight', { kind: 'lit', item: kit.light }, gate(['light-choice', 'light-swap'])),
    rule('melee', { kind: 'unarmed-hit' }, at=['melee']),
  ],
  handling: [{ id: kind, mechanism: kind, reloadRequiresCaseRemoval: kind == 'revolver', lessons: [{ id: lesson, facts: [lesson] } for lesson in lessons] } for kind in ['revolver', 'pump']],
  steps: [
    step('move', gate(['move', 'look']), ['movement.forward', 'movement.back', 'movement.left', 'movement.right', 'pointer.look'], [hint(join([[action('movement.forward', t.forward)], [action('movement.back', t.back)], [action('movement.left', t.left)], [action('movement.right', t.right)], [action('pointer.look', t.look)]]))]),
    step('door', gate(['door']), ['world.interact'], [hint([action('world.interact', t.openDoor)])]),
    step('loot', gate(['loot']), ['ui.inventory-toggle', 'inventory.previous', 'inventory.next', 'inventory.take', 'inventory.hands', 'inventory.wear', 'inventory.search', 'inventory.find', 'inventory.wield-or-pocket'], [
      hint(join([[action('inventory.previous', t.selectPrevious)], [action('inventory.next', t.selectNext)], [action('inventory.take', t.takeSelected)], [action('inventory.hands', t.wieldSelected)], [action('inventory.wear', t.wearOrRemove)]]) + [{ lineBreak: true }] + join([[action('inventory.search', t.searchSupplies)], [action('inventory.find', t.findItems)], [action('inventory.wield-or-pocket', t.wieldOrStow)]]), { inventoryOpen: true }), hint([inv])]),
    step('hands', gate(any=['hands', 'opened']), wieldTopic, [hint([wield(t.beansAndOpener)])]),
    step('open', gate(['opened']), handTopic, [hint([use('can_opener', t.openCan)], { held: ['canned_beans', 'can_opener'] }), hint([wield(t.beansAndOpener)])]),
    step('eat', gate(['eaten']), handTopic, [hint([use('opened_beans', t.eatBeans)], { held: ['opened_beans'] }), hint([wield(t.openedBeans)], { carried: 'opened_beans' })] + held('canned_beans', [use('canned_beans', t.openCan)], [wield(t.canOfBeans)])),
    step('drink', gate(['drunk']), handTopic, held('water_bottle', [use('water_bottle', t.drink)], [wield(t.waterBottle)])),
    step('light', gate(['light']), handTopic, [hint([use('flashlight', t.switchOff)], { held: ['flashlight'], lightOn: true }), hint([use('flashlight', t.switchOn)], { held: ['flashlight'] }), hint([wield(t.flashlight)])]),
    step('escape', gate(['escape', 'crouch']), ['player.crouch-toggle'], [hint(join([[action('player.crouch-toggle', t.crouch)], [text(t.exitPath)]]))]),
    step('pause', gate(['paused']), menuTopic, [hint(menu)]),
    step('light-on', gate(['light-on']), handTopic, held(kit.light, [use(kit.light, kit.labels.on)], [{ wieldItem: kit.light }]), gate(['light-choice'])),
    step('light-swap', gate(['light-swap']), wieldTopic + ['quickbar.assign.1', 'quickbar.use.1'], [
      hint([{ itemName: kit.battery }, text(': '), action('quickbar.assign.1', kit.labels.assign)], { held: [kit.light], inventoryOpen: true }),
      hint(join([[inv], [action('quickbar.use.1', kit.labels.swap)]]), { held: [kit.light] }),
      hint([{ wieldItem: kit.light }]),
    ], gate(['light-choice'])),
    step('light-relight', gate(['light-relight']), handTopic, held(kit.light, [use(kit.light, kit.labels.relight)], [{ wieldItem: kit.light }]), gate(['light-choice'])),
    step('finish', never, menuTopic, [hint(menu)], gate(none=['weapons'])),
    gunStep('revolver', t.revolver, t.closeCylinder), gunStep('pump', t.pumpShotgun, t.pump),
    step('melee', gate(['melee']), ['ui.inventory-toggle', 'inventory.drop', 'inventory.best-pocket', 'stance.ready', 'hand.use-dominant'], [
      hint(join([[text(t.emptyHands)], [action('inventory.drop', t.putDownSelected)], [action('inventory.best-pocket', t.stowSelected)], [inv]]), { inventoryOpen: true }),
      hint(join([[text(t.emptyHands)], [inv], [action('stance.ready', t.enGarde)], [action('hand.use-dominant', t.punch)]])),
    ]),
    step('complete', never, menuTopic, [hint(join([[text(t.weaponsComplete)], menu]))]),
  ],
  choices: [
    { id: 'weapons', at: ['finish'], label: t.weaponsPractice, once: true },
    { id: 'light-choice', at: ['finish', 'complete'], label: kit.labels.start, once: true },
  ],
  chrome: { inventory: t.inventory, closeInventory: t.closeInventory, wieldSelectedItem: t.wieldSelectedItem, unsaved: t.unsaved, controls: t.practiceControls, restart: t.restart },
}
