import os
import random

from dynamicprompts.generators import RandomPromptGenerator
from dynamicprompts.generators.attentiongenerator import AttentionGenerator

class DynamicTextLoaderNode:
    use_cached_file = False
    file_cache = {}
    file_paths = {}
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "string": ("STRING", {"default": '', "multiline": True, "tooltip": "Enter text directly here. If text is provided, the file path will be ignored."}),
                "file_path": ("STRING", {"default": '', "multiline": False}),
                "use_cached_file": ("BOOLEAN", {"default": True, "tooltip": "Use cached file content if available."}),
                "random_prompt": ("BOOLEAN", {"default": False, "tooltip": "Is the text a prompt with wildcards? Then turn this on."}),
                "use_attention": ("BOOLEAN", {"default": False, "tooltip": "Use attention generator for emphasis. Only works when random_prompt is enabled."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 2000000000, "tooltip": "The seed to use for generating images. Plug returned seed(s) into sampler."}),
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
    
    def process_text(self, string=None, file_path=None, use_cached_file=True, random_prompt=False, use_attention=False, seed=0, unique_id=None):
        text = ""
        
        if string:
            text = string
        elif file_path:
            file_path_changed = (unique_id in DynamicTextLoaderNode.file_paths and DynamicTextLoaderNode.file_paths[unique_id] != file_path)
                            
            if (unique_id not in DynamicTextLoaderNode.file_cache or not use_cached_file or file_path_changed):
                
                if not os.path.exists(file_path):
                    print(f"Error: The path '{file_path}' does not exist.")
                    return ([''], [seed])
                
                try:
                    with open(file_path, 'r', encoding="utf-8") as file:
                        DynamicTextLoaderNode.file_cache[unique_id] = file.read()
                        DynamicTextLoaderNode.file_paths[unique_id] = file_path
                        print(f"Loaded file for node {unique_id}: {file_path}")
                except Exception as e:
                    print(f"Error reading file: {e}")
                    return ([''], [seed])
            
            text = DynamicTextLoaderNode.file_cache[unique_id]
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
    def IS_CHANGED(cls, string=None, file_path=None, use_cached_file=True, random_prompt=False, use_attention=False, seed=0, unique_id=None):
        if not cls.use_cached_file:
            return random.randint(1, 1000000)
        
        if file_path and (unique_id in cls.file_paths and cls.file_paths[unique_id] != file_path):
            return random.randint(1, 1000000)
        
        if random_prompt:
            return seed
        
        return None
