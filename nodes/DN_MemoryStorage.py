import os
import random
import json

from .utils.api_routes import register_operation_handler
from aiohttp import web
from .. import constants

CACHE_DIR = os.path.join(constants.USER_DATA_DIR, "memory_storage")
DN_STORAGE_DATA = {}

class DN_MemoryStorage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "root_graph_id": ("STRING", {"default": ""}),
                "mode": (["set", "get"], {"default": "set"}),
                "context": (["workflow", "global"], {"default": "workflow"}),
                "persistent": ("BOOLEAN", {"default": False}),
                "key": ("STRING", {"default": ""}),
            },
            "optional": {
                "input": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "Dado's Nodes/Memory Storage"
    OUTPUT_NODE = True

    def execute(self, root_graph_id, mode, context, key, persistent, input=None, unique_id=None):
        if key == "":
            raise ValueError("Empty key")

        storage_key = root_graph_id if context == "workflow" else "global"

        value = None
        if mode == "set" and input is not None and input.strip() != "":
            if storage_key not in DN_STORAGE_DATA:
                DN_STORAGE_DATA[storage_key] = {}
            DN_STORAGE_DATA[storage_key][key] = input
            value = input
            
            if persistent:
                file_path = os.path.join(CACHE_DIR, f"{storage_key}.json")
                data = {}
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                data[key] = input
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f)
        
        if mode == "get":
            if storage_key not in DN_STORAGE_DATA:
                DN_STORAGE_DATA[storage_key] = {}
                
            if persistent:
                file_path = os.path.join(CACHE_DIR, f"{storage_key}.json")
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if key in data:
                            DN_STORAGE_DATA[storage_key][key] = data[key]
            
            if storage_key in DN_STORAGE_DATA and key in DN_STORAGE_DATA[storage_key]:
                value = DN_STORAGE_DATA[storage_key][key]
        
        return (value,)

    @classmethod
    def IS_CHANGED(self, root_graph_id, mode, context, key, persistent, input=None, unique_id=None):
        return random.random()

@register_operation_handler
async def memory_storage_operations(request):
    data = await request.json()
    
    operation = data.get('operation')
    if operation not in ['dummy_op', 'delete_memory_storage']:
        return None
    
    payload = data.get('payload')
    
    if operation == 'dummy_op':
        rootGraphId = payload.get('rootGraphId')
        print(f"Received rootGraphId: {rootGraphId}")
        return web.json_response({"response": "got the dummy"})
    
    if operation == 'delete_memory_storage':
        rootGraphId = payload.get('rootGraphId')
        if rootGraphId in DN_STORAGE_DATA:
            del DN_STORAGE_DATA[rootGraphId]
            print(f"Deleted memory storage for rootGraphId: {rootGraphId}")
        
        file_path = os.path.join(CACHE_DIR, f"{rootGraphId}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Deleted memory storage file: {file_path}")
            
        return web.json_response({"status": "success"})
    
    return web.json_response({"error": "Invalid operation"}, status=400)
