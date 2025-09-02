"""
@title: Wildcard Selector/Composer V2
@author: Dado
@description: Advanced wildcard processing with sections and efficient parsing.
Enhanced with DynamicPrompts-inspired robust wildcard resolution.
"""
import xxhash
import json
import re
import random
from typing import Dict, Any, List, ClassVar, Tuple, Optional

# Ensure Wildcard is defined before its usage in type hints
from aiohttp import web
from ..utils.api_routes import register_operation_handler

class WildcardParseError(Exception):
    """Custom exception for wildcard parsing errors"""
    def __init__(self, message: str, position: int = -1, text: str = ""):
        self.message = message
        self.position = position
        self.text = text
        super().__init__(f"{message} at position {position} in '{text[:50]}...'")

class WildcardResolver:
    """
    Enhanced wildcard resolver based on DynamicPrompts implementation.
    Uses bottom-up resolution strategy for robust nested wildcard handling.
    """
    
    def __init__(self, max_depth: int = 20, seed: Optional[int] = None):
        self.max_depth = max_depth
        self.seed = seed
        if seed is not None:
            random.seed(seed)
    
    def resolve_wildcards_complete(self, text: str) -> str:
        """
        Complete wildcard resolution that handles deeply nested cases.
        Uses the proven DynamicPrompts bottom-up approach.
        """
        if not self._has_wildcards(text):
            return text
        
        result = self._normalize_text(text)
        depth = 0
        
        while depth < self.max_depth and self._has_wildcards(result):
            prev_result = result
            result = self._resolve_innermost_wildcards(result)
            
            # Safety check: if no progress was made, break to avoid infinite loop
            if result == prev_result:
                break
            
            depth += 1
        
        return result.strip()
    
    def _has_wildcards(self, text: str) -> bool:
        """Check if text contains unresolved wildcards."""
        return '{' in text and '|' in text and '}' in text
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text by removing ALL newlines and cleaning up whitespace."""
        # SIMPLE FIX: Just remove ALL newlines and normalize spaces
        text = text.replace('\n', ' ').replace('\r', ' ')
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def _resolve_innermost_wildcards(self, text: str) -> str:
        """
        Resolve innermost wildcards in a single pass.
        FIXED: Use a much simpler approach that actually works.
        """
        # Find the FIRST wildcard and resolve it
        start = text.find('{')
        if start == -1:
            return text
        
        # Find the matching closing brace
        brace_count = 0
        end = -1
        
        for i in range(start, len(text)):
            if text[i] == '{':
                brace_count += 1
            elif text[i] == '}':
                brace_count -= 1
                if brace_count == 0:
                    end = i
                    break
        
        if end == -1:
            return text  # No matching closing brace
        
        # Extract the wildcard content
        content = text[start+1:end]
        
        if '|' in content:
            options = self._parse_wildcard_options(content)
            if options:
                selected = random.choice(options)
                # Replace just this one wildcard
                return text[:start] + selected + text[end+1:]
        
        # If no valid options, remove the braces
        return text[:start] + content + text[end+1:]
    
    def _parse_wildcard_options(self, content: str) -> List[str]:
        """
        Parse wildcard options with robust handling of edge cases.
        FIXED: Better handling of multi-line content.
        """
        if not content or '|' not in content:
            return [content.strip()] if content.strip() else []
        
        options = []
        current_option = ""
        brace_level = 0
        
        for char in content:
            if char == '{':
                brace_level += 1
                current_option += char
            elif char == '}':
                brace_level -= 1
                current_option += char
            elif char == '|' and brace_level == 0:
                # Split at pipe only if we're not inside nested braces
                if current_option.strip():
                    options.append(current_option.strip())
                current_option = ""
            else:
                current_option += char
        
        # Add the last option
        if current_option.strip():
            options.append(current_option.strip())
        
        return [opt for opt in options if opt.strip()]  # Filter out empty options
    
    def extract_all_wildcards(self, text: str) -> List[Dict[str, Any]]:
        """
        Extract all wildcards from text for analysis/UI purposes.
        """
        wildcards = []
        
        # Normalize text first to remove newlines
        normalized_text = self._normalize_text(text)
        
        # Simple pattern - no fancy multi-line handling needed now
        pattern = r'\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        
        for match in re.finditer(pattern, normalized_text):
            wildcard_text = match.group(0)
            content = match.group(1)
            
            if '|' in content:
                options = self._parse_wildcard_options(content)
                if options:
                    wildcards.append({
                        'text': wildcard_text,
                        'content': content,
                        'options': options,
                        'start': match.start(),
                        'end': match.end(),
                        'id': xxhash.xxh64(wildcard_text.encode('utf-8')).hexdigest()
                    })
        
        return wildcards

class Wildcard:
    """Enhanced Wildcard class with better option handling"""
    
    def __init__(self, original_text: str, options: List[str], resolver: Optional[WildcardResolver] = None):
        self.id = xxhash.xxh64(original_text.encode('utf-8')).hexdigest()
        self.original_text = original_text
        self.options = [opt.strip() for opt in options if opt.strip()]  # Clean options
        self.resolver = resolver or WildcardResolver()
        
        # Auto-select a random option for processing
        if self.options:
            selected_index = random.randint(0, len(self.options) - 1)
            selected_value = self.options[selected_index]
            
            # Resolve any nested wildcards in the selected value
            resolved_value = self.resolver.resolve_wildcards_complete(selected_value)
            
            self.selection = {
                'index': selected_index,
                'value': selected_value,
                'resolved_value': resolved_value
            }
        else:
            self.selection = {
                'index': 0,
                'value': "",
                'resolved_value': ""
            }
    
    def get_resolved_value(self) -> str:
        """Get the fully resolved value for this wildcard"""
        return self.selection.get('resolved_value', self.selection.get('value', ''))
    
    def to_dict(self):
        return {
            'id': self.id,
            'original_text': self.original_text,
            'options': self.options,
            'selection': self.selection
        }

class Section:
    """Enhanced Section class with improved wildcard processing"""
    
    def __init__(self, text: str, index: int, resolver: Optional[WildcardResolver] = None):
        self.text = text.strip()
        self.index = index
        self.id = xxhash.xxh64(f"section_{index}_{text}".encode('utf-8')).hexdigest()
        self.resolver = resolver or WildcardResolver()
        self.wildcards = []
        self.parse_errors = []
        self._parse_wildcards()
    
    def _parse_wildcards(self):
        """Parse wildcards using the enhanced resolver"""
        try:
            wildcard_data = self.resolver.extract_all_wildcards(self.text)
            
            for wd in wildcard_data:
                try:
                    wildcard = Wildcard(wd['text'], wd['options'], self.resolver)
                    self.wildcards.append(wildcard)
                except Exception as e:
                    self.parse_errors.append(f"Error creating wildcard from '{wd['text']}': {e}")
                    
        except Exception as e:
            self.parse_errors.append(f"Error parsing wildcards: {e}")
    
    def get_clean_text(self) -> str:
        """
        Get text with all wildcards fully resolved.
        Uses the enhanced resolver for robust processing.
        """
        try:
            # CRITICAL FIX: Normalize the text BEFORE resolving
            normalized_text = self.resolver._normalize_text(self.text)
            return self.resolver.resolve_wildcards_complete(normalized_text)
        except Exception as e:
            self.parse_errors.append(f"Error resolving wildcards: {e}")
            return self.text
    
    def get_text_with_selections(self) -> str:
        """
        Get text with wildcards replaced by their specific selections.
        This preserves the UI selections while resolving nested content.
        """
        result = self.text
        
        try:
            # Sort wildcards by position (reverse order to avoid position shifts)
            sorted_wildcards = sorted(self.wildcards, key=lambda w: self.text.find(w.original_text), reverse=True)
            
            for wildcard in sorted_wildcards:
                if wildcard.original_text in result:
                    resolved_value = wildcard.get_resolved_value()
                    result = result.replace(wildcard.original_text, resolved_value, 1)
            
            return result
        except Exception as e:
            self.parse_errors.append(f"Error applying selections: {e}")
            return self.get_clean_text()  # Fallback to full resolution
    
    def to_dict(self):
        return {
            'id': self.id,
            'text': self.text,
            'index': self.index,
            'wildcards': [wc.to_dict() for wc in self.wildcards],
            'parse_errors': self.parse_errors,
            'has_errors': len(self.parse_errors) > 0
        }

class WildcardDocument:
    """Enhanced document class with better error handling and performance"""
    
    def __init__(self, seed: Optional[int] = None):
        self.sections: List[Section] = []
        self.section_by_id: Dict[str, Section] = {}
        self.wildcard_to_section_id: Dict[str, str] = {}
        self.global_errors: List[str] = []
        self.resolver = WildcardResolver(seed=seed)
    
    def parse_prompt(self, prompt: str) -> Tuple[List[Section], Dict[str, str]]:
        """Parse prompt with enhanced error handling and performance"""
        self.sections = []
        self.section_by_id = {}
        self.wildcard_to_section_id = {}
        self.global_errors = []
        
        if not prompt:
            return [], {}
        
        try:
            # Split on commas, but be smarter about it
            section_texts = self._smart_split_sections(prompt)
            
            for section_index, section_text in enumerate(section_texts):
                if not section_text.strip():
                    continue
                    
                try:
                    section = Section(section_text, section_index, self.resolver)
                    self.sections.append(section)
                    self.section_by_id[section.id] = section
                    
                    # Build wildcard indexes
                    for wildcard in section.wildcards:
                        self.wildcard_to_section_id[wildcard.id] = section.id
                    
                    # Collect section errors
                    if section.parse_errors:
                        self.global_errors.extend([f"Section {section_index}: {error}" for error in section.parse_errors])
                
                except Exception as e:
                    error_msg = f"Failed to parse section {section_index} '{section_text[:50]}...': {e}"
                    self.global_errors.append(error_msg)
        
        except Exception as e:
            self.global_errors.append(f"Global parsing error: {e}")
        
        return self.sections, self.wildcard_to_section_id
    
    def _smart_split_sections(self, prompt: str) -> List[str]:
        """
        Smart section splitting that respects wildcard boundaries.
        Won't split on commas inside wildcards.
        """
        sections = []
        current_section = ""
        brace_level = 0
        
        for char in prompt:
            if char == '{':
                brace_level += 1
                current_section += char
            elif char == '}':
                brace_level -= 1
                current_section += char
            elif char == ',' and brace_level == 0:
                # Only split on comma if we're not inside wildcards
                if current_section.strip():
                    sections.append(current_section.strip())
                current_section = ""
            else:
                current_section += char
        
        # Add the last section
        if current_section.strip():
            sections.append(current_section.strip())
        
        return sections
    
    def get_clean_prompt(self) -> str:
        """Generate prompt with all wildcards fully resolved"""
        return ', '.join(section.get_clean_text() for section in self.sections)
    
    def get_prompt_with_selections(self) -> str:
        """Generate prompt using specific wildcard selections"""
        return ', '.join(section.get_text_with_selections() for section in self.sections)
    
    def get_marked_prompt(self) -> str:
        """Generate prompt with wildcards preserved"""
        return ', '.join(section.text for section in self.sections)
    
    def get_parsing_report(self):
        """Get detailed parsing report for debugging"""
        total_wildcards = sum(len(section.wildcards) for section in self.sections)
        sections_with_errors = sum(1 for s in self.sections if s.parse_errors)
        
        return {
            'total_sections': len(self.sections),
            'total_wildcards': total_wildcards,
            'sections_with_errors': sections_with_errors,
            'global_errors': self.global_errors,
            'section_errors': {s.id: s.parse_errors for s in self.sections if s.parse_errors},
            'resolver_max_depth': self.resolver.max_depth
        }
    
    def get_section_for_wildcard(self, wildcard_id: str) -> Optional[Section]:
        """Instant lookup: wildcard_id -> section"""
        section_id = self.wildcard_to_section_id.get(wildcard_id)
        if section_id:
            return self.section_by_id.get(section_id)
        return None
    
    def get_section_by_id(self, section_id: str) -> Optional[Section]:
        """Instant lookup: section_id -> section"""
        return self.section_by_id.get(section_id)

    def get_wildcard(self, wildcard_id: str) -> Optional["Wildcard"]:
        """Get wildcard through section lookup"""
        section = self.get_section_for_wildcard(wildcard_id)
        if section:
            for wildcard in section.wildcards:
                if wildcard.id == wildcard_id:
                    return wildcard
        return None
    
    def to_dict(self):
        base_dict = {
            'sections': [section.to_dict() for section in self.sections],
            'wildcard_to_section_id': self.wildcard_to_section_id
        }
        
        # Add error information
        parsing_report = self.get_parsing_report()
        base_dict.update({
            'parsing_report': parsing_report,
            'has_errors': len(self.global_errors) > 0 or parsing_report['sections_with_errors'] > 0
        })
        
        return base_dict

class DN_WildcardSelectorComposerV2:
    """Enhanced main node class with improved performance and reliability"""
    
    file_cache: ClassVar[Dict[str, str]] = {}
    node_state: ClassVar[Dict[str, Dict[str, Any]]] = {}
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "wildcards_prompt": ("STRING", {"multiline": True}),
                "wildcard_structure_data": ("STRING", {"multiline": True}),
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
    
    def process_prompt(self, wildcards_prompt="", wildcard_structure_data="", seed=-1, unique_id=None):
        # Use seed if provided (seed = -1 means random)
        actual_seed = None if seed == -1 else seed
        
        # Create document and parse
        document = WildcardDocument(seed=actual_seed)
        sections, wildcard_index = document.parse_prompt(wildcards_prompt)
        
        # Apply existing structure data if provided
        if wildcard_structure_data:
            self._apply_structure_data(document, wildcard_structure_data)
        
        # Store parsed data for API access
        if unique_id:
            self.node_state[unique_id] = {
                'sections': [section.to_dict() for section in document.sections],
                'section_by_id': {sid: section.to_dict() for sid, section in document.section_by_id.items()},
                'wildcard_to_section_id': document.wildcard_to_section_id,
                'parsing_report': document.get_parsing_report()
            }
        
        # Generate outputs
        clean_prompt = document.get_clean_prompt()
        marked_prompt = document.get_marked_prompt()
        
        # Print statement to debug the processed prompt
        
        return (clean_prompt, marked_prompt)
    
    def _apply_structure_data(self, document: WildcardDocument, structure_data: str):
        """Apply stored wildcard selections and structure data"""
        try:
            data = json.loads(structure_data)
            sections_data = data.get('sections', [])
            
            # Apply selections to wildcards
            for section_data in sections_data:
                section = document.get_section_by_id(section_data.get('id'))
                if section:
                    wildcards_data = section_data.get('wildcards', [])
                    for wildcard_data in wildcards_data:
                        wildcard = next((w for w in section.wildcards if w.id == wildcard_data.get('id')), None)
                        if wildcard and 'selection' in wildcard_data:
                            wildcard.selection = wildcard_data['selection']
        
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            print(f"Error applying structure data: {e}")

@register_operation_handler
async def handle_wildcard_selector_composer_operations(request):
    try:
        data = await request.json()
        operation = data.get('operation')
        node_id = str(data.get('id', ''))
        
        if operation == 'update_clean_wildcards_prompt':
            payload = data.get('payload', {})
            content = payload.get('content', '')
            
            # Process the content and create structure data
            document = WildcardDocument()
            document.parse_prompt(content)
            
            # Create structure data
            structure_data = {
                'sections': [section.to_dict() for section in document.sections],
                'section_by_id': {sid: section.to_dict() for sid, section in document.section_by_id.items()},
                'wildcard_to_section_id': document.wildcard_to_section_id,
                'parsing_report': document.get_parsing_report()
            }
            
            # Store in node state
            if node_id:
                DN_WildcardSelectorComposerV2.node_state[node_id] = structure_data
            
            return web.json_response({
                "status": "success",
                "message": "Content updated successfully",
                "content": content,
                "structure_data": structure_data
            })
        
        elif operation == 'get_wildcard_structure':
            # Send parsed structure data to frontend
            structure_data = DN_WildcardSelectorComposerV2.node_state.get(node_id, {})
            return web.json_response({
                "status": "success",
                "data": structure_data
            })
        
        elif operation == 'save_wildcard_structure':
            # Receive structure data from frontend
            payload = data.get('payload', {})
            
            if node_id:
                # Store structure data in node state
                DN_WildcardSelectorComposerV2.node_state[node_id] = payload
            
            return web.json_response({
                "status": "success",
                "message": "Structure data saved"
            })
    
    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )