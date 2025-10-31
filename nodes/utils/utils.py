import os
from pathlib import Path
import json
import folder_paths
from ... import constants

def get_chutes_inputs(model_key):
    """Generate ComfyUI input definitions from Chutes model schemas"""
    config_path = os.path.join(constants.BASE_DIR, "configs", "chutes", "image_gen", "models.json")

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Models config not found at: {config_path}")
    with open(config_path, 'r', encoding='utf-8') as f:
        models_config = json.load(f)

    models = models_config.get(model_key)
    if not models:
        raise ValueError(f"No models found for key: {model_key}")
    
    first_model = next(iter(models.values()))

    schema_path = os.path.join(constants.BASE_DIR, "configs", "chutes", "image_gen", "schemas", first_model["schema_file"])

    if not os.path.exists(schema_path):
        raise FileNotFoundError(f"Schema file not found at: {schema_path}")
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_data = json.load(f)

    properties = schema_data["definitions"]["GenerationInput"]["properties"]

    preferred_order = {
        "prompt": "The text prompt describing what to generate",
        "negative_prompt": "Text describing what not to include in the output",
        "seed": "Random seed for reproducible results",
        "width": "Width of the output image in pixels",
        "height": "Height of the output image in pixels",
        "guidance_scale": "How strongly to follow the prompt",
        "true_cfg_scale": "How strongly to follow the prompt",
        "cfg": "How strongly to follow the prompt",
        "num_inference_steps": "Number of denoising steps"
    }

    input_defs = {}

    if len(models) > 1:
        input_defs["model"] = (list(models.keys()), {})

    for key in properties:
        if key not in preferred_order:
            raise ValueError(f"Unknown key '{key}' in schema")
    for key in preferred_order:
        if key in properties:
            input_defs[key] = _process_property(key, properties[key], preferred_order)

    if model_key in ["qwen"] and "true_cfg_scale" in input_defs:
        input_defs["guidance_scale"] = input_defs.pop("true_cfg_scale")

    result = {
        "input_defs": input_defs,
        "endpoint": first_model.get("endpoint")
    }
    return result

def _process_property(key, prop, preferred_order):
    """Convert schema property to ComfyUI input definition"""
    match key:
        case "prompt" | "negative_prompt":
            config = {
                "multiline": True,
                "tooltip": preferred_order[key]
            }
            return ("STRING", config)

        case "seed":
            integer_def = next(item for item in prop["anyOf"] if item["type"] == "integer")
            config = {
                "default": 0,
                "min": integer_def["minimum"],
                "max": integer_def["maximum"],
                "step": 1,
                "tooltip": preferred_order[key]
            }
            return ("INT", config)

        case "width" | "height":
            config = {
                "default": prop.get("default"),
                "min": prop.get("min", prop.get("minimum")),
                "max": prop.get("max", prop.get("maximum")),
                "step": 64,
                "tooltip": preferred_order[key]
            }
            return ("INT", config)

        case "num_inference_steps":
            config = {
                "default": prop.get("default"),
                "min": prop.get("min", prop.get("minimum")),
                "max": prop.get("max", prop.get("maximum")),
                "step": prop.get("step", 1),
                "tooltip": preferred_order[key]
            }
            return ("INT", config)

        case "guidance_scale" | "true_cfg_scale" | "cfg":
            config = {
                "default": prop.get("default"),
                "min": prop.get("min", prop.get("minimum")),
                "max": prop.get("max", prop.get("maximum")),
                "step": prop.get("step", 0.1),
                "tooltip": preferred_order[key]
            }
            return ("FLOAT", config)

def get_setting(setting_key):
    user_dir = folder_paths.get_user_directory()
    default_user = "default"  # TODO determine how to find the correct user - for now its 'default'
    settings_file = Path(user_dir) / default_user / "comfy.settings.json"
    if settings_file.exists():
        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = json.load(f)
            return settings.get(setting_key)
    return None
        