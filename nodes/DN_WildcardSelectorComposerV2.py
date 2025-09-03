"""
@title: Wildcard Selector/Composer V2
@author: Dado
@description: Processes and catalogs sections and wildcards, mapping their structure and relationships for UI representation.
"""
import xxhash
from typing import Dict, Any, ClassVar, List, Tuple
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DN_WildcardSelectorComposerV2:
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "wildcards_prompt": ("STRING", {"multiline": True}),
                "wildcards_structure_data": ("STRING", {"multiline": True}),
                "seed": ("INT", {"default": -1, "min": -1, "max": 2147483647}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("clean_prompt", "marked_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text"

    def find_wildcards(self, text: str) -> List[Tuple[int, int]]:
        """Find all wildcard boundaries in the text"""
        wildcards = []
        bracket_depth = 0
        start_pos = None
        
        for i, char in enumerate(text):
            if char == '{':
                if bracket_depth == 0:
                    start_pos = i
                bracket_depth += 1
            elif char == '}':
                bracket_depth -= 1
                if bracket_depth == 0 and start_pos is not None:
                    wildcards.append((start_pos, i + 1))
                    start_pos = None
        
        return wildcards
    
    def parse_choices(self, wildcard_content: str) -> List[str]:
        """Parse choices within a wildcard, handling nested wildcards"""
        choices = []
        current_choice = ""
        bracket_depth = 0
        
        for i, char in enumerate(wildcard_content):
            if char == '{':
                bracket_depth += 1
            elif char == '}':
                bracket_depth -= 1
            elif char == '|' and bracket_depth == 0:
                choices.append(current_choice.strip())
                current_choice = ""
                continue
            
            current_choice += char
        
        choices.append(current_choice.strip())
        return choices
    
    def analyze_wildcard_structure(self, text: str, depth: int = 0) -> List[Dict[str, Any]]:
        """Recursively analyze wildcard structure and return hierarchical data"""
        structure = []
        wildcards = self.find_wildcards(text)
        
        for start, end in wildcards:
            wildcard_content = text[start:end]  # Keep the outer braces for content
            choices_content = text[start+1:end-1]  # Remove outer braces for parsing choices
            choices = self.parse_choices(choices_content)
            
            # Check if any choice contains nested wildcards
            has_nested = any(self.find_wildcards(choice) for choice in choices)
            
            wildcard_data = {
                'start': start,
                'end': end,
                'content': wildcard_content,  # Keep the full wildcard syntax with {}
                'choices': choices,
                'depth': depth,
                'has_nested': has_nested,
                'children': []
            }
            
            # Recursively analyze nested wildcards in each choice
            if has_nested:
                for choice in choices:
                    child_wildcards = self.analyze_wildcard_structure(choice, depth + 1)
                    wildcard_data['children'].extend(child_wildcards)
            
            structure.append(wildcard_data)
        
        return structure
    
    def generate_structure_data(self, structure: List[Dict[str, Any]]) -> str:
        """Generate structure data output"""
        structure_lines = []
        
        for i, wildcard in enumerate(structure):
            if wildcard['depth'] == 0:
                if i > 0:
                    structure_lines.append("------")
                
                structure_lines.append(f"ROOT: {wildcard['content']}")
                structure_lines.append(", ".join(wildcard['choices']))
                
                # Process children recursively
                self._add_children_structure(wildcard['children'], structure_lines, 1)
            else:
                # Handle nested wildcards that aren't direct children of root
                self._add_wildcard_structure(wildcard, structure_lines)
        
        return "\n".join(structure_lines)
    
    def _add_children_structure(self, children: List[Dict[str, Any]], structure_lines: List[str], level: int):
        """Add structure data for child wildcards"""
        for child in children:
            structure_lines.append(f"CHILD {level}: {child['content']}")
            structure_lines.append(", ".join(child['choices']))
            
            # Recursively process deeper children
            if child['children']:
                self._add_children_structure(child['children'], structure_lines, level + 1)
    
    def _add_wildcard_structure(self, wildcard: Dict[str, Any], structure_lines: List[str]):
        """Add structure data for a single wildcard at any level"""
        structure_lines.append(f"CHILD {wildcard['depth']}: {wildcard['content']}")
        structure_lines.append(", ".join(wildcard['choices']))
        
        if wildcard['children']:
            self._add_children_structure(wildcard['children'], structure_lines, wildcard['depth'] + 1)
    
    def process_prompt(self, wildcards_prompt="", wildcards_structure_data="", seed=-1, unique_id=None):
        marked_prompt = ""
        
        if unique_id and unique_id in self.node_state:
            wildcards_prompt = self.node_state[unique_id].get('wildcards_prompt', wildcards_prompt)
        
        return (wildcards_prompt, marked_prompt)

@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        node_id = str(data.get('id', ''))
        
        if operation == 'update_wildcards_prompt':
            payload = data.get('payload', {})
            content = payload.get('content', '')
            
            if node_id:
                DN_WildcardSelectorComposerV2.node_state[node_id] = {
                    'wildcards_prompt': content
                }
            
            # Analyze wildcard structure and include in response
            structure_data = ""
            if content:
                instance = DN_WildcardSelectorComposerV2()
                structure = instance.analyze_wildcard_structure(content)
                structure_data = instance.generate_structure_data(structure)
            
            return web.json_response({
                "status": "success",
                "message": "Content updated successfully",
                "wildcard_structure_data": structure_data
            })
    
    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )