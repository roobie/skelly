// A blueprint authored with the helper shapes of `packages/deadvox/src/content/base/vehicles.jsonnet`: a pair
// with a service name per side, and one height shared by three fittings.
local fitting(id, part, at, supportedBy=[], service=null) =
  { id: id, part: part, at: at, supportedBy: supportedBy } +
  if service == null then {} else { service: service };
local service(mount, durationSimSeconds, qualities, near, far) = {
  mount: mount,
  durationSimSeconds: durationSimSeconds,
  qualities: qualities,
  names:: { near: near, far: far },
};
local sideService(service, side) = service + { name: service.names[side] };
local pair(id, part, at, shared, service) = [
  fitting(id + '_near', part, at, shared, sideService(service, 'near')),
  fitting(id + '_far', part, [at[0], at[1], 0 - at[2]], shared, sideService(service, 'far')) + { mirror: true },
];

{
  blueprint(height, durationSimSeconds):: {
    id: 'vat_fx_authored',
    name: 'VAT authored fixture',
    fittings: [
      fitting('frame', 'vat_fx_frame', [0, 0, 0]),
      fitting('rail', 'vat_fx_panel', [0.5, height, 0], ['frame']),
    ] + pair('plate', 'vat_fx_panel', [1, height, 0.4], ['frame'], service('vat_fx_mount', durationSimSeconds, { wrenching: 1 }, 'Near plate', 'Far plate')),
  },
}
