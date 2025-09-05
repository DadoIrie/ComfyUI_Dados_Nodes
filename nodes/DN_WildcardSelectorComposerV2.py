"""
@title: Wildcard Selector/Composer V2
@author: Dado
@description: Processes and catalogs sections and wildcards, mapping their structure and relationships for UI representation.
"""
import xxhash
import json
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

    @staticmethod
    def find_wildcards(text: str) -> List[Tuple[int, int]]:
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

    @staticmethod
    def parse_choices(wildcard_content: str) -> List[str]:
        """Parse choices within a wildcard, handling nested wildcards"""
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
        choices.append(current_choice.strip())
        return choices

    @staticmethod
    def parse_sections(prompt: str) -> List[str]:
        """Parse prompt into sections delimited by commas, ignoring commas inside wildcards"""
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

    def analyze_wildcard_structure(
        self,
        text: str,
        depth: int = 0,
        return_wildcards_only: bool = False,
        target_path: List[str] = None
    ) -> Dict[str, Any]:
        """Recursively analyze wildcard structure and return hierarchical data with hashed keys"""
        if target_path is None:
            target_path = []

        sections = self.parse_sections(text) if depth == 0 else [text]
        result = {}

        for section in sections:
            section_wildcards = self.find_wildcards(section)
            # Top-level section hash logic
            if depth == 0 and not return_wildcards_only and len(section_wildcards) == 1 and section_wildcards[0][0] == 0 and section_wildcards[0][1] == len(section):
                section_hash = "s_" + xxhash.xxh32(section.encode()).hexdigest()[:7]
            else:
                section_hash = xxhash.xxh32(section.encode()).hexdigest()[:8]

            section_target_path = target_path.copy()
            if depth == 0 and not return_wildcards_only:
                section_target_path = [section_hash]

            section_data = result if return_wildcards_only else {
                "raw": section,
                "target": section_target_path
            }

            for start, end in section_wildcards:
                wildcard_content = section[start:end]
                choices_content = section[start+1:end-1]
                choices = self.parse_choices(choices_content)
                wildcard_hash = xxhash.xxh32(wildcard_content.encode()).hexdigest()[:8]

                processed_choices = []
                nested_wildcard_data = {}
                for choice in choices:
                    nested_wildcards = self.find_wildcards(choice)
                    if nested_wildcards:
                        choice_hash = xxhash.xxh32(choice.encode()).hexdigest()[:8]
                        processed_choices.append(choice_hash)
                        nested_wildcard_dict = self.analyze_wildcard_structure(
                            choice, depth + 1, True, section_target_path + [wildcard_hash, choice_hash]
                        )
                        choice_data = {
                            "raw": choice,
                            "options": [],
                            "selected": "nothing selected (random selection)",
                            "target": section_target_path + [wildcard_hash, choice_hash]
                        }
                        direct_children = [
                            nh for nh, nd in nested_wildcard_dict.items()
                            if len(nd.get("target", [])) == len(choice_data["target"]) + 1
                        ]
                        choice_data["options"] = direct_children
                        for nested_hash, nested_data in nested_wildcard_dict.items():
                            choice_data[nested_hash] = nested_data
                        nested_wildcard_data[choice_hash] = choice_data
                    else:
                        processed_choices.append(choice)

                # Determine raw text for nested wildcards
                if depth > 0:
                    wildcard_start, wildcard_end = start, end
                    prev_delim_pos = max([i for i in range(wildcard_start - 1, -1, -1) if section[i] in '{},'], default=-1)
                    next_delim_pos = min([i for i in range(wildcard_end, len(section)) if section[i] in '{},'], default=len(section))
                    wildcard_raw = section[prev_delim_pos + 1:next_delim_pos].strip()
                else:
                    wildcard_raw = wildcard_content

                wildcard_data = {
                    "raw": wildcard_raw,
                    "options": processed_choices,
                    "selected": "nothing selected (random selection)",
                    "target": section_target_path + [wildcard_hash]
                }
                for nested_hash, nested_data in nested_wildcard_data.items():
                    wildcard_data[nested_hash] = nested_data

                if return_wildcards_only:
                    result[wildcard_hash] = wildcard_data
                else:
                    section_data[wildcard_hash] = wildcard_data

            if not return_wildcards_only:
                result[section_hash] = section_data

        return result

    @staticmethod
    def generate_structure_data(structure: Dict[str, Any]) -> str:
        """Generate structure data output in JSON format"""
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
            old_structure_json = payload.get('wildcards_structure_data', '')

            if node_id:
                DN_WildcardSelectorComposerV2.node_state[node_id] = {
                    'wildcards_prompt': content
                }

            structure_data = ""
            if content:
                instance = DN_WildcardSelectorComposerV2()
                new_structure = instance.analyze_wildcard_structure(content)

                def merge_selected(old, new):
                    if not isinstance(old, dict) or not isinstance(new, dict):
                        return
                    for k, v in new.items():
                        if isinstance(v, dict):
                            # If this is a wildcard dict with 'selected'
                            if 'selected' in v:
                                old_v = old.get(k, {})
                                if isinstance(old_v, dict) and 'selected' in old_v:
                                    v['selected'] = old_v.get('selected', v['selected'])
                            merge_selected(old.get(k, {}), v)
                try:
                    old_structure = json.loads(old_structure_json) if old_structure_json else {}
                    merge_selected(old_structure, new_structure)
                except Exception:
                    pass  # If merging fails, just use new_structure
                structure_data = instance.generate_structure_data(new_structure)
            else:
                structure_data = "{}"

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
