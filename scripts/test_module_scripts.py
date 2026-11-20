from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ModuleScriptsTest(unittest.TestCase):
    def test_boot_scripts_gate_loading_and_use_studio_only(self):
        post_fs_data = (ROOT / "module/post-fs-data.sh").read_text()
        service = (ROOT / "module/service.sh").read_text()
        self.assertLess(
            post_fs_data.index('"$STUDIOCTL" boot-enabled'),
            post_fs_data.index("/data/adb/ksud insmod"),
        )
        self.assertIn('"status":"enabled"', post_fs_data)
        self.assertIn("/data/adb/ksu/lkm/susfs_guard_lkm/module.ko", post_fs_data)
        self.assertIn('boot pre-mount', post_fs_data)
        self.assertIn('boot late-pre-mount', post_fs_data)
        self.assertIn('boot post-mount', service)
        self.assertIn('boot late-load', service)
        combined = post_fs_data + service
        self.assertNotIn("ksud susfs", combined)
        self.assertNotIn("ksu_susfs", combined)


if __name__ == "__main__":
    unittest.main()
