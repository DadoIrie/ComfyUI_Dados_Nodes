"""
@title: Text DropDown
@author: Dado
@description: A node that accepts a text input and returns the dropdown selection
"""

from typing import Dict, Any, ClassVar, List
import json
import random
import time
# from server import PromptServer  # type: ignore pylint: disable=import-error
from aiohttp import web
from .utils.api_routes import register_operation_handler

class DN_TextDropDownNode:
    """
    A node that accepts a text input and outputs the dropdown selection.
    """
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "Dado's Nodes/Text & Prompt"

    selections: ClassVar[Dict[str, str]] = {}
    entries_map: ClassVar[Dict[str, List[str]]] = {}
    DEFAULT_SELECTION = "empty"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID"
            }
        }

    def process(self, unique_id: str) -> tuple:
        selection = self.__class__.selections.get(str(unique_id), self.DEFAULT_SELECTION)
        
        if selection == "random":
            entries = self.__class__.entries_map.get(str(unique_id), [])
            if entries:
                selection = random.choice(entries)
            else:
                selection = self.DEFAULT_SELECTION
                
        return (selection,)

    @classmethod
    def IS_CHANGED(cls, unique_id: str) -> str:
        """Track changes in the dropdown selection for this node instance"""
        selection_key = str(unique_id)
        current_selection = cls.selections.get(selection_key, cls.DEFAULT_SELECTION)
        
        if current_selection == "random":
            return f"{selection_key}:{current_selection}:{time.time()}"
        
        return f"{selection_key}:{current_selection}"

@register_operation_handler
async def handle_text_dropdown_operations(request):
    """Handle text dropdown operations using the common message route"""
    try:
        data = await request.json()
        operation = data.get('operation')
        
        if operation not in ['update_selection', 'remove_selection']:
            return None
            
        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})

        if operation == 'update_selection':
            selection = payload.get('selection')
            if selection is not None:
                DN_TextDropDownNode.selections[node_id] = selection
                
                entries = payload.get('entries')
                if selection == "random" and entries is not None:
                    DN_TextDropDownNode.entries_map[node_id] = entries
                
                return web.json_response({"status": "success"})
        
        elif operation == 'remove_selection':
            if node_id in DN_TextDropDownNode.selections:
                del DN_TextDropDownNode.selections[node_id]
            if node_id in DN_TextDropDownNode.entries_map:
                del DN_TextDropDownNode.entries_map[node_id]
                
            return web.json_response({"status": "success"})
        
        return web.json_response({"error": "Invalid operation or parameters"}, status=400)
    
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
