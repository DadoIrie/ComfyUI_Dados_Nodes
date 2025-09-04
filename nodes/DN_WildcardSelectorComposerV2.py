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
    
    def parse_sections(self, prompt: str) -> List[str]:
        """Parse prompt into sections delimited by commas"""
        sections = []
        current_section = ""
        bracket_depth = 0
        
        for char in prompt:
            if char == '{':
                bracket_depth += 1
            elif char == '}':
                bracket_depth -= 1
            elif char == ',' and bracket_depth == 0:
                sections.append(current_section.strip())
                current_section = ""
                continue
            
            current_section += char
        
        # Add the last section if it exists
        if current_section.strip():
            sections.append(current_section.strip())
        
        return sections
    
    def analyze_wildcard_structure(self, text: str, depth: int = 0, return_wildcards_only: bool = False, target_path: List[str] = None) -> Dict[str, Any]:
        """Recursively analyze wildcard structure and return hierarchical data with hashed keys"""
        if target_path is None:
            target_path = []
        
        # Parse sections (only for top-level input)
        if depth == 0:
            sections = self.parse_sections(text)
        else:
            # For nested input, treat as a single section
            sections = [text]
        
        # If returning wildcards only, don't wrap in section data
        if return_wildcards_only:
            result = {}
        else:
            result = {}
        
        for section in sections:
            # Hash the entire section string
            # For top-level sections that are just a single wildcard, use a different hash to avoid collision
            if depth == 0 and not return_wildcards_only:
                # Check if this section is exactly one wildcard that spans the entire section
                section_wildcards = self.find_wildcards(section)
                if (len(section_wildcards) == 1 and
                        section_wildcards[0][0] == 0 and
                        section_wildcards[0][1] == len(section)):
                    # This is a top-level section that is just a single wildcard
                    # Use a different hash to distinguish it from the wildcard itself
                    section_hash = "s_" + xxhash.xxh32(section.encode()).hexdigest()[:7]
                else:
                    # Normal section hash
                    section_hash = xxhash.xxh32(section.encode()).hexdigest()[:8]
            else:
                # For nested sections or when returning wildcards only, use normal hash
                section_hash = xxhash.xxh32(section.encode()).hexdigest()[:8]
            
            # Create the target path for this section
            section_target_path = target_path.copy()
            if depth == 0 and not return_wildcards_only:
                section_target_path = [section_hash]
            
            # Create section object with raw text (only when not returning wildcards only)
            if return_wildcards_only:
                section_data = result  # Use result directly when returning wildcards only
            else:
                section_data = {
                    "raw": section,
                    "target": section_target_path
                }
            
            # Find wildcards in this section
            wildcards = self.find_wildcards(section)
            
            # Process each wildcard in the section
            for start, end in wildcards:
                wildcard_content = section[start:end]  # Keep the outer braces for content
                choices_content = section[start+1:end-1]  # Remove outer braces for parsing choices
                choices = self.parse_choices(choices_content)
                
                # Hash the wildcard content
                wildcard_hash = xxhash.xxh32(wildcard_content.encode()).hexdigest()[:8]
                
                # Process choices to handle nested wildcards
                processed_choices = []
                nested_wildcard_data = {}  # Collect nested wildcard data separately
                for choice in choices:
                    # Check if choice contains nested wildcards
                    nested_wildcards = self.find_wildcards(choice)
                    if nested_wildcards:
                        # For choices with nested wildcards, we need to create a hash for the choice itself
                        # and then process the nested wildcards
                        choice_hash = xxhash.xxh32(choice.encode()).hexdigest()[:8]
                        processed_choices.append(choice_hash)
                        # Process nested wildcards recursively
                        nested_wildcard_dict = self.analyze_wildcard_structure(choice, depth + 1, return_wildcards_only=True, target_path=section_target_path + [wildcard_hash, choice_hash])
                        # Create a data structure for this choice
                        choice_data = {
                            "raw": choice,
                            "options": [],
                            "selected": "nothing selected",
                            "target": section_target_path + [wildcard_hash, choice_hash]
                        }
                        # Add nested wildcard data to the choice data and collect direct children
                        direct_children = []
                        for nested_hash, nested_data in nested_wildcard_dict.items():
                            choice_data[nested_hash] = nested_data
                            # Only add direct children to options
                            if len(nested_data.get("target", [])) == len(choice_data["target"]) + 1:
                                direct_children.append(nested_hash)
                        choice_data["options"] = direct_children
                        # Add the choice data to nested_wildcard_data
                        nested_wildcard_data[choice_hash] = choice_data
                    else:
                        processed_choices.append(choice)
                
                # Create wildcard object
                # For nested wildcards, use only the text around the wildcard as raw text
                if depth > 0:
                    # Find the text around this wildcard in the section (choice)
                    # Look for delimiters ({, }, or ,) before and after the wildcard
                    wildcard_start = start
                    wildcard_end = end
                    
                    # Find previous delimiter
                    prev_delim_pos = -1
                    for i in range(wildcard_start - 1, -1, -1):
                        if section[i] in '{},':
                            prev_delim_pos = i
                            break
                    
                    # Find next delimiter
                    next_delim_pos = len(section)
                    for i in range(wildcard_end, len(section)):
                        if section[i] in '{},':
                            next_delim_pos = i
                            break
                    
                    # Extract the text around the wildcard
                    wildcard_raw = section[prev_delim_pos + 1:next_delim_pos].strip()
                else:
                    wildcard_raw = wildcard_content
                
                wildcard_data = {
                    "raw": wildcard_raw,
                    "options": processed_choices,
                    "selected": "nothing selected",
                    "target": section_target_path + [wildcard_hash]
                }
                
                # Add collected nested wildcard data to the parent wildcard's data
                for nested_hash, nested_data in nested_wildcard_data.items():
                    wildcard_data[nested_hash] = nested_data
                
                # Add wildcard to section data or result directly
                if return_wildcards_only:
                    result[wildcard_hash] = wildcard_data
                else:
                    section_data[wildcard_hash] = wildcard_data
            
            # Add section to result (only when not returning wildcards only)
            if not return_wildcards_only:
                result[section_hash] = section_data
        
        return result
    
    def generate_structure_data(self, structure: Dict[str, Any]) -> str:
        """Generate structure data output in JSON format"""
        import json
        return json.dumps(structure, indent=2)
    
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