import folder_paths
import os
import numpy as np
from PIL import Image
import re

class DN_PreviewImage:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "image": ("IMAGE", {"forceInput": True}),
                "mp4_path": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "preview"
    CATEGORY = "Dado's Nodes/Image"

    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory()
        self.type = "temp"

    def preview(self, image=None, mp4_path=None):
        if image is None and mp4_path is None:
            return {}

        if image is not None:
            # Process image tensor
            filename_prefix = "ComfyUI"
            full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(filename_prefix, self.output_dir)

            img_array = image.cpu().numpy()

            # Process first image in batch only
            batch_img = img_array[0]

            # Convert dtype if necessary
            if batch_img.dtype != np.uint8:
                batch_img = np.clip(255. * batch_img, 0, 255).astype(np.uint8)

            img = Image.fromarray(batch_img)

            file = f"{filename}_{counter:05}_.png"
            # Save image and return in ComfyUI's expected format
            file_path = os.path.join(full_output_folder, file)
            img.save(file_path)

            return {"ui": {
                "images": [{
                    "filename": file,
                    "subfolder": subfolder,
                    "type": self.type
                }]
            }}

        if mp4_path is not None and isinstance(mp4_path, str):
            # First try direct mp4 path
            if mp4_path.lower().endswith(".mp4"):
                video_path = mp4_path
            else:
                # Extract mp4 path from string representation if needed
                mp4_match = re.search(r'\"(.*?\.mp4)\"', mp4_path)
                if mp4_match:
                    video_path = mp4_match.group(1)
            
            # Return the video path in ComfyUI's expected format
            return {"ui": {
                "videos": [{
                    "filename": os.path.basename(video_path),
                    "subfolder": os.path.dirname(video_path),
                    "type": "temp"
                }]
            }}