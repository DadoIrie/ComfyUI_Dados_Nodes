"""
@title: Wildcard Selector/Composer
@author: Dado
@description: A node for building prompts using wildcards.
"""
import random
from typing import Dict, Any, ClassVar
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DN_WildcardSelectorComposerV2:
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {            
            "optional": {
                "wildcards_prompt": ("STRING",),
                "wildcards_selections": ("STRING",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("clean_prompt", "marked_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text"
    
    def process_prompt(self, wildcards_prompt="", wildcards_selections="", unique_id=None):
        clean_prompt = wildcards_prompt or ""
        marked_prompt = wildcards_prompt or ""
            
        # TODO: Implement with new modular architecture
        return (clean_prompt, marked_prompt)
    
    @classmethod
    def IS_CHANGED(cls, wildcards_prompt, wildcards_selections, unique_id=None):
        return random.randint(1, 1000000)

@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):  # ← New unique name
    try:
        data = await request.json()
        operation = data.get('operation')
        
        # ← ONLY handle your specific operation, return None for others
        if operation != 'update_clean_wildcards_prompt':
            return None  # ← Let other handlers try
            
        node_id = str(data.get('id', ''))  # ← Use 'id' like CSV node
        payload = data.get('payload', {})   # ← Get payload like CSV node
        
        # Extract content from payload like the CSV node does
        content = payload.get('content', '')  # ← Get from payload
        
        # Store the content in node state
        if node_id:
            DN_WildcardSelectorComposerV2.node_state[node_id] = {
                'wildcards_prompt': content
            }
        
        # Return proper response
        return web.json_response({
            "status": "success", 
            "message": "Content updated successfully",
            "content": content
        })
        
    except Exception as e:
        print(f"Error in wildcard handler: {e}")  # Debug
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )