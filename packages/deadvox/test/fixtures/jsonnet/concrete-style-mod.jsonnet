local styles = import '../../../src/content/base/map-kits.jsonnet';
local townhouse = std.filter(function(style) style.id == 'brick_townhouse', styles.mapStyles)[0];
{
  mapStyles: [townhouse + {
    bindings: townhouse.bindings + {
      facade: { role: 'shell', block: 'concrete' },
      cap: { role: 'trim', block: 'concrete' },
    },
  }],
}
