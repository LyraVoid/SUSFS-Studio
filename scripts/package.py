import argparse
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re
import stat
import struct
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]


class EntryAssets(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        key = {"script": "src", "link": "href"}.get(tag)
        if key is not None:
            self.references.append(dict(attrs).get(key) or "")


def read_regular(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular file: {path}")
    return path.read_bytes()


def validate_cli(data: bytes) -> None:
    if (
        len(data) < 64
        or data[:7] != b"\x7fELF\x02\x01\x01"
        or struct.unpack_from("<HH", data, 16) != (3, 183)
    ):
        raise ValueError("Expected an AArch64 ELF64 position-independent executable")
    offset = struct.unpack_from("<Q", data, 32)[0]
    size, count = struct.unpack_from("<HH", data, 54)
    if size != 56 or offset < 64 or offset + size * count > len(data):
        raise ValueError("Invalid ELF program header table")
    for entry in range(offset, offset + size * count, size):
        if struct.unpack_from("<I", data, entry)[0] == 3:
            start = struct.unpack_from("<Q", data, entry + 8)[0]
            length = struct.unpack_from("<Q", data, entry + 32)[0]
            if data[start : start + length] == b"/system/bin/linker64\0":
                return
            break
    raise ValueError("Expected the Android 64-bit program interpreter")


def package(web: Path, cli: Path, output: Path) -> None:
    binary = read_regular(cli)
    validate_cli(binary)
    if web.is_symlink() or not web.is_dir():
        raise ValueError("Expected a WebUI build directory")
    if output.resolve().is_relative_to(web.resolve()) or output.resolve() == cli.resolve():
        raise ValueError("Output must not overlap the build inputs")
    paths = {}
    for path in web.rglob("*"):
        name = path.relative_to(web).as_posix()
        if name == "assets":
            if path.is_symlink() or not path.is_dir():
                raise ValueError("Expected a real assets directory")
            continue
        if name != "index.html" and not re.fullmatch(r"assets/[\w-]+\.(js|css)", name, re.ASCII):
            raise ValueError(f"Unexpected WebUI entry: {name}")
        paths[name] = read_regular(path)
    if "index.html" not in paths:
        raise ValueError("Missing WebUI entry point")
    html = EntryAssets()
    html.feed(paths["index.html"].decode())
    html.close()
    refs = html.references
    if not any(ref.endswith(".js") for ref in refs) or any(
        not ref.startswith("./assets/") or ref[2:] not in paths for ref in refs
    ):
        raise ValueError("WebUI entry point must reference existing relative assets")

    entries = {
        "module.prop": read_regular(ROOT / "module/module.prop"),
        "bin/studioctl": binary,
        **{f"webroot/{name}": data for name, data in paths.items()},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as file, ZipFile(file, "w") as archive:
        for name, data in sorted(entries.items()):
            entry = ZipInfo(name)
            entry.create_system = 3
            mode = 0o755 if name == "bin/studioctl" else 0o644
            entry.external_attr = (stat.S_IFREG | mode) << 16
            archive.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the arm64 diagnostic development ZIP")
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--cli", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        package(args.web, args.cli, args.output)
        print(f"{hashlib.sha256(args.output.read_bytes()).hexdigest()}  {args.output}")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Packaging failed: {error}\n")


if __name__ == "__main__":
    main()
