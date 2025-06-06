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
        wildcard_pattern = r'\{([^}]+)\}'
        matches = list(re.finditer(wildcard_pattern, text))
        
        return [{
            'index': i,
            'original': match.group(0),
            'position': match.start(),
            'options': [''] + [opt.strip() for opt in match.group(1).split('|')],
            'selected': ''
        } for i, match in enumerate(matches)]
    
    def apply_selections_to_wildcards(self, wildcards: list, selections: Dict) -> list:
        for wildcard in wildcards:
            wildcard_content = wildcard['original']
            
            for selection_data in selections.values():
                if (isinstance(selection_data, dict) and selection_data.get('original') == wildcard_content):
                    selected_value = selection_data.get('selected', '')
                    if selected_value in wildcard['options']:
                        wildcard['selected'] = selected_value
                    break
        
        return wildcards
    
    def apply_wildcards_to_text(self, text: str, selections: Dict) -> str:
        wildcard_pattern = r'\{([^}]+)\}'
        matches = list(re.finditer(wildcard_pattern, text))
        
        modified_text = text
        for i, match in enumerate(reversed(matches)):
            wildcard_index = len(matches) - 1 - i
            selection_data = selections.get(str(wildcard_index))
            
            if selection_data and selection_data.get('selected'):
                start, end = match.span()
                modified_text = (modified_text[:start] + selection_data['selected'] + modified_text[end:])
        
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
        node_id = str(unique_id)
        state = cls.node_state.get(node_id, {})
        
        if not state.get('use_cached_file', True):
            return random.randint(1, 1000000)
        
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
