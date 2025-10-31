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

class DN_ChutesNetaLuminaNode:
    @classmethod
    def INPUT_TYPES(cls):
        sampler_options = ["res_multistep", "euler_ancestral"]

        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "blurry, worst quality, low quality", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1, "tooltip": "Random seed for reproducible results. Set to 0 for random. Values >32-bit will be hashed down."}),
                "cfg_scale": ("FLOAT", {"default": 4.5, "min": 4.0, "max": 5.5, "step": 0.1}),
                "width": ("INT", {"default": 1024, "min": 768, "max": 2048, "step": 64}),
                "height": ("INT", {"default": 1024, "min": 768, "max": 2048, "step": 64}),
                "steps": ("INT", {"default": 30, "min": 20, "max": 50, "step": 1}),
                "sampler": (sampler_options, {"default": "res_multistep"}),
                "scheduler": ("STRING", {"default": "linear_quadratic"}),
            },
            "optional": {
                "parallel": ("BOOLEAN", {"default": False, "tooltip": "Enable parallel execution mode"}),
            }
        }

    RETURN_TYPES = ("IMAGE", "CHUTES_IMG_PARALLEL")
    RETURN_NAMES = ("image", "parallel")
    FUNCTION = "generate_image"
    CATEGORY = "Dado's Nodes/Chutes"

    def _do_api_call(self, prompt, negative_prompt, cfg_scale, width, height, steps, seed, sampler, scheduler):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        body = {
            "model": "neta-lumina",
            "input_args": {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "cfg": cfg_scale,
                "width": width,
                "height": height,
                "steps": steps,
                "seed": seed,
                "sampler": sampler,
                "scheduler": scheduler
            }
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

    def generate_image(self, prompt, negative_prompt, cfg_scale, width, height, steps, seed, sampler, scheduler, parallel=False):
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(
                self._do_api_call,
                prompt, negative_prompt, cfg_scale, width, height, steps, seed, sampler, scheduler
            )
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(prompt, negative_prompt, cfg_scale, width, height, steps, seed, sampler, scheduler)
            return (result[0], None)