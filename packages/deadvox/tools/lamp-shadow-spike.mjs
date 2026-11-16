import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStageServer } from '../test/browser/stageServer.mjs';
import { launchChromium } from '../test/browser/chromium.mjs';
import { gameUrl } from '../test/browser/gameUrl.mjs';
import { browserStageUrl } from '../test/browser/stage-mode.mjs';
import { lampShadowSpikePlugin } from './lamp-shadow-spike-plugin.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] ?? 'cube';
const slots = Number(process.argv[3] ?? 4);
const kind = process.argv[4] ?? 'measure';
const out = resolve(process.env.SPIKE_OUT ?? 'test-results/lamp-shadow-spike');
await mkdir(out, { recursive: true });
const server = await createStageServer({
  root, configFile: `${root}/vite.config.ts`, logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [lampShadowSpikePlugin(mode, slots)],
});
let browser;
const errors = [];
try {
  await server.listen();
  browser = await launchChromium('cell-repair-crack', {headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:kind==='shot'?{width:920,height:740}:{width:640,height:360}});
  page.setDefaultTimeout(0);
  page.on('pageerror', e=>{ errors.push(e.message); console.log('PAGE_ERROR', e.stack); });
  page.on('console', m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE_ERROR',m.text().slice(0,500));}});
  await page.goto(browserStageUrl('cell-repair-crack', gameUrl(`http://127.0.0.1:${server.httpServer.address().port}`, {
    startMod: kind === 'shot' ? 'skelly.deadvox.scenario.test-house.lamp-cube-many' : 'skelly.deadvox.scenario.test-house.cell-repair-look',
    hash:{debug:true,seed:kind==='shot'?1:73,radius:16,post:false},
  })), {waitUntil:'domcontentloaded',timeout:120000});
  console.log('PHASE menu',mode,slots,kind);
  await page.waitForFunction(()=>document.querySelector('#go')?.getAttribute('aria-disabled')==='false');
  await page.locator('#go').click();
  await page.waitForFunction(()=>globalThis.spikeProbe?.worldLoading.ready);
  console.log('PHASE ready');
  const identity = await page.evaluate(() => {
    const p=globalThis.spikeProbe;
    p.engine.mood.setRenderScale(1); p.engine.mood.externalGpuTiming=true;
    const gl=p.engine.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {renderer:gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),position:[...p.body.pos],camera:p.engine.camera.position.toArray(),lights:globalThis.lampPool.lights.slice(0,globalThis.lampPool.itemSlots).map(l=>({at:l.position.toArray(),intensity:l.intensity})),size:gl.getParameter(gl.VIEWPORT)};
  });
  const settle = n=>page.evaluate(n=>new Promise(done=>{let at=0;const step=()=>++at>=n?done():requestAnimationFrame(step);requestAnimationFrame(step);}),n);
  if (mode==='ray'||mode==='contact'||mode==='hybrid') await page.evaluate(()=>globalThis.lampSpike.rebuild());
  if (kind === 'shot') {
    await page.evaluate(()=>{globalThis.spikeProbe.input.controls.yaw=-Math.PI/2;globalThis.spikeProbe.input.controls.pitch=-0.25;
      const style=document.createElement('style');style.textContent='#hud,#quickbar,#prompt,#debug-readout {visibility:hidden}';document.head.append(style);
    });
    await settle(20);
    await page.screenshot({path:`${out}/${mode}-${slots}.png`,timeout:120000});
    if(slots===8) {
      await page.evaluate(()=>globalThis.spikeRemote=true);
      await settle(12);
      await page.screenshot({path:`${out}/${mode}-${slots}-remote-closed.png`,timeout:120000});
      await page.keyboard.press('KeyF');
      await page.waitForFunction(()=>[...globalThis.spikeProbe.session.entities.records].some(e=>globalThis.spikeProbe.session.entities.defOf(e).door&&e.open));
      await settle(12);
      await page.screenshot({path:`${out}/${mode}-${slots}-remote-open.png`,timeout:120000});
    }
    await writeFile(`${out}/${mode}-${slots}-shot.json`,JSON.stringify({identity,errors},null,2));
  } else {
    await page.evaluate(()=>{
      const p=globalThis.spikeProbe, at=p.engine.camera.position;
      globalThis.spikeSynthetic=Array.from({length:globalThis.lampPool.itemSlots},(_,i)=>[at.x+(i%2?1:-1)*1.5,at.y-0.5,at.z-1-Math.floor(i/2)]);
      globalThis.spikeLit=0;
    });
    const results=[];
    for(const lit of (slots===8?[8,0]:[0,2,4])) {
      await page.evaluate(n=>globalThis.spikeLit=n,lit);
      await settle(8);
      await page.evaluate(()=>{globalThis.spikeProbe.records=[];globalThis.spikeProbe.capture=true;});
      await page.waitForFunction(()=>globalThis.spikeProbe.records.length>=40);
      const rows=await page.evaluate(()=>{globalThis.spikeProbe.capture=false;return globalThis.spikeProbe.records;});
      const intervals=rows.slice(1).map((r,i)=>r.now-rows[i].now).sort((a,b)=>a-b);
      const row={lit,p50:intervals[intervals.length>>1],rows};
      results.push(row);
      console.log('RESULT',mode,slots,lit,row.p50);
      await writeFile(`${out}/${mode}-${slots}-frames.json`,JSON.stringify({identity,results,errors},null,2));
    }
  }
  const glState=await page.evaluate(()=>{
    const p=globalThis.spikeProbe, gl=p.engine.renderer.getContext();
    return {error:gl.getError(),camera:p.engine.camera.position.toArray(),yaw:p.input.controls.yaw,pitch:p.input.controls.pitch,
      lamps:globalThis.lampPool.lights.slice(0,globalThis.lampPool.itemSlots).map(l=>({at:l.position.toArray(),intensity:l.intensity,casts:l.castShadow,carried:l.userData.carried})),
      programs:p.engine.renderer.info.programs.map(p=>{
        const uniforms=[];
        for(let i=0;i<gl.getProgramParameter(p.program,gl.ACTIVE_UNIFORMS);i++) {
          const u=gl.getActiveUniform(p.program,i);
          if(/spike|pointShadowMap/.test(u.name))uniforms.push({name:u.name,size:u.size,type:u.type});
        }
        return {name:p.name,uniforms};
      })};
  });
  await writeFile(`${out}/${mode}-${slots}-${kind}-gl.json`,JSON.stringify(glState,null,2));
  console.log('GL',glState.error,'PROGRAMS',glState.programs.length,'ERRORS',errors.length);
  if(errors.length||glState.error)throw new Error('Probe errors');
}finally{await browser?.close();await server.close();}
