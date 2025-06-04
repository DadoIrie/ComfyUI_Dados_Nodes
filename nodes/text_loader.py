import os
import json
import random
from typing import Dict, Any, ClassVar
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class DynamicTextLoaderNode:
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    def __init__(self):
        pass
    
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
    
    def get_selections_file_path(self, txt_file_path):
        """Get the path for the selections JSON file"""
        base_path = os.path.splitext(txt_file_path)[0]
        return f"{base_path}_selections.json"
    
    def load_wildcard_selections(self, txt_file_path):
        """Load wildcard selections from JSON file"""
        selections_file = self.get_selections_file_path(txt_file_path)
        
        if not os.path.exists(selections_file):
            return {}
        
        try:
            with open(selections_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (IOError, json.JSONDecodeError, OSError) as e:
            print(f"Error loading wildcard selections from {selections_file}: {e}")
            return {}
    
    def save_wildcard_selections(self, txt_file_path, selections):
        """Save wildcard selections to JSON file"""
        selections_file = self.get_selections_file_path(txt_file_path)
        
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(selections_file), exist_ok=True)
            
            with open(selections_file, 'w', encoding='utf-8') as f:
                json.dump(selections, f, indent=2, ensure_ascii=False)
            
            print(f"Saved wildcard selections to {selections_file}")
            return True
        except (IOError, OSError) as e:
            print(f"Error saving wildcard selections to {selections_file}: {e}")
            return False
    
    def delete_wildcard_selections(self, txt_file_path):
        """Delete wildcard selections JSON file"""
        selections_file = self.get_selections_file_path(txt_file_path)
        
        if os.path.exists(selections_file):
            try:
                os.remove(selections_file)
                print(f"Deleted wildcard selections file: {selections_file}")
                return True
            except (IOError, OSError) as e:
                print(f"Error deleting wildcard selections file {selections_file}: {e}")
                return False
        return True
    
    def parse_wildcards_with_matching(self, text, txt_file_path):
        """Parse wildcards and match with persisted selections - simplified content-based matching only"""
        import re
        wildcard_pattern = r'\{([^}]+)\}'
        matches = list(re.finditer(wildcard_pattern, text))
        
        current_wildcards = []
        for i, match in enumerate(matches):
            options = [opt.strip() for opt in match.group(1).split('|')]
            current_wildcards.append({
                'index': i,
                'original': match.group(0),
                'position': match.start(),
                'options': [''] + options,
                'selected': ''
            })
        
        # Load persisted selections
        existing_selections = self.load_wildcard_selections(txt_file_path)
        print(f"Loaded existing selections: {existing_selections}")
        
        # Match existing selections with current wildcards - CONTENT-BASED ONLY
        for wildcard in current_wildcards:
            wildcard_content = wildcard['original']
            
            # Find matching selection by content - iterate over values only
            for selection_data in existing_selections.values():
                if isinstance(selection_data, dict) and selection_data.get('original') == wildcard_content:
                    selected_value = selection_data.get('selected', '')
                    # Only preserve if the selected value still exists in options
                    if selected_value and selected_value in wildcard['options']:
                        wildcard['selected'] = selected_value
                        print(f"Preserved selection for '{wildcard_content}': '{selected_value}'")
                    else:
                        print(f"Selection '{selected_value}' no longer valid for '{wildcard_content}'")
                    break
        
        return current_wildcards
    
    def generate_modified_text(self, original_text, txt_file_path):
        """Generate text with wildcard selections applied"""
        selections = self.load_wildcard_selections(txt_file_path)
        
        if not selections:
            return original_text
        
        import re
        wildcard_pattern = r'\{([^}]+)\}'
        matches = list(re.finditer(wildcard_pattern, original_text))
        
        # Apply replacements in reverse order to maintain positions
        modified_text = original_text
        for i, match in enumerate(reversed(matches)):
            wildcard_index = len(matches) - 1 - i
            selection_data = selections.get(str(wildcard_index))
            
            if selection_data and selection_data.get('selected'):
                start, end = match.span()
                modified_text = modified_text[:start] + selection_data['selected'] + modified_text[end:]
        
        return modified_text
    
    def process_text(self, unique_id=None):
        node_id = str(unique_id)
        state = self.__class__.node_state.get(node_id, {})
        
        path = state.get('path', '')
        file_selection = state.get('file_selection', '')
        use_cached_file = state.get('use_cached_file', True)
        
        if not path or not file_selection:
            return ('',)
        
        file_path = os.path.join(path, f"{file_selection}.txt")
        cache_key = f"{node_id}_{file_path}"
        
        if cache_key not in self.__class__.file_cache or not use_cached_file:
            if not os.path.exists(file_path):
                print(f"Error: The file '{file_path}' does not exist.")
                return ('',)
            
            try:
                with open(file_path, 'r', encoding="utf-8") as file:
                    content = file.read()
                    self.__class__.file_cache[cache_key] = content
                    print(f"Loaded file for node {unique_id}: {file_path}")
            except (IOError, OSError, UnicodeDecodeError) as e:
                print(f"Error reading file: {e}")
                return ('',)
        
        text = self.__class__.file_cache[cache_key]
        
        # Apply wildcard selections if any
        modified_text = self.generate_modified_text(text, file_path)
        return (modified_text,)
    
    @classmethod
    def IS_CHANGED(cls, unique_id=None):
        node_id = str(unique_id)
        state = cls.node_state.get(node_id, {})
        
        if not state.get('use_cached_file', True):
            return random.randint(1, 1000000)
        
        return None

@register_operation_handler
async def handle_text_loader_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        
        if operation not in ['update_state', 'get_txt_files', 'save_file', 'get_file_content', 'delete_file', 'update_wildcard_selection', 'reset_wildcards']:
            return None
            
        node_id = str(data.get('id', ''))
        payload = data.get('payload', {})

        # Create instance once for all operations that need it
        instance = DynamicTextLoaderNode()

        if operation == 'update_state':
            DynamicTextLoaderNode.node_state[node_id] = payload
            return web.json_response({"status": "success"})
        
        if operation == 'get_txt_files':
            path = payload.get('path', '')
            
            if not path or not os.path.exists(path) or not os.path.isdir(path):
                return web.json_response({
                    "status": "success",
                    "files": ["invalid path"],
                    "valid_path": False
                })
            
            try:
                txt_files = []
                for file in os.listdir(path):
                    if file.lower().endswith('.txt'):
                        txt_files.append(os.path.splitext(file)[0])
                
                if not txt_files:
                    return web.json_response({
                        "status": "success",
                        "files": ["no files"],
                        "valid_path": True
                    })
                else:
                    return web.json_response({
                        "status": "success", 
                        "files": txt_files,
                        "valid_path": True
                    })
            except (IOError, OSError) as e:
                print(f"Error reading directory {path}: {e}")
                return web.json_response({
                    "status": "success",
                    "files": ["invalid path"],
                    "valid_path": False
                })
        
        if operation == 'get_file_content':
            path = payload.get('path', '')
            file_selection = payload.get('file_selection', '')
            
            if not path or not file_selection:
                return web.json_response({
                    "status": "error",
                    "message": "No file selected"
                }, status=400)
            
            file_path = os.path.join(path, f"{file_selection}.txt")
            cache_key = f"{node_id}_{file_path}"
            
            if cache_key in DynamicTextLoaderNode.file_cache:
                content = DynamicTextLoaderNode.file_cache[cache_key]
            else:
                if not os.path.exists(file_path):
                    return web.json_response({
                        "status": "error",
                        "message": "File does not exist"
                    }, status=404)
                
                try:
                    with open(file_path, 'r', encoding="utf-8") as file:
                        content = file.read()
                        DynamicTextLoaderNode.file_cache[cache_key] = content
                except (IOError, OSError, UnicodeDecodeError) as e:
                    return web.json_response({
                        "status": "error",
                        "message": f"Error reading file: {str(e)}"
                    }, status=500)
            
            # Parse wildcards with persisted selections
            wildcards = instance.parse_wildcards_with_matching(content, file_path)
            
            return web.json_response({
                "status": "success",
                "content": content,
                "wildcards": wildcards
            })
        
        if operation == 'update_wildcard_selection':
            wildcard_index = str(payload.get('wildcard_index', ''))
            selected_value = payload.get('selected_value', '')
            original_wildcard = payload.get('original_wildcard', '')
            
            print(f"Updating wildcard selection: index={wildcard_index}, value='{selected_value}', original='{original_wildcard}'")
            
            # Get file path
            state = DynamicTextLoaderNode.node_state.get(node_id, {})
            path = state.get('path', '')
            file_selection = state.get('file_selection', '')
            
            if not path or not file_selection:
                return web.json_response({
                    "status": "error",
                    "message": "No file selected"
                }, status=400)
            
            file_path = os.path.join(path, f"{file_selection}.txt")
            
            # Load current selections
            wildcard_selections = instance.load_wildcard_selections(file_path)
            print(f"Current selections before update: {wildcard_selections}")
            
            # Update selection
            if selected_value:
                wildcard_selections[wildcard_index] = {
                    'selected': selected_value,
                    'original': original_wildcard
                }
                print(f"Added selection: {wildcard_index} -> '{selected_value}'")
            else:
                wildcard_selections.pop(wildcard_index, None)
                print(f"Removed selection for index: {wildcard_index}")
            
            # Save selections
            success = instance.save_wildcard_selections(file_path, wildcard_selections)
            print(f"Saved selections: {wildcard_selections}")
            
            if success:
                return web.json_response({
                    "status": "success",
                    "message": "Wildcard selection updated"
                })
            else:
                return web.json_response({
                    "status": "error",
                    "message": "Failed to save wildcard selection"
                }, status=500)
        
        if operation == 'reset_wildcards':
            # Get file path
            state = DynamicTextLoaderNode.node_state.get(node_id, {})
            path = state.get('path', '')
            file_selection = state.get('file_selection', '')
            
            if not path or not file_selection:
                return web.json_response({
                    "status": "error",
                    "message": "No file selected"
                }, status=400)
            
            file_path = os.path.join(path, f"{file_selection}.txt")
            
            # Delete selections file
            success = instance.delete_wildcard_selections(file_path)
            
            if success:
                return web.json_response({
                    "status": "success",
                    "message": "All wildcard selections reset"
                })
            else:
                return web.json_response({
                    "status": "error",
                    "message": "Failed to reset wildcard selections"
                }, status=500)
        
        if operation == 'save_file':
            content = payload.get('content', '')
            path = payload.get('path', '')
            file_selection = payload.get('file_selection', '')
            is_new_file = payload.get('is_new_file', False)
            
            if not path or not file_selection:
                return web.json_response({
                    "status": "error",
                    "message": "No file selected"
                }, status=400)
            
            if not content.strip():
                return web.json_response({
                    "status": "error",
                    "message": "Empty files are not allowed"
                }, status=400)
            
            file_path = os.path.join(path, f"{file_selection}.txt")
            
            try:
                # Get old content to check if it changed
                old_content = ""
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r', encoding="utf-8") as file:
                            old_content = file.read()
                    except (IOError, OSError, UnicodeDecodeError):
                        old_content = ""
                
                content_changed = old_content != content
                print(f"Content changed: {content_changed}")
                
                # Save the file
                with open(file_path, 'w', encoding="utf-8") as file:
                    file.write(content)
                
                # Update cache with new content
                cache_key = f"{node_id}_{file_path}"
                DynamicTextLoaderNode.file_cache[cache_key] = content
                
                # Process wildcards with preserved selections
                wildcards = instance.parse_wildcards_with_matching(content, file_path)
                
                # Update the JSON file with current wildcard structure and preserved selections
                if wildcards:
                    # Create new selections dict based on current wildcards
                    new_selections = {}
                    for wildcard in wildcards:
                        if wildcard['selected']:  # Only save if there's a selection
                            new_selections[str(wildcard['index'])] = {
                                'selected': wildcard['selected'],
                                'original': wildcard['original']
                            }
                    
                    # Save updated selections
                    instance.save_wildcard_selections(file_path, new_selections)
                    print(f"Updated JSON file with selections: {new_selections}")
                
                print(f"Saved file for node {node_id}: {file_path}")
                
                return web.json_response({
                    "status": "success",
                    "message": "File saved successfully",
                    "wildcards": wildcards,
                    "content_changed": content_changed,
                    "is_new_file": is_new_file
                })
                
            except (IOError, OSError, UnicodeDecodeError) as e:
                print(f"Error saving file: {e}")
                return web.json_response({
                    "status": "error",
                    "message": f"Error saving file: {str(e)}"
                }, status=500)
        
        if operation == 'delete_file':
            path = payload.get('path', '')
            file_selection = payload.get('file_selection', '')
            
            if not path or not file_selection:
                return web.json_response({
                    "status": "error",
                    "message": "No file selected"
                }, status=400)
            
            file_path = os.path.join(path, f"{file_selection}.txt")
            
            if not os.path.exists(file_path):
                return web.json_response({
                    "status": "error",
                    "message": "File does not exist"
                }, status=404)
            
            try:
                # Delete the text file
                os.remove(file_path)
                print(f"Deleted file: {file_path}")
                
                # Delete associated wildcard selections
                instance.delete_wildcard_selections(file_path)
                
                # Remove from cache
                cache_key = f"{node_id}_{file_path}"
                DynamicTextLoaderNode.file_cache.pop(cache_key, None)
                
                return web.json_response({
                    "status": "success",
                    "message": "File and associated selections deleted successfully"
                })
                
            except (IOError, OSError) as e:
                print(f"Error deleting file: {e}")
                return web.json_response({
                    "status": "error",
                    "message": f"Error deleting file: {str(e)}"
                }, status=500)
        
        return web.json_response({"error": "Invalid operation"}, status=400)
    
    except Exception as e:
        print(f"Error in handle_text_loader_operations: {e}")
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)
