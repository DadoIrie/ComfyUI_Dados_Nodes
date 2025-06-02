import torch
from PIL import Image
from pathlib import Path
from huggingface_hub import snapshot_download
from transformers import AutoProcessor, AutoModelForVision2Seq, AutoModelForCausalLM
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

class SmolVLMNode:
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
    
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
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "describe_image"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def describe_image(self, image, prompt, max_tokens, model):
        model_path = download_smolvlm(model)
    
        if self.model is None or self.processor is None:
            print(f"Loading {model} model and processor...")
        
            self.processor = AutoProcessor.from_pretrained(model_path)
        
            if "SmolVLM2" in model:
                self.model = AutoModelForCausalLM.from_pretrained(model_path, trust_remote_code=True).to(self.device)
            else:
                self.model = AutoModelForVision2Seq.from_pretrained(model_path).to(self.device)
        
            print(f"{model} model loaded successfully")
    
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
        inputs = inputs.to(self.device)
    
        with torch.no_grad():
            generated_ids = self.model.generate(**inputs, max_new_tokens=max_tokens)
    
        generated_text = self.processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )[0]
    
        if "Assistant: " in generated_text:
            generated_text = generated_text.split("Assistant: ", 1)[1].strip()
    
        return (generated_text,)
