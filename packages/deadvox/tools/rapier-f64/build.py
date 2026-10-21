#!/usr/bin/env python3
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
PRECISION = 'f32' if '--f32' in sys.argv else 'f64'
OUT = ROOT / f'test-results/rapier-{PRECISION}'
REVISION = '0fd32c1cbbc7018af36f09b190c16ce72fbb9301'
TOOLCHAIN = '1.90.0'


def run(*args, cwd=OUT):
    subprocess.run(args, cwd=cwd, check=True, env={**os.environ, 'RUSTFLAGS': ''})


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = OUT / 'upstream'
    if not source.exists():
        run('git', 'clone', 'https://github.com/dimforge/rapier.js.git', str(source))
    run('git', 'checkout', '--detach', REVISION, cwd=source)
    run('rustup', 'toolchain', 'install', TOOLCHAIN, '--profile', 'minimal', '--target', 'wasm32-unknown-unknown')
    if not shutil.which('wasm-bindgen') or subprocess.check_output(['wasm-bindgen', '--version'], text=True).strip() != 'wasm-bindgen 0.2.100':
        run('cargo', f'+{TOOLCHAIN}', 'install', 'wasm-bindgen-cli', '--version', '0.2.100', '--locked')
    crate = OUT / 'crate'
    if (crate / 'src').exists():
        shutil.rmtree(crate / 'src')
    shutil.copytree(source / 'src', crate / 'src')
    for path in (crate / 'src').rglob('*.rs'):
        text = path.read_text()
        if PRECISION == 'f32':
            continue
        if path.name == 'debug_render_pipeline.rs':
            # Debug colors are upstream f32, unlike physical vertex coordinates.
            text = text.replace('vertices: Vec<f32>', 'vertices: Vec<f64>')
            text = text.replace("vertices: &'a mut Vec<f32>", "vertices: &'a mut Vec<f64>")
            text = text.replace('use js_sys::Float32Array;', 'use js_sys::{Float32Array, Float64Array};')
            text = text.replace('pub fn vertices(&self) -> Float32Array', 'pub fn vertices(&self) -> Float64Array')
            text = text.replace('Float32Array::new_with_length(self.vertices', 'Float64Array::new_with_length(self.vertices')
        else:
            text = re.sub(r'\bf32\b', 'f64', text).replace('Float32Array', 'Float64Array')
        path.write_text(text)
    manifest = (HERE / 'Cargo.toml').read_text()
    if PRECISION == 'f32':
        manifest = manifest.replace('-f64', '')
    (crate / 'Cargo.toml').write_text(manifest)
    lock = HERE / ('Cargo-f32.lock' if PRECISION == 'f32' else 'Cargo.lock')
    if lock.exists():
        shutil.copy(lock, crate / 'Cargo.lock')
    run('cargo', f'+{TOOLCHAIN}', 'build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', cwd=crate)
    package = OUT / 'pkg'
    package.mkdir(exist_ok=True)
    run('wasm-bindgen', str(crate / 'target/wasm32-unknown-unknown/release/rapier_wasm3d.wasm'), '--target', 'web', '--out-dir', str(package))
    shutil.copy(source / 'LICENSE', package / 'LICENSE')
    ts = package / 'src'
    if ts.exists():
        shutil.rmtree(ts)
    shutil.copytree(source / 'src.ts', ts)
    for path in ts.rglob('*.ts'):
        text = re.sub(r'[^\n]*#if DIM2[^\n]*\n.*?[^\n]*#endif[^\n]*\n', '', path.read_text(), flags=re.S)
        if PRECISION == 'f32':
            pass
        elif path.name != 'debug_render_pipeline.ts':
            text = text.replace('Float32Array', 'Float64Array')
        else:
            text = text.replace('vertices: Float32Array', 'vertices: Float64Array')
        path.write_text(text)
    shutil.copy(package / 'rapier_wasm3d.d.ts', ts / 'rapier_wasm3d.d.ts')
    (ts / 'raw.ts').write_text('export * from "./rapier_wasm3d";\n')
    (package / 'package.json').write_text('{"type":"module","private":true}\n')
    run(str(ROOT / 'node_modules/.bin/tsc'), '--target', 'ES2020', '--module', 'ES2020', '--moduleResolution', 'bundler', '--strict', 'false', '--declaration', '--skipLibCheck', '--outDir', str(package), str(ts / 'rapier.ts'))


if __name__ == '__main__':
    main()
