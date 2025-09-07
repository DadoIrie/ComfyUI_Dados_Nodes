"""
@title: Wildcard Selector/Composer V2
@author: Dado
@description: Processes and catalogs sections and wildcards, mapping their structure and relationships for UI representation.
"""
import json
from typing import Dict, Any, ClassVar
from aiohttp import web
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
                "seed": ("INT", {"default": -1, "min": -1, "max": 2147483647}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("clean_prompt", "marked_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text & Prompt"

    def process_prompt(self, wildcards_prompt="", wildcards_structure_data="", seed=-1, unique_id=None):
        marked_prompt = ""
        if unique_id and unique_id in self.node_state:
            wildcards_prompt = self.node_state[unique_id].get('wildcards_prompt', wildcards_prompt)
        return (wildcards_prompt, marked_prompt)
    
    @classmethod
    def update_wildcards_prompt(cls, node_id: str, content: str, old_structure_json: str = "") -> str:
        """Handles updating the wildcards prompt and merging selected values."""
        if node_id:
            cls.node_state[node_id] = {
                'wildcards_prompt': content
            }

        structure_data = ""
        if content:
            new_structure = WildcardStructureCreation().create_json_structure(content)
            try:
                old_structure = json.loads(old_structure_json) if old_structure_json else {}
                cls.merge_selected(old_structure, new_structure)
            except Exception:
                pass  # If merging fails, just use new_structure
            structure_data = WildcardStructureCreation.generate_structure_data(new_structure)
        else:
            structure_data = "{}"
        return structure_data

    @staticmethod
    def merge_selected(old, new):
        """Recursively merge 'selected' values from old structure into new structure."""
        if not isinstance(old, dict) or not isinstance(new, dict):
            return
        for k, v in new.items():
            if isinstance(v, dict):
                if 'selected' in v:
                    old_v = old.get(k, {})
                    if isinstance(old_v, dict) and 'selected' in old_v:
                        v['selected'] = old_v.get('selected', v['selected'])
                DN_WildcardSelectorComposerV2.merge_selected(old.get(k, {}), v)


@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        node_id = str(data.get('id', ''))

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

    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )
