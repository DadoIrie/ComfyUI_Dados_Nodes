import { fetchSend } from "../utils.js";

class EventQueueProcessor {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    enqueue(eventType, eventData) {
        this.queue.push({ type: eventType, data: eventData });
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    async processQueue() {
        this.isProcessing = true;
        
        while (this.queue.length > 0) {
            const event = this.queue.shift();
            try {
                await this.processEvent(event);
            } catch (error) {
                console.error(`Error processing event ${event.type}:`, error);
            }
        }
        
        this.isProcessing = false;
    }

    async processEvent(event) {
        if (this.eventHandler) {
            await this.eventHandler(event);
        }
    }

    setEventHandler(handler) {
        this.eventHandler = handler;
    }
}

class WidgetManager {
    constructor(node) {
        this.node = node;
    }

    getWidget(widgetName) {
        return this.node.widgets?.find(widget => widget.name === widgetName);
    }

    getWidgetValue(widgetName) {
        const widget = this.getWidget(widgetName);
        return widget ? widget.value : "";
    }

    setWidgetValue(widgetName, value) {
        const widget = this.getWidget(widgetName);
        if (widget) {
            widget.value = value !== null && value !== undefined ? value : "";
        }
    }

    updateWidgets(dataObject) {
        Object.entries(dataObject).forEach(([key, value]) => {
            if (value !== undefined) {
                this.setWidgetValue(key, value);
            }
        });
    }
}

class StructureDataManager {
    constructor(widgetManager) {
        this.widgetManager = widgetManager;
        this.cachedStructure = null;
    }

    getStructureData() {
        const structureString = this.widgetManager.getWidgetValue("wildcards_structure_data");
        if (!structureString) {
            return this.getDefaultStructure();
        }
        
        try {
            this.cachedStructure = JSON.parse(structureString);
            return this.cachedStructure;
        } catch (error) {
            console.error("Error parsing structure data:", error);
            return this.getDefaultStructure();
        }
    }

    getDefaultStructure() {
        return { nodes: {}, root_nodes: [] };
    }

    updateStructureData(newStructure) {
        this.cachedStructure = newStructure;
        const structureString = JSON.stringify(newStructure);
        this.widgetManager.setWidgetValue("wildcards_structure_data", structureString);
    }

    getStructureString() {
        return this.widgetManager.getWidgetValue("wildcards_structure_data");
    }
}

class TextMarkingService {
    constructor() {
        this.textboxReference = null;
    }

    setTextbox(textbox) {
        this.textboxReference = textbox;
    }

    markWildcard(wildcardData) {
        if (!this.validateWildcardData(wildcardData)) return;
        
        const startPosition = wildcardData.position?.start;
        const endPosition = wildcardData.position?.end;
        const content = this.getTextContent();
        
        this.clearAllMarks();
        
        if (this.validatePositions(startPosition, endPosition, content)) {
            this.applyMark(startPosition, endPosition, 'wildcard-mark');
        }
    }

    markOption(optionData) {
        const { displayText, parentWildcard, optionIndex } = optionData;
        
        this.clearAllMarks();
        
        const startPosition = parentWildcard.position?.start;
        const endPosition = parentWildcard.position?.end;
        const content = this.getTextContent();
        
        if (!this.validatePositions(startPosition, endPosition, content)) {
            console.warn("Invalid parent wildcard position for option marking");
            return;
        }
        
        if (this.isNestedWildcard(displayText)) {
            this.handleNestedWildcardMarking(displayText, startPosition, endPosition, content);
        } else if (optionIndex !== undefined && displayText) {
            this.handleRegularOptionMarking(content, displayText, startPosition, endPosition, optionIndex);
        }
    }

    clearAllMarks() {
        if (this.textboxReference && typeof this.textboxReference.clearMarks === 'function') {
            this.textboxReference.clearMarks('wildcard-mark');
            this.textboxReference.clearMarks('option-mark');
        }
    }

    validateWildcardData(wildcardData) {
        return wildcardData && typeof wildcardData.content === 'string';
    }

    validatePositions(startPosition, endPosition, content) {
        if (typeof startPosition !== 'number' || typeof endPosition !== 'number') {
            return false;
        }
        if (startPosition < 0 || endPosition < 0 || startPosition >= endPosition) {
            return false;
        }
        if (!content || endPosition > content.length) {
            return false;
        }
        return true;
    }

    getTextContent() {
        return this.textboxReference ? this.textboxReference.getContent() : '';
    }

    applyMark(startPosition, endPosition, className) {
        if (this.textboxReference) {
            this.textboxReference.markText(startPosition, endPosition, className);
        }
    }

    isNestedWildcard(text) {
        return typeof text === 'string' && text.startsWith('{') && text.endsWith('}');
    }

    handleNestedWildcardMarking(displayText, startPosition, endPosition, content) {
        if (this.validatePositions(startPosition, endPosition, content)) {
            this.applyMark(startPosition, endPosition, 'option-mark');
            return;
        }
        
        const wildcardContent = content.substring(startPosition + 1, endPosition - 1);
        const nestedStart = wildcardContent.indexOf(displayText);
        
        if (nestedStart !== -1) {
            const absoluteStart = startPosition + 1 + nestedStart;
            const absoluteEnd = absoluteStart + displayText.length;
            if (this.validatePositions(absoluteStart, absoluteEnd, content)) {
                this.applyMark(absoluteStart, absoluteEnd, 'option-mark');
            }
        }
    }

    handleRegularOptionMarking(content, displayText, startPosition, endPosition, optionIndex) {
        const position = this.calculateOptionPosition(
            content,
            displayText,
            startPosition,
            endPosition,
            optionIndex
        );
        
        if (position && this.validatePositions(position.start, position.end, content)) {
            this.applyMark(position.start, position.end, 'option-mark');
        }
    }

    calculateOptionPosition(fullText, optionText, wildcardStart, wildcardEnd, optionIndex) {
        const wildcardContent = fullText.substring(wildcardStart + 1, wildcardEnd - 1);
        const options = this.parseWildcardOptions(wildcardContent);
        
        if (optionIndex < 0 || optionIndex >= options.length) return null;
        
        let currentPosition = wildcardStart + 1;
        
        for (let index = 0; index < optionIndex; index++) {
            currentPosition += options[index].length;
            let pipePosition = currentPosition;
            
            while (pipePosition < wildcardEnd - 1 && fullText.charAt(pipePosition) !== '|') {
                pipePosition++;
            }
            
            if (fullText.charAt(pipePosition) === '|') {
                currentPosition = pipePosition + 1;
            }
        }
        
        let searchPosition = currentPosition;
        while (searchPosition < wildcardEnd - 1 && /\s/.test(fullText.charAt(searchPosition))) {
            searchPosition++;
        }
        
        const optionStart = searchPosition;
        
        while (searchPosition < wildcardEnd - 1 && 
               fullText.charAt(searchPosition) !== '|' && 
               fullText.charAt(searchPosition) !== '}') {
            searchPosition++;
        }
        
        while (searchPosition > optionStart && /\s/.test(fullText.charAt(searchPosition - 1))) {
            searchPosition--;
        }
        
        return { start: optionStart, end: searchPosition };
    }

    parseWildcardOptions(wildcardContent) {
        const options = [];
        let currentOption = '';
        let bracketDepth = 0;
        let position = 0;
        
        while (position < wildcardContent.length) {
            const character = wildcardContent[position];
            
            if (character === '{') {
                bracketDepth++;
                currentOption += character;
                position++;
                
                while (position < wildcardContent.length && bracketDepth > 0) {
                    const nestedCharacter = wildcardContent[position];
                    currentOption += nestedCharacter;
                    
                    if (nestedCharacter === '{') {
                        bracketDepth++;
                    } else if (nestedCharacter === '}') {
                        bracketDepth--;
                    }
                    
                    position++;
                }
            } else if (character === '|' && bracketDepth === 0) {
                if (currentOption.trim()) {
                    options.push(currentOption.trim());
                }
                currentOption = '';
                position++;
            } else {
                currentOption += character;
                position++;
            }
        }
        
        if (currentOption.trim()) {
            options.push(currentOption.trim());
        }
        
        return options;
    }
}

export class WildcardsMediator extends EventTarget {
    constructor(node, constants) {
        super();
        this.node = node;
        this.constants = constants;
        this.widgetManager = new WidgetManager(node);
        this.structureDataManager = new StructureDataManager(this.widgetManager);
        this.textMarkingService = new TextMarkingService();
        this.eventQueueProcessor = new EventQueueProcessor();
        this.textboxReference = null;
        this.dropdownManagerReference = null;
        
        this.initializeEventProcessor();
    }

    initializeEventProcessor() {
        this.eventQueueProcessor.setEventHandler(async (event) => {
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
        });
    }

    setTextbox(textbox) {
        this.textboxReference = textbox;
        this.textMarkingService.setTextbox(textbox);
    }

    setDropdownManager(dropdownManager) {
        this.dropdownManagerReference = dropdownManager;
    }

    getHiddenWidget(widgetName) {
        return this.widgetManager.getWidget(widgetName);
    }

    getHiddenWidgetValue(widgetName) {
        return this.widgetManager.getWidgetValue(widgetName);
    }

    updateHiddenWidget(widgetName, value) {
        this.widgetManager.setWidgetValue(widgetName, value);
    }

    getWildcardsPrompt() {
        return this.widgetManager.getWidgetValue("wildcards_prompt");
    }

    getWildcardsStructure() {
        return this.structureDataManager.getStructureString();
    }

    updateNodeData(dataObject) {
        this.widgetManager.updateWidgets(dataObject);
    }

    async saveContent() {
        if (!this.validateTextboxReady()) {
            this.emit('save-error', "Save failed - textbox not ready");
            return;
        }

        const content = this.textboxReference.getContent();
        const currentStructure = this.structureDataManager.getStructureData();
        const structureString = JSON.stringify(currentStructure);
        
        try {
            await this.performSave(content, structureString);
        } catch (error) {
            console.error("Error saving content:", error);
            this.emit('save-error', "Save failed");
        }
    }

    validateTextboxReady() {
        return this.textboxReference && typeof this.textboxReference.getContent === 'function';
    }

    async performSave(content, structureString) {
        this.updateNodeData({ wildcards_prompt: content });
        
        const response = await fetchSend(
            this.constants.MESSAGE_ROUTE,
            this.node.id,
            "update_wildcards_prompt",
            { content, wildcards_structure_data: structureString }
        );
        
        if (response.status === 'success' && response.wildcard_structure_data !== undefined) {
            this.handleSuccessfulSave(response.wildcard_structure_data);
        }
        
        this.node.setDirtyCanvas(true, true);
        this.emit('save-success', "Saved!");
    }

    handleSuccessfulSave(newStructureData) {
        this.updateNodeData({
            wildcards_structure_data: newStructureData
        });
        
        const parsedStructure = JSON.parse(newStructureData);
        this.structureDataManager.updateStructureData(parsedStructure);
        
        this.textMarkingService.clearAllMarks();
        this.queueEvent('structure-update', parsedStructure);
    }

    processMarkRequest(requestData) {
        const { type, data } = requestData;
        
        switch (type) {
            case 'wildcard':
                this.textMarkingService.markWildcard(data);
                break;
            case 'option':
                this.textMarkingService.markOption(data);
                break;
            case 'unmark':
                this.textMarkingService.clearAllMarks();
                break;
        }
    }

    queueEvent(eventType, eventData) {
        this.eventQueueProcessor.enqueue(eventType, eventData);
    }

    emit(eventType, detail) {
        this.dispatchEvent(new CustomEvent(eventType, { detail }));
    }
}