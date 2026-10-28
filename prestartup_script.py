import importlib.util
import re
from pathlib import Path
from importlib.metadata import distribution, PackageNotFoundError
import subprocess
import sys
import os
import folder_paths

USER_DATA_DIR = os.path.join(folder_paths.get_user_directory(), "DadosNodes")
os.makedirs(USER_DATA_DIR, exist_ok=True)

def is_package_installed(package_name):
    try:
        distribution(package_name)
        return True
    except PackageNotFoundError:
        return False

def install_package_if_missing(package_spec):
    package_spec = package_spec.split('#')[0].strip()
    match = re.match(r'^([a-zA-Z0-9\-_]+)', package_spec)
    if not match:
        return
    base_name = match.group(1)
    if is_package_installed(base_name):
        print(f"✅ {base_name} already installed.")
    else:
        print(f"⬇️ Installing {package_spec}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_spec])

def ensure_deepseek_api():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    api_dir = os.path.join(base_dir, "deepseek_api")
    if not os.path.exists(api_dir):
        print("DeepSeek-API not found. Cloning from GitHub...")
        try:
            subprocess.check_call([
                "git", "clone", "https://github.com/sums001/Deepseek-API.git", api_dir
            ])
            print("DeepSeek-API cloned successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to clone DeepSeek-API: {e}")
            return
    req_path = os.path.join(api_dir, "requirements.txt")
    if os.path.exists(req_path):
        print("Checking DeepSeek dependencies...")
        with open(req_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                install_package_if_missing(line)
    else:
        print("⚠️ requirements.txt not found in deepseek_api folder.")
    home = Path.home()
    playwright_cache = home / ".cache" / "ms-playwright"
    chromium_found = False
    if playwright_cache.exists():
        for item in playwright_cache.iterdir():
            if item.is_dir() and item.name.startswith("chromium-"):
                chromium_found = True
                break
    if chromium_found:
        print("✅ Playwright Chromium already installed.")
    else:
        print("⬇️ Installing Playwright Chromium browser...")
        try:
            subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
            print("Playwright Chromium installed.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install Playwright Chromium: {e}")

def ensure_py3pin():
    if importlib.util.find_spec("py3pin") is None:
        print("py3pin is not installed. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/GgAaYyAaNn/py3-pinterest.git"])
            print("py3pin installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install py3pin: {e}")
    else:
        print("✅ py3pin already installed.")

def ensure_dynamicprompts():
    if importlib.util.find_spec("dynamicprompts") is None:
        print("dynamicprompts is not installed. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/DadoIrie/dynamicprompts.git"])
            print("dynamicprompts installed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to install dynamicprompts: {e}")
    else:
        print("✅ dynamicprompts already installed.")


ensure_py3pin()
ensure_dynamicprompts()