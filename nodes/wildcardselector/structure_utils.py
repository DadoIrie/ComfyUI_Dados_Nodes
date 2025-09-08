"""
@title: Wildcard Structure Utils
@author: Dado
@description: Utilities for creating and analyzing wildcard JSON structures.
"""
# ! Known limitation: reversed wildcards with identical content are not handled > {{{entry|entry}|entry}|entry}
import xxhash
import json
from typing import Dict, Any, List, Tuple

class WildcardStructureCreation:
    def __init__(self):
        self.position_cache = {}
        self.unique_id_counter = {}
        self.MAX_NESTING_DEPTH = 21
    
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
        
        if depth == 0:
            self.unique_id_counter = {}
            self.full_text = text
        
        if depth == 0:
            sections = self.parse_sections(text)
            
            current_pos = 0
            
            for i, section in enumerate(sections):
                section_start = text.find(section, current_pos)
                section_end = section_start + len(section)
                current_pos = section_end
                
                section_id = self.generate_unique_id(section, parent_path, i)
                
                content_key = section
                if content_key not in self.unique_id_counter:
                    self.unique_id_counter[content_key] = 0
                else:
                    self.unique_id_counter[content_key] += 1
                    section_id = self.generate_unique_id(section, parent_path, self.unique_id_counter[content_key])
                
                section_path = f"{parent_path}/{section_id}" if parent_path else section_id
                
                structure["nodes"][section_id] = {
                    "type": "section",
                    "content": section,
                    "path": section_path,
                    "position": {"start": section_start, "end": section_end},
                    "children": {}
                }
                
                structure["root_nodes"].append(section_id)
                
                section_wildcards = self.find_wildcards(section)
                for wc_idx, (wc_start, wc_end) in enumerate(section_wildcards):
                    wildcard_content = section[wc_start:wc_end]
                    absolute_start = section_start + wc_start
                    absolute_end = section_start + wc_end
                    wildcard_id = self._process_wildcard(
                        structure, wildcard_content, section_path,
                        absolute_start, absolute_end, depth + 1, wc_idx
                    )
                    structure["nodes"][section_id]["children"][wildcard_id] = True
        else:
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
        content_key = wildcard_content
        if content_key not in self.unique_id_counter:
            self.unique_id_counter[content_key] = 0
        else:
            self.unique_id_counter[content_key] += 1
        
        wildcard_id = self.generate_unique_id(
            wildcard_content, parent_path, self.unique_id_counter[content_key]
        )
        
        wildcard_path = f"{parent_path}/{wildcard_id}"
        
        inner_content = wildcard_content[1:-1]  # Remove { and }
        choices = self.parse_choices(inner_content)
        
        wildcard_node = {
            "type": "wildcard",
            "content": wildcard_content,
            "path": wildcard_path,
            "position": {"start": start_pos, "end": end_pos},
            "options": [],
            "selection": None
        }
        
        for choice_idx, choice in enumerate(choices):
            nested_wildcards = self.find_wildcards(choice)
            
            if nested_wildcards:
                choice_id = self.generate_unique_id(choice, wildcard_path, choice_idx)
                choice_path = f"{wildcard_path}/{choice_id}"
                
                wildcard_node["options"].append({
                    "id": choice_id,
                    "path": choice_path
                })
                
                choice_node = {
                    "type": "choice",
                    "content": choice,
                    "path": choice_path,
                    "parent_wildcard": wildcard_id,
                    "children": {}
                }
                
                structure["nodes"][choice_id] = choice_node
                
                
                for nw_idx, (nw_start, nw_end) in enumerate(nested_wildcards):
                    nested_content = choice[nw_start:nw_end]
                    
                    if hasattr(self, 'full_text'):
                        parent_inner_content = wildcard_content[1:-1]
                        parent_choices = self.parse_choices(parent_inner_content)
                        
                        choice_offset = 1
                        for i in range(choice_idx):
                            choice_offset += len(parent_choices[i]) + 1
                        parent_wildcard_pos = self.full_text.find(wildcard_content, start_pos)
                        if parent_wildcard_pos != -1:
                            absolute_start = parent_wildcard_pos + choice_offset + nw_start
                            absolute_end = parent_wildcard_pos + choice_offset + nw_end
                            
                            if (absolute_start >= 0 and absolute_end <= len(self.full_text) and
                                    self.full_text[absolute_start:absolute_end] == nested_content):
                                pass
                            else:
                                occurrence_count = 0
                                for i in range(choice_idx):
                                    if nested_content in parent_choices[i]:
                                        occurrence_count += 1
                                
                                search_pos = parent_wildcard_pos
                                for _ in range(occurrence_count + 1):
                                    found_pos = self.full_text.find(nested_content, search_pos)
                                    if found_pos != -1:
                                        absolute_start = found_pos
                                        absolute_end = found_pos + len(nested_content)
                                        search_pos = found_pos + 1
                                    else:
                                        break
                        else:
                            absolute_start = start_pos + choice_offset + nw_start
                            absolute_end = start_pos + choice_offset + nw_end
                    else:
                        parent_inner_content = wildcard_content[1:-1]
                        parent_choices = self.parse_choices(parent_inner_content)
                        choice_offset = 1
                        for i in range(choice_idx):
                            choice_offset += len(parent_choices[i]) + 1
                        absolute_start = start_pos + choice_offset + nw_start
                        absolute_end = start_pos + choice_offset + nw_end
                    
                    nested_id = self._process_wildcard(
                        structure, nested_content, choice_path,
                        absolute_start, absolute_end, depth + 1, nw_idx
                    )
                    choice_node["children"][nested_id] = True
            else:
                wildcard_node["options"].append(choice)
        
        structure["nodes"][wildcard_id] = wildcard_node
        
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
        
        if 'nodes' in new and 'nodes' in old:
            for node_id, new_node in new['nodes'].items():
                if node_id in old['nodes']:
                    old_node = old['nodes'][node_id]
                    if 'selection' in new_node and 'selection' in old_node:
                        new_node['selection'] = old_node['selection']
                    
                    WildcardStructureCreation.merge_selected(old_node, new_node)
        else:
            for k, v in new.items():
                if isinstance(v, dict):
                    if 'selected' in v:
                        old_v = old.get(k, {})
                        if isinstance(old_v, dict) and 'selected' in old_v:
                            v['selected'] = old_v.get('selected', v['selected'])
                    WildcardStructureCreation.merge_selected(old.get(k, {}), v)
