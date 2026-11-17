local rows = import 'tools/jsonnet/lib/loot-rows.libsonnet';
local item = rows.item, table = rows.table, nothing = rows.nothing;

// A magazine is filled with one cartridge of its calibre, picked by the odds of the table that drops it.
local rifleCartridges = [{ item: 'cartridge_5_d_56x45', weight: 1 }, { item: 'cartridge_7_d_62x39', weight: 1 }];

{
  loot: [
    // Armed-stock role tables, shared by the station, the HQ and the armed rooms: each source's
    // context decides which rows it admits, so the station never rolls the rifle rows the HQ does.
    { id: 'armoury_arms', rolls: [1, 1], entries: [
      item('revolver_357', 2, condition=[0.5, 0.9]),
      item('pump_shotgun', 1, condition=[0.5, 0.9]),
      item('rifle_assault', 1, condition=[0.5, 0.9]),
      item('rifle_ak', 1, condition=[0.5, 0.9]), nothing(1),
    ] },
    // Only Military sources admit rifle rows. Rifle counts are sized so a run offers each rifle calibre
    // about as many rounds as it offers .357, several thirty-round magazines' worth (#1089).
    { id: 'armoury_ammunition', rolls: [1, 2], entries: [
      item('cartridge_357_h_magnum', 3, count=[3, 12]),
      item('cartridge_box_357_h_magnum', 2), item('cartridge_box_9x19', 2),
      item('shotshell_box', 1),
      item('cartridge_5_d_56x45', 3, count=[60, 150]),
      item('cartridge_box_5_d_56x45', 2, count=[3, 6]),
      item('cartridge_7_d_62x39', 3, count=[60, 150]),
      item('cartridge_box_7_d_62x39', 2, count=[3, 6]),
      item('magazine_stanag_30', 2, condition=[0.5, 0.9]),
      item('magazine_stanag_20', 1, condition=[0.5, 0.9]),
      item('magazine_akm_30', 2, condition=[0.5, 0.9]), nothing(2),
    ], cartridgeOdds: rifleCartridges },
    // Rifle supplies for the rooms outside the armoury, so the HQ's ammunition and magazines are not all in one cabinet.
    { id: 'hq_field_supplies', rolls: [1, 2], entries: [
      item('cartridge_5_d_56x45', 2, count=[40, 100]),
      item('cartridge_7_d_62x39', 2, count=[40, 100]),
      item('cartridge_box_5_d_56x45', 1, count=[2, 4]), item('cartridge_box_7_d_62x39', 1, count=[2, 4]),
      item('magazine_stanag_30', 2, condition=[0.5, 0.9]),
      item('magazine_stanag_20', 1, condition=[0.5, 0.9]),
      item('magazine_akm_30', 2, condition=[0.5, 0.9]), nothing(3),
    ], cartridgeOdds: rifleCartridges },
    { id: 'armoury_cabinet', rolls: [2, 3], entries: [
      table('armoury_arms', 1), table('armoury_ammunition', 2),
    ] },
    { id: 'equipment_locker', rolls: [1, 2], entries: [
      item('utility_vest', 2, condition=[0.4, 0.8]),
      item('stab_vest', 1, condition=[0.4, 0.8]),
      item('riot_helmet', 1, condition=[0.4, 0.8]),
      item('flashlight', 2), item('portable_radio', 1),
      item('bandage', 1), nothing(4),
    ] },
  ],
}
