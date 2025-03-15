import os
import torch
from PIL import Image
import torch.amp.autocast_mode
from pathlib import Path
from huggingface_hub import snapshot_download
import folder_paths
import flash_attn
from transformers import AutoProcessor, AutoModelForVision2Seq
from .. import constants

BASE_DIR = constants.BASE_DIR

# Define directories for models
MODEL_DIRS = {
    "256M": Path(BASE_DIR) / "models" / "smolvlm-256M-instruct",
    "500M": Path(BASE_DIR) / "models" / "smolvlm-500M-instruct"
}

# Ensure directories exist
for model_dir in MODEL_DIRS.values():
    model_dir.mkdir(parents=True, exist_ok=True)

def download_smolvlm(model_size):
    """Download SmolVLM model if not already present"""
    model_name = f"SmolVLM-{model_size}-Instruct"
    target_dir = MODEL_DIRS[model_size]
    print(f"Target directory for download: {target_dir}")
    
    path = snapshot_download(
        f"HuggingFaceTB/{model_name}",
        local_dir=target_dir,
        force_download=False,
        local_files_only=False,
        local_dir_use_symlinks="auto",
        ignore_patterns=["**/onnx/**", "**/*.onnx"]  # Ignore ONNX files and directories
    )
    print(f"Model path: {path}")
    return path

class SmolVLMNode:
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"multiline": True, "default": "Can you describe this image?"}),
                "max_tokens": ("INT", {
                    "default": 500, 
                    "min": 10,
                    "max": 2000,
                    "step": 10,
                    "display": "number"
                }),
                "model_size": (["256M", "500M"], {}),  # Using COMBO for model size
                "precision": (["bfloat16", "float32"], {}),  # New combo for precision
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "describe_image"
    CATEGORY = "VLM Nodes/SmolVLM"

    def describe_image(self, image, prompt, max_tokens, model_size, precision):
        # Download model if not already downloaded
        model_path = download_smolvlm(model_size)
    
        # Load model and processor if not already loaded
        if self.model is None or self.processor is None:
            print(f"Loading SmolVLM {model_size} model and processor...")
        
            # Set the data type based on the precision input
            dtype = torch.float32 if precision == "float32" else torch.bfloat16
            print(f"Using data type: {dtype}")
        
            # Determine attention implementation
            attn_implementation = (
                "flash_attention_2" if self.device == "cuda" and precision != "float32" else "eager"
            )
            print(f"Attention implementation: {attn_implementation}")
        
            self.processor = AutoProcessor.from_pretrained(model_path)
            self.model = AutoModelForVision2Seq.from_pretrained(
                model_path,
                torch_dtype=dtype,
                _attn_implementation=attn_implementation,
            ).to(self.device)
            print(f"SmolVLM {model_size} model loaded successfully")
    
        # Convert ComfyUI image tensor to PIL Image
        pil_image = Image.fromarray((image[0] * 255).numpy().astype('uint8'))
    
        # Create input messages
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt}
                ]
            },
        ]
    
        # Prepare inputs
        prompt_template = self.processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self.processor(text=prompt_template, images=[pil_image], return_tensors="pt")
        inputs = inputs.to(self.device)
    
        # Generate outputs
        with torch.no_grad():
            generated_ids = self.model.generate(**inputs, max_new_tokens=max_tokens)
    
        generated_text = self.processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )[0]
    
        # Remove everything before and including "Assistant: "
        if "Assistant: " in generated_text:
            generated_text = generated_text.split("Assistant: ", 1)[1].strip()
    
        return (generated_text,)
