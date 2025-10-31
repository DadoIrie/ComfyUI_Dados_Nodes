import requests
import torch
import numpy as np
from PIL import Image
import io
import base64
import json
import os
from .. import constants
from .utils.api_routes import register_operation_handler
from .utils.utils import get_setting
from aiohttp import web

class APIExecutionHandle:
    def __init__(self, call_func, *args, **kwargs):
        self.call_func = call_func
        self.args = args
        self.kwargs = kwargs

    def execute(self):
        return self.call_func(*self.args, **self.kwargs)

class DN_ChutesQwenImageEditNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Input image to edit"}),
                "prompt": ("STRING", {"default": "", "multiline": True, "tooltip": "Edit instructions"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1, "tooltip": "Random seed for reproducible results. Set to 0 for random. Values >32-bit will be hashed down."}),
                "width": ("INT", {"default": 1024, "min": 128, "max": 2048, "step": 64}),
                "height": ("INT", {"default": 1024, "min": 128, "max": 2048, "step": 64}),
                "cfg": ("FLOAT", {"default": 4.0, "min": 0.0, "max": 10.0, "step": 0.1}),
                "steps": ("INT", {"default": 40, "min": 5, "max": 100, "step": 1}),
            },
            "optional": {
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                "parallel": ("BOOLEAN", {"default": False, "tooltip": "Enable parallel execution mode"}),
            }
        }

    def _process_seed(self, seed):
        """Convert 64-bit ComfyUI seeds to 32-bit for Chutes API"""
        if seed == 0:
            return None
        return seed & 0xFFFFFFFF

    RETURN_TYPES = ("IMAGE", "CHUTES_IMG_PARALLEL")
    RETURN_NAMES = ("image", "parallel")
    FUNCTION = "edit_image"
    CATEGORY = "Dado's Nodes/Chutes"

    def _image_to_base64(self, image_tensor):
        """Convert ComfyUI image tensor to base64 string"""
        image = image_tensor.cpu().numpy()
        image = (image * 255).clip(0, 255).astype('uint8')
        pil_image = Image.fromarray(image)
        if pil_image.mode == 'I':
            pil_image = pil_image.point(lambda i: i * (1 / 255))

        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

    def _do_api_call(self, image, prompt, seed, width, height, cfg, steps, negative_prompt):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }

        image_b64s = [self._image_to_base64(image[i]) for i in range(image.shape[0])]

        print(f"Batch length: {len(image_b64s)}")

        body = {
            "seed": self._process_seed(seed),
            "width": width,
            "height": height,
            "prompt": prompt,
            "image_b64s": image_b64s,
            "true_cfg_scale": cfg,
            "negative_prompt": negative_prompt,
            "num_inference_steps": steps
        }

        response = requests.post(
            "https://chutes-qwen-image-edit-2509.chutes.ai/generate",
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

        # Response is JPEG image
        image_bytes = response.content
        pil_image = Image.open(io.BytesIO(image_bytes))

        # Convert to ComfyUI format
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        image_np = np.array(pil_image).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)
        return (image_tensor,)

    def edit_image(self, image, prompt, seed, width, height, cfg, steps, negative_prompt="", parallel=False):
        if parallel:
            # Return dummy + execution handle
            dummy = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            handle = APIExecutionHandle(
                self._do_api_call,
                image, prompt, seed, width, height, cfg, steps, negative_prompt
            )
            return (dummy, handle)
        else:
            # Normal execution
            result = self._do_api_call(image, prompt, seed, width, height, cfg, steps, negative_prompt)
            return (result[0], None)


QWEN_PROMPTS_FILE = os.path.join(constants.USER_DATA_DIR, "qwen_edit_prompts.json")


def get_qwen_edit_prompts():
    if not os.path.exists(QWEN_PROMPTS_FILE):
        return {}
    with open(QWEN_PROMPTS_FILE, 'r') as f:
        return json.load(f)


def save_qwen_edit_prompts(data):
    os.makedirs(os.path.dirname(QWEN_PROMPTS_FILE), exist_ok=True)
    with open(QWEN_PROMPTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f)


@register_operation_handler
async def handle_qwen_edit_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        if operation not in ['get_qwen_edit_prompt', 'store_qwen_edit_prompt', 'get_all_qwen_edit_prompts', 'delete_qwen_edit_prompt']:
            return None

        if operation == 'get_all_qwen_edit_prompts':
            prompts = get_qwen_edit_prompts()
            return web.json_response({"prompts": list(prompts.keys())})

        elif operation == 'store_qwen_edit_prompt':
            payload = data.get('payload', {})
            prompt_name = payload.get('prompt_name')
            if not prompt_name:
                return web.json_response({"status": "no_name"})

            prompts = get_qwen_edit_prompts()
            prompts[prompt_name] = {
                "cfg": payload.get('cfg'),
                "steps": payload.get('steps'),
                "seed": payload.get('seed'),
                "prompt": payload.get('prompt'),
                "negative_prompt": payload.get('negative_prompt')
            }
            save_qwen_edit_prompts(prompts)
            return web.json_response({"status": "saved"})

        elif operation == 'get_qwen_edit_prompt':
            payload = data.get('payload', {})
            prompt_name = payload.get('prompt_name')
            prompts = get_qwen_edit_prompts()
            if prompt_name in prompts:
                return web.json_response({"data": prompts[prompt_name]})
            return web.json_response({"error": "Prompt not found"}, status=404)

        elif operation == 'delete_qwen_edit_prompt':
            payload = data.get('payload', {})
            prompt_name = payload.get('prompt_name')
            prompts = get_qwen_edit_prompts()
            if prompt_name in prompts:
                del prompts[prompt_name]
                save_qwen_edit_prompts(prompts)
            return web.json_response({"prompts": list(prompts.keys())})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
