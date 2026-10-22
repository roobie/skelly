local models = [
  (import 'things/baseball_bat.model.json') + { grip: { at: [-0.3, 0, 0] }, anchors: { strike: [0.4273, 0, 0] }, hold: 'upright', roll: 0 },
  (import 'things/crowbar.model.json') + { grip: { at: [-0.3, 0, 0] }, anchors: { strike: [0.2306, 0, 0], claw: [0.105, -0.129, 0] }, hold: 'upright', roll: 90 },
  (import 'things/hammer.model.json') + { grip: { at: [-0.185, 0, 0] }, anchors: { strike: [0.0939, 0, 0], face: [0.047, -0.1, 0], claw: [0.062, 0.1, 0] }, hold: 'upright', roll: 90 },
  (import 'things/kabar.model.json') + { grip: { at: [-0.075, 0, 0] }, anchors: { strike: [0.2205, 0, 0] }, hold: 'forward' },
  (import 'things/kitchen_knife.model.json') + { grip: { at: [-0.055, 0, 0] }, anchors: { strike: [0.2471, 0, 0] }, hold: 'forward' },
  (import 'things/machete.model.json') + { grip: { at: [-0.2, 0, 0] }, anchors: { strike: [0.2447, 0, 0], edge: [0.2, -0.034, 0] }, hold: 'forward' },
  (import 'things/wrench.model.json') + { grip: { at: [-0.075, 0, 0] }, anchors: { strike: [0.1047, 0, 0] }, hold: 'upright', roll: 90 },
  (import 'things/steel_pipe.model.json') + { grip: { at: [0, 0, 0] }, anchors: { strike: [0.927, 0, -0.1] }, hold: 'upright', roll: 0 },
];
{ models: models }
