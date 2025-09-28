import importlib.util
import subprocess
import sys

def ensure_py3pin():
    if importlib.util.find_spec("py3pin") is None:
        print("py3pin is not installed. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/GgAaYyAaNn/py3-pinterest.git"])
            print("py3pin installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install py3pin: {e}")


ensure_py3pin()
