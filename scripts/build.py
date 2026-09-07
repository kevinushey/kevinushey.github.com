#!/usr/bin/env python3
"""Stage the existing static website for hosting without a bundler."""

from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
output = root / "dist"
if output.exists():
    shutil.rmtree(output)
output.mkdir()
shutil.copy2(root / "index.html", output / "index.html")

# Keep the existing public asset and experiment URLs available.
for name in ("css", "img", "js", "bootstrap", "FontAwesome", "claude-experiments"):
    shutil.copytree(root / name, output / name)

print(f"Static website built in {output}")
