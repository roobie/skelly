local restoration = import '../skelly.deadvox.scenario.holdout.restoration/restoration.libsonnet';
// Empty-handed, so the spare and the tools come from the stores as they would in Holdout.
{ starts: [restoration.start('holdoutrestorationroute', [])] }
