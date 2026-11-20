"""Build the capture helper with its own Python runtime; players need no Python.

Builds for the OS it runs on (Windows, macOS or Linux): capture/dist/GuildieCapture/
holds GuildieCapture(.exe) and its files. On macOS, set GUILDIE_CAPTURE_ARCH (for
example universal2, with a universal2 Python) to pick the architecture.
"""
from pathlib import Path
import os
import subprocess
import sys
import shutil
import importlib.metadata

if sys.platform not in ("win32", "darwin") and not sys.platform.startswith("linux"):
    raise SystemExit("Build the capture helper on Windows, macOS or Linux.")
root = Path(__file__).resolve().parents[1] / "capture"
options = ["--collect-submodules", "mss"]
packages = ["mss", "pyinstaller"]
if sys.platform == "darwin":
    options += ["--hidden-import", "Quartz"]
    if os.environ.get("GUILDIE_CAPTURE_ARCH"):
        options += ["--target-arch", os.environ["GUILDIE_CAPTURE_ARCH"]]
    packages += ["pyobjc-core", "pyobjc-framework-Cocoa", "pyobjc-framework-Quartz"]
elif sys.platform.startswith("linux"):
    # python-xlib loads its extension modules by name at connect time.
    options += ["--collect-submodules", "Xlib"]
    packages += ["python-xlib", "six"]
subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
                "--console", "--name", "GuildieCapture", *options,
                "--distpath", str(root / "dist"), "--workpath", str(root / "build"),
                "--specpath", str(root), str(root / "reader.py")], check=True)
output = root / "dist/GuildieCapture"
licenses = output / "licenses"
licenses.mkdir(parents=True, exist_ok=True)
for package in packages:
    distribution = importlib.metadata.distribution(package)
    copied = False
    for file in distribution.files or []:
        if ".dist-info" not in str(file):
            continue  # pyobjc ships test modules named "copying"
        if "license" in file.name.lower() or "copying" in file.name.lower():
            source = Path(distribution.locate_file(file))
            if source.is_file():
                shutil.copy2(source, licenses / (package + "-" + file.name))
                copied = True
    if not copied:
        # pyobjc-core has no license file in its wheel, only the metadata.
        metadata = distribution.metadata
        (licenses / (package + "-LICENSE.txt")).write_text(
            "%s %s\nLicense: %s\n%s\n" % (package, distribution.version,
                                           metadata.get("License-Expression") or metadata.get("License"),
                                           metadata.get("Home-page") or ""), encoding="utf-8")
for python_license in (Path(sys.base_prefix) / "LICENSE.txt",
                       Path(sys.base_prefix) / "lib" / ("python%d.%d" % sys.version_info[:2]) / "LICENSE.txt"):
    if python_license.exists():
        shutil.copy2(python_license, licenses / "Python-LICENSE.txt")
        break

if sys.platform == "darwin":
    # Apple Silicon only runs signed code. Ad-hoc sign every Mach-O file (a onedir
    # build is not a bundle, so --deep has nothing to follow); electron-builder
    # re-signs them inside Guildie.app when it signs the app.
    machos = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and not path.is_symlink():
            with path.open("rb") as file:
                magic = file.read(4)
            if magic in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca"):
                machos.append(path)
    # Libraries first, the executable last.
    executable = output / "GuildieCapture"
    machos.sort(key=lambda path: path == executable)
    for path in machos:
        subprocess.run(["codesign", "--force", "--sign", "-", str(path)], check=True)
    subprocess.run(["codesign", "--verify", "--strict", str(executable)], check=True)
