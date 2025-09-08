"""
@title: Wildcard Structure Utils
@author: Dado
@description: Utilities for creating and analyzing wildcard JSON structures.
"""
import xxhash
import json
from typing import Dict, Any, List, Tuple

class WildcardStructureCreation:
    def __init__(self):
        self.position_cache = {}  # Cache for position tracking within single execution
        self.unique_id_counter = {}  # Track occurrences of identical wildcards
        self.MAX_NESTING_DEPTH = 21  # Maximum nesting depth for wildcards
    
    def generate_unique_id(self, content: str, context_path: str = "", occurrence: int = 0) -> str:
        """
        Generate unique ID for content, handling duplicates with occurrence tracking
        """
        base = f"{content}|{context_path}"
        hash_part = xxhash.xxh32(base.encode()).hexdigest()[:8]
        
        if occurrence > 0:
            return f"i_{hash_part}_{occurrence}"
        return f"i_{hash_part}"
    
    def find_wildcards(self, text: str) -> List[Tuple[int, int]]:
        """
        Find wildcard boundaries with position tracking
        """
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
        """
        Parse choices within wildcard, handling nested structures
        """
        choices = []
        current_choice = ""
        bracket_depth = 0
        
        for char in wildcard_content:
            if char == '{':
                bracket_depth += 1
            elif char == '}':
                bracket_depth -= 1
            elif char == '|' and bracket_depth == 0:
                choices.append(current_choice.strip())
                current_choice = ""
                continue
            current_choice += char
        
        if current_choice.strip():
            choices.append(current_choice.strip())
        return choices
    
    def parse_sections(self, prompt: str) -> List[str]:
        """
        Split prompt into comma-separated sections, respecting bracket depth
        """
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
        
        if current_section.strip():
            sections.append(current_section.strip())
        return sections
    
    def create_json_structure(self, text: str, parent_path: str = "", depth: int = 0) -> Dict[str, Any]:
        """
        Create improved JSON structure with proper duplicate handling
        """
        structure = {
            "nodes": {},
            "root_nodes": [] if depth == 0 else None
        }
        
        # Reset occurrence tracking for new root call
        if depth == 0:
            self.unique_id_counter = {}
            # Store the full text for absolute position calculation
            self.full_text = text
        
        if depth == 0:
            # Process top-level sections
            sections = self.parse_sections(text)
            
            # Track the current position in the full text
            current_pos = 0
            
            for i, section in enumerate(sections):
                # Find the actual position of this section in the full text
                section_start = text.find(section, current_pos)
                section_end = section_start + len(section)
                current_pos = section_end
                
                section_id = self.generate_unique_id(section, parent_path, i)
                
                # Track section occurrence
                content_key = section
                if content_key not in self.unique_id_counter:
                    self.unique_id_counter[content_key] = 0
                else:
                    self.unique_id_counter[content_key] += 1
                    section_id = self.generate_unique_id(section, parent_path, self.unique_id_counter[content_key])
                
                section_path = f"{parent_path}/{section_id}" if parent_path else section_id
                
                # Create section node with absolute positions
                structure["nodes"][section_id] = {
                    "type": "section",
                    "content": section,
                    "path": section_path,
                    "position": {"start": section_start, "end": section_end},
                    "children": {}
                }
                
                # No need for separate lookup tables - all info is in the nodes
                
                # Add to root nodes
                structure["root_nodes"].append(section_id)
                
                # Process wildcards within section with absolute positions
                section_wildcards = self.find_wildcards(section)
                for wc_idx, (wc_start, wc_end) in enumerate(section_wildcards):
                    wildcard_content = section[wc_start:wc_end]
                    # Convert relative section positions to absolute text positions
                    absolute_start = section_start + wc_start
                    absolute_end = section_start + wc_end
                    wildcard_id = self._process_wildcard(
                        structure, wildcard_content, section_path,
                        absolute_start, absolute_end, depth + 1, wc_idx
                    )
                    # Add wildcard to section's children
                    structure["nodes"][section_id]["children"][wildcard_id] = True
        else:
            # Process nested content (wildcards within wildcards)
            wildcards = self.find_wildcards(text)
            for wc_idx, (wc_start, wc_end) in enumerate(wildcards):
                wildcard_content = text[wc_start:wc_end]
                self._process_wildcard(
                    structure, wildcard_content, parent_path,
                    wc_start, wc_end, depth + 1, wc_idx
                )
        
        return structure
    
    def _process_wildcard(self, structure: Dict[str, Any], wildcard_content: str, parent_path: str, start_pos: int, end_pos: int, depth: int, occurrence: int):
        """
        Process a single wildcard and add it to the structure
        """
        # Generate unique ID for this wildcard
        content_key = wildcard_content
        if content_key not in self.unique_id_counter:
            self.unique_id_counter[content_key] = 0
        else:
            self.unique_id_counter[content_key] += 1
        
        wildcard_id = self.generate_unique_id(
            wildcard_content, parent_path, self.unique_id_counter[content_key]
        )
        
        wildcard_path = f"{parent_path}/{wildcard_id}"
        
        # Extract choices
        inner_content = wildcard_content[1:-1]  # Remove { and }
        choices = self.parse_choices(inner_content)
        
        # Create wildcard node with minimal options
        wildcard_node = {
            "type": "wildcard",
            "content": wildcard_content,
            "path": wildcard_path,
            "position": {"start": start_pos, "end": end_pos},
            "options": [],  # Will be populated with minimal option objects
            "selection": None  # Current selection
        }
        
        # Process each choice
        for choice_idx, choice in enumerate(choices):
            # Check if choice contains nested wildcards
            nested_wildcards = self.find_wildcards(choice)
            
            if nested_wildcards:
                # For choices with nested wildcards, create a full choice node
                choice_id = self.generate_unique_id(choice, wildcard_path, choice_idx)
                choice_path = f"{wildcard_path}/{choice_id}"
                
                # Add minimal option reference
                wildcard_node["options"].append({
                    "id": choice_id,
                    "path": choice_path
                })
                
                # Create choice node
                choice_node = {
                    "type": "choice",
                    "content": choice,
                    "path": choice_path,
                    "parent_wildcard": wildcard_id,
                    "children": {}
                }
                
                # Add choice node to structure
                structure["nodes"][choice_id] = choice_node
                
                # No need for separate lookup tables - all info is in the nodes
                
                # Process nested wildcards with absolute positions
                for nw_idx, (nw_start, nw_end) in enumerate(nested_wildcards):
                    nested_content = choice[nw_start:nw_end]
                    # Find the absolute position of this nested wildcard in the full text
                    # We need to find the exact position of this choice within the parent wildcard
                    
                    # Get all choices in the wildcard
                    inner_content = wildcard_content[1:-1]  # Remove { and }
                    all_choices = self.parse_choices(inner_content)
                    
                    # Find the index of this choice in the list of all choices
                    choice_index = -1
                    for i, c in enumerate(all_choices):
                        if c == choice:
                            choice_index = i
                            break
                    
                    # Calculate the offset of this choice within the parent wildcard
                    # We need to find the actual position by parsing the parent wildcard content
                    parent_inner_content = wildcard_content[1:-1]  # Remove { and }
                    parent_choices = self.parse_choices(parent_inner_content)
                    
                    # Calculate the actual offset by finding where this choice starts
                    choice_offset = 1  # Start after the opening {
                    for i in range(choice_index):
                        choice_offset += len(parent_choices[i]) + 1  # +1 for the |
                    
                    # For nested wildcards, we need to find their absolute position in the full text
                    # The choice_offset gives us the position within the parent wildcard
                    # But we also need to consider where this choice is in the full text
                    
                    # If we have the full text stored, use it to find the absolute position
                    if hasattr(self, 'full_text'):
                        # Find the choice content in the full text to get its absolute position
                        search_start = start_pos + choice_offset
                        absolute_choice_pos = self.full_text.find(choice, search_start)
                        if absolute_choice_pos != -1:
                            absolute_start = absolute_choice_pos + nw_start
                            absolute_end = absolute_choice_pos + nw_end
                        else:
                            # Fallback to the original calculation
                            absolute_start = start_pos + choice_offset + nw_start
                            absolute_end = start_pos + choice_offset + nw_end
                    else:
                        absolute_start = start_pos + choice_offset + nw_start
                        absolute_end = start_pos + choice_offset + nw_end
                    
                    nested_id = self._process_wildcard(
                        structure, nested_content, choice_path,
                        absolute_start, absolute_end, depth + 1, nw_idx
                    )
                    # Add nested wildcard to choice's children
                    choice_node["children"][nested_id] = True
            else:
                # For simple choices without nested wildcards, just store the text
                # No need to create a separate node - we'll use CodeMirror's search
                wildcard_node["options"].append(choice)
        
        # Add wildcard node to structure
        structure["nodes"][wildcard_id] = wildcard_node
        
        # No need for separate lookup tables - all info is in the nodes
        
        return wildcard_id
    
    @staticmethod
    def generate_structure_data(structure: Dict[str, Any]) -> str:
        """
        Convert structure to JSON string for frontend consumption
        """
        return json.dumps(structure, indent=2)
    
    @staticmethod
    def merge_selected(old, new):
        """Recursively merge 'selected' values from old structure into new structure."""
        if not isinstance(old, dict) or not isinstance(new, dict):
            return
        
        # Handle the new structure with nodes
        if 'nodes' in new and 'nodes' in old:
            for node_id, new_node in new['nodes'].items():
                if node_id in old['nodes']:
                    old_node = old['nodes'][node_id]
                    # Merge selection values
                    if 'selection' in new_node and 'selection' in old_node:
                        new_node['selection'] = old_node['selection']
                    
                    # Recursively merge child nodes
                    WildcardStructureCreation.merge_selected(old_node, new_node)
        else:
            # Fallback to the old structure
            for k, v in new.items():
                if isinstance(v, dict):
                    if 'selected' in v:
                        old_v = old.get(k, {})
                        if isinstance(old_v, dict) and 'selected' in old_v:
                            v['selected'] = old_v.get('selected', v['selected'])
                    WildcardStructureCreation.merge_selected(old.get(k, {}), v)
