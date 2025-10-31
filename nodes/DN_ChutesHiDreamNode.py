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

class DN_ChutesHiDreamNode:
    @classmethod
    def INPUT_TYPES(cls):
        resolution_options = [
            "1024x1024", 
            "768x1360", 
            "1360x768", 
            "880x1168",
            "1168x880", 
            "1248x832", 
            "832x1248"
        ]
        
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1, "tooltip": "Random seed for reproducible results. Set to 0 for random. Values >32-bit will be hashed down."}),
                "resolution": (resolution_options, {"default": "1024x1024"}),
                "guidance_scale": ("FLOAT", {"default": 5.0, "min": 0, "max": 10.0, "step": 0.1}),
                "num_inference_steps": ("INT", {"default": 50, "min": 5, "max": 75, "step": 1}),
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
        return seed % 100000000

    def _do_api_call(self, prompt, resolution, guidance_scale, num_inference_steps, seed):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        body = {
            "prompt": prompt,
            "resolution": resolution,
            "guidance_scale": guidance_scale,
            "num_inference_steps": num_inference_steps,
            "seed": self._process_seed(seed)
        }

        response = requests.post(
            "https://chutes-hidream.chutes.ai/generate",
            headers=headers,
            json=body
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

    def generate_image(self, prompt, resolution, guidance_scale, num_inference_steps, seed=0, parallel=False):
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(
                self._do_api_call,
                prompt, resolution, guidance_scale, num_inference_steps, seed
            )
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(prompt, resolution, guidance_scale, num_inference_steps, seed)
            return (result[0], None)