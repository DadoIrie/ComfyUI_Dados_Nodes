"""
@title: CSV Multi DropDown
@author: Dado
@description: A node that accepts CSV input and outputs multiple dropdown selections
"""

from typing import Dict, Any, ClassVar, List
import json
import random
import time
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DN_CSVMultiDropDownNode:
    """
    Node that outputs selections from multiple CSV-based dropdowns.
    """
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "Dado's Nodes/Text"

    selections: ClassVar[Dict[str, Dict[str, str]]] = {}  # node_id -> {dropdown_id: selection}
    entries_map: ClassVar[Dict[str, Dict[str, List[str]]]] = {}  # node_id -> {dropdown_id: entries}
    DEFAULT_SELECTION = "empty"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "required": {},
            "optional": {
                "csv_text": ("STRING", {"multiline": True, "tooltip": 'Each line defines a dropdown. First item is the ID, rest are options.\nUse "random" to select a random option.\ncolor,"green,blue,yellow" & color,green,blue,yellow (both formats supported)'}),
                "remove_duplicates": ("BOOLEAN", {"default": False, "tooltip": "Remove duplicate entries in dropdowns"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID"
            }
        }

    def process(self, csv_text, remove_duplicates, unique_id: str) -> tuple:
        node_id = str(unique_id)
        selections_for_node = self.__class__.selections.get(node_id, {})
        result_entries = []

        for dropdown_id, selection in selections_for_node.items():
            if selection == "random":
                entries = self.__class__.entries_map.get(node_id, {}).get(dropdown_id, [])
                selection = random.choice(entries) if entries else self.DEFAULT_SELECTION
            result_entries.append(selection)

        # return concatenated string of all dropdown selections
        return (", ".join(result_entries) if result_entries else self.DEFAULT_SELECTION,)

    @classmethod
    def IS_CHANGED(cls, csv_text, remove_duplicates, unique_id: str) -> str:
        node_id = str(unique_id)
        selections_for_node = cls.selections.get(node_id, {})
        timestamp = time.time()
        return f"{node_id}:{json.dumps(selections_for_node)}:{timestamp}"

@register_operation_handler
async def handle_csv_dropdown_operations(request):
    """Handle multi-dropdown operations via message route"""
    try:
        data = await request.json()
        operation = data.get('operation')
        if operation not in ['update_selections', 'remove_selection']:
            return None

        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})

        if operation == 'update_selections':
            # payload is now a dict of dropdown_id -> selection
            selections_for_node = {}
            entries_for_node = {}

            for key, value in payload.items():
                if key.endswith("_entries"):
                    dropdown_id = key[:-8]
                    entries_for_node[dropdown_id] = value
                else:
                    selections_for_node[key] = value

            if selections_for_node:
                DN_CSVMultiDropDownNode.selections[node_id] = selections_for_node
            if entries_for_node:
                DN_CSVMultiDropDownNode.entries_map[node_id] = entries_for_node

            return web.json_response({"status": "success"})

        elif operation == 'remove_selection':
            DN_CSVMultiDropDownNode.selections.pop(node_id, None)
            DN_CSVMultiDropDownNode.entries_map.pop(node_id, None)
            return web.json_response({"status": "success"})

        return web.json_response({"error": "Invalid operation or parameters"}, status=400)

    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
