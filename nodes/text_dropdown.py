"""
@title: Text DropDown
@author: Dado
@description: A node that accepts a text input and returns the dropdown selection
"""

from typing import Dict, Any, ClassVar, List
import json
import random
import time
from server import PromptServer  # type: ignore pylint: disable=import-error
from aiohttp import web

class TextDropDownNode:
    """
    A node that accepts a text input and outputs the dropdown selection.
    """
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "Dado's Nodes/Text"

    selections: ClassVar[Dict[str, str]] = {}
    entries_map: ClassVar[Dict[str, List[str]]] = {}  # Store available entries for each node
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
        # Get the selected dropdown value for this node instance
        selection = self.__class__.selections.get(str(unique_id), self.DEFAULT_SELECTION)
        
        # If selection is "random", pick a random entry from available entries
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
        
        # For "random", add a timestamp to force re-execution each time
        if current_selection == "random":
            return f"{selection_key}:{current_selection}:{time.time()}"
        
        return f"{selection_key}:{current_selection}"

# API route to handle dropdown operations
@PromptServer.instance.routes.post('/dadoNodes/textDropdown/')
async def text_dropdown_router(request):
    try:
        data = await request.json()
        op = data.get('op')

        # Handle operation from older format
        if op is None:
            # Try to determine operation from other fields
            if 'selection' in data:
                op = 'update_selection'
            elif 'node_id' in data and any(key.startswith('remove') for key in data):
                op = 'remove_selection'

        node_id = str(data.get('node_id', ''))

        if op == 'update_selection':
            selection = data.get('selection')
            if selection is not None:
                TextDropDownNode.selections[node_id] = selection
                
                # If we received entries (for random selection), store them
                entries = data.get('entries')
                if selection == "random" and entries is not None:
                    TextDropDownNode.entries_map[node_id] = entries
                
                return web.json_response({"status": "success"})
        
        elif op == 'remove_selection':
            if node_id in TextDropDownNode.selections:
                del TextDropDownNode.selections[node_id]
            if node_id in TextDropDownNode.entries_map:
                del TextDropDownNode.entries_map[node_id]
            return web.json_response({"status": "success"})
        
        return web.json_response({"error": "Invalid operation or parameters"}, status=400)
    
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
