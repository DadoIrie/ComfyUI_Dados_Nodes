import folder_paths
import os
import numpy as np
from PIL import Image

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

        if mp4_path is not None and isinstance(mp4_path, str) and mp4_path.lower().endswith(".mp4"):
            # If it's an MP4 path, return it directly
            subfolder_path = os.path.dirname(mp4_path)
            comfyui_index = subfolder_path.find("ComfyUI/")
            after_comfyui = subfolder_path[comfyui_index + 8:]
            type_value = after_comfyui.split('/')[0]
            return {"ui": {
                "videos": [{
                    "filename": os.path.basename(mp4_path),
                    "subfolder": subfolder_path,
                    "type": type_value
                }]
            }}