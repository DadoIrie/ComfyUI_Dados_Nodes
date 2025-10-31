import requests
import io
import torch
import numpy as np
from PIL import Image
from .utils.utils import get_setting

class APIExecutionHandle:
    def __init__(self, call_func, *args, **kwargs):
        self.call_func = call_func
        self.args = args
        self.kwargs = kwargs

    def execute(self):
        return self.call_func(*self.args, **self.kwargs)

class DN_ChutesChromaImageNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1, "tooltip": "Random seed for reproducible results. Set to 0 for random. Values >32-bit will be hashed down."}),
                "width": ("INT", {"default": 1024, "min": 200, "max": 2048, "step": 64}),
                "height": ("INT", {"default": 1024, "min": 200, "max": 2048, "step": 64}),
                "cfg": ("FLOAT", {"default": 4.5, "min": 1.0, "max": 7.5, "step": 0.1}),
                "steps": ("INT", {"default": 30, "min": 5, "max": 50, "step": 1}),
            },
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

    def _do_api_call(self, prompt, width, height, cfg, steps, seed, negative_prompt):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        body = {
            "model": "chroma",
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "guidance_scale": cfg,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
            "seed": self._process_seed(seed)
        }

        response = requests.post(
            "https://image.chutes.ai/generate",
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

    def generate_image(self, prompt, width, height, cfg, steps, seed=0, negative_prompt="", parallel=False):
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(
                self._do_api_call,
                prompt, width, height, cfg, steps, seed, negative_prompt
            )
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(prompt, width, height, cfg, steps, seed, negative_prompt)
            return (result[0], None)