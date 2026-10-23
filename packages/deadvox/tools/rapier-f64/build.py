#!/usr/bin/env python3
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
PRECISION = 'f32' if '--f32' in sys.argv else 'f64'
OUT = ROOT / f'test-results/rapier-{PRECISION}'
REVISION = '0fd32c1cbbc7018af36f09b190c16ce72fbb9301'
TOOLCHAIN = '1.90.0'
BINDGEN = '0.2.100'
VENDOR = ROOT / 'packages/deadvox/vendor/rapier-f64'


def environment():
    clean = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    cargo_home = Path(os.environ.get('CARGO_HOME', Path.home() / '.cargo')).resolve()
    flags = [f'--remap-path-prefix={cargo_home}=cargo', f'--remap-path-prefix={ROOT}=repository']
    clean.update(RUSTFLAGS='', CARGO_ENCODED_RUSTFLAGS='\x1f'.join(flags))
    return clean


def run(*args, cwd=OUT):
    subprocess.run(args, cwd=cwd, check=True, env=environment())


def materialize(source, destination, revision=REVISION):
    archive = subprocess.check_output(
        ['git', 'archive', revision, 'src', 'src.ts', 'LICENSE'], cwd=source, env=environment())
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
        tree.extractall(destination, filter='data')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(package):
    inputs = ['build.py', 'Cargo.toml', 'Cargo.lock']
    provenance = {
        'revision': REVISION, 'rustToolchain': TOOLCHAIN, 'wasmBindgen': BINDGEN,
        'inputs': {name: digest(HERE / name) for name in inputs},
        'typescript': json.loads((ROOT / 'node_modules/typescript/package.json').read_text())['version'],
        'files': {str(path.relative_to(package)): digest(path)
                  for path in sorted(package.rglob('*')) if path.is_file()},
    }
    (package / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = OUT / 'upstream'
    if not source.exists():
        run('git', 'clone', 'https://github.com/dimforge/rapier.js.git', str(source))
    pinned = OUT / 'pinned'
    materialize(source, pinned)
    run('rustup', 'toolchain', 'install', TOOLCHAIN, '--profile', 'minimal', '--target', 'wasm32-unknown-unknown')
    if not shutil.which('wasm-bindgen') or subprocess.check_output(['wasm-bindgen', '--version'], text=True).strip() != f'wasm-bindgen {BINDGEN}':
        run('cargo', f'+{TOOLCHAIN}', 'install', 'wasm-bindgen-cli', '--version', BINDGEN, '--locked')
    crate = OUT / 'crate'
    if (crate / 'src').exists():
        shutil.rmtree(crate / 'src')
    shutil.copytree(pinned / 'src', crate / 'src')
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
    if package.exists():
        shutil.rmtree(package)
    package.mkdir()
    run('wasm-bindgen', str(crate / 'target/wasm32-unknown-unknown/release/rapier_wasm3d.wasm'), '--target', 'web', '--out-dir', str(package))
    shutil.copy(pinned / 'LICENSE', package / 'LICENSE')
    ts = package / 'src'
    if ts.exists():
        shutil.rmtree(ts)
    shutil.copytree(pinned / 'src.ts', ts)
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
    run(str(ROOT / 'node_modules/.bin/tsc'), '--target', 'ES2020', '--module', 'ES2020', '--moduleResolution', 'bundler', '--strict', 'false', '--declaration', '--removeComments', '--skipLibCheck', '--outDir', str(package), str(ts / 'rapier.ts'))
    shutil.rmtree(ts)
    record(package)
    if '--commit' in sys.argv or '--verify' in sys.argv:
        if PRECISION != 'f64':
            raise ValueError('Only f64 is supplied to the game')
        if '--verify' in sys.argv:
            if (package / 'provenance.json').read_bytes() != (VENDOR / 'provenance.json').read_bytes():
                raise ValueError('Regenerated package differs from committed provenance')
        else:
            if VENDOR.exists():
                shutil.rmtree(VENDOR)
            shutil.copytree(package, VENDOR)


if __name__ == '__main__':
    main()
