import requests
import os
import folder_paths
import base64
import io
import json
import random
from PIL import Image
from .utils.utils import get_setting

class DN_ChutesImageToVideoNode:
    @classmethod
    def INPUT_TYPES(cls):
        resolution_options = ["480p", "720p"]
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Input image for video generation"}),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "static", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1}),
                "frames": ("INT", {"default": 81, "min": 21, "max": 140, "step": 1}),
                "fps": ("INT", {"default": 16, "min": 16, "max": 24, "step": 1}),
                "resolution": (resolution_options, {"default": "480p"}),
                "guidance_scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.1}),
            },
            "optional": {
                "fast": ("BOOLEAN", {"default": True}),
                "guidance_scale_2": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("video_path",)
    FUNCTION = "generate_video"
    CATEGORY = "Dado's Nodes/Chutes"

    def _process_seed(self, seed):
        """Convert 64-bit ComfyUI seeds to 32-bit for Chutes API"""
        if seed == 0:
            return None
        return seed & 0xFFFFFFFF

    def _image_to_base64(self, image_tensor):
        """Convert ComfyUI image tensor to base64 string"""
        arr = (image_tensor[0].cpu().numpy() * 255).clip(0, 255).astype('uint8')
        pil_image = Image.fromarray(arr)
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

    def generate_video(self, image, prompt, negative_prompt, seed, frames, fps, resolution, guidance_scale, fast=True, guidance_scale_2=None):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        image_b64 = self._image_to_base64(image)

        body = {
            "prompt": prompt,
            "image": image_b64,
            "negative_prompt": negative_prompt,
            "seed": self._process_seed(seed),
            "frames": frames,
            "fps": fps,
            "resolution": resolution,
            "guidance_scale": guidance_scale,
            "fast": fast
        }

        if guidance_scale_2 is not None:
            body["guidance_scale_2"] = guidance_scale_2

        response = requests.post(
            "https://chutes-wan-2-2-i2v-14b-fast.chutes.ai/generate",
            headers=headers,
            json=body,
            stream=False,
            timeout=3600
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

        # Save video content to ComfyUI temp directory
        temp_dir = folder_paths.get_temp_directory()
        video_filename = f"chutes_i2v_video_{hash(prompt + str(seed)) % 1000000}.mp4"
        video_path = os.path.join(temp_dir, video_filename)

        with open(video_path, 'wb') as f:
            f.write(response.content)

        return (video_path,)
    
    @classmethod
    def IS_CHANGED(cls, image, prompt, negative_prompt, seed, frames, fps, resolution, guidance_scale, fast=True, guidance_scale_2=None):
        return random.random()