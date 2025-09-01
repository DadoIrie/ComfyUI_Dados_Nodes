"""
@title: Wildcard Selector/Composer
@author: Dado
@description: A node for building prompts using wildcards.
"""


import random
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DN_WildcardSelectorComposerV2:
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
    
    RETURN_TYPES = ("STRING",) * 2
    RETURN_NAMES = ("clean_prompt", "marked_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text"
    
    def process_prompt(self, wildcards_prompt="", wildcards_selections="", unique_id=None):
        clean_prompt = ""
        marked_prompt = ""
            
        # TODO: Implement with new modular architecture
        return (clean_prompt, marked_prompt)
    
    @classmethod
    def IS_CHANGED(cls, wildcards_prompt, wildcards_selections, unique_id=None):
        return random.randint(1, 1000000)

@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        
        # TODO: Implement operations with new modular approach
        return web.json_response({"status": "success", "message": "Not implemented yet"})
        
    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )