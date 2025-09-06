import re
import json
import random
from typing import Dict, Any, ClassVar, Optional, Tuple
from aiohttp import web
from .utils.api_routes import register_operation_handler

class DN_WildcardPromptEditorNode:
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {            
            "optional": {
                "wildcards_prompt": ("STRING",),
                "wildcards_selections": ("STRING",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING",) * 2
    RETURN_NAMES = ("clean_prompt", "marked_prompt")
    FUNCTION = "process_prompt"
    CATEGORY = "Dado's Nodes/Text"
    
    def parse_wildcards(self, clean_prompt: str) -> list:
        return self._parse_wildcards_recursive(clean_prompt, "")
    
    def _extract_entry_wildcards(self, option_text: str, parent_child_index: str) -> list:
        entry_wildcards = []
        wildcard_pattern = r'\{([^{}]+)\}'
        matches = list(re.finditer(wildcard_pattern, option_text))
        
        for i, match in enumerate(matches):
            entry_wildcard = {
                'index': f"{parent_child_index}.e{i + 1}",
                'original': match.group(0),
                'position': match.start(),
                'options': [''] + [opt.strip() for opt in match.group(1).split('|')],
                'selected': '',
                'is_entry_wildcard': True
            }
            entry_wildcards.append(entry_wildcard)
        
        return entry_wildcards
    
    def _parse_wildcards_recursive(self, clean_prompt: str, parent_index: str) -> list:
        wildcards = []
        matches = self._find_wildcard_matches(clean_prompt)
        
        for i, (start, end, content) in enumerate(matches):
            current_index = f"{parent_index}.{i + 1}" if parent_index else str(i + 1)
            
            wildcard = {
                'index': current_index,
                'original': clean_prompt[start:end],
                'position': start,
                'options': [''],
                'selected': '',
                'children': {},
                'entry_wildcards': {}
            }
            
            if self._has_top_level_pipes(content):
                options = self._split_top_level_options(content)
                wildcard['options'].extend(options)
                
                for j, option in enumerate(options):
                    if self._contains_wildcards(option):
                        child_index = f"{current_index}.{j + 1}"
                        child_wildcards = self._parse_wildcards_recursive(option, child_index)
                        if child_wildcards:
                            wildcard['children'][str(j + 1)] = child_wildcards
                
                    entry_wildcards = self._extract_entry_wildcards(option, f"{current_index}.{j + 1}")
                    if entry_wildcards:
                        wildcard['entry_wildcards'][str(j + 1)] = entry_wildcards
            else:
                simple_options = [opt.strip() for opt in content.split('|')]
                wildcard['options'].extend(simple_options)
                
                for j, option in enumerate(simple_options):
                    if j > 0:  # Skip the empty first option
                        entry_wildcards = self._extract_entry_wildcards(option, f"{current_index}.{j + 1}")
                        if entry_wildcards:
                            wildcard['entry_wildcards'][str(j + 1)] = entry_wildcards
            
            wildcards.append(wildcard)
        
        return wildcards

    def _find_wildcard_matches(self, clean_prompt: str) -> list:
        matches = []
        i = 0
        while i < len(clean_prompt):
            if clean_prompt[i] == '{':
                start = i
                brace_count = 1
                i += 1
                
                while i < len(clean_prompt) and brace_count > 0:
                    if clean_prompt[i] == '{':
                        brace_count += 1
                    elif clean_prompt[i] == '}':
                        brace_count -= 1
                    i += 1
                
                if brace_count == 0:
                    end = i
                    content = clean_prompt[start + 1:end - 1]
                    matches.append((start, end, content))
                else:
                    break
            else:
                i += 1
        
        return matches
    
    def _has_top_level_pipes(self, content: str) -> bool:
        brace_count = 0
        for char in content:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
            elif char == '|' and brace_count == 0:
                return True
        return False
    
    def _split_top_level_options(self, content: str) -> list:
        options = []
        current_option = ""
        brace_count = 0
        
        for char in content:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
            elif char == '|':
                if brace_count == 0:
                    options.append(current_option.strip())
                    current_option = ""
                    continue
            
            current_option += char
        
        if current_option.strip():
            options.append(current_option.strip())
        
        return options
    
    def _contains_wildcards(self, clean_prompt: str) -> bool:
        return '{' in clean_prompt and '}' in clean_prompt
    
    def _has_nested_structure(self, content: str) -> bool:
        return self._has_top_level_pipes(content)
    
    def apply_selections_to_wildcards(self, wildcards: list, selections: Dict) -> list:
        return self._apply_selections_recursive(wildcards, selections)
    
    def _apply_selections_recursive(self, wildcards: list, selections: Dict) -> list:
        for wildcard in wildcards:
            selection_data = selections.get(wildcard['index'])
            if selection_data and isinstance(selection_data, dict):
                selected_value = selection_data.get('selected', '')
                if selected_value in wildcard['options']:
                    wildcard['selected'] = selected_value
                    
                    # NEW: Transfer mark data from selections to wildcard object
                    if 'mark' in selection_data:
                        wildcard['mark'] = selection_data['mark']
                    
                    if 'children' in wildcard and wildcard['children']:
                        selected_index = wildcard['options'].index(selected_value)
                        if selected_index > 0:
                            child_key = str(selected_index)
                            if child_key in wildcard['children']:
                                wildcard['children'][child_key] = self._apply_selections_recursive(
                                    wildcard['children'][child_key], selections
                                )
                    
                    if 'entry_wildcards' in wildcard and wildcard['entry_wildcards']:
                        selected_index = wildcard['options'].index(selected_value)
                        if selected_index > 0:
                            entry_key = str(selected_index)
                            if entry_key in wildcard['entry_wildcards']:
                                wildcard['entry_wildcards'][entry_key] = self._apply_selections_recursive(
                                    wildcard['entry_wildcards'][entry_key], selections
                                )
        return wildcards
    
    def apply_wildcards_to_text(self, clean_prompt: str, selections: Dict) -> str:
        processed_selections = self._flatten_selections_for_processing(selections)
        return self._apply_wildcards_to_text_recursive(clean_prompt, processed_selections, "")
    
    def _flatten_selections_for_processing(self, selections: Dict) -> Dict:
        flattened = {}
        for key, value in selections.items():
            if isinstance(value, dict) and 'selected' in value:
                flattened[key] = value['selected']
        return flattened
    
    def _apply_wildcards_to_text_recursive(self, clean_prompt: str, selections: Dict, parent_index: str) -> str:
        matches = self._find_wildcard_matches(clean_prompt)
        
        modified_text = clean_prompt
        offset = 0
        
        for i, (start, end, content) in enumerate(matches):
            current_index = f"{parent_index}.{i + 1}" if parent_index else str(i + 1)
            
            selected_value = selections.get(current_index)
            if selected_value:
                if self._has_top_level_pipes(content):
                    options = self._split_top_level_options(content)
                    if selected_value in options:
                        selected_option_index = options.index(selected_value) + 1
                        child_index = f"{current_index}.{selected_option_index}"
                        
                        replacement = self._apply_wildcards_to_text_recursive(selected_value, selections, child_index)
                        
                        replacement = self._apply_entry_wildcards_to_text(replacement, selections, child_index)
                    else:
                        replacement = clean_prompt[start:end]
                else:
                    replacement = self._apply_entry_wildcards_to_text(selected_value, selections, current_index + ".1")
                
                adjusted_start = start + offset
                adjusted_end = end + offset
                modified_text = modified_text[:adjusted_start] + replacement + modified_text[adjusted_end:]
                offset += len(replacement) - (end - start)
        
        return modified_text
    
    def _apply_entry_wildcards_to_text(self, clean_prompt: str, selections: Dict, base_index: str) -> str:
        """Apply entry wildcard selections to clean_prompt"""
        modified_text = clean_prompt
        entry_matches = list(re.finditer(r'\{([^{}]+)\}', clean_prompt))
        
        for i, match in enumerate(reversed(entry_matches)):
            entry_index = f"{base_index}.e{len(entry_matches) - i}"
            selected_value = selections.get(entry_index)
            
            if selected_value:
                start, end = match.span()
                modified_text = modified_text[:start] + selected_value + modified_text[end:]
        
        return modified_text
    
    def process_prompt(self, wildcards_prompt="", wildcards_selections="", unique_id=None):
        if not wildcards_prompt.strip():
            return ('', '')
        try:
            selections = json.loads(wildcards_selections) if wildcards_selections.strip() else {}
        except json.JSONDecodeError:
            selections = {}

        # Apply wildcards to get clean text (no marks)
        clean_prompt = self.apply_wildcards_to_text(wildcards_prompt, selections)
        
        # Apply markings using the new position-based system
        marked_prompt = self.apply_markings_during_resolution(wildcards_prompt, selections)
        
        return (clean_prompt, marked_prompt)

    def apply_markings_during_resolution(self, original_prompt: str, selections: Dict) -> str:
        """Apply markings during wildcard resolution to handle position tracking"""
        # Calculate effective marks with inheritance
        effective_marks = self._calculate_effective_marks(selections)
        
        # Process wildcards and apply marks simultaneously
        processed_selections = self._flatten_selections_for_processing(selections)
        return self._apply_wildcards_and_marks_recursive(original_prompt, processed_selections, effective_marks, "", selections)

    def _apply_wildcards_and_marks_recursive(self, text: str, selections: Dict, effective_marks: Dict, parent_index: str, full_selections: Dict) -> str:
        """Apply wildcards and marks simultaneously to handle position tracking"""
        matches = self._find_wildcard_matches(text)
        
        modified_text = text
        offset = 0
        
        for i, (start, end, content) in enumerate(matches):
            current_index = f"{parent_index}.{i + 1}" if parent_index else str(i + 1)
            
            # Get selected value
            selected_value = selections.get(current_index, '')
            
            if selected_value:
                replacement = self._process_wildcard_with_marks(
                    text, start, end, content, current_index, selected_value, 
                    selections, effective_marks, full_selections
                )
            else:
                # No selection - keep the original wildcard text
                replacement = text[start:end]
            
            # Apply mark to this wildcard if it has one AND it's not empty
            effective_mark = effective_marks.get(current_index)
            
            if effective_mark and effective_mark.strip():
                replacement = f"START_{effective_mark.upper()}{replacement}END_{effective_mark.upper()}"
            
            # Replace in text
            adjusted_start = start + offset
            adjusted_end = end + offset
            modified_text = modified_text[:adjusted_start] + replacement + modified_text[adjusted_end:]
            offset += len(replacement) - (end - start)
        
        return modified_text

    def _process_wildcard_with_marks(
            self, text: str, start: int, end: int, content: str, 
            current_index: str, selected_value: str, 
            selections: Dict, effective_marks: Dict, full_selections: Dict) -> str:
        """Process a single wildcard with mark support"""
        
        if self._has_top_level_pipes(content):
            options = self._split_top_level_options(content)
            if selected_value in options:
                selected_option_index = options.index(selected_value) + 1
                child_index = f"{current_index}.{selected_option_index}"
                
                # Recursively process the selected value
                replacement = self._apply_wildcards_and_marks_recursive(
                    selected_value, selections, effective_marks, child_index, full_selections
                )
                
                # Process entry wildcards
                replacement = self._apply_entry_wildcards_with_marks(
                    replacement, selections, effective_marks, child_index, full_selections
                )
            else:
                replacement = text[start:end]  # Keep original if not found
        else:
            # For simple options (like {correctA|correctB}), just use the selected value
            replacement = selected_value
            
            # Process any entry wildcards within this selected value
            replacement = self._apply_entry_wildcards_with_marks(
                replacement, selections, effective_marks, current_index + ".1", full_selections
            )
        
        return replacement

    def _apply_entry_wildcards_with_marks(self, text: str, selections: Dict, effective_marks: Dict, base_index: str, full_selections: Dict) -> str:
        """Apply entry wildcard selections with marks"""
        modified_text = text
        entry_matches = list(re.finditer(r'\{([^{}]+)\}', text))
        
        # Process in reverse order to maintain positions
        for i, match in enumerate(reversed(entry_matches)):
            entry_index = f"{base_index}.e{len(entry_matches) - i}"
            
            selected_value = selections.get(entry_index, '')
            
            if selected_value:
                replacement = selected_value
                
                # Apply mark if this entry wildcard has one AND it's not empty
                effective_mark = effective_marks.get(entry_index)
                if effective_mark and effective_mark.strip():  # ← Added strip() check
                    replacement = f"START_{effective_mark.upper()}{replacement}END_{effective_mark.upper()}"
                
                start, end = match.span()
                modified_text = modified_text[:start] + replacement + modified_text[end:]
        
        return modified_text

    def _calculate_effective_marks(self, selections: Dict) -> Dict[str, str]:
        """Calculate effective marks for each wildcard using inheritance"""
        print(f"DEBUG: Input selections: {selections}")  # DEBUG
        effective_marks = {}
        
        # First pass: collect direct marks
        direct_marks = {}
        for wildcard_index, selection_data in selections.items():
            if isinstance(selection_data, dict) and 'mark' in selection_data:
                mark = selection_data.get('mark', '')
                direct_marks[wildcard_index] = mark
                print(f"DEBUG: Found mark for {wildcard_index}: '{mark}'")  # DEBUG
        
        print(f"DEBUG: Direct marks: {direct_marks}")  # DEBUG
        
        # Second pass: apply inheritance
        for wildcard_index in selections.keys():
            if wildcard_index in direct_marks:
                effective_marks[wildcard_index] = direct_marks[wildcard_index]
            else:
                inherited_mark = self._find_inherited_mark(wildcard_index, direct_marks)
                if inherited_mark:
                    effective_marks[wildcard_index] = inherited_mark
        
        print(f"DEBUG: Final effective marks: {effective_marks}")  # DEBUG
        return effective_marks

    def _find_inherited_mark(self, wildcard_index: str, direct_marks: Dict[str, str]) -> Optional[str]:
        """Find the most specific parent mark for inheritance"""
        index_parts = wildcard_index.split('.')
        
        # Walk up the hierarchy looking for a marked parent
        for i in range(len(index_parts) - 1, 0, -1):
            parent_index = '.'.join(index_parts[:i])
            if parent_index in direct_marks:
                return direct_marks[parent_index]
        
        return None

    # Keep the old apply_markings_to_text method for backward compatibility but use new system
    def apply_markings_to_text(self, clean_prompt: str, selections: Dict) -> str:
        """Legacy method - now redirects to new implementation"""
        return self.apply_markings_during_resolution(clean_prompt, selections)

    @classmethod
    def IS_CHANGED(cls, wildcards_prompt, wildcards_selections, unique_id=None):
        return random.randint(1, 1000000)

class TextLoaderOperations:
    def __init__(self, node_instance: DN_WildcardPromptEditorNode):
        self.node = node_instance
    
    def error_response(self, message: str, status: int = 400):
        return web.json_response({"status": "error", "message": message}, status=status)
    
    def success_response(self, data: Dict = None):
        response = {"status": "success"}
        if data:
            response.update(data)
        return web.json_response(response)
    
    def validate_file_selection(self, payload: Dict) -> Tuple[Optional[str], Optional[str]]:
        path = payload.get('path', '')
        file_selection = payload.get('file_selection', '')
        
        if not path or not file_selection:
            return None, None
        
        return path, file_selection
    
    async def update_state(self, node_id: str, payload: Dict):
        DN_WildcardPromptEditorNode.node_state[node_id] = payload
        return self.success_response()
    
    async def get_txt_files(self, payload: Dict):
        path = payload.get('path', '')
        files, valid_path = self.node.get_txt_files(path)
        
        return self.success_response({
            "files": files,
            "valid_path": valid_path
        })
    
    async def get_content(self, node_id: str, payload: Dict):
        wildcards_prompt = payload.get('wildcards_prompt', '')
        wildcards_selections = payload.get('wildcards_selections', '')
        
        try:
            selections = json.loads(wildcards_selections) if wildcards_selections.strip() else {}
        except json.JSONDecodeError:
            selections = {}
        
        wildcards = self.node.parse_wildcards(wildcards_prompt) if wildcards_prompt.strip() else []
        wildcards = self.node.apply_selections_to_wildcards(wildcards, selections)
        
        return self.success_response({
            "content": wildcards_prompt,
            "wildcards": wildcards
        })
    
    async def update_content(self, node_id: str, payload: Dict):
        content = payload.get('content', '')
        wildcards_selections = payload.get('wildcards_selections', '')
        
        # Parse wildcards from the new content
        wildcards = self.node.parse_wildcards(content) if content.strip() else []
        
        # Apply existing selections if any
        try:
            existing_selections = json.loads(wildcards_selections) if wildcards_selections.strip() else {}
        except json.JSONDecodeError:
            existing_selections = {}
        
        wildcards = self.node.apply_selections_to_wildcards(wildcards, existing_selections)
        
        # Collect selections for return
        new_selections = {}
        self._collect_wildcard_selections(wildcards, new_selections)
        
        return self.success_response({
            "message": "Content saved successfully",
            "wildcards": wildcards,
            "selections_json": json.dumps(new_selections, ensure_ascii=False)
        })

    def _collect_wildcard_selections(self, wildcards: list, selections: Dict):
        for wildcard in wildcards:
            if wildcard.get('selected'):
                selections[wildcard['index']] = {
                    'selected': wildcard['selected'],
                    'original': wildcard['original'],
                    'position': wildcard.get('position', 0)  # NEW: Include position
                }
                # NEW: Preserve mark if it exists
                if wildcard.get('mark'):
                    selections[wildcard['index']]['mark'] = wildcard['mark']
            
            if wildcard.get('children'):
                for child_wildcards in wildcard['children'].values():
                    self._collect_wildcard_selections(child_wildcards, selections)
            
            if wildcard.get('entry_wildcards'):
                for entry_wildcards in wildcard['entry_wildcards'].values():
                    self._collect_wildcard_selections(entry_wildcards, selections)
    
    async def update_wildcard_selection(self, node_id: str, payload: Dict):
        wildcard_index = str(payload.get('wildcard_index', ''))
        selected_value = payload.get('selected_value', '')
        original_wildcard = payload.get('original_wildcard', '')
        mark_value = payload.get('mark_value')
        wildcard_position = payload.get('wildcard_position', 0)  # NEW: Get position
        wildcard_content = payload.get('wildcard_content', '')   # NEW: Get content
        wildcards_selections = payload.get('wildcards_selections', '')
        
        try:
            selections = json.loads(wildcards_selections) if wildcards_selections.strip() else {}
        except json.JSONDecodeError:
            selections = {}
        
        # FIXED: Preserve existing data when updating
        if wildcard_index not in selections:
            selections[wildcard_index] = {}
        
        # Update selection data if provided
        if selected_value is not None:  # Allow empty string
            selections[wildcard_index]['selected'] = selected_value
            selections[wildcard_index]['original'] = original_wildcard
            selections[wildcard_index]['position'] = wildcard_position
        
        # Handle mark value separately to preserve existing selection data
        if mark_value is not None:
            if mark_value:  # Non-empty mark
                selections[wildcard_index]['mark'] = mark_value
                selections[wildcard_index]['mark_content'] = wildcard_content
                selections[wildcard_index]['mark_position'] = wildcard_position
            else:
                # Remove mark if empty value provided
                selections[wildcard_index].pop('mark', None)
                selections[wildcard_index].pop('mark_content', None)
                selections[wildcard_index].pop('mark_position', None)
        
        # Only remove the entire entry if it has no useful data
        if (not selections[wildcard_index].get('selected') and not selections[wildcard_index].get('mark') and wildcard_index in selections):
            selections.pop(wildcard_index, None)
        
        return self.success_response({
            "message": "Wildcard selection updated",
            "selections_json": json.dumps(selections, ensure_ascii=False)
        })

    def _cleanup_orphaned_marks(self, selections: Dict):
        """Remove mark data for selections that no longer have a selected value"""
        keys_to_clean = []
        for key, selection_data in selections.items():
            if isinstance(selection_data, dict):
                if not selection_data.get('selected') and selection_data.get('mark'):
                    # Mark exists but no selection - clean it up
                    keys_to_clean.append(key)
        
        for key in keys_to_clean:
            if 'mark' in selections[key]:
                del selections[key]['mark']
            if 'mark_content' in selections[key]:
                del selections[key]['mark_content']
            if 'mark_position' in selections[key]:
                del selections[key]['mark_position']

    def _clear_wildcard_branch(self, selections: Dict, wildcard_index: str):
        keys_to_remove = [key for key in selections.keys() if key == wildcard_index or key.startswith(wildcard_index + '.')]
        for key in keys_to_remove:
            selections.pop(key, None)
    
    async def reset_wildcards(self, node_id: str):
        return self.success_response({
            "message": "All wildcard selections reset",
            "selections_json": "{}"
        })

@register_operation_handler
async def handle_wildcard_prompt_editor_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        
        valid_operations = [
            'update_state', 'update_content', 'get_content',
            'update_wildcard_selection', 'reset_wildcards'
        ]
        
        if operation not in valid_operations:
            return None  # ← Let other handlers try
        
        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})
        
        node_instance = DN_WildcardPromptEditorNode()
        operations = TextLoaderOperations(node_instance)
        
        handler = getattr(operations, operation)
        if operation == 'get_txt_files':
            result = await handler(payload)
        elif operation == 'reset_wildcards':
            result = await handler(node_id)
        else:
            result = await handler(node_id, payload)
        
        return result
        
    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )
