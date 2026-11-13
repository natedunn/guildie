"""Build the Windows helper with its own Python runtime; players need no Python."""
from pathlib import Path
import subprocess
import sys
import shutil
import importlib.metadata

if sys.platform != "win32":
    raise SystemExit("Build the capture helper on Windows (or use a Windows CI artifact).")
root = Path(__file__).resolve().parents[1] / "capture"
subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
                "--console", "--name", "GuildieCapture", "--collect-submodules", "mss",
                "--distpath", str(root / "dist"), "--workpath", str(root / "build"),
                "--specpath", str(root), str(root / "reader.py")], check=True)
licenses = root / "dist/GuildieCapture/licenses"
licenses.mkdir(parents=True, exist_ok=True)
for package in ("mss", "pyinstaller"):
    distribution = importlib.metadata.distribution(package)
    for file in distribution.files or []:
        if "license" in file.name.lower() or "copying" in file.name.lower():
            source = Path(distribution.locate_file(file))
            if source.is_file():
                shutil.copy2(source, licenses / (package + "-" + file.name))
python_license = Path(sys.base_prefix) / "LICENSE.txt"
if python_license.exists():
    shutil.copy2(python_license, licenses / "Python-LICENSE.txt")
