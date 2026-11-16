function once(code, match, replacement) {
  if (code.split(match).length !== 2) throw new Error(`instrumentation missing: ${match}`);
  return code.replace(match, replacement);
}
export function lampShadowSpikePlugin(mode, slots = 4) {
  return { name: 'lamp-shadow-spike', enforce: 'pre', transform(source, id) {
    let code = source;
    if (id.endsWith('/src/render/playView.ts')) {
      code = `import { installLampShadowSpike } from './lampShadowSpike.ts';\n${code}`;
      code = once(code, '  const lightPool = new LightPool(scene, lightTuning, held.warmUpTarget.scene);',
        `  const lightPool = new LightPool(scene, {...lightTuning, heldLamps:${slots / 2}, droppedLamps:${slots / 2}}, held.warmUpTarget.scene);
  const spike = installLampShadowSpike({...engine, config: {scale: {blockSize: s}}}, lightPool, '${mode}');`);
      code = once(code, '      fixtureReach?.update(lightPool.reachSlots);', `      if (globalThis.spikeLit !== undefined) {
        lightPool.lights.forEach((light, i) => {
          if (i >= lightPool.itemSlots || i >= globalThis.spikeLit) light.intensity = 0;
          else if (globalThis.spikeSynthetic) {
            const at = globalThis.spikeSynthetic[i];
            light.position.set(...at); light.intensity = 8; light.distance = 8;
          }
        });
      }
      if (globalThis.spikeRemote) {
        const remote = lightPool.lights.findIndex((light,i)=>i>=${slots/2} && i<lightPool.itemSlots && light.position.x>4 && light.intensity>0);
        lightPool.lights.forEach((light,i)=>{if(i!==remote) {light.intensity=0; if(lightPool.handLights[i]) lightPool.handLights[i].intensity=0;}});
      }
      spike.update();
      fixtureReach?.update(lightPool.reachSlots);`);
    }
    if (id.endsWith('/src/render/shadows.ts')) {
      code = once(code, '      light.castShadow = true;', `      light.castShadow = ${mode === 'cube' || mode === 'atlas' ? 'true' : mode === 'hybrid' ? 'light === lights[0]' : 'false'};`);
      code = once(code, '    this.drawItems(draw, scene);', '    this.drawItems(draw, scene);\n    globalThis.lampSpike?.copyAtlas();');
      code = once(code, '    for (const item of this.items) {', '    for (const item of this.items) {\n      if (!item.castShadow) continue;');
      code = once(code, '      for (const [index, item] of this.items.entries()) {', '      for (const [index, item] of this.items.entries()) {\n        if (!item.castShadow) continue;');
    }
    if (id.endsWith('/src/presentation/play.ts')) code = once(code, '  startRealFrames(frame);', `  globalThis.spikeProbe={engine,session,input,view,worldLoading,body,inventory,records:[],capture:false};
  startRealFrames(now=>{const t=performance.now(); const keep=frame(now); const p=globalThis.spikeProbe;
    if(p.capture)p.records.push({now,workMs:performance.now()-t,...engine.shadows?.itemStats,spikeCpu:globalThis.lampSpike?.cpuMs}); return keep;});`);
    return code === source ? undefined : code;
  }};
}
