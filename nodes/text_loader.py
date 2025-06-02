import os
from typing import Dict, Any, ClassVar
from dynamicprompts.generators import RandomPromptGenerator
from dynamicprompts.generators.attentiongenerator import AttentionGenerator
from ..utils.api_routes import register_operation_handler
from aiohttp import web

class DynamicTextLoaderNode:
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "string": ("STRING", {"default": '', "multiline": True, "tooltip": "Enter text directly here. If text is provided, the file path will be ignored."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 2000000000, "tooltip": "The seed to use for Wildcards (random_prompts)."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "INT",)
    RETURN_NAMES = ("text", "seed",)
    OUTPUT_IS_LIST = (True, True,)
    FUNCTION = "process_text"
    CATEGORY = "Dado's Nodes/Text"
    
    def process_text(self, string=None, seed=0, unique_id=None):
        node_id = str(unique_id)
        state = self.__class__.node_state.get(node_id, {})
        
        text_content = string if string else state.get('string', '')
        path = state.get('path', '')
        file_selection = state.get('file_selection', '')
        use_cached_file = state.get('use_cached_file', True)
        random_prompt = state.get('random_prompt', False)
        use_attention = state.get('use_attention', False)
        
        # Use the seed parameter from the input, fallback to state if needed
        seed = seed if seed != 0 else state.get('seed')
        
        text = ""
        
        if text_content:
            text = text_content
        elif path and file_selection:
            file_path = os.path.join(path, f"{file_selection}.txt")
            cache_key = f"{node_id}_{file_path}"
            
            if cache_key not in self.__class__.file_cache or not use_cached_file:
                if not os.path.exists(file_path):
                    print(f"Error: The file '{file_path}' does not exist.")
                    return ([''], [seed])
                
                try:
                    with open(file_path, 'r', encoding="utf-8") as file:
                        self.__class__.file_cache[cache_key] = file.read()
                        print(f"Loaded file for node {unique_id}: {file_path}")
                except Exception as e:
                    print(f"Error reading file: {e}")
                    return ([''], [seed])
            
            text = self.__class__.file_cache[cache_key]
        else:
            return ([''], [seed])
        
        if random_prompt:
            generator = RandomPromptGenerator()
            
            if use_attention:
                attention_generator = AttentionGenerator(generator)
                prompts = attention_generator.generate(text, num_prompts=1, seeds=seed)
                
                fixed_prompts = []
                for prompt in prompts:
                    import re
                    fixed_prompt = re.sub(r'\((,\s*)', r'\1(', prompt)
                    fixed_prompts.append(fixed_prompt)
                prompts = fixed_prompts
            else:
                prompts = generator.generate(text, num_images=1, seeds=seed)
                
            seeds = [seed]
            return (prompts, seeds)
        
        return ([text], [seed])
    
    @classmethod
    def IS_CHANGED(cls, unique_id=None):
        node_id = str(unique_id)
        state = cls.node_state.get(node_id, {})
        
        if state.get('random_prompt', False):
            return state.get('seed', 0)
        
        return None

@register_operation_handler
async def handle_text_loader_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        
        if operation not in ['update_state', 'get_txt_files']:
            return None
            
        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})

        if operation == 'update_state':
            DynamicTextLoaderNode.node_state[node_id] = payload
            return web.json_response({"status": "success"})
        
        elif operation == 'get_txt_files':
            path = payload.get('path', '')
            
            if not path or not os.path.exists(path) or not os.path.isdir(path):
                return web.json_response({
                    "status": "success",
                    "files": ["no files found"],
                    "valid_path": False
                })
            
            try:
                txt_files = []
                for file in os.listdir(path):
                    if file.lower().endswith('.txt'):
                        txt_files.append(os.path.splitext(file)[0])
                
                if not txt_files:
                    txt_files = ["no txt files found"]
                    valid_path = False
                else:
                    valid_path = True
                
                return web.json_response({
                    "status": "success", 
                    "files": txt_files,
                    "valid_path": valid_path
                })
            except Exception:
                return web.json_response({
                    "status": "success",
                    "files": ["error reading directory"],
                    "valid_path": False
                })
        
        return web.json_response({"error": "Invalid operation"}, status=400)
    
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
