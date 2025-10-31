import requests
import io
import torch
import numpy as np
from PIL import Image
import json
import os
from .. import constants
from .utils.utils import get_chutes_inputs, get_setting

class APIExecutionHandle:
    def __init__(self, call_func, *args, **kwargs):
        self.call_func = call_func
        self.args = args
        self.kwargs = kwargs

    def execute(self):
        return self.call_func(*self.args, **self.kwargs)

class DN_ChutesQwenImageNode:
    _INPUTS = get_chutes_inputs("qwen")
    _INPUT_DEFS = _INPUTS["input_defs"]
    _API_ENDPOINT = _INPUTS["endpoint"]

    _MODELS_CONFIG_PATH = os.path.join(constants.BASE_DIR, "configs", "chutes", "image_gen", "models.json")
    with open(_MODELS_CONFIG_PATH, 'r', encoding='utf-8') as f:
        _MODELS_CONFIG = json.load(f)
    _MODEL_KEY = list(_MODELS_CONFIG["qwen"].keys())[0]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": cls._INPUT_DEFS,
            "optional": {
                "parallel": ("BOOLEAN", {"default": False, "tooltip": "Enable parallel execution mode"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "CHUTES_IMG_PARALLEL")
    RETURN_NAMES = ("image", "parallel")
    FUNCTION = "generate_image"
    CATEGORY = "Dado's Nodes/Chutes"

    def _process_seed(self, seed):
        """Convert 64-bit ComfyUI seeds to 32-bit for Chutes API"""
        if seed == 0:
            return None
        return seed & 0xFFFFFFFF

    def _do_api_call(self, **kwargs):
        api_token = get_setting('dadosNodes.chutes_api_key')

        if not api_token:
            raise ValueError("Chutes API key needs to be set in the settings.")

        kwargs["seed"] = self._process_seed(kwargs.get("seed", 0))
        if "model" not in kwargs:
            kwargs["model"] = self._MODEL_KEY

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        body = kwargs

        response = requests.post(
            self._API_ENDPOINT,
            headers=headers,
            json=body,
            stream=True,
            timeout=3600
        )

        if response.status_code != 200:
            raise ValueError(f"API request failed with status code: {response.status_code}")

        image_bytes = response.content
        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        arr = np.array(pil_image).astype(np.float32) / 255.0
        tensor = torch.from_numpy(arr)
        return (tensor.unsqueeze(0),)

    def generate_image(self, **kwargs):
        parallel = kwargs.pop("parallel", False)
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(self._do_api_call, **kwargs)
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(**kwargs)
            return (result[0], None)
