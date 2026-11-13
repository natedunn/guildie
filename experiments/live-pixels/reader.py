"""Compatibility entry point; the shipped reader lives with the desktop app."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps/desktop/capture"))
import importlib.util
spec = importlib.util.spec_from_file_location("guildie_capture", Path(__file__).resolve().parents[2] / "apps/desktop/capture/reader.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Assembler, decode, sample_values, main = module.Assembler, module.decode, module.sample_values, module.main

if __name__ == "__main__":
    main()
