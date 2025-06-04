from dynamicprompts.generators import RandomPromptGenerator
from dynamicprompts.generators.attentiongenerator import AttentionGenerator

class DN_wildcards_processor:
    
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "tooltip": "Text with wildcards to process"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 2000000000, "tooltip": "Seed for wildcard randomization"}),
                "use_attention": ("BOOLEAN", {"default": False, "tooltip": "Use attention generator for emphasis"}),
            }
        }
    
    RETURN_TYPES = ("STRING", "INT",)
    RETURN_NAMES = ("processed_text", "seed",)
    FUNCTION = "process_wildcards"
    CATEGORY = "Dado's Nodes/Text"
    
    def process_wildcards(self, text, seed, use_attention):
        if not text:
            return (text, seed)
        
        generator = RandomPromptGenerator()
        
        if use_attention:
            attention_generator = AttentionGenerator(generator)
            prompts = attention_generator.generate(text, num_prompts=1, seeds=seed)
            
            fixed_prompts = []
            for prompt in prompts:
                import re
                fixed_prompt = re.sub(r'\((,\s*)', r'\1(', prompt)
                fixed_prompts.append(fixed_prompt)
            processed_text = fixed_prompts[0] if fixed_prompts else text
        else:
            prompts = generator.generate(text, num_images=1, seeds=seed)
            processed_text = list(prompts)[0] if prompts else text
        
        return (processed_text, seed)
    
    @classmethod
    def IS_CHANGED(cls, text, seed, use_attention):
        return seed