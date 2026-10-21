import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('rapier_build', Path(__file__).with_name('build.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class PinnedTreeTest(unittest.TestCase):
    def test_checkout_extras_cannot_replace_generated_loader(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'checkout'
            source.mkdir()
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=source, env=build.environment())
            git('init', '-q')
            for name, text in {'LICENSE': 'fixture license', 'src/lib.rs': 'pinned rust',
                               'src.ts/rapier.ts': 'pinned bindings', '.gitignore': 'ignored.rs\n'}.items():
                path = source / name
                path.parent.mkdir(exist_ok=True)
                path.write_text(text)
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                'commit', '-qm', 'fixture')
            revision = git('rev-parse', 'HEAD').decode().strip()
            (source / 'src.ts/rapier_wasm3d.ts').write_text('untracked loader replacement')
            (source / 'src/ignored.rs').write_text('ignored source')
            (source / 'src/lib.rs').write_text('modified checkout')
            stage = root / 'stage'
            stage.mkdir()
            (stage / 'stale.ts').write_text('previous run')
            with patch.dict(os.environ, {'GIT_DIR': '/nonexistent', 'GIT_WORK_TREE': '/nonexistent'}):
                build.materialize(source, stage, revision)
            self.assertEqual((stage / 'src/lib.rs').read_text(), 'pinned rust')
            self.assertEqual((stage / 'src.ts/rapier.ts').read_text(), 'pinned bindings')
            self.assertFalse((stage / 'src.ts/rapier_wasm3d.ts').exists())
            self.assertFalse((stage / 'src/ignored.rs').exists())
            self.assertFalse((stage / 'stale.ts').exists())


if __name__ == '__main__':
    unittest.main()
