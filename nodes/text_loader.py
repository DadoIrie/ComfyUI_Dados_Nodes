import os
import random

from dynamicprompts.generators import RandomPromptGenerator
from dynamicprompts.generators.attentiongenerator import AttentionGenerator

class DynamicTextLoaderNode:
    always_reload = False
    file_cache = {}
    file_paths = {}
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "file_path": ("STRING", {"default": '', "multiline": False}),
                "always_reload": ("BOOLEAN", {"default": False}),
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
    FUNCTION = "load_text_file"
    CATEGORY = "Dado's Nodes/Text"
    
    def load_text_file(self, file_path, always_reload=False, random_prompt=False, use_attention=False, seed=0, unique_id=None):
        # Check if file path has changed for this instance
        file_path_changed = (unique_id in DynamicTextLoaderNode.file_paths and DynamicTextLoaderNode.file_paths[unique_id] != file_path)
                            
        # Update cache if:
        # 1. No cache exists for this instance
        # 2. always_reload is True
        # 3. File path has changed
        if (unique_id not in DynamicTextLoaderNode.file_cache or always_reload or file_path_changed):
            
            if not os.path.exists(file_path):
                print(f"Error: The path '{file_path}' does not exist.")
                return ([''], [seed])
            
            try:
                with open(file_path, 'r', encoding="utf-8") as file:
                    # Cache the file content and path
                    DynamicTextLoaderNode.file_cache[unique_id] = file.read()
                    DynamicTextLoaderNode.file_paths[unique_id] = file_path
                    print(f"Loaded file for node {unique_id}: {file_path}")
            except Exception as e:
                print(f"Error reading file: {e}")
                return ([''], [seed])
        
        # Use cached content
        text = DynamicTextLoaderNode.file_cache[unique_id]
        
        if random_prompt:
            generator = RandomPromptGenerator()
            
            if use_attention:
                # Use attention generator if enabled
                attention_generator = AttentionGenerator(generator)
                prompts = attention_generator.generate(text, num_prompts=1, seeds=seed)
                
                # Fix formatting issue with parentheses and commas
                fixed_prompts = []
                for prompt in prompts:
                    # Find pattern "(," and move the opening parenthesis after the comma and any whitespace
                    import re
                    fixed_prompt = re.sub(r'\((,\s*)', r'\1(', prompt)
                    fixed_prompts.append(fixed_prompt)
                prompts = fixed_prompts
            else:
                # Use regular random prompt generator
                prompts = generator.generate(text, num_images=1, seeds=seed)
                
            seeds = [seed]
            return (prompts, seeds)
        
        return ([text], [seed])
    
    @classmethod
    def IS_CHANGED(cls, file_path='', always_reload=False, random_prompt=False, use_attention=False, seed=0, unique_id=None):
        # Use cls.always_reload instead of the parameter
        if cls.always_reload:
            return random.randint(1, 1000000)
        
        # Check if file path has changed for this instance
        if (unique_id in cls.file_paths and cls.file_paths[unique_id] != file_path):
            # Return random value to force a reload
            return random.randint(1, 1000000)
        
        if random_prompt:
            return seed
            
        return None
