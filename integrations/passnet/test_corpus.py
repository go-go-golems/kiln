import json
from pathlib import Path
import tempfile
import unittest
from corpus import FORMAT, read_manifest


class ManifestTests(unittest.TestCase):
    def read(self, records):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'manifest.json').write_text(json.dumps({'format': FORMAT, 'variants': records}))
            return read_manifest(path)

    def test_relative_identity_and_artifact(self):
        self.assertEqual(len(self.read([{'graph': 'graphs/a', 'script': '000.kiln.js'}])['variants']), 1)

    def test_duplicate_identity_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate graph'):
            self.read([{'graph': 'graphs/a', 'script': f'{i}.kiln.js'} for i in range(2)])

    def test_paths_cannot_escape(self):
        for graph, script in [('graphs/a', '../outside.kiln.js'), ('../outside', '000.kiln.js')]:
            with self.assertRaises(ValueError):
                self.read([{'graph': graph, 'script': script}])
