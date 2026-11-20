import argparse
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re
import stat
import struct
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$", re.ASCII)
UPDATE_URL = re.compile(r"^https://[^\s]+$", re.ASCII)


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


def module_metadata(path: Path) -> dict[str, str]:
    text = read_regular(path).decode("utf-8")
    values = {}
    for number, line in enumerate(text.splitlines(), 1):
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key or key in values:
            raise ValueError(f"Invalid module.prop line {number}")
        values[key] = value
    for key in ("id", "name", "version", "versionCode"):
        if not values.get(key):
            raise ValueError(f"Missing module.prop field: {key}")
    return values


def module_prop(
    path: Path,
    *,
    version: str | None = None,
    version_code: int | None = None,
    version_suffix: str | None = None,
    update_json: str | None = None,
) -> bytes:
    values = module_metadata(path)
    if version is not None and version_suffix is not None:
        raise ValueError("--version and --version-suffix cannot be combined")
    if version is not None:
        values["version"] = version
    elif version_suffix is not None:
        values["version"] = values["version"] + version_suffix
    if not VERSION.fullmatch(values["version"]):
        raise ValueError("Invalid module version")
    if version_code is not None:
        values["versionCode"] = str(version_code)
    try:
        code = int(values["versionCode"], 10)
    except ValueError as error:
        raise ValueError("versionCode must be a decimal integer") from error
    if not 1 <= code <= 2_147_483_647:
        raise ValueError("versionCode is outside the supported range")
    if update_json is not None:
        if not UPDATE_URL.fullmatch(update_json):
            raise ValueError("updateJson must be an HTTPS URL without whitespace")
        values["updateJson"] = update_json

    lines = read_regular(path).decode("utf-8").splitlines()
    rendered = []
    seen = set()
    for line in lines:
        key, separator, _ = line.partition("=")
        if separator and key in values:
            rendered.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            rendered.append(line)
    for key, value in values.items():
        if key not in seen:
            rendered.append(f"{key}={value}")
    return ("\n".join(rendered) + "\n").encode()


def package(
    web: Path,
    cli: Path,
    output: Path,
    *,
    version: str | None = None,
    version_code: int | None = None,
    version_suffix: str | None = None,
    update_json: str | None = None,
) -> None:
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
        "module.prop": module_prop(
            ROOT / "module/module.prop",
            version=version,
            version_code=version_code,
            version_suffix=version_suffix,
            update_json=update_json,
        ),
        "banner.webp": read_regular(ROOT / "module/banner.webp"),
        "customize.sh": read_regular(ROOT / "module/customize.sh"),
        "post-fs-data.sh": read_regular(ROOT / "module/post-fs-data.sh"),
        "service.sh": read_regular(ROOT / "module/service.sh"),
        "bin/studioctl": binary,
        "LICENSE": read_regular(ROOT / "LICENSE"),
        "THIRD_PARTY_NOTICES.md": read_regular(ROOT / "THIRD_PARTY_NOTICES.md"),
        **{
            f"LICENSES/{path.name}": read_regular(path)
            for path in sorted((ROOT / "LICENSES").glob("*.txt"))
        },
        **{f"webroot/{name}": data for name, data in paths.items()},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as file, ZipFile(file, "w") as archive:
        for name, data in sorted(entries.items()):
            entry = ZipInfo(name)
            entry.create_system = 3
            mode = (
                0o755
                if name in {"bin/studioctl", "post-fs-data.sh", "service.sh"}
                else 0o644
            )
            entry.external_attr = (stat.S_IFREG | mode) << 16
            archive.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the arm64 module ZIP")
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--cli", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version")
    parser.add_argument("--version-code", type=int)
    parser.add_argument("--version-suffix")
    parser.add_argument("--update-json")
    args = parser.parse_args()
    try:
        package(
            args.web,
            args.cli,
            args.output,
            version=args.version,
            version_code=args.version_code,
            version_suffix=args.version_suffix,
            update_json=args.update_json,
        )
        print(f"{hashlib.sha256(args.output.read_bytes()).hexdigest()}  {args.output}")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Packaging failed: {error}\n")


if __name__ == "__main__":
    main()
