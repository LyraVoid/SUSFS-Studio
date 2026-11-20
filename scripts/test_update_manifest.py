from pathlib import Path
import json
from tempfile import TemporaryDirectory
import unittest

from update_manifest import render


MODULE_PROP = """\
id=susfs_studio
name=SUSFS Studio
version=0.1.0-beta.1
versionCode=1001
updateJson=https://raw.githubusercontent.com/LyraVoid/SUSFS-Studio/main/update.json
"""


class UpdateManifestTest(unittest.TestCase):
    def test_release_manifest(self):
        with TemporaryDirectory() as directory:
            module_prop = Path(directory) / "module.prop"
            module_prop.write_text(MODULE_PROP)
            data = json.loads(
                render(
                    module_prop,
                    "LyraVoid/SUSFS-Studio",
                    "0.1.0-beta.1",
                    1001,
                    "susfs-studio-0.1.0-beta.1-arm64.zip",
                )
            )
            self.assertEqual(
                data,
                {
                    "version": "0.1.0-beta.1",
                    "versionCode": 1001,
                    "zipUrl": "https://github.com/LyraVoid/SUSFS-Studio/releases/download/v0.1.0-beta.1/susfs-studio-0.1.0-beta.1-arm64.zip",
                    "changelog": "https://github.com/LyraVoid/SUSFS-Studio/releases/tag/v0.1.0-beta.1",
                },
            )

    def test_rejects_metadata_mismatch(self):
        with TemporaryDirectory() as directory:
            module_prop = Path(directory) / "module.prop"
            module_prop.write_text(MODULE_PROP)
            with self.assertRaisesRegex(ValueError, "version does not match"):
                render(module_prop, "LyraVoid/SUSFS-Studio", "0.1.0", 1001, "asset.zip")
            with self.assertRaisesRegex(ValueError, "versionCode does not match"):
                render(module_prop, "LyraVoid/SUSFS-Studio", "0.1.0-beta.1", 1002, "asset.zip")
            with self.assertRaisesRegex(ValueError, "repository"):
                render(module_prop, "../bad", "0.1.0-beta.1", 1001, "asset.zip")
            with self.assertRaisesRegex(ValueError, "asset"):
                render(module_prop, "LyraVoid/SUSFS-Studio", "0.1.0-beta.1", 1001, "../asset.zip")


if __name__ == "__main__":
    unittest.main()
