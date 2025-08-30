"""
@title: Prompt Sections Extractor
@author: Dado
@description: Node to extract sections from a prompt based on specified markers specified in the WIldcard Prompt Editor Node (or otherwise)
"""

from typing import Dict, Tuple
import re

class DN_PromptSectionsExtractor:
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "extract_marked_sections"
    CATEGORY = "Dado's Nodes/Text"

    @classmethod
    def INPUT_TYPES(s) -> Dict[str, dict]:
        return {
            "required": {
                "marked_prompt": ("STRING", {"forceInput": True}),
                "mark": ("STRING", {"default": "", "multiline": False})
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    def extract_marked_sections(self, marked_prompt, mark=None, unique_id=None) -> Tuple[str]:
        mark = (mark or "").upper()
        pattern = rf"START_{mark}(.*?)END_{mark}"
        results = []
        for m in re.finditer(pattern, marked_prompt, re.DOTALL):
            end_pos = m.end()
            section = m.group(1)
            # Include comma after END_MARK if present
            if end_pos < len(marked_prompt) and marked_prompt[end_pos] == ',':
                section += ','
            results.append(section)
        return (" ".join(results),)
