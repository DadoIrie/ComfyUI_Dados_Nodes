import os
import random

from dynamicprompts.generators import RandomPromptGenerator

class DynamicTextLoaderNode:
    always_reload = False
    file_cache = {}
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "file_path": ("STRING", {"default": '', "multiline": False}),
                "always_reload": ("BOOLEAN", {"default": False}),
                "random_prompt": ("BOOLEAN", {"default": False, "tooltip": "Is the text a prompt with wildcards? Then turn this on."}),
                "count": ("INT", {"default": 1, "min": 1, "max": 2000000000, "tooltip": "Number of prompts to generate."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 2000000000, "tooltip": "The seed to use for generating images. Plug returned seed(s) into sampler."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "INT", "INT",)
    RETURN_NAMES = ("text", "seed", "count",)
    OUTPUT_IS_LIST = (True, True, False,)
    FUNCTION = "load_text_file"
    CATEGORY = "Dado's Nodes/Text"
    
    def load_text_file(self, file_path, always_reload=False, random_prompt=False, count=1, seed=0, unique_id=None):
        if unique_id not in DynamicTextLoaderNode.file_cache or always_reload:
            if not os.path.exists(file_path):
                print(f"Error: The path '{file_path}' does not exist.")
                return ([''], [seed], count)
            
            try:
                with open(file_path, 'r', encoding="utf-8") as file:
                    DynamicTextLoaderNode.file_cache[unique_id] = file.read()
            except Exception as e:
                print(f"Error reading file: {e}")
                return ([''], [seed], count)
        
        text = DynamicTextLoaderNode.file_cache[unique_id]
        
        if random_prompt:
            generator = RandomPromptGenerator()
            prompts = generator.generate(text, num_images=count, seeds=seed)
            seeds = [seed] * len(prompts)
            return (prompts, seeds, count)
        
        return ([text], [seed], count)
    
    @classmethod
    def IS_CHANGED(cls, file_path='', always_reload=False, random_prompt=False, count=1, seed=0, unique_id=None):
        if always_reload:
            return random.randint(1, 1000000)
        
        if random_prompt:
            return seed
            
        return None
