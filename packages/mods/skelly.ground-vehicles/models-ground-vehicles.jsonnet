(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    // Only the finishes look fixture draws these, from its debug pack; a debug pack cannot ship built files of its own.
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_frame.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_hull.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_bonnet.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_grille.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_brush_guard.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_bed_floor.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_tailgate.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_windscreen.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_dashboard.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_roof_hatch.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_steering_box.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_portal_axle.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_rear_prop_shaft.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_wheel.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_front_door.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_rear_door.model.json',
    import 'packages/skelly-assets/built/skelly.ground-vehicles/things/light_tactical_vehicle_headlamp.model.json',
  ],
})
