import argparse
import json
from pathlib import Path
import re

from package import VERSION, module_metadata


NAME = r"(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9_.-]*[A-Za-z0-9])"
REPOSITORY = re.compile(rf"^{NAME}/{NAME}$", re.ASCII)
ASSET = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$", re.ASCII)


def validate_version_code(value: int) -> None:
    if not 1 <= value <= 2_147_483_647:
        raise ValueError("versionCode is outside the supported range")


def render(
    module_prop: Path,
    repository: str,
    version: str,
    version_code: int,
    asset: str,
) -> bytes:
    metadata = module_metadata(module_prop)
    if not VERSION.fullmatch(version):
        raise ValueError("Invalid version")
    validate_version_code(version_code)
    if metadata["version"] != version:
        raise ValueError("module.prop version does not match the release version")
    if metadata["versionCode"] != str(version_code):
        raise ValueError("module.prop versionCode does not match the release versionCode")
    if not REPOSITORY.fullmatch(repository):
        raise ValueError("Invalid GitHub repository")
    if not ASSET.fullmatch(asset):
        raise ValueError("Invalid release asset name")
    tag = f"v{version}"
    data = {
        "version": version,
        "versionCode": version_code,
        "zipUrl": f"https://github.com/{repository}/releases/download/{tag}/{asset}",
        "changelog": f"https://github.com/{repository}/releases/tag/{tag}",
    }
    return (json.dumps(data, indent=2, ensure_ascii=True) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a KSU module update manifest")
    parser.add_argument("--module-prop", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        output = render(
            args.module_prop,
            args.repository,
            args.version,
            args.version_code,
            args.asset,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("xb") as file:
            file.write(output)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Update manifest failed: {error}\n")


if __name__ == "__main__":
    main()
