import torch
from PIL import Image
from pathlib import Path
from huggingface_hub import snapshot_download
import torchvision.transforms.functional as TVF
from torchvision import transforms
from .joytagger import Models
from .. import constants

BASE_DIR = constants.BASE_DIR
THRESHOLD = 0.4

MODEL_DIR = Path(BASE_DIR) / "models" / "joytag"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

def download_joytag():
    print(f"Target directory for download: {MODEL_DIR}")
    
    path = snapshot_download(
        "fancyfeast/joytag",
        local_dir=MODEL_DIR,
        force_download=False,
        local_files_only=False,
        local_dir_use_symlinks="auto"
    )
    print(f"Model path: {path}")
    return path

def prepare_image(image: Image.Image, target_size: int) -> torch.Tensor:
    image_shape = image.size
    max_dim = max(image_shape)
    pad_left = (max_dim - image_shape[0]) // 2
    pad_top = (max_dim - image_shape[1]) // 2
    padded_image = Image.new('RGB', (max_dim, max_dim), (255, 255, 255))
    padded_image.paste(image, (pad_left, pad_top))
    
    if max_dim != target_size:
        padded_image = padded_image.resize((target_size, target_size), Image.Resampling.BICUBIC)
    
    image_tensor = TVF.pil_to_tensor(padded_image) / 255.0
    image_tensor = TVF.normalize(image_tensor, mean=[0.48145466, 0.4578275, 0.40821073], std=[0.26862954, 0.26130258, 0.27577711])
    return image_tensor

def process_tag(tag):
    tag = tag.replace("(medium)", "")
    tag = tag.replace("\\", "")
    tag = tag.replace("m/", "")
    tag = tag.replace("-", "")
    tag = tag.replace("_", " ")
    tag = tag.strip()
    return tag

class JoyTaggerNode:
    def __init__(self):
        self.model = None
        self.top_tags = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "tag_count": ("INT", {
                    "default": 50,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "display": "number"
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "generate_tags"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def generate_tags(self, image, tag_count):
        model_path = download_joytag()
        
        if self.model is None or self.top_tags is None:
            print("Loading JoyTagger model...")
            
            self.model = Models.VisionModel.load_model(Path(model_path), device=self.device)
            self.model.eval()
            
            with open(Path(model_path) / 'top_tags.txt', 'r') as f:
                self.top_tags = [line.strip() for line in f.readlines() if line.strip()]
            
            print("JoyTagger model loaded successfully")
        
        pil_image = transforms.ToPILImage()(image[0].permute(2, 0, 1))
        
        with torch.no_grad():
            image_tensor = prepare_image(pil_image, self.model.image_size)
            batch = {
                'image': image_tensor.unsqueeze(0).to(self.device),
            }
            
            with torch.amp.autocast_mode.autocast(self.device, enabled=True):
                preds = self.model(batch)
                tag_preds = preds['tags'].sigmoid().cpu()
            
            scores = {self.top_tags[i]: tag_preds[0][i] for i in range(len(self.top_tags))}
        
        top_tags_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:tag_count]
        top_tags_processed = [process_tag(tag) for tag, _ in top_tags_scores]
        top_tags_filtered = [tag for tag in top_tags_processed if tag]
        
        result = ', '.join(top_tags_filtered)
        
        return (result,)