"""Verify Agent 1's integration base without concurrently edited, untracked lanes."""
from pathlib import Path
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[3]
evidence = root / "harness/evidence/feat-115"
owned = [
    "src/components/simulation/simulation-controller.ts",
    "src/components/simulation/simulation-gate.test.tsx",
    "src/components/simulation/walk-pacer.ts",
    "src/components/simulation/walk-pacer.test.ts",
    "src/components/simulation/staff-pacer.ts",
    "src/components/simulation/staff-pacer.test.ts",
] + [str(p.relative_to(root)).replace("\\", "/") for p in (root / "src/components/simulation/motion").glob("*.ts")]
base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root).decode().strip()
directory = Path(tempfile.mkdtemp(prefix="wangraan-feat115-"))
assert directory.parent.resolve() == Path(tempfile.gettempdir()).resolve()
results = {}
try:
    archive = subprocess.check_output(["git", "archive", "--format=zip", base], cwd=root)
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        source.extractall(directory)
    for name in owned + ["next-env.d.ts"]:
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, target)
    junction = directory / "node_modules"
    subprocess.run(["powershell", "-NoProfile", "-Command", "New-Item -ItemType Junction -Path '" + str(junction) + "' -Target '" + str(root / "node_modules") + "' | Out-Null"], check=True)
    for name, args in [("unit-tests", ["test"]), ("typecheck", ["run", "typecheck"]), ("lint", ["run", "lint"])]:
        result = subprocess.run(["npm.cmd", *args], cwd=directory, capture_output=True)
        output = result.stdout + result.stderr
        (evidence / ("owned-" + name + ".log")).write_bytes(output.rstrip() + b"\n")
        results[name] = result.returncode
        print(name, result.returncode, flush=True)
    report = {"base": base, "overlaid_files": owned, "checks": results,
              "scope": "Tracked Agent 1 integration base plus feat-115 only. Concurrent untracked food/clip lanes are excluded."}
    (evidence / "owned-snapshot-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
finally:
    if (directory / "node_modules").exists():
        os.rmdir(directory / "node_modules")
    assert directory.parent.resolve() == Path(tempfile.gettempdir()).resolve() and directory.name.startswith("wangraan-feat115-")
    shutil.rmtree(directory)
raise SystemExit(max(results.values(), default=1))
