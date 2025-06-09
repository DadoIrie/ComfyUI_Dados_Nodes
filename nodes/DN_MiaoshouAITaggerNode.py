import torch
from PIL import Image
from pathlib import Path
from huggingface_hub import snapshot_download
from transformers import AutoModelForCausalLM, AutoProcessor
from .. import constants

BASE_DIR = constants.BASE_DIR

MODEL_CONFIGS = {
    "v1.5": {
        "base": {"repo": "MiaoshouAI/Florence-2-base-PromptGen-v1.5"},
        "large": {"repo": "MiaoshouAI/Florence-2-large-PromptGen-v1.5"}
    },
    "v2.0": {
        "base": {"repo": "MiaoshouAI/Florence-2-base-PromptGen-v2.0"},
        "large": {"repo": "MiaoshouAI/Florence-2-large-PromptGen-v2.0"}
    }
}

MODEL_DIRS = {}
for version, sizes in MODEL_CONFIGS.items():
    for size, config in sizes.items():
        model_key = f"{version}-{size}"
        model_name = config["repo"].split("/")[1].lower()
        MODEL_DIRS[model_key] = Path(BASE_DIR) / "models" / model_name

for model_dir in MODEL_DIRS.values():
    model_dir.mkdir(parents=True, exist_ok=True)

def download_florence2(model_key):
    target_dir = MODEL_DIRS[model_key]
    
    version = model_key.split('-')[0]
    size = model_key.split('-')[1]
    
    repo_id = MODEL_CONFIGS[version][size]["repo"]
    
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

class DN_MiaoshouAITaggerNode:
    def __init__(self):
        self.model = None
        self.processor = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "instruction": ([
                    "GENERATE_TAGS",
                    "CAPTION", 
                    "DETAILED_CAPTION",
                    "MORE_DETAILED_CAPTION",
                    "MIXED_CAPTION"
                ], {}),
                "max_tokens": ("INT", {
                    "default": 1024,
                    "min": 10,
                    "max": 2000,
                    "display": "number"
                }),
                "version": (["v1.5", "v2.0"], {}),
                "size": (["base", "large"], {}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "generate_caption"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def generate_caption(self, image, instruction, max_tokens, version, size):
        model_key = f"{version}-{size}"
        model_path = download_florence2(model_key)
    
        if self.model is None or self.processor is None:
            print(f"Loading Florence-2 {size} {version} model and processor...")
        
            self.processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
            self.model = AutoModelForCausalLM.from_pretrained(model_path, trust_remote_code=True).to(self.device)
            print(f"Florence-2 {size} {version} model loaded successfully")
    
        pil_image = Image.fromarray((image[0] * 255).numpy().astype('uint8'))
    
        formatted_instruction = f"<{instruction}>"
        inputs = self.processor(text=formatted_instruction, images=pil_image, return_tensors="pt").to(self.device)
    
        with torch.no_grad():
            generated_ids = self.model.generate(
                input_ids=inputs["input_ids"],
                pixel_values=inputs["pixel_values"],
                max_new_tokens=max_tokens,
                do_sample=False,
                num_beams=3
            )
    
        generated_text = self.processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
        
        parsed_answer = self.processor.post_process_generation(
            generated_text, 
            task=formatted_instruction, 
            image_size=(pil_image.width, pil_image.height)
        )
        
        if isinstance(parsed_answer, dict):
            result_text = parsed_answer.get(formatted_instruction, str(parsed_answer))
        else:
            result_text = str(parsed_answer)

        result_text = result_text.replace("<pad>", "").strip()

        return (result_text,)