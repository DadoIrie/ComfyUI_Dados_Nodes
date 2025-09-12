"""
@title: Wildcard Selector/Composer V2
@author: Dado
@description: Processes and catalogs sections and wildcards, mapping their structure and relationships for UI representation.
"""
import json
import os
import folder_paths
from typing import Dict, Any, ClassVar
from aiohttp import web
from dynamicprompts.generators import RandomPromptGenerator
from .utils.api_routes import register_operation_handler
from .wildcardselector.structure_utils import WildcardStructureCreation

class DN_WildcardSelectorComposerV2:
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "wildcards_prompt": ("STRING", {"multiline": True}),
                "wildcards_structure_data": ("STRING", {"multiline": True}),
                "seed": ("INT", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("STRING",) * 3
    RETURN_NAMES = ("clean_prompt", "marked_prompt", "processed_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text & Prompt"

    def process_prompt(self, unique_id, seed=None, wildcards_prompt="", wildcards_structure_data=""):
        marked_prompt = ""
        processed_prompt = ""

        process_wildcards = self.node_state.get(unique_id, {}).get("process_wildcards", False)

        if process_wildcards and wildcards_prompt:
            generator = RandomPromptGenerator()
            processed_prompt = generator.generate(wildcards_prompt)[0]

        return (wildcards_prompt, marked_prompt, processed_prompt)
    
    # ! IS_CHANGED is missing with a random number generator in order to call this node again even if the input prompt is the same 
    
    @classmethod
    def update_wildcards_prompt(cls, node_id: str, content: str, old_structure_json: str = "") -> str:
        cls.node_state[node_id]['wildcards_prompt'] = content

        structure_data = ""
        if content:
            creator = WildcardStructureCreation()
            new_structure = creator.create_json_structure(content)
            try:
                old_structure = json.loads(old_structure_json) if old_structure_json else {}
                creator.merge_selected(old_structure, new_structure)
            except Exception:
                pass  # If merging fails, just use new_structure
            structure_data = creator.generate_structure_data(new_structure)
        else:
            structure_data = "{}"
        return structure_data


@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        node_id = str(data.get('id', ''))

        valid_operations = [
            'update_wildcards_prompt', 'process_wildcards'
        ]
        
        # Log ComfyUI user folder paths
        try:
            user_dir_abs = folder_paths.get_user_directory()
            user_dir_rel = os.path.relpath(user_dir_abs)
            current_dir = os.getcwd()
            
            print(f"ComfyUI User Directory - Absolute: {user_dir_abs}")
            print(f"ComfyUI User Directory - Relative: {user_dir_rel} (relative to: {current_dir})")
        except Exception as e:
            print(f"Failed to get ComfyUI user directory: {str(e)}")
        
        if operation not in valid_operations:
            return None

        if node_id not in DN_WildcardSelectorComposerV2.node_state:
            DN_WildcardSelectorComposerV2.node_state[node_id] = {}

        if operation == 'update_wildcards_prompt':
            payload = data.get('payload', {})
            content = payload.get('content', '')
            old_structure_json = payload.get('wildcards_structure_data', '')

            structure_data = DN_WildcardSelectorComposerV2.update_wildcards_prompt(node_id, content, old_structure_json)

            return web.json_response({
                "status": "success",
                "message": "Content updated successfully",
                "wildcard_structure_data": structure_data
            })

        if operation == 'process_wildcards':
            payload = data.get('payload', {})
            state = bool(payload.get('state'))
            DN_WildcardSelectorComposerV2.node_state[node_id]["process_wildcards"] = state
            return web.json_response({"status": "success", "process_wildcards": state})

    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )
