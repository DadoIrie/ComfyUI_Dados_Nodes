import requests
import os
import folder_paths
from .utils.utils import get_setting

class DN_ChutesTextToVideoNode:
    @classmethod
    def INPUT_TYPES(cls):
        resolution_options = ["1280*720", "720*1280", "832*480", "480*832", "1024*1024"]
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "static", "multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1}),
                "steps": ("INT", {"default": 25, "min": 10, "max": 30, "step": 1}),
                "frames": ("INT", {"default": 81, "min": 81, "max": 241, "step": 1}),
                "fps": ("INT", {"default": 24, "min": 16, "max": 60, "step": 1}),
                "resolution": (resolution_options, {"default": "832*480"}),
                "guidance_scale": ("FLOAT", {"default": 5.0, "min": 1.0, "max": 7.5, "step": 0.1}),
            },
            "optional": {
                "sample_shift": ("FLOAT", {"default": 1.0, "min": 1.0, "max": 7.0, "step": 0.1}),
                "single_frame": ("BOOLEAN", {"default": False}),
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

    def generate_video(self, prompt, negative_prompt, seed, steps, frames, fps, resolution, guidance_scale, sample_shift=None, single_frame=False):
        api_token = get_setting('dadosNodes.chutes_api_key')

        headers = {
            "Authorization": "Bearer " + api_token,
            "Content-Type": "application/json"
        }

        body = {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "seed": self._process_seed(seed),
            "steps": steps,
            "frames": frames,
            "fps": fps,
            "resolution": resolution,
            "guidance_scale": guidance_scale,
            "single_frame": single_frame
        }

        if sample_shift is not None:
            body["sample_shift"] = sample_shift

        response = requests.post(
            "https://chutes-wan2-1-14b.chutes.ai/text2video",
            headers=headers,
            json=body,
            stream=True,
            timeout=3600
        )

        if response.status_code != 200:
            raise ValueError(f"API request failed with status code: {response.status_code}")

        # Save video content to ComfyUI temp directory
        temp_dir = folder_paths.get_temp_directory()
        video_filename = f"chutes_video_{hash(prompt + str(seed)) % 1000000}.mp4"
        video_path = os.path.join(temp_dir, video_filename)

        with open(video_path, 'wb') as f:
            f.write(response.content)

        return (video_path,)