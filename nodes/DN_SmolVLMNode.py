import torch
from PIL import Image
from pathlib import Path
from huggingface_hub import snapshot_download
from transformers import AutoProcessor, AutoModelForVision2Seq, AutoModelForImageTextToText
from .. import constants

BASE_DIR = constants.BASE_DIR

MODEL_CONFIGS = {
    "256M": [
        {"name": "SmolVLM-256M-Instruct", "repo": "HuggingFaceTB/SmolVLM-256M-Instruct"},
        {"name": "SmolVLM2-256M-Video-Instruct", "repo": "HuggingFaceTB/SmolVLM2-256M-Video-Instruct"}
    ],
    "500M": [
        {"name": "SmolVLM-500M-Instruct", "repo": "HuggingFaceTB/SmolVLM-500M-Instruct"},
        {"name": "SmolVLM2-500M-Video-Instruct", "repo": "HuggingFaceTB/SmolVLM2-500M-Video-Instruct"}
    ]
}

MODEL_DIRS = {}
for size, models in MODEL_CONFIGS.items():
    for model in models:
        model_key = f"{size}-{model['name'].split('-')[0]}"
        MODEL_DIRS[model_key] = Path(BASE_DIR) / "models" / model['name'].lower()

for model_dir in MODEL_DIRS.values():
    model_dir.mkdir(parents=True, exist_ok=True)

def download_smolvlm(model_key):
    target_dir = MODEL_DIRS[model_key]
    
    size = model_key.split('-')[0]
    model_type = model_key.split('-')[1]
    
    for model in MODEL_CONFIGS[size]:
        if model['name'].startswith(model_type):
            repo_id = model['repo']
            break
    
    print(f"Target directory for download: {target_dir}")
    
    path = snapshot_download(
        repo_id,
        local_dir=target_dir,
        force_download=False,
        local_files_only=False,
        local_dir_use_symlinks="auto",
        ignore_patterns=["**/onnx/**", "**/*.onnx"]
    )
    print(f"Model path: {path}")
    return path

class DN_SmolVLMNode:
    def __init__(self):
        self.model = None
        self.processor = None
        self.current_device = None  # Track the currently loaded device
        self.current_model_key = None
    
    @classmethod
    def INPUT_TYPES(cls):
        model_options = list(MODEL_DIRS.keys())
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"multiline": True, "default": "Describe the image in great detail"}),
                "max_tokens": ("INT", {
                    "default": 500,
                    "min": 10,
                    "max": 2000,
                    "display": "number"
                }),
                "model": (model_options, {}),
                "use_cpu": ("BOOLEAN", {"default": False, "tooltip": "If true, unload the model from GPU and use CPU instead."}),
                "keep_loaded": ("BOOLEAN", {"default": False, "tooltip": "If false, unload the model from memory after use."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "describe_image"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def describe_image(self, image, prompt, max_tokens, model, use_cpu, keep_loaded):
        model_path = download_smolvlm(model)

        target_device = "cpu" if use_cpu else ("cuda" if torch.cuda.is_available() else "cpu")

        if model != self.current_model_key or self.current_device != target_device:
            print(f"Switching to {model} model and processor on {target_device}...")
            # Clear previous model and processor to free up memory
            if self.model is not None:
                print(f"Unloading previous model from {self.current_device}...")
                self.model.cpu()
                del self.model
            if self.processor is not None:
                del self.processor
            self.model = None
            self.processor = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            self.processor = AutoProcessor.from_pretrained(model_path)

            if "SmolVLM2" in model:
                self.model = AutoModelForImageTextToText.from_pretrained(model_path, trust_remote_code=True).to(target_device)
            else:
                self.model = AutoModelForVision2Seq.from_pretrained(model_path).to(target_device)

            self.current_model_key = model
            self.current_device = target_device
            print(f"{model} model loaded successfully on {target_device}")

        pil_image = Image.fromarray((image[0] * 255).numpy().astype('uint8'))

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt}
                ]
            },
        ]

        prompt_template = self.processor.apply_chat_template(messages, add_generation_prompt=True)
        inputs = self.processor(text=prompt_template, images=[pil_image], return_tensors="pt")
        inputs = inputs.to(target_device)

        with torch.no_grad():
            generated_ids = self.model.generate(**inputs, max_new_tokens=max_tokens)

        generated_text = self.processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )[0]

        if "Assistant: " in generated_text:
            generated_text = generated_text.split("Assistant: ", 1)[1].strip()

        result = (generated_text,)

        if not keep_loaded:
            print(f"Unloading SmolVLM model from {self.current_device} after use.")
            if self.model is not None:
                self.model.cpu()
                del self.model
                self.model = None
            if self.processor is not None:
                del self.processor
                self.processor = None
            self.current_device = None
            self.current_model_key = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        return result
