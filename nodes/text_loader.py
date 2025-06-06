import os
import re
import json
import random
from typing import Dict, Any, ClassVar, Optional, Tuple
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DynamicTextLoaderNode:
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process_text"
    CATEGORY = "Dado's Nodes/Text"
    
    def get_file_path(self, path: str, file_selection: str) -> str:
        return os.path.join(path, f"{file_selection}.txt")
    
    def get_selections_file_path(self, txt_file_path: str) -> str:
        base_path = os.path.splitext(txt_file_path)[0]
        return f"{base_path}_selections.json"
    
    def load_json_file(self, file_path: str) -> Dict:
        if not os.path.exists(file_path):
            return {}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (IOError, json.JSONDecodeError, OSError):
            return {}
    
    def save_json_file(self, file_path: str, data: Dict) -> bool:
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except (IOError, OSError):
            return False
    
    def load_text_file(self, file_path: str) -> Optional[str]:
        if not os.path.exists(file_path):
            return None
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except (IOError, OSError, UnicodeDecodeError):
            return None
    
    def save_text_file(self, file_path: str, content: str) -> bool:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except (IOError, OSError, UnicodeDecodeError):
            return False
    
    def delete_file(self, file_path: str) -> bool:
        if not os.path.exists(file_path):
            return True
        
        try:
            os.remove(file_path)
            return True
        except (IOError, OSError):
            return False
    
    def get_txt_files(self, path: str) -> Tuple[list, bool]:
        if not path or not os.path.exists(path) or not os.path.isdir(path):
            return ["invalid path"], False
        
        try:
            txt_files = [os.path.splitext(f)[0] for f in os.listdir(path) if f.lower().endswith('.txt')]
            return txt_files if txt_files else ["no files"], True
        except (IOError, OSError):
            return ["invalid path"], False
    
    def parse_wildcards(self, text: str) -> list:
        return self._parse_wildcards_recursive(text, "")
    
    def _extract_entry_wildcards(self, option_text: str, parent_child_index: str) -> list:
        entry_wildcards = []
        wildcard_pattern = r'\{([^{}]+)\}'
        matches = list(re.finditer(wildcard_pattern, option_text))
        
        for i, match in enumerate(matches):
            entry_wildcard = {
                'index': f"{parent_child_index}.{i + 1}",
                'original': match.group(0),
                'position': match.start(),
                'options': [''] + [opt.strip() for opt in match.group(1).split('|')],
                'selected': '',
                'is_entry_wildcard': True
            }
            entry_wildcards.append(entry_wildcard)
        
        return entry_wildcards
    
    def _parse_wildcards_recursive(self, text: str, parent_index: str) -> list:
        wildcards = []
        wildcard_pattern = r'\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        matches = list(re.finditer(wildcard_pattern, text))
        
        for i, match in enumerate(matches):
            current_index = f"{parent_index}.{i + 1}" if parent_index else str(i + 1)
            content = match.group(1)
            
            wildcard = {
                'index': current_index,
                'original': match.group(0),
                'position': match.start(),
                'options': [''],
                'selected': '',
                'children': {}
            }
            
            if self._has_top_level_pipes(content):
                options = self._split_top_level_options(content)
                wildcard['options'].extend(options)
                
                for j, option in enumerate(options):
                    if self._contains_wildcards(option):
                        child_index = f"{current_index}.{j + 1}"
                        entry_wildcards = self._extract_entry_wildcards(option, child_index)
                        if entry_wildcards:
                            wildcard['children'][str(j + 1)] = entry_wildcards
            else:
                simple_options = [opt.strip() for opt in content.split('|')]
                wildcard['options'].extend(simple_options)
            
            wildcards.append(wildcard)
        
        return wildcards
    
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
            elif char == '|' and brace_count == 0:
                options.append(current_option.strip())
                current_option = ""
                continue
            
            current_option += char
        
        if current_option.strip():
            options.append(current_option.strip())
        
        return options
    
    def _contains_wildcards(self, text: str) -> bool:
        return '{' in text and '}' in text
    
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
                    
                    if 'children' in wildcard and wildcard['children']:
                        selected_index = wildcard['options'].index(selected_value)
                        if selected_index > 0:
                            child_key = str(selected_index)
                            if child_key in wildcard['children']:
                                wildcard['children'][child_key] = self._apply_selections_recursive(
                                    wildcard['children'][child_key], selections
                                )
        return wildcards
    
    def apply_wildcards_to_text(self, text: str, selections: Dict) -> str:
        processed_selections = self._flatten_selections_for_processing(selections)
        return self._apply_wildcards_to_text_recursive(text, processed_selections, "")
    
    def _flatten_selections_for_processing(self, selections: Dict) -> Dict:
        flattened = {}
        for key, value in selections.items():
            if isinstance(value, dict) and 'selected' in value:
                flattened[key] = value['selected']
        return flattened
    
    def _apply_wildcards_to_text_recursive(self, text: str, selections: Dict, parent_index: str) -> str:
        wildcard_pattern = r'\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        matches = list(re.finditer(wildcard_pattern, text))
        
        modified_text = text
        
        for match in reversed(matches):
            i = len([m for m in matches if m.start() <= match.start()]) - 1
            current_index = f"{parent_index}.{i + 1}" if parent_index else str(i + 1)
            content = match.group(1)
            
            selected_value = selections.get(current_index)
            if selected_value:
                if self._has_nested_structure(content):
                    options = self._split_top_level_options(content)
                    if selected_value in options:
                        selected_option_index = options.index(selected_value) + 1
                        child_index = f"{current_index}.{selected_option_index}"
                        replacement = self._apply_wildcards_to_text_recursive(selected_value, selections, child_index)
                    else:
                        replacement = match.group(0)
                else:
                    replacement = selected_value
                
                start, end = match.span()
                modified_text = modified_text[:start] + replacement + modified_text[end:]
        
        return modified_text
    
    def process_text(self, unique_id=None):
        node_id = str(unique_id)
        state = self.__class__.node_state.get(node_id, {})
        
        path = state.get('path', '')
        file_selection = state.get('file_selection', '')
        use_cached_file = state.get('use_cached_file', True)
        
        if not path or not file_selection:
            return ('',)
        
        file_path = self.get_file_path(path, file_selection)
        cache_key = f"{node_id}_{file_path}"
        
        if cache_key not in self.__class__.file_cache or not use_cached_file:
            content = self.load_text_file(file_path)
            print(content)
            if content is None:
                return ('',)
            
            self.__class__.file_cache[cache_key] = content
        
        text = self.__class__.file_cache[cache_key]
        selections_file = self.get_selections_file_path(file_path)
        selections = self.load_json_file(selections_file)
        
        return (self.apply_wildcards_to_text(text, selections),)
    
    @classmethod
    def IS_CHANGED(cls, unique_id=None):
        return random.randint(1, 1000000)

class TextLoaderOperations:
    def __init__(self, node_instance: DynamicTextLoaderNode):
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
        DynamicTextLoaderNode.node_state[node_id] = payload
        return self.success_response()
    
    async def get_txt_files(self, payload: Dict):
        path = payload.get('path', '')
        files, valid_path = self.node.get_txt_files(path)
        
        return self.success_response({
            "files": files,
            "valid_path": valid_path
        })
    
    async def get_file_content(self, node_id: str, payload: Dict):
        path, file_selection = self.validate_file_selection(payload)
        if not path:
            return self.error_response("No file selected")
        
        file_path = self.node.get_file_path(path, file_selection)
        cache_key = f"{node_id}_{file_path}"
        
        if cache_key in DynamicTextLoaderNode.file_cache:
            content = DynamicTextLoaderNode.file_cache[cache_key]
        else:
            content = self.node.load_text_file(file_path)
            if content is None:
                return self.error_response("File does not exist", 404)
            
            DynamicTextLoaderNode.file_cache[cache_key] = content
        
        selections_file = self.node.get_selections_file_path(file_path)
        selections = self.node.load_json_file(selections_file)
        wildcards = self.node.parse_wildcards(content)
        wildcards = self.node.apply_selections_to_wildcards(wildcards, selections)
        
        return self.success_response({
            "content": content,
            "wildcards": wildcards
        })
    
    async def save_file(self, node_id: str, payload: Dict):
        content = payload.get('content', '')
        path, file_selection = self.validate_file_selection(payload)
        is_new_file = payload.get('is_new_file', False)
        
        if not path:
            return self.error_response("No file selected")
        
        if not content.strip():
            return self.error_response("Empty files are not allowed")
        
        file_path = self.node.get_file_path(path, file_selection)
        old_content = self.node.load_text_file(file_path) or ""
        content_changed = old_content != content
        
        if not self.node.save_text_file(file_path, content):
            return self.error_response("Error saving file", 500)
        
        cache_key = f"{node_id}_{file_path}"
        DynamicTextLoaderNode.file_cache[cache_key] = content
        
        selections_file = self.node.get_selections_file_path(file_path)
        existing_selections = self.node.load_json_file(selections_file)
        wildcards = self.node.parse_wildcards(content)
        wildcards = self.node.apply_selections_to_wildcards(wildcards, existing_selections)
        
        new_selections = {
            str(w['index']): {
                'selected': w['selected'],
                'original': w['original']
            } for w in wildcards if w['selected']
        }
        
        self.node.save_json_file(selections_file, new_selections)
        
        return self.success_response({
            "message": "File saved successfully",
            "wildcards": wildcards,
            "content_changed": content_changed,
            "is_new_file": is_new_file
        })
    
    async def delete_file(self, node_id: str, payload: Dict):
        path, file_selection = self.validate_file_selection(payload)
        if not path:
            return self.error_response("No file selected")
        
        file_path = self.node.get_file_path(path, file_selection)
        
        if not os.path.exists(file_path):
            return self.error_response("File does not exist", 404)
        
        if not self.node.delete_file(file_path):
            return self.error_response("Error deleting file", 500)
        
        selections_file = self.node.get_selections_file_path(file_path)
        self.node.delete_file(selections_file)
        
        cache_key = f"{node_id}_{file_path}"
        DynamicTextLoaderNode.file_cache.pop(cache_key, None)
        
        return self.success_response({
            "message": "File and associated selections deleted successfully"
        })
    
    async def update_wildcard_selection(self, node_id: str, payload: Dict):
        wildcard_index = str(payload.get('wildcard_index', ''))
        selected_value = payload.get('selected_value', '')
        original_wildcard = payload.get('original_wildcard', '')
        
        state = DynamicTextLoaderNode.node_state.get(node_id, {})
        path, file_selection = state.get('path', ''), state.get('file_selection', '')
        
        if not path or not file_selection:
            return self.error_response("No file selected")
        
        file_path = self.node.get_file_path(path, file_selection)
        selections_file = self.node.get_selections_file_path(file_path)
        wildcard_selections = self.node.load_json_file(selections_file)
        
        if selected_value:
            wildcard_selections[wildcard_index] = {
                'selected': selected_value,
                'original': original_wildcard
            }
        else:
            wildcard_selections.pop(wildcard_index, None)
        
        if not self.node.save_json_file(selections_file, wildcard_selections):
            return self.error_response("Failed to save wildcard selection", 500)
        
        return self.success_response({"message": "Wildcard selection updated"})

    def _clear_wildcard_branch(self, selections: Dict, wildcard_index: str):
        keys_to_remove = [key for key in selections.keys() if key == wildcard_index or key.startswith(wildcard_index + '.')]
        for key in keys_to_remove:
            selections.pop(key, None)
    
    async def reset_wildcards(self, node_id: str):
        state = DynamicTextLoaderNode.node_state.get(node_id, {})
        path, file_selection = state.get('path', ''), state.get('file_selection', '')
        
        if not path or not file_selection:
            return self.error_response("No file selected")
        
        file_path = self.node.get_file_path(path, file_selection)
        selections_file = self.node.get_selections_file_path(file_path)
        
        if not self.node.delete_file(selections_file):
            return self.error_response("Failed to reset wildcard selections", 500)
        
        return self.success_response({"message": "All wildcard selections reset"})

@register_operation_handler
async def handle_text_loader_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        
        valid_operations = [
            'update_state', 'get_txt_files', 'save_file', 'get_file_content', 
            'delete_file', 'update_wildcard_selection', 'reset_wildcards'
        ]
        
        if operation not in valid_operations:
            return None
        
        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})
        
        node_instance = DynamicTextLoaderNode()
        operations = TextLoaderOperations(node_instance)
        
        handler = getattr(operations, operation)
        if operation == 'get_txt_files':
            return await handler(payload)
        elif operation == 'reset_wildcards':
            return await handler(node_id)
        else:
            return await handler(node_id, payload)
        
    except Exception as e:
        print(f"Error in handle_text_loader_operations: {e}")
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )
