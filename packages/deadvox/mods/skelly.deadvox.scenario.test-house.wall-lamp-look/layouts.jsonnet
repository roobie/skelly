local crouchSites = (import '../skelly.deadvox.scenario.test-house.crouch-wall-look/layouts.jsonnet').layouts;
// The crouch look's stand at the partition: a start mod supplies exactly one start, so this look cannot depend on
// that mod and borrows its site row instead.
{ layouts: [crouchSites[0] + { id: 'testHouseWallLampLook' }] }
