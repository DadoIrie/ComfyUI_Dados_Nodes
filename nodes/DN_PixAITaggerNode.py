import torch
from PIL import Image
from pathlib import Path
from huggingface_hub import snapshot_download, login, logout
from torchvision import transforms
import timm
import json
from aiohttp import web
from .. import constants
from .utils.api_routes import register_operation_handler

BASE_DIR = constants.BASE_DIR

MODEL_DIR = Path(BASE_DIR) / "models" / "pixaitagger"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

class TaggingHead(torch.nn.Module):
    def __init__(self, input_dim, num_classes):
        super().__init__()
        self.input_dim = input_dim
        self.num_classes = num_classes
        self.head = torch.nn.Sequential(torch.nn.Linear(input_dim, num_classes))

    def forward(self, x):
        logits = self.head(x)
        probs = torch.nn.functional.sigmoid(logits)
        return probs

def get_encoder():
    base_model_repo = "hf_hub:SmilingWolf/wd-eva02-large-tagger-v3"
    encoder = timm.create_model(base_model_repo, pretrained=False)
    encoder.reset_classifier(0)
    return encoder

def get_decoder():
    decoder = TaggingHead(1024, 13461)
    return decoder

def get_model():
    encoder = get_encoder()
    decoder = get_decoder()
    model = torch.nn.Sequential(encoder, decoder)
    return model

def download_pixaitagger():
    logout()
    if DN_PixAITaggerNode._hf_token:
        login(DN_PixAITaggerNode._hf_token)
    else:
        raise ValueError("Hugging Face access token needs to be set in the settings for PixAI Tagger.")
    
    path = snapshot_download(
        "pixai-labs/pixai-tagger-v0.9",
        local_dir=MODEL_DIR,
        force_download=False,
        local_files_only=False,
        local_dir_use_symlinks="auto"
    )
    return path

def pure_pil_alpha_to_color_v2(
    image: Image.Image, color: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    image.load()
    background = Image.new("RGB", image.size, color)
    background.paste(image, mask=image.split()[3])
    return background


def pil_to_rgb(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        image = pure_pil_alpha_to_color_v2(image)
    elif image.mode == "P":
        image = pure_pil_alpha_to_color_v2(image.convert("RGBA"))
    else:
        image = image.convert("RGB")
    return image

class DN_PixAITaggerNode:
    _shared_model = None
    _hf_token = None

    @classmethod
    def set_hf_token(cls, token):
        cls._hf_token = token if token else None

    @classmethod
    def _get_shared_model(cls, model_path, device):
        if cls._shared_model is None:
            cls._shared_model = get_model()
            states_dict = torch.load(Path(model_path) / "model_v0.9.pth", map_location=device, weights_only=True)
            cls._shared_model.load_state_dict(states_dict)
            cls._shared_model.to(device)
            cls._shared_model.eval()
        return cls._shared_model

    def __init__(self):
        self.model = None
        self.tag_map = None
        self.index_to_tag_map = None
        self.gen_tag_count = 0
        self.character_tag_count = 0
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.transform = transforms.Compose(
            [
                transforms.Resize((448, 448)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
            ]
        )
        self.tags_to_exclude = {"web_address", "patreon_username", "gumroad_username", "artist_name"}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "threshold_general": ("FLOAT", {
                    "default": 0.30,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                }),
                "threshold_character": ("FLOAT", {
                    "default": 0.75,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                }),
                "tokens_general": ("INT", {
                    "default": 128,
                    "min": 1,
                    "max": 1000,
                    "step": 1,
                }),
                "tokens_character": ("INT", {
                    "default": 128,
                    "min": 1,
                    "max": 1000,
                    "step": 1,
                }),
                "include_scores": ("BOOLEAN", {
                    "default": False,
                }),
                "underscore_separated": ("BOOLEAN", {
                    "default": True,
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "generate_tags"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def _format_tag(self, tag_name, score, include_scores, underscore_separated):
        if not underscore_separated:
            tag_name = tag_name.replace("_", " ")
        
        if include_scores:
            return f"{tag_name}({score:.2f})"
        return tag_name

    def generate_tags(self, image, threshold_general, threshold_character, tokens_general, tokens_character, include_scores, underscore_separated):
        model_path = download_pixaitagger()
        
        if self.model is None or self.tag_map is None:
            self.model = DN_PixAITaggerNode._get_shared_model(model_path, self.device)
            with open(Path(model_path) / 'tags_v0.9_13k.json', 'r') as f:
                tag_info = json.load(f)
                self.tag_map = tag_info["tag_map"]
                self.gen_tag_count = tag_info["tag_split"]["gen_tag_count"]
                self.character_tag_count = tag_info["tag_split"]["character_tag_count"]
                self.index_to_tag_map = {i: tag for i, tag in enumerate(self.tag_map.keys())}
        
        pil_image = Image.fromarray((image[0].cpu().numpy() * 255).astype('uint8'))
        
        pil_image = pil_to_rgb(pil_image)
        image_tensor = self.transform(pil_image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            with torch.amp.autocast_mode.autocast(self.device, enabled=True):
                probs = self.model.forward(image_tensor)[0]
            general_mask = probs[: self.gen_tag_count] > threshold_general
            character_mask = probs[self.gen_tag_count:] > threshold_character

            general_indices = general_mask.nonzero(as_tuple=True)[0]
            character_indices = (
                character_mask.nonzero(as_tuple=True)[0] + self.gen_tag_count
            )

            general_tags = []
            character_tags = []

            processed_general_tags_count = 0
            for i in general_indices:
                idx = i.item()
                tag_name = self.index_to_tag_map[idx]
                
                if tag_name in self.tags_to_exclude:
                    continue

                score = probs[idx].item()
                if processed_general_tags_count < tokens_general:
                    general_tags.append(self._format_tag(tag_name, score, include_scores, underscore_separated))
                    processed_general_tags_count += 1

            processed_character_tags_count = 0
            for i in character_indices:
                idx = i.item()
                tag_name = self.index_to_tag_map[idx]
                
                if tag_name in self.tags_to_exclude:
                    continue

                score = probs[idx].item()
                if processed_character_tags_count < tokens_character:
                    character_tags.append(self._format_tag(tag_name, score, include_scores, underscore_separated))
                    processed_character_tags_count += 1
            
            all_tags = general_tags + character_tags
            result = ', '.join(all_tags)
            return (result,)

@register_operation_handler
async def handle_pixai_tagger_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')

        valid_operations = ['set_hf_token']
        
        if operation not in valid_operations:
            return None

        if operation == 'set_hf_token':
            payload = data.get('payload', {})
            hf_token = payload.get('hf_token', '')
            DN_PixAITaggerNode.set_hf_token(hf_token)
            return web.json_response({
                "status": "success",
                "message": "Hugging Face token updated."
            })

    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )
        
