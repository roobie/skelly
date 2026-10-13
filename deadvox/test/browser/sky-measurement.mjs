// biome-ignore-all lint/correctness/noNodejsModules: browser evidence owns its Vite server, head metadata and artifacts.

import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import { initializeSkyTiming, skyTimingPlugin, summarizeSkyTiming } from './sky-timing.mjs';

const route = { start: 430, end: 490, z: 523 };
const pagePath = `/?site=playtest&seed=1&radius=48&debug=1&time=13:00&at=${route.start},${route.z},-90`;
const engineObservation = `
  const evidence = globalThis.skyRouteEvidence;
  if (evidence && renderer && skylight) {
    evidence.engine = { ...worldSetup, scene, camera, renderer, skylight };
    const update = skylight.update.bind(skylight);
    skylight.update = (...args) => {
      const start = performance.now();
      evidence.inSkyUpdate=true;
      try { return update(...args); }
      finally { evidence.inSkyUpdate=false; evidence.serviceRealMs += performance.now()-start; }
    };
    const at = skylight.at.bind(skylight);
    evidence.sample = at;
    skylight.at = (...args) => {
      const start = performance.now();
      const result = at(...args);
      evidence.serviceRealMs += performance.now()-start;
      return result;
    };
    skylight.onJob = (workerMs,latencyMs) => evidence.jobs.push({phase:evidence.phase,workerMs,latencyMs});
    const gl = renderer.getContext();
    const shaders = new WeakSet(), programs = new WeakSet();
    const shaderSource = gl.shaderSource.bind(gl), attachShader = gl.attachShader.bind(gl);
    gl.shaderSource = (shader,source) => {
      if(source.includes('vSkyWorld')) shaders.add(shader);
      return shaderSource(shader,source);
    };
    gl.attachShader = (program,shader) => {
      if(shaders.has(shader)) programs.add(program);
      return attachShader(program,shader);
    };
    for(const [method,owned] of [['compileShader',shaders],['linkProgram',programs],['getShaderParameter',shaders],['getProgramParameter',programs]]) {
      const original = gl[method].bind(gl);
      gl[method] = (...args) => {
        if(!owned.has(args[0])) return original(...args);
        const start = performance.now(), result = original(...args);
        evidence.programRealMs += performance.now()-start;
        return result;
      };
    }
    const bound = new Map();
    const bindTexture = gl.bindTexture.bind(gl);
    gl.bindTexture = (target,texture) => {bound.set(target,texture); return bindTexture(target,texture);};
    const ownedTexture = target => Object.entries(evidence.uniforms ?? {}).some(([name,uniform]) =>
      name.startsWith('uSky') && uniform.value?.isTexture &&
      renderer.properties.get(uniform.value).__webglTexture === bound.get(target));
    for (const method of ['texStorage3D','texImage3D','texSubImage3D','texImage2D','texSubImage2D']) {
      const original = gl[method].bind(gl);
      gl[method] = (...args) => {
        if (!ownedTexture(args[0])) return original(...args);
        const start = performance.now();
        const result = original(...args);
        const realMs = performance.now()-start;
        evidence.textureRealMs += realMs;
        const published=globalThis.skyTiming?.lastPublished;
        evidence.uploads.push({phase:evidence.phase,method,realMs,
          publicationJob:published?.frame===globalThis.skyTiming?.renderedFrames ? published.job : null});
        return result;
      };
    }
    const locations = new WeakSet();
    const getUniformLocation = gl.getUniformLocation.bind(gl);
    gl.getUniformLocation = (program,name) => {
      const location = getUniformLocation(program,name);
      if (location && name.startsWith('uSky')) locations.add(location);
      return location;
    };
    for (const method of ['uniform1f','uniform1i','uniform1fv','uniform1iv','uniform2f','uniform2fv','uniform3f','uniform3fv','uniform4f','uniform4fv']) {
      const original = gl[method].bind(gl);
      gl[method] = (...args) => {
        if (!locations.has(args[0])) return original(...args);
        const start = performance.now();
        const result = original(...args);
        evidence.uniformRealMs += performance.now()-start;
        return result;
      };
    }
  }
`;
export const frameObservation = `
  Object.assign(globalThis.skyRouteEvidence,{play:{engine,session,debugTools,blockSize:scale.blockSize}});
  startRealFrames((...args) => {
    const evidence = globalThis.skyRouteEvidence;
    const start = performance.now();
    const beforeFrame = engine.renderer.info.render.frame;
    const keepRunning=frame(...args);
    if(engine.renderer.info.render.frame===beforeFrame) return keepRunning;
    const frameRealMs = performance.now()-start;
    const position = engine.camera.position.toArray();
    const eligible = engine.skylight.inspect().flatMap((field,index) => {
      const point = position.map(v=>v/scale.blockSize);
      return point.every((v,a)=>v>=field.bounds.min[a]&&v<field.bounds.max[a])
        ? [{index,complete:field.complete,current:field.current,resident:field.resident}] : [];
    });
    evidence.frames.push({phase:evidence.phase,realMs:start,
      startAbsoluteRealMs:performance.timeOrigin+start,endAbsoluteRealMs:performance.timeOrigin+start+frameRealMs,
      intervalRealMs:evidence.previousRealMs===null ? null : start-evidence.previousRealMs,
      frameRealMs,serviceRealMs:evidence.serviceRealMs,textureRealMs:evidence.textureRealMs,
      uniformRealMs:evidence.uniformRealMs,programRealMs:evidence.programRealMs,
      lightingRealMs:evidence.serviceRealMs+evidence.textureRealMs+evidence.uniformRealMs+evidence.programRealMs,
      position,estimate:evidence.sample(position),eligible,stats:{...engine.skylight.stats}});
    evidence.previousRealMs = start;
    evidence.serviceRealMs = evidence.textureRealMs = evidence.uniformRealMs = evidence.programRealMs = 0;
    return keepRunning;
  });
`;

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
}
function summarize(frames) {
  const intervals = frames.flatMap((frame) => (frame.intervalRealMs === null ? [] : [frame.intervalRealMs]));
  const lighting = frames.map((frame) => frame.lightingRealMs);
  const elapsed = intervals.reduce((sum, value) => sum + value, 0);
  const over18 = intervals.filter((value) => value > 18).length;
  return {
    frameDenominator: frames.length,
    intervalDenominator: intervals.length,
    lightingP99RealMs: percentile(lighting, 0.99),
    lightingMaxRealMs: lighting.length > 0 ? Math.max(...lighting) : null,
    lightingOver2Count: lighting.filter((value) => value > 2).length,
    sceneFps: elapsed > 0 ? (intervals.length * 1000) / elapsed : null,
    framesOver18Count: over18,
    framesOver18Percent: intervals.length > 0 ? (100 * over18) / intervals.length : null,
    eligibleFrames: frames.filter((frame) => frame.eligible.length > 0).length,
    unknownHeightFrames: frames.filter((frame) => frame.eligible.some((field) => !field.complete)).length,
    nonresidentFrames: frames.filter((frame) => frame.eligible.some((field) => field.complete && !field.resident))
      .length,
    staleDisplayFrames: frames.filter((frame) => frame.eligible.some((field) => field.complete && !field.current))
      .length,
    initialStats: frames[0]?.stats,
    finalStats: frames.at(-1)?.stats,
  };
}
function pendingEpisodes(frames, pendingState) {
  const open = new Map();
  const episodes = [];
  for (const frame of frames) {
    const seen = new Set();
    for (const field of frame.eligible) {
      const key = `${frame.phase}:${field.index}`;
      seen.add(key);
      if (pendingState(field) && !open.has(key)) {
        open.set(key, { phase: frame.phase, index: field.index, startRealMs: frame.realMs });
      }
      if (!pendingState(field) && open.has(key)) {
        const pending = open.get(key);
        episodes.push({ ...pending, elapsedRealMs: frame.realMs - pending.startRealMs, end: 'ready' });
        open.delete(key);
      }
    }
    const left = [...open].filter(([key]) => !seen.has(key));
    for (const [key, pending] of left) {
      episodes.push({ ...pending, elapsedRealMs: frame.realMs - pending.startRealMs, end: 'left-region' });
      open.delete(key);
    }
  }
  const lastRealMs = frames.at(-1)?.realMs;
  for (const pending of open.values()) {
    episodes.push({ ...pending, elapsedRealMs: lastRealMs - pending.startRealMs, end: 'route-ended' });
  }
  const resolved = episodes.filter((episode) => episode.end === 'ready').map((episode) => episode.elapsedRealMs);
  return {
    denominator: episodes.length,
    resolvedDenominator: resolved.length,
    resolvedP99RealMs: percentile(resolved, 0.99),
    censoredCount: episodes.length - resolved.length,
    episodes,
  };
}

export async function measureSkyRoute(browser, root, artifacts) {
  const server = await createServer({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      skyTimingPlugin(),
      {
        name: 'sky-route-observation',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/src/game/engine.ts')) {
            const marker = '  return {\n    ...worldSetup,';
            if (code.split(marker).length !== 2) {
              throw new Error('Sky evidence engine marker changed');
            }
            return code.replace(marker, engineObservation + marker);
          }
          if (id.endsWith('/src/game/play.ts')) {
            const marker = 'startRealFrames(frame);';
            if (code.split(marker).length !== 2) {
              throw new Error('Sky evidence frame marker changed');
            }
            return code.replace(marker, frameObservation);
          }
          if (id.endsWith('/src/render/skylight.ts')) {
            const marker = 'shader.uniforms.uSkyVolume = this.texture;';
            if (code.split(marker).length !== 2) {
              throw new Error('Sky evidence uniform marker changed');
            }
            return code
              .replace(marker, `${marker}\nglobalThis.skyRouteEvidence.uniforms = shader.uniforms;`)
              .replace(
                'material.onBeforeCompile = (shader, renderer) => {',
                'material.onBeforeCompile = (shader, renderer) => {\nconst skyPatchStartRealMs = performance.now();',
              )
              .replace(
                '    };\n    material.customProgramCacheKey = () =>',
                'globalThis.skyRouteEvidence.programRealMs += performance.now()-skyPatchStartRealMs;\n    };\n    material.customProgramCacheKey = () =>',
              );
          }
        },
      },
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(initializeSkyTiming);
  await page.addInitScript(() => {
    globalThis.skyRouteEvidence = {
      phase: 'cold',
      frames: [],
      jobs: [],
      uploads: [],
      previousRealMs: null,
      serviceRealMs: 0,
      textureRealMs: 0,
      uniformRealMs: 0,
      programRealMs: 0,
    };
  });
  let result;
  try {
    await server.listen();
    await page.goto(new URL(pagePath, server.resolvedUrls.local[0]).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: Math.abs(route.end - route.start) * 2000 },
    );
    await page.locator('#go').click();
    await page.waitForFunction(() => globalThis.skyRouteEvidence.frames.length > 0);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => globalThis.skyRouteEvidence.play.debugTools.noclip);
    const movement = async (goal, key, direction) => {
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(
          ({ goal: target, direction: sign }) => {
            const { session, blockSize } = globalThis.skyRouteEvidence.play;
            return sign * (session.body.pos[0] * blockSize - target) >= 0;
          },
          { goal, direction },
          { timeout: Math.abs(route.end - route.start) * 2000 },
        );
      } finally {
        await page.keyboard.up(key);
        await page.keyboard.up('ShiftLeft');
      }
    };
    await movement(route.end, 'KeyW', 1);
    await page.evaluate(() => {
      const evidence = globalThis.skyRouteEvidence;
      evidence.phase = 'warm';
      evidence.previousRealMs = null;
      evidence.serviceRealMs = 0;
      evidence.textureRealMs = 0;
      evidence.uniformRealMs = 0;
      evidence.programRealMs = 0;
    });
    await movement(route.start, 'KeyS', -1);
    await page.evaluate(() => {
      globalThis.skyRouteEvidence.phase = 'off';
    });
    await page.screenshot({ path: resolve(artifacts, 'sky-route-warm.png') });
    const captured = await page.evaluate(async (pathRoute) => {
      const evidence = globalThis.skyRouteEvidence;
      const { engine } = evidence.play;
      // biome-ignore lint/correctness/noUnresolvedImports: Vite serves the typed collector in the browser.
      const { collectSkyGeometry } = await import('/test/browser/sky-geometry.ts');
      const geometry = collectSkyGeometry(engine, pathRoute, evidence.sample);
      const gl = engine.renderer.getContext();
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        frames: evidence.frames,
        jobs: evidence.jobs,
        uploads: evidence.uploads,
        ...geometry,
        timing: { events: globalThis.skyTiming.events, jobs: globalThis.skyTiming.jobs },
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        noclip: evidence.play.debugTools.noclip,
        finalStats: { ...engine.skylight.stats },
      };
    }, route);
    const cold = captured.frames.filter((frame) => frame.phase === 'cold');
    const warm = captured.frames.filter((frame) => frame.phase === 'warm');
    result = {
      metadata: {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        browser: browser.version(),
        viewport: [1600, 900],
        pagePath,
        route,
        attribution:
          'RAF frames; Skylight.update/at, owned sky textures/uSky uniforms and patched-program callbacks/compile/link checks; CPU wall time, not GPU execution',
      },
      cold: summarize(cold),
      warm: summarize(warm),
      fallback: {
        cold: pendingEpisodes(cold, (field) => !field.complete),
        warm: pendingEpisodes(warm, (field) => !field.complete),
      },
      revalidation: {
        cold: pendingEpisodes(cold, (field) => field.complete && !field.current),
        warm: pendingEpisodes(warm, (field) => field.complete && !field.current),
      },
      errors,
      ...captured,
      timing: summarizeSkyTiming(captured.timing).map((job) => {
        const uploads = captured.uploads.filter((upload) => upload.publicationJob === job.id);
        return {
          ...job,
          returnRenderFrames: captured.frames
            .filter(
              (frame) =>
                frame.endAbsoluteRealMs > job.workerEndAbsoluteRealMs &&
                frame.startAbsoluteRealMs < job.receivedAbsoluteRealMs,
            )
            .map((frame) => ({
              phase: frame.phase,
              startAbsoluteRealMs: frame.startAbsoluteRealMs,
              endAbsoluteRealMs: frame.endAbsoluteRealMs,
              frameRealMs: frame.frameRealMs,
            })),
          textureSubmissions: uploads,
          textureSubmissionRealMs: uploads.reduce((sum, upload) => sum + upload.realMs, 0),
        };
      }),
    };
  } catch (error) {
    result = {
      error: String(error),
      errors,
      pagePath,
      route,
      captured: await page
        .evaluate(() => {
          const evidence = globalThis.skyRouteEvidence;
          return {
            frames: evidence.frames,
            jobs: evidence.jobs,
            stats: evidence.engine?.skylight.stats,
            position: evidence.play?.session.body.pos,
            noclip: evidence.play?.debugTools.noclip,
          };
        })
        .catch(() => null),
    };
    throw error;
  } finally {
    if (result) {
      await writeFile(resolve(artifacts, 'sky-route-evidence.json'), JSON.stringify(result, null, 2));
      const { frames, uploads, jobs, timing, ...summary } = result;
      process.stdout.write(`SKY_ROUTE_EVIDENCE ${JSON.stringify(summary)}\n`);
      for (const frame of frames ?? []) {
        process.stdout.write(`SKY_ROUTE_FRAME ${JSON.stringify(frame)}\n`);
      }
      for (const upload of uploads ?? []) {
        process.stdout.write(`SKY_ROUTE_UPLOAD ${JSON.stringify(upload)}\n`);
      }
      for (const job of jobs ?? []) {
        process.stdout.write(`SKY_ROUTE_JOB ${JSON.stringify(job)}\n`);
      }
      for (const job of timing ?? []) {
        process.stdout.write(`SKY_ROUTE_TIMING ${JSON.stringify(job)}\n`);
      }
    }
    await page.close();
    await server.close();
  }
  return result;
}
