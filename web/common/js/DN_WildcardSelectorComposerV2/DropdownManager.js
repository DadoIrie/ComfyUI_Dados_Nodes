class DropdownUI {
    constructor(sidebar, onSelect, textbox) {
        this.sidebar = sidebar;
        this.onSelect = onSelect;
        this.textbox = textbox;
        this.activeOverlay = null;
        this._setupGlobalClickListener();
    }

    _markWildcard(wildcard) {
        if (this.textbox && wildcard && typeof wildcard.content === 'string') {
            const start = wildcard.position?.start;
            const end = wildcard.position?.end;
            this.textbox.mark(wildcard.content, 'button', start, end);
        }
    }

    _markOption(displayText, parentWildcard, idx) {
        if (!this.textbox) return;
        const hasDuplicates = this._hasDuplicateOptionText(parentWildcard, displayText);
        const start = parentWildcard.position?.start;
        const end = parentWildcard.position?.end;
        if (hasDuplicates) {
            this.textbox.mark(displayText, 'button', start, end, idx);
            return;
        }
        this.textbox.mark(displayText, 'button', start, end);
    }

    render(dropdownsData) {
        const containerMap = this._buildExistingContainerMap();
        const newIds = dropdownsData.map(({ wildcard }) => DropdownUI.generateWildcardId(wildcard));
        const newIdsSet = new Set(newIds);

        this._removeObsoleteContainers(containerMap, newIdsSet);
        this._updateOrCreateDropdowns(dropdownsData, containerMap, newIds);
    }

    _buildExistingContainerMap() {
        const containerMap = new Map();
        this.sidebar.querySelectorAll('.wildcard-dropdown-container').forEach(container => {
            const id = container.querySelector('.custom-dropdown')?.dataset.wildcardId;
            if (!id) return;
            containerMap.set(id, container);
        });
        return containerMap;
    }

    _removeObsoleteContainers(containerMap, newIdsSet) {
        containerMap.forEach((container, id) => {
            if (newIdsSet.has(id)) return;
            container.remove();
        });
    }

    _updateOrCreateDropdowns(dropdownsData, containerMap, newIds) {
        newIds.forEach((id, idx) => {
            const { wildcard, parent } = dropdownsData[idx];
            let container = containerMap.get(id);
            
            if (!container) {
                container = this.renderDropdownForWildcard(wildcard, parent);
            } else {
                this._updateExistingContainer(container, wildcard);
            }
            
            this._positionContainer(container, parent, idx);
        });
    }

    _updateExistingContainer(container, wildcard) {
        container.innerHTML = '';
        container.appendChild(this.renderCustomDropdown(wildcard));
    }

    _positionContainer(container, parent, idx) {
        if (parent && !parent.contains(container)) {
            parent.appendChild(container);
            return;
        }
        if (!parent && this.sidebar.children[idx] !== container) {
            this.sidebar.insertBefore(container, this.sidebar.children[idx] || null);
        }
    }

    renderDropdownForWildcard(wildcard, parentElement) {
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'wildcard-dropdown-container';
        const customDropdown = this.renderCustomDropdown(wildcard);
        dropdownContainer.appendChild(customDropdown);

        if (parentElement) {
            parentElement.appendChild(dropdownContainer);
        } else {
            this.sidebar.appendChild(dropdownContainer);
        }

        dropdownContainer._wildcard = wildcard;
        dropdownContainer._parent = parentElement;
        return dropdownContainer;
    }

    renderCustomDropdown(wildcard) {
        const container = document.createElement('div');
        container.className = 'custom-dropdown';
        container._wildcard = wildcard;

        const button = this._createDropdownButton(wildcard, container);
        const optionsContainer = this.renderOptions(wildcard, (option, index) => {
            if (this.onSelect) {
                this.onSelect(wildcard, option, index, container);
            }
        }, wildcard);

        container.appendChild(button);
        container.appendChild(optionsContainer);
        container.dataset.wildcardId = DropdownUI.generateWildcardId(wildcard);

        return container;
    }

    _createDropdownButton(wildcard, container) {
        const button = document.createElement('button');
        button.className = 'custom-dropdown-button';
        button.type = 'button';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-text';
        textSpan.textContent = this._getDisplayText(wildcard);

        const arrow = this._createDropdownArrow();
        
        button.appendChild(textSpan);
        button.appendChild(arrow);

        this._setupButtonEventListeners(button, wildcard, container);

        return button;
    }

    _getDisplayText(wildcard) {
        const selectedValue = wildcard.selection;
        if (!selectedValue) {
            return 'nothing selected (random selection)';
        }

        const selectedOption = this._findSelectedOption(wildcard, selectedValue);
        
        if (!selectedOption) {
            return selectedValue;
        }
        
        if (typeof selectedOption === 'object' && selectedOption !== null && selectedOption.displayText) {
            return DropdownUI.truncateOption(selectedOption.displayText);
        }
        
        return DropdownUI.truncateOption(selectedOption);
    }

    _findSelectedOption(wildcard, selectedValue) {
        if (!wildcard.options || !Array.isArray(wildcard.options)) {
            return null;
        }
        
        return wildcard.options.find(opt =>
            (typeof opt === 'string' && opt === selectedValue) ||
            (typeof opt === 'object' && opt !== null && opt.id === selectedValue)
        );
    }

    _createDropdownArrow() {
        const arrow = document.createElement('span');
        arrow.className = 'custom-dropdown-arrow';
        arrow.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
        `;
        return arrow;
    }

    _setupButtonEventListeners(button, wildcard, container) {
        button.addEventListener('mouseenter', () => {
            this._markWildcard(wildcard);
        });
        
        button.addEventListener('mouseleave', () => {
            if (this.textbox) {
                this.textbox.unmark('button');
            }
        });

        button.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (!container.classList.contains('open')) {
                this._markWildcard(wildcard);
            }
            this.toggleCustomDropdown(container);
        });
    }

    renderOptions(wildcard, onSelect, parentWildcard) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-dropdown-options';

        const optionsList = this._buildOptionsList(wildcard);
        this._renderOptionElements(optionsContainer, optionsList);
        this._setupOptionsEventListeners(optionsContainer, wildcard, onSelect, parentWildcard);

        return optionsContainer;
    }

    _buildOptionsList(wildcard) {
        const optionsList = [];
        optionsList.push({ value: '', index: -1, displayText: 'nothing selected (random selection)', option: null });

        if (wildcard.options && Array.isArray(wildcard.options)) {
            wildcard.options.forEach((option, index) => {
                const optionData = this._processOptionData(option, index);
                optionsList.push(optionData);
            });
        }

        return optionsList;
    }

    _processOptionData(option, index) {
        let optionValue, displayText;
        
        if (typeof option === 'object' && option !== null && option.id) {
            optionValue = option.id;
            displayText = option.displayText || option.id;
        } else {
            optionValue = option;
            displayText = option;
        }
        
        return {
            value: optionValue,
            index,
            displayText: DropdownUI.truncateOption(displayText),
            option
        };
    }

    _renderOptionElements(optionsContainer, optionsList) {
        optionsList.forEach(({ value, index, displayText }) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'custom-dropdown-option';
            optionElement.dataset.value = value;
            optionElement.dataset.index = index;
            optionElement.textContent = displayText;
            optionsContainer.appendChild(optionElement);
        });
    }

    _setupOptionsEventListeners(optionsContainer, wildcard, onSelect, parentWildcard) {
        optionsContainer.addEventListener('click', e => {
            const el = e.target.closest('.custom-dropdown-option');
            if (!el) return;
            e.stopPropagation();
            const idx = Number(el.dataset.index);
            const val = el.dataset.value;
            onSelect(val, idx);
            const dropdown = optionsContainer.closest('.custom-dropdown');
            if (!dropdown) return;
            this.closeCustomDropdown(dropdown);
        });

        optionsContainer.addEventListener('mouseenter', e => {
            const el = e.target.closest('.custom-dropdown-option');
            if (!el || !this.textbox) return;
            this.textbox.unmark();
            const idx = Number(el.dataset.index);
            const displayText = el.textContent;
            const option = idx === -1 ? null : wildcard.options[idx];
            if (option && this._isNestedWildcardOption(option, displayText)) {
                this._handleNestedWildcardOption(option, displayText);
                return;
            }
            this._markOption(displayText, parentWildcard, idx);
        }, true);

        optionsContainer.addEventListener('mouseleave', e => {
            const el = e.target.closest('.custom-dropdown-option');
            if (!el || !this.textbox) return;
            this.textbox.unmark();
            const start = parentWildcard.position?.start;
            const end = parentWildcard.position?.end;
            this.textbox.mark(parentWildcard.content, 'button', start, end);
        }, true);
    }

    _handleNestedWildcardOption(option, displayText) {
        const event = new CustomEvent('get-nested-wildcard-position', {
            detail: {
                optionId: option.id,
                displayText: displayText,
                callback: (start, end) => {
                    this.textbox.mark(displayText, 'button', start, end);
                }
            },
            bubbles: true
        });
        this.sidebar.dispatchEvent(event);
    }

    static generateWildcardId(wildcard) {
        return btoa(JSON.stringify({
            path: wildcard.path,
            content: wildcard.content,
            options: wildcard.options
        })).replace(/[^a-zA-Z0-9]/g, '');
    }

    toggleCustomDropdown(container) {
        const isOpen = container.classList.contains('open');
        this.closeAllCustomDropdowns();
        if (!isOpen) {
            this.openCustomDropdown(container);
            this._markWildcard(container._wildcard);
        }
    }

    openCustomDropdown(container) {
        container.classList.add('open');
        this.activeOverlay = container;

        const options = container.querySelector('.custom-dropdown-options');
        if (!options) return;

        options.style.maxHeight = options.scrollHeight + 'px';
        this._setupDropdownScrollBehavior(options);
    }

    _setupDropdownScrollBehavior(options) {
        const onTransitionEnd = () => {
            options.removeEventListener('transitionend', onTransitionEnd);
            this._adjustScrollPosition(options);
        };
        options.addEventListener('transitionend', onTransitionEnd);
    }

    _adjustScrollPosition(options) {
        const scrollContainer = this.sidebar.querySelector('.sidebar-dropdowns-scroll') || this.sidebar;
        const scrollRect = scrollContainer.getBoundingClientRect();
        const optionsRect = options.getBoundingClientRect();
        
        if (optionsRect.bottom > scrollRect.bottom) {
            const scrollAmount = this._calculateScrollAmount(optionsRect, scrollRect);
            scrollContainer.scrollBy({top: scrollAmount, behavior: 'smooth'});
        }
    }

    _calculateScrollAmount(optionsRect, scrollRect) {
        const extraScroll = 32;
        return optionsRect.bottom - scrollRect.bottom + extraScroll;
    }

    closeCustomDropdown(container) {
        container.classList.remove('open');
        if (this.activeOverlay === container) {
            this.activeOverlay = null;
        }
        if (this.textbox) {
            this.textbox.unmark('button');
            this.textbox.unmark('option');
        }
        const button = container.querySelector('.custom-dropdown-button');
        if (button) button.blur();

        const options = container.querySelector('.custom-dropdown-options');
        if (options) {
            options.style.maxHeight = '0px';
        }
    }

    closeAllCustomDropdowns() {
        document.querySelectorAll('.custom-dropdown.open').forEach(dropdown => {
            this.closeCustomDropdown(dropdown);
        });
    }

    _setupGlobalClickListener() {
        document.addEventListener('mousedown', e => {
            if (this.activeOverlay && !this.activeOverlay.contains(e.target)) {
                this.closeCustomDropdown(this.activeOverlay);
            }
        });
    }

    static truncateOption(option) {
        if (typeof option === 'string' && option.length > 40) {
            return option.slice(0, 40) + '...';
        }
        return option || '';
    }

    clearDropdowns() {
        this.sidebar.querySelectorAll('.wildcard-dropdown-container').forEach(el => el.remove());
    }

    _hasDuplicateOptions(wildcard) {
        if (!wildcard.options || !Array.isArray(wildcard.options) || wildcard.options.length <= 1) {
            return false;
        }
        
        const seen = new Set();
        for (const option of wildcard.options) {
            const text = typeof option === 'string' ? option :
                        (option?.displayText || option?.id || '');
            
            if (seen.has(text)) {
                return true;
            }
            seen.add(text);
        }
        
        return false;
    }
    
    _normalizeWildcardText(text) {
        return text.replace(/\s*\|\s*/g, '|')
                  .replace(/{\s*/g, '{')
                  .replace(/\s*}/g, '}');
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
            
            const normalizedText = this._normalizeWildcardText(text);
            
            if (normalizedText === normalizedSearchText) {
                count++;
                if (count > 1) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    _isNestedWildcardOption(option, displayText) {
        return typeof displayText === 'string' &&
               displayText.startsWith('{') &&
               displayText.endsWith('}') &&
               typeof option === 'object' &&
               option !== null &&
               option.id;
    }
}

export class DropdownManager {
    constructor(sidebar, structureData, processor, textbox) {
        this.sidebar = sidebar;
        this.structureData = structureData || { nodes: {}, root_nodes: [] };
        this.processor = processor;
        this.textbox = textbox;
        this.ui = new DropdownUI(sidebar, (wildcard, selectedValue, selectedIndex, container) => {
            this.handleUserSelection(wildcard, selectedValue, selectedIndex, container);
        }, textbox);
        this.observers = [];
        this._init();
    }

    _init() {
        this._notifyObservers = this._notifyObservers.bind(this);
        this.addObserver(() => this.render());
        this._setupNestedWildcardListener();
        this.render();
    }

    _setupNestedWildcardListener() {
        this.sidebar.addEventListener('get-nested-wildcard-position', (event) => {
            const { optionId, displayText, callback } = event.detail;
            
            const choiceNode = this.structureData?.nodes?.[optionId];
            if (!choiceNode || !choiceNode.children) return;
            
            const wildcardChildIds = Object.keys(choiceNode.children);
            if (wildcardChildIds.length === 0) return;
            
            const wildcardNodeId = wildcardChildIds[0];
            const wildcardNode = this.structureData?.nodes?.[wildcardNodeId];
            
            if (wildcardNode && wildcardNode.position) {
                callback(wildcardNode.position.start, wildcardNode.position.end);
            }
        });
    }

    addObserver(fn) {
        this.observers.push(fn);
    }

    removeObserver(fn) {
        this.observers = this.observers.filter(obs => obs !== fn);
    }

    _notifyObservers() {
        this.observers.forEach(fn => fn());
    }

    handleUserSelection(wildcard, selectedValue) {
        this.setSelected(wildcard, selectedValue);
    }

    setSelected(wildcard, selectedValue) {
        wildcard.selection = selectedValue;
        this._updateProcessorData();
        this._notifyObservers();
    }

    setSelectedByTarget(target, value) {
        if (!this._isValidTarget(target)) return;
        this.structureData.nodes[target].selection = value;
        this._notifyObservers();
    }

    _updateProcessorData() {
        if (this.processor) {
            this.processor.updateNodeData({
                wildcards_structure_data: JSON.stringify(this.structureData)
            });
        }
    }

    _isValidTarget(target) {
        return this.structureData &&
               this.structureData.nodes &&
               this.structureData.nodes[target];
    }

    findRootWildcards(data) {
        if (!data) {
            console.warn('Structure data is undefined or null');
            return [];
        }
        
        if (data.nodes && data.root_nodes) {
            return this._findRootWildcardsFromNodes(data);
        }
        
        return this._findRootWildcardsFromData(data);
    }

    _findRootWildcardsFromNodes(data) {
        const wildcards = [];
        data.root_nodes.forEach(rootNodeId => {
            const rootNode = data.nodes[rootNodeId];
            if (!rootNode) return;
            this._collectWildcardNodes(rootNode, data.nodes, wildcards);
        });
        return wildcards;
    }

    _findRootWildcardsFromData(data) {
        const wildcards = [];
        for (const key in data) {
            if (!this._isValidDataKey(data, key)) continue;
            
            for (const nestedKey in data[key]) {
                if (!data[key].hasOwnProperty(nestedKey)) continue;
                const nested = data[key][nestedKey];
                
                if (this._isValidWildcard(nested)) {
                    wildcards.push(nested);
                }
            }
        }
        return wildcards;
    }

    _isValidDataKey(data, key) {
        return data.hasOwnProperty(key) &&
               typeof data[key] === 'object' &&
               data[key] !== null;
    }

    _isValidWildcard(nested) {
        return typeof nested === 'object' &&
               nested !== null &&
               Array.isArray(nested.options);
    }
    
    _collectWildcardNodes(node, allNodes, wildcards) {
        if (!this._isWildcardNode(node)) {
            this._processChildNodes(node, allNodes, wildcards);
            return;
        }
        
        this._updateOptionDisplayTexts(node, allNodes);
        wildcards.push(node);
        this._processChildNodes(node, allNodes, wildcards);
    }

    _isWildcardNode(node) {
        return node.type === 'wildcard' && Array.isArray(node.options);
    }

    _processChildNodes(node, allNodes, wildcards) {
        if (!node.children) return;
        Object.keys(node.children).forEach(childId => {
            const childNode = allNodes[childId];
            if (!childNode) return;
            this._collectWildcardNodes(childNode, allNodes, wildcards);
        });
    }

    _updateOptionDisplayTexts(node, allNodes) {
        if (!node.options) return;
        
        const needsDisplayTextUpdate = node.options.some(opt =>
            typeof opt === 'object' && opt !== null && opt.id && !opt.displayText
        );
        
        if (!needsDisplayTextUpdate) return;
        
        node.options = node.options.map(option => {
            if (this._shouldUpdateOptionDisplayText(option, allNodes)) {
                return {
                    ...option,
                    displayText: allNodes[option.id].content
                };
            }
            return option;
        });
    }

    _shouldUpdateOptionDisplayText(option, allNodes) {
        return typeof option === 'object' &&
               option !== null &&
               option.id &&
               allNodes[option.id] &&
               !option.displayText;
    }

    buildDropdownsData() {
        const dropdownsData = [];
        const rootWildcards = this.findRootWildcards(this.structureData);
        rootWildcards.forEach(wildcard => {
            dropdownsData.push({ wildcard, parent: null });
            this._collectChildDropdowns(wildcard, wildcard.selection, dropdownsData, null);
        });
        return dropdownsData;
    }

    _collectChildDropdowns(wildcard, selectedValue, dropdownsData, parentContainer) {
        if (selectedValue === '' || !wildcard.options) return;
        
        const selectedOption = this._findSelectedOptionForWildcard(wildcard, selectedValue);
        if (!selectedOption) return;
        
        const optionId = this._extractOptionId(selectedOption);
        if (!this._isValidOptionId(optionId)) return;
        
        const nestedNode = this.structureData.nodes[optionId];
        if (!nestedNode.children) return;
        
        this._processNestedNodeChildren(nestedNode, dropdownsData, parentContainer);
    }

    _findSelectedOptionForWildcard(wildcard, selectedValue) {
        return wildcard.options.find(opt =>
            (typeof opt === 'string' && opt === selectedValue) ||
            (typeof opt === 'object' && opt !== null && opt.id === selectedValue)
        );
    }

    _extractOptionId(selectedOption) {
        if (typeof selectedOption === 'object' && selectedOption.id) {
            return selectedOption.id;
        } else if (typeof selectedOption === 'string') {
            return selectedOption;
        }
        return null;
    }

    _isValidOptionId(optionId) {
        return optionId &&
               this.structureData &&
               this.structureData.nodes &&
               this.structureData.nodes[optionId];
    }

    _processNestedNodeChildren(nestedNode, dropdownsData, parentContainer) {
        Object.keys(nestedNode.children).forEach(childId => {
            const childNode = this.structureData.nodes[childId];
            if (this._isValidChildWildcardNode(childNode)) {
                this._updateOptionDisplayTexts(childNode, this.structureData.nodes);
                dropdownsData.push({ wildcard: childNode, parent: parentContainer });
                this._collectChildDropdowns(childNode, childNode.selection, dropdownsData, parentContainer);
            }
        });
    }

    _isValidChildWildcardNode(node) {
        return node &&
               node.type === 'wildcard' &&
               Array.isArray(node.options);
    }

    render() {
        const dropdownsData = this.buildDropdownsData();
        this.ui.render(dropdownsData);
    }

    refresh() {
        this._notifyObservers();
    }
}