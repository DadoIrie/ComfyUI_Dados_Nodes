import requests
import io
import json
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

class DN_ChutesHunyuanImage3Node:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFF, "step": 1, "tooltip": "Random seed for reproducible results. Set to 0 for random. 32-bit value is used directly by API."}),
                "width": ("INT", {"default": 512, "min": 256, "max": 2048, "step": 16, "tooltip": "Image width in pixels"}),
                "height": ("INT", {"default": 512, "min": 256, "max": 2048, "step": 16, "tooltip": "Image height in pixels"}),
                "steps": ("INT", {"default": 20, "min": 10, "max": 100, "step": 1}),
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
        """Handle 32-bit seed for Hunyuan Image 3 API"""
        if seed == 0:
            return None
        return int(seed)

    def _do_api_call(self, prompt, width, height, steps, seed):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        size = f"{width}x{height}"
        body = {
            "prompt": prompt,
            "seed": self._process_seed(seed),
            "size": size,
            "steps": steps
        }

        response = requests.post(
            "https://chutes-hunyuan-image-3.chutes.ai/generate",
            headers=headers,
            json=body
        )

        if response.status_code != 200:
            print(f"API request failed with status code {response.status_code}")
            print("Raw API error response content:")
            response_text = response.content.decode('utf-8')
            print(response_text)

            try:
                error_message = json.loads(
                    json.loads(response_text)['detail']
                    .replace("Invalid request: Invalid request: ", "", 1)
                )['detail']['message']
            except (json.JSONDecodeError, KeyError):
                outer_data = json.loads(response_text)
                error_message = outer_data['detail']
            
            print("Detailed API error message:")
            print(error_message)

            raise ValueError(f"API request failed with status code {response.status_code}. Details: {error_message}")

        image_bytes = response.content
        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")
        arr = np.array(pil_image).astype(np.float32) / 255.0
        tensor = torch.from_numpy(arr)
        return (tensor.unsqueeze(0),)

    def generate_image(self, prompt, width, height, steps, seed=0, parallel=False):
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(
                self._do_api_call,
                prompt, width, height, steps, seed
            )
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(prompt, width, height, steps, seed)
            return (result[0], None)