import type { Registry } from './content.ts';
import type { ContentSection } from './schema/files.ts';
import type { ActorDef, BodyTuningDef, ItemDef } from './schema.ts';

type Report = (section: ContentSection, id: string, path: string, message: string) => void;

const checkerFor = (registry: Registry, report: Report, section: ContentSection, id: string) => {
  const issue = (path: string, message: string): void => report(section, id, path, message);
  const selected = (path: string, kind: string, melee = false): void => {
    const definition = registry.damageKinds.get(kind);
    if (!definition) {
      issue(path, `no damage kind "${kind}"`);
    } else if (melee && definition.class !== 'melee') {
      issue(path, `damage kind "${kind}" is not melee`);
    }
  };
  const keys = (path: string, values: object | undefined): void => {
    for (const kind of Object.keys(values ?? {})) {
      selected(`${path}.${kind}`, kind);
    }
  };
  const complete = (path: string, values: object): void => {
    keys(path, values);
    for (const kind of registry.damageKinds.keys()) {
      if (!Object.hasOwn(values, kind)) {
        issue(`${path}.${kind}`, `missing response for damage kind "${kind}"`);
      }
    }
  };
  return { issue, selected, keys, complete };
};
type Checker = ReturnType<typeof checkerFor>;

const checkBody = (body: BodyTuningDef, checker: Checker): void => {
  const responses = {
    '.shockPerDamage': body.shockPerDamage,
    '.outerWearMultiplier': body.outerWearMultiplier,
    '.pain.perDamage': body.pain.perDamage,
    ...Object.fromEntries(
      body.bleeding.tiers.map((tier, i) => [`.bleeding.tiers[${i}].chancePerDamage`, tier.chancePerDamage]),
    ),
  };
  for (const [path, values] of Object.entries(responses)) {
    checker.complete(path, values);
  }
  checker.keys('.linger', body.linger);
  checker.selected('.landing.kind', body.landing.kind);
};

const checkItem = (item: ItemDef, checker: Checker, registry: Registry): void => {
  checker.keys('.wearable.protects', item.wearable?.protects);
  item.wearable?.imperviousTo?.forEach((kind, i) => {
    checker.selected(`.wearable.imperviousTo[${i}]`, kind);
  });
  const weapon = item.weapon?.melee;
  if (weapon) {
    checker.selected('.weapon.melee.type', weapon.type, true);
    if (!registry.meleeClasses.has(weapon.type) || registry.meleeClasses.get(weapon.type)?.unarmed) {
      checker.issue('.weapon.melee.type', `no melee class "${weapon.type}"`);
    }
  }
  if (item.ammo) {
    checker.selected('.ammo.damageKind', item.ammo.damageKind);
  }
  if (item.explosive) {
    checker.selected('.explosive.blast.damageKind', item.explosive.blast.damageKind);
    checker.selected('.explosive.fragments.damageKind', item.explosive.fragments.damageKind);
  }
  if (item.trap) {
    checker.selected('.trap.playerInjury.kind', item.trap.playerInjury.kind);
  }
};

const checkActor = (actor: ActorDef, checker: Checker): void => {
  checker.keys('.damageResistance', actor.damageResistance);
  actor.attack?.moves.forEach((move, i) => {
    checker.selected(`.attack.moves[${i}].damageKind`, move.damageKind);
  });
  actor.acidSpit?.moves.forEach((move, i) => {
    checker.selected(`.acidSpit.moves[${i}].damageKind`, move.damageKind);
  });
  if (actor.acidSpit) {
    checker.selected('.acidSpit.puddle.damageKind', actor.acidSpit.puddle.damageKind);
  }
};

export const checkDamageKinds = (registry: Registry, report: Report): void => {
  for (const body of registry.body.values()) {
    checkBody(body, checkerFor(registry, report, 'body', body.id));
  }
  for (const material of registry.blockMaterials.values()) {
    checkerFor(registry, report, 'blockMaterials', material.id).complete('.resistance', material.resistance);
  }
  for (const meleeClass of registry.meleeClasses.values()) {
    const checker = checkerFor(registry, report, 'meleeClasses', meleeClass.id);
    if (meleeClass.capability !== 'unarmed') {
      checker.selected('.id', meleeClass.id, true);
    }
    if (meleeClass.unarmed) {
      checker.selected('.unarmed.damageKind', meleeClass.unarmed.damageKind, true);
    }
  }
  for (const player of registry.player.values()) {
    checkerFor(registry, report, 'player', player.id).selected(
      '.debugBlockTool.damageKind',
      player.debugBlockTool.damageKind,
    );
  }
  for (const item of registry.items.values()) {
    checkItem(item, checkerFor(registry, report, 'items', item.id), registry);
  }
  for (const actor of registry.actors.values()) {
    checkActor(actor, checkerFor(registry, report, 'actors', actor.id));
  }
};
