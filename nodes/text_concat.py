"""
@title: Text Concatenator
@author: Dado
@description: A node with dynamic text inputs for concatenation
"""

from typing import Dict, Tuple

class TextConcatenatorNode:
    """
    A node that dynamically accepts text inputs and concatenates them.
    """
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
            },
            "optional": {}
        }

    def concatenate(self, delimiter=", ", **kwargs) -> Tuple[str]:
        # Get all the text inputs and concatenate them
        result = ""
        
        # Filter out non-text inputs and the delimiter parameter itself
        texts = []
        for key, value in kwargs.items():
            if isinstance(value, str) and key != "delimiter":
                texts.append(value)
                
        # Join all texts with the specified delimiter
        result = delimiter.join(texts)
                
        return (result,)

