"""
@title: Text Concatenator
@author: Dado
@description: Node with dynamic text inputs for concatenation
"""

from typing import Dict, Tuple

class DN_TextConcatenateNode:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "concatenate"
    CATEGORY = "Dado's Nodes/Text"

    @classmethod
    def INPUT_TYPES(s) -> Dict[str, dict]:
        return {
            "required": {
                "delimiter": ("STRING", {
                    "default": ", ",
                    "multiline": False
                }),
                "strip_newlines": ("BOOLEAN", {"default": False, "tooltip": "Strip newlines from the concatenated text. Useful for cleaner output."}),
            },
            "optional": {}
        }

    def concatenate(self, delimiter=", ", strip_newlines=False, **kwargs) -> Tuple[str]:
        result = ""
        
        texts = []
        for key, value in kwargs.items():
            if isinstance(value, str) and key != "delimiter":
                texts.append(value)
                
        result = delimiter.join(texts)
        if strip_newlines:
            result = result.replace('\n', '')
        return (result,)
