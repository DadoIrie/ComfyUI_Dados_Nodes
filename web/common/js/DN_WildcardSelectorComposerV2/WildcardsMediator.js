import { fetchSend } from "../utils.js";

export class WildcardsMediator extends EventTarget {
    constructor(node, constants) {
        super();
        this.node = node;
        this.constants = constants;
        this.structureData = this._initializeStructureData();
        this.textbox = null;
        this.dropdownManager = null;
        this.eventQueue = [];
        this.processingQueue = false;
    }

    // Component registration
    setTextbox(textbox) {
        this.textbox = textbox;
    }

    setDropdownManager(dropdownManager) {
        this.dropdownManager = dropdownManager;
    }

    // Centralized widget data management
    getHiddenWidget(name) {
        return this.node.widgets?.find(w => w.name === name);
    }

    getHiddenWidgetValue(name) {
        const widget = this.getHiddenWidget(name);
        return widget ? widget.value : "";
    }

    updateHiddenWidget(name, value) {
        const widget = this.getHiddenWidget(name);
        if (widget) {
            // Don't set to null, only set to empty string if value is null or undefined
            widget.value = value !== null && value !== undefined ? value : "";
        }
    }

    getWildcardsPrompt() {
        return this.getHiddenWidgetValue("wildcards_prompt");
    }

    getWildcardsStructure() {
        return this.getHiddenWidgetValue("wildcards_structure_data");
    }

    updateNodeData(data) {
        if (data.wildcards_prompt !== undefined) {
            this.updateHiddenWidget("wildcards_prompt", data.wildcards_prompt);
        }
        if (data.wildcards_structure_data !== undefined) {
            this.updateHiddenWidget("wildcards_structure_data", data.wildcards_structure_data);
        }
    }

    // Centralized backend communication
    async saveContent() {
        // Defensive check: ensure textbox is ready
        if (!this.textbox || !this.textbox.getContent) {
            console.warn("Textbox not ready for save operation");
            this.emit('save-error', "Save failed - textbox not ready");
            return;
        }

        const content = this.textbox.getContent();
        const structureDataStr = this.getWildcardsStructure();
        this.structureData = structureDataStr ? JSON.parse(structureDataStr) : {};
        const currentStructure = JSON.stringify(this.structureData);
        
        try {
            this.updateNodeData({ wildcards_prompt: content });
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "update_wildcards_prompt",
                { content, wildcards_structure_data: currentStructure }
            );
            
            if (response.status === 'success' && response.wildcard_structure_data !== undefined) {
                this.updateNodeData({
                    wildcards_structure_data: response.wildcard_structure_data
                });
                this.structureData = JSON.parse(response.wildcard_structure_data);
                
                // Clear existing marks before emitting structure update
                // This prevents stale position references
                this._clearAllTextMarks();
                
                // Queue the structure update to ensure proper sequencing
                this.queueEvent('structure-update', this.structureData);
            }
            
            this.node.setDirtyCanvas(true, true);
            this.emit('save-success', "Saved!");
        } catch (error) {
            console.error("Error saving content:", error);
            this.emit('save-error', "Save failed");
        }
    }

    // Clear all text marks to prevent stale position references
    _clearAllTextMarks() {
        if (this.textbox && typeof this.textbox.clearMarks === 'function') {
            this.textbox.clearMarks('wildcard-mark');
            this.textbox.clearMarks('option-mark');
        }
    }

    // Enhanced position validation before marking
    _validateMarkingPosition(start, end, content) {
        if (typeof start !== 'number' || typeof end !== 'number') {
            return false;
        }
        if (start < 0 || end < 0 || start >= end) {
            return false;
        }
        if (!content || end > content.length) {
            return false;
        }
        return true;
    }

    processMarkRequest(rawData) {
        const { type, data } = rawData;
        
        switch (type) {
            case 'wildcard':
                this._processWildcardMark(data);
                break;
            case 'option':
                this._processOptionMark(data);
                break;
            case 'unmark':
                const markType = data.markType || 'button';
                const className = markType === 'option' ? 'option-mark' : 'wildcard-mark';
                this.textbox.clearMarks(className);
                break;
        }
    }

    _processWildcardMark(wildcard) {
        if (!wildcard || typeof wildcard.content !== 'string') return;
        
        const start = wildcard.position?.start;
        const end = wildcard.position?.end;
        const content = this.textbox.getContent();
        
        // Clear previous marks before applying new one
        this.textbox.clearMarks('wildcard-mark');
        this.textbox.clearMarks('option-mark');
        
        // Validate position before marking
        if (this._validateMarkingPosition(start, end, content)) {
            this.textbox.markText(start, end, 'wildcard-mark');
        }
    }

    _processOptionMark(data) {
        const { displayText, parentWildcard, optionIndex } = data;
        
        // Clear previous marks before applying new one
        this.textbox.clearMarks('wildcard-mark');
        this.textbox.clearMarks('option-mark');
        
        const start = parentWildcard.position?.start;
        const end = parentWildcard.position?.end;
        const fullText = this.textbox.getContent();
        
        // Validate parent wildcard position first
        if (!this._validateMarkingPosition(start, end, fullText)) {
            console.warn("Invalid parent wildcard position for option marking");
            return;
        }
        
        // For nested wildcard options, we need to mark the entire nested wildcard content
        if (displayText && displayText.startsWith('{') && displayText.endsWith('}')) {
            // This is a nested wildcard, the position should already be provided in parentWildcard
            if (this._validateMarkingPosition(start, end, fullText)) {
                this.textbox.markText(start, end, 'option-mark');
                return;
            }
            
            // Fallback: find the position in the text
            const nestedWildcardText = displayText;
            const wildcardContent = fullText.substring(start + 1, end - 1);
            
            // Find the position of the nested wildcard within the parent wildcard
            const nestedStart = wildcardContent.indexOf(nestedWildcardText);
            if (nestedStart !== -1) {
                const absoluteStart = start + 1 + nestedStart;
                const absoluteEnd = absoluteStart + nestedWildcardText.length;
                if (this._validateMarkingPosition(absoluteStart, absoluteEnd, fullText)) {
                    this.textbox.markText(absoluteStart, absoluteEnd, 'option-mark');
                }
                return;
            }
        }
        
        // For regular string options, calculate the specific option position
        if (optionIndex !== undefined && displayText) {
            const position = this._calculateOptionPosition(
                fullText,
                displayText,
                start,
                end,
                optionIndex
            );
            if (position && this._validateMarkingPosition(position.start, position.end, fullText)) {
                this.textbox.markText(position.start, position.end, 'option-mark');
            }
        }
    }

    // Event queue system for robustness
    queueEvent(type, data) {
        this.eventQueue.push({ type, data });
        if (!this.processingQueue) {
            this.processEventQueue();
        }
    }

    async processEventQueue() {
        this.processingQueue = true;
        
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            
            try {
                switch (event.type) {
                    case 'mark-request':
                        this.processMarkRequest(event.data);
                        break;
                    case 'save-request':
                        await this.saveContent();
                        break;
                    case 'structure-update':
                        this.emit('structure-updated', event.data);
                        break;
                }
            } catch (error) {
                console.error(`Error processing event ${event.type}:`, error);
            }
        }
        
        this.processingQueue = false;
    }

    // Helper methods - centralized for all components
    _calculateOptionPosition(fullText, optionText, wildcardStart, wildcardEnd, optionIndex) {
        const wildcardContent = fullText.substring(wildcardStart + 1, wildcardEnd - 1);
        const options = this._parseWildcardOptions(wildcardContent);
        
        if (optionIndex < 0 || optionIndex >= options.length) return null;
        
        let currentPos = wildcardStart + 1;
        for (let i = 0; i < optionIndex; i++) {
            currentPos += options[i].length;
            let pipePos = currentPos;
            while (pipePos < wildcardEnd - 1 && fullText.charAt(pipePos) !== '|') pipePos++;
            if (fullText.charAt(pipePos) === '|') currentPos = pipePos + 1;
        }
        
        let searchPos = currentPos;
        while (searchPos < wildcardEnd - 1 && /\s/.test(fullText.charAt(searchPos))) searchPos++;
        const optionStart = searchPos;
        
        while (searchPos < wildcardEnd - 1 && fullText.charAt(searchPos) !== '|' && fullText.charAt(searchPos) !== '}') searchPos++;
        while (searchPos > optionStart && /\s/.test(fullText.charAt(searchPos - 1))) searchPos--;
        
        return { start: optionStart, end: searchPos };
    }

    _parseWildcardOptions(wildcardContent) {
        const options = [];
        let currentOption = '';
        let bracketDepth = 0;
        let pos = 0;
        
        while (pos < wildcardContent.length) {
            const char = wildcardContent[pos];
            
            if (char === '{') {
                bracketDepth++;
                currentOption += char;
                pos++;
                
                while (pos < wildcardContent.length && bracketDepth > 0) {
                    const nestedChar = wildcardContent[pos];
                    currentOption += nestedChar;
                    
                    if (nestedChar === '{') bracketDepth++;
                    else if (nestedChar === '}') bracketDepth--;
                    
                    pos++;
                }
            } else if (char === '|' && bracketDepth === 0) {
                if (currentOption.trim()) options.push(currentOption.trim());
                currentOption = '';
                pos++;
            } else {
                currentOption += char;
                pos++;
            }
        }
        
        if (currentOption.trim()) options.push(currentOption.trim());
        return options;
    }

    _hasDuplicateOptionText(wildcard, searchText) {
        if (!wildcard.options || !Array.isArray(wildcard.options) || wildcard.options.length <= 1) {
            return false;
        }
        
        const normalizedSearchText = this._normalizeWildcardText(searchText);
        let count = 0;
        
        for (const option of wildcard.options) {
            const text = typeof option === 'string' ? option :
                        (option?.displayText || option?.id || '');
            
            if (this._normalizeWildcardText(text) === normalizedSearchText) {
                count++;
                if (count > 1) return true;
            }
        }
        
        return false;
    }
    
    _normalizeWildcardText(text) {
        return text.replace(/\s*\|\s*/g, '|')
                  .replace(/{\s*/g, '{')
                  .replace(/\s*}/g, '}');
    }

    _initializeStructureData() {
        const structureDataStr = this.getWildcardsStructure();
        if (structureDataStr) {
            try {
                return JSON.parse(structureDataStr);
            } catch (e) {
                console.error("Error parsing structure data:", e);
            }
        }
        return { nodes: {}, root_nodes: [] };
    }

    // Event emission
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}