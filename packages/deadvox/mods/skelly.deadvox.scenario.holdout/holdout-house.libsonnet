local rural = import '../skelly.deadvox.buildings/rural-damaged.jsonnet';
std.filter(function(assembly) assembly.id == 'rural_plot_privy_breached', rural.mapAssemblies)[0]
