// What every vehicle piece shares. `solidFill` is low enough that a car's low bonnet block stays open,
// so a jump lands on the bonnet, and high enough that the cabin, roof and wheels still block.
local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
// A released vehicle's sites come from the release, so a pin bump moves its parts; only what holds each part up, its
// finish and which sites spin are authored here. A site's near and far twins and its numbered row share a stem, and a
// support named by stem resolves to the fitting's own twin and row, its row alone or its side alone, whichever the
// release has, so a road wheel rests on its own road arm or axle and a side plate on its own hull side without a
// support per site.
local siteName(id) =
  local words = std.split(id, '_');
  local sided = std.member(['near', 'far'], words[std.length(words) - 1]);
  local unsided = if sided then words[:std.length(words) - 1] else words;
  local last = unsided[std.length(unsided) - 1];
  local numbered = std.length(unsided) > 1 && std.all([std.member('0123456789', c) for c in std.stringChars(last)]);
  local stem = std.join('_', if numbered then unsided[:std.length(unsided) - 1] else unsided);
  {
    stem: stem,
    suffix: std.substr(id, std.length(stem), std.length(id) - std.length(stem)),
    row: if numbered then '_' + last else '',
    side: if sided then '_' + words[std.length(words) - 1] else '',
  };
{
  solidFill: 0.4,
  // A body's half-metre sky cells are mostly air between thin panels, so a cell stops only part of the sky light:
  // the ground under a car and its cabin read shaded, not enclosed. Hidden, since placed vehicles extend this object
  // and a part's shade is not theirs to carry.
  bodyShade:: 0.35,
  // A vehicle part: an item whose exported model carries its physics. Hidden like the shade, for the same reason.
  part(id, name, size, capabilities, description=null):: {
    id: id,
    name: name,
    category: 'misc',
    model: id,
    size: size,
    vehicle: {
      drops: { default: 'item_drop_wood' } + landings.on('metal'),
      capabilities: capabilities,
      obstruction: {
        // Glazing retains body collision but admits sight and light.
        sight: !std.member(capabilities, 'glazing'),
        light: if std.member(capabilities, 'glazing') then 0 else $.bodyShade,
        // Sound and combat remain explicit rather than inferred from a part name or model.
        sound: true,
        combat: true,
      },
    },
  } + (if description == null then {} else { description: description }),
  // A finish repaints only the materials a model marks paintable, so every site takes it and the models decide. A
  // spinning site turns about its axle, the model's x axis through its place, as the vehicle travels.
  releasedFittings(sites, supports, finish, spins=[])::
    local ids = std.set([site.id for site in sites]);
    [
      local name = siteName(site.id);
      local own(support) =
        local found = [candidate for candidate in [support + name.suffix, support + name.row, support + name.side] if std.setMember(candidate, ids)];
        if std.length(found) > 0 then found[0] else support;
      assert std.objectHas(supports, name.stem) : 'author what holds up the released site ' + site.id;
      // A site's swing says how far a part opens before it touches something, and `rides` names the swinging part a
      // site moves with; Deadvox plays no swing, so the fitting leaves both out rather than carry fields nothing reads.
      // A rider rests on the part it rides instead (its authored support).
      std.objectRemoveKey(std.objectRemoveKey(site, 'swing'), 'rides') + { supportedBy: [own(support) for support in supports[name.stem]], finish: finish }
      + (if std.member(spins, name.stem) then { spin: true } else {})
      for site in sites
    ],
}
