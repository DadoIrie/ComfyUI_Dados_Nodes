import requests
import io
import torch
import numpy as np
from PIL import Image
from .utils.utils import get_chutes_inputs, get_setting

class APIExecutionHandle:
    def __init__(self, call_func, *args, **kwargs):
        self.call_func = call_func
        self.args = args
        self.kwargs = kwargs

    def execute(self):
        return self.call_func(*self.args, **self.kwargs)

class DN_ChutesFluxImageNode:
    _INPUTS = get_chutes_inputs("flux")
    _INPUT_DEFS = _INPUTS["input_defs"]
    _API_ENDPOINT = _INPUTS["endpoint"]
    
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
        # Get API token from settings
        api_token = get_setting('dadosNodes.chutes_api_key')

        if not api_token:
            raise ValueError("Chutes API key needs to be set in the settings.")

        kwargs["seed"] = self._process_seed(kwargs.get("seed", 0))

        model = kwargs.get("model")
        num_inference_steps = kwargs["num_inference_steps"]
        num_inference_steps = num_inference_steps if model != "FLUX.1-dev" else min(num_inference_steps, 30)
        kwargs["num_inference_steps"] = num_inference_steps

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