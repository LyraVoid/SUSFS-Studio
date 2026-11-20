from pathlib import Path
import stat
import struct
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from package import package


class PackageTest(unittest.TestCase):
    def test_development_archive(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "web"
            (web / "assets").mkdir(parents=True)
            index = web / "index.html"
            index.write_text('<script src="./assets/index.js"></script>')
            (web / "assets/index.js").write_text("export {};")
            cli = root / "studioctl"
            elf = bytearray(120) + b"/system/bin/linker64\0"
            elf[:7] = b"\x7fELF\x02\x01\x01"
            struct.pack_into("<HH", elf, 16, 3, 183)
            struct.pack_into("<Q", elf, 32, 64)
            struct.pack_into("<HH", elf, 54, 56, 1)
            struct.pack_into("<I", elf, 64, 3)
            struct.pack_into("<Q", elf, 72, 120)
            struct.pack_into("<Q", elf, 96, len(elf) - 120)
            cli.write_bytes(elf)
            first = root / "first.zip"
            second = root / "second.zip"
            package(web, cli, first)
            package(web, cli, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with ZipFile(first) as archive:
                self.assertEqual(archive.namelist(), ["bin/studioctl", "customize.sh", "module.prop", "post-fs-data.sh", "service.sh", "webroot/assets/index.js", "webroot/index.html"])
                self.assertEqual(stat.S_IMODE(archive.getinfo("bin/studioctl").external_attr >> 16), 0o755)
                self.assertEqual(stat.S_IMODE(archive.getinfo("post-fs-data.sh").external_attr >> 16), 0o755)
                self.assertEqual(stat.S_IMODE(archive.getinfo("service.sh").external_attr >> 16), 0o755)
                self.assertIn(
                    "author=LyraVoid and matsuzaka-yuki",
                    archive.read("module.prop").decode("utf-8").splitlines(),
                )
            with self.assertRaises(FileExistsError):
                package(web, cli, first)
            index.write_text('<script src="https://example.invalid/app.js"></script>')
            with self.assertRaisesRegex(ValueError, "relative assets"):
                package(web, cli, root / "remote.zip")
            index.write_text('<script src="./assets/index.js"></script>')
            (web / "assets/index.js").unlink()
            (web / "assets").rmdir()
            (web / "assets").symlink_to(root, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "real assets directory"):
                package(web, cli, root / "symlink.zip")
            cli.write_bytes(b"wrong architecture")
            with self.assertRaisesRegex(ValueError, "AArch64"):
                package(web, cli, root / "invalid.zip")
