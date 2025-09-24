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
    logout()  # ! DEBUG purpose - remove on release
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
        self.character_ip_mapping = None
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
                    "tooltip": "Minimum confidence score for general tags to be included. Higher scores may result in fewer tags."
                }),
                "threshold_character": ("FLOAT", {
                    "default": 0.85,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01,
                    "tooltip": "Minimum confidence score for character tags to be included. Higher scores may result in fewer tags."
                }),
                "tags_count": ("INT", {
                    "default": 128,
                    "min": 1,
                    "max": 1000,
                    "step": 1,
                    "tooltip": "Maximum number of tags. Higher thresholds may result in fewer tags than this value."
                }),
                "underscore_separated": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Use underscores instead of spaces between words in tags."
                }),
                "percentage_scores": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Display scores as percentage (0-100%) instead of decimal (0.0-1.0)"
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("tags", "tags_with_scores", "tags_json_with_score")
    FUNCTION = "generate_tags"
    CATEGORY = "Dado's Nodes/VLM Nodes"

    def _format_tag(self, tag_name, score, include_scores, underscore_separated, percentage_scores=False):
        if not underscore_separated:
            tag_name = tag_name.replace("_", " ")
        
        if include_scores:
            if percentage_scores:
                return f"{tag_name}({score*100:.2f}%)"
            else:
                return f"{tag_name}({score})"
        return tag_name

    def generate_tags(self, image, threshold_general, threshold_character, tags_count, underscore_separated, percentage_scores):
        model_path = download_pixaitagger()
        
        if self.model is None or self.tag_map is None or self.character_ip_mapping is None:
            self.model = DN_PixAITaggerNode._get_shared_model(model_path, self.device)
            
            tags_file = Path(model_path) / 'tags_v0.9_13k.json'
            mapping_file = Path(model_path) / 'char_ip_map.json'

            with open(tags_file, 'r') as f:
                tag_info = json.load(f)
                self.tag_map = tag_info["tag_map"]
                self.gen_tag_count = tag_info["tag_split"]["gen_tag_count"]
                self.character_tag_count = tag_info["tag_split"]["character_tag_count"]
                # Invert the tag_map for efficient index-to-tag lookups
                self.index_to_tag_map = {v: k for k, v in self.tag_map.items()}

            with open(mapping_file, 'r') as f:
                self.character_ip_mapping = json.load(f)
        
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

            cur_gen_tags = []
            cur_char_tags = []
            
            for i in general_indices:
                idx = i.item()
                tag_name = self.index_to_tag_map[idx]
                if tag_name not in self.tags_to_exclude:
                    cur_gen_tags.append((tag_name, probs[idx].item()))
            
            for i in character_indices:
                idx = i.item()
                tag_name = self.index_to_tag_map[idx]
                if tag_name not in self.tags_to_exclude:
                    cur_char_tags.append((tag_name, probs[idx].item()))

            ip_tags_set = set()
            for tag_name, _ in cur_char_tags:
                if tag_name in self.character_ip_mapping:
                    ip_tags_set.update(self.character_ip_mapping[tag_name])
            ip_tags = sorted(list(ip_tags_set))

            cur_gen_tags.sort(key=lambda x: x[1], reverse=True)
            cur_char_tags.sort(key=lambda x: x[1], reverse=True)

            final_gen_tags = cur_gen_tags[:tags_count]
            final_char_tags = cur_char_tags[:tags_count]

            unified_tags_data = final_gen_tags + final_char_tags
            unified_tags_data.sort(key=lambda x: x[1], reverse=True)

            all_tags_str_list = []
            all_tags_with_scores_str_list = []
            
            json_output = {
                "general": {tag: score * 100 if percentage_scores else score for tag, score in final_gen_tags},
                "character": {tag: score * 100 if percentage_scores else score for tag, score in final_char_tags},
                "ip": ip_tags
            }

            for tag_name, score in unified_tags_data:
                all_tags_str_list.append(self._format_tag(tag_name, score, False, underscore_separated, percentage_scores))
                all_tags_with_scores_str_list.append(self._format_tag(tag_name, score, True, underscore_separated, percentage_scores))
            
            result_unified_tags = ', '.join(all_tags_str_list)
            result_unified_tags_with_scores = ', '.join(all_tags_with_scores_str_list)
            result_structured_json = json.dumps(json_output)

            return (result_unified_tags, result_unified_tags_with_scores, result_structured_json)

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
        
