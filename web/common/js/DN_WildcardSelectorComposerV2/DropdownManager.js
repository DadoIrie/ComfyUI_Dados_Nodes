class DropdownUI {
    constructor(sidebar, onSelect, textbox) {
        this.sidebar = sidebar;
        this.onSelect = onSelect;
        this.textbox = textbox;
        this.activeOverlay = null;
        this._setupGlobalClickListener();
    }

    render(dropdownsData) {
        const containerMap = new Map();
        this.sidebar.querySelectorAll('.wildcard-dropdown-container').forEach(container => {
            const id = container.querySelector('.custom-dropdown')?.dataset.wildcardId;
            if (id) containerMap.set(id, container);
        });

        const newIds = dropdownsData.map(({ wildcard }) => DropdownUI.generateWildcardId(wildcard));

        containerMap.forEach((container, id) => {
            if (!newIds.includes(id)) {
                container.remove();
            }
        });

        newIds.forEach((id, idx) => {
            const { wildcard, parent } = dropdownsData[idx];
            let container = containerMap.get(id);
            if (!container) {
                container = this.renderDropdownForWildcard(wildcard, parent);
            } else {
                container.innerHTML = '';
                const customDropdown = this.renderCustomDropdown(wildcard);
                container.appendChild(customDropdown);
            }
            if (parent) {
                if (!parent.contains(container)) {
                    parent.appendChild(container);
                }
            } else {
                if (this.sidebar.children[idx] !== container) {
                    this.sidebar.insertBefore(container, this.sidebar.children[idx] || null);
                }
            }
        });
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

        const button = document.createElement('button');
        button.className = 'custom-dropdown-button';
        button.type = 'button';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-text';

        // Use 'selection' instead of 'selected' for the new structure
        const selectedValue = wildcard.selection;
        let displayText;
        if (!selectedValue) {
            displayText = 'nothing selected (random selection)';
        } else {
            // Find the selected option and get its content
            let selectedOption = null;
            if (wildcard.options && Array.isArray(wildcard.options)) {
                selectedOption = wildcard.options.find(opt =>
                    (typeof opt === 'string' && opt === selectedValue) ||
                    (typeof opt === 'object' && opt !== null && opt.id === selectedValue)
                );
            }
            
            if (selectedOption) {
                if (typeof selectedOption === 'object' && selectedOption !== null && selectedOption.displayText) {
                    displayText = DropdownUI.truncateOption(selectedOption.displayText);
                } else {
                    displayText = DropdownUI.truncateOption(selectedOption);
                }
            } else {
                displayText = selectedValue;
            }
        }
        textSpan.textContent = displayText;

        const arrow = document.createElement('span');
        arrow.className = 'custom-dropdown-arrow';
        arrow.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
        `;

        button.appendChild(textSpan);
        button.appendChild(arrow);

        const optionsContainer = this.renderOptions(wildcard, (option, index) => {
            if (this.onSelect) {
                this.onSelect(wildcard, option, index, container);
            }
        }, wildcard);

        button.addEventListener('mousedown', e => {
            e.stopPropagation();
            this.toggleCustomDropdown(container);
        });

        container.appendChild(button);
        container.appendChild(optionsContainer);
        container.dataset.wildcardId = DropdownUI.generateWildcardId(wildcard);

        return container;
    }

    renderOptions(wildcard, onSelect, parentWildcard) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-dropdown-options';

        const resetOption = document.createElement('div');
        resetOption.className = 'custom-dropdown-option';
        resetOption.dataset.value = '';
        resetOption.dataset.index = -1;
        resetOption.textContent = 'nothing selected (random selection)';
        resetOption.addEventListener('click', e => {
            e.stopPropagation();
            onSelect('', -1);
        });
        optionsContainer.appendChild(resetOption);

        if (wildcard.options && Array.isArray(wildcard.options)) {
            wildcard.options.forEach((option, index) => {
                const optionElement = document.createElement('div');
                optionElement.className = 'custom-dropdown-option';
                
                // Handle both string options and object options with id/path
                let optionValue, displayText;
                if (typeof option === 'object' && option !== null && option.id) {
                    optionValue = option.id;
                    // Use displayText if available, otherwise use the id
                    displayText = option.displayText || option.id;
                } else {
                    optionValue = option;
                    displayText = option;
                }
                
                optionElement.dataset.value = optionValue;
                optionElement.dataset.index = index;
                optionElement.textContent = DropdownUI.truncateOption(displayText);

                optionElement.addEventListener('click', e => {
                    e.stopPropagation();
                    onSelect(optionValue, index);
                });
                optionElement.addEventListener('mouseenter', () => {
                    if (this.textbox) {
                        this.textbox.unmark();
                        // Use position data for marking
                        const start = parentWildcard.position?.start;
                        const end = parentWildcard.position?.end;
                        this.textbox.mark(displayText, 'button', start, end);
                    }
                });
                optionElement.addEventListener('mouseleave', () => {
                    if (this.textbox) {
                        this.textbox.unmark();
                        const start = parentWildcard.position?.start;
                        const end = parentWildcard.position?.end;
                        this.textbox.mark(parentWildcard.content, 'button', start, end);
                    }
                });
                optionsContainer.appendChild(optionElement);
            });
        }

        return optionsContainer;
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
        }
    }

    openCustomDropdown(container) {
        container.classList.add('open');
        this.activeOverlay = container;

        const options = container.querySelector('.custom-dropdown-options');
        const wildcard = container._wildcard;
        if (wildcard && typeof wildcard.content === 'string') {
            // Use position data for marking
            const start = wildcard.position?.start;
            const end = wildcard.position?.end;
            this.textbox.mark(wildcard.content, 'button', start, end);
        }
        if (options) {
            options.style.maxHeight = options.scrollHeight + 'px';
            const onTransitionEnd = () => {
                options.removeEventListener('transitionend', onTransitionEnd);
                const scrollContainer = this.sidebar.querySelector('.sidebar-dropdowns-scroll') || this.sidebar;
                const scrollRect = scrollContainer.getBoundingClientRect();
                const optionsRect = options.getBoundingClientRect();
                const extraScroll = 32;
                if (optionsRect.bottom > scrollRect.bottom) {
                    const scrollAmount = optionsRect.bottom - scrollRect.bottom + extraScroll;
                    scrollContainer.scrollBy({top: scrollAmount, behavior: 'smooth'});
                }
            };
            options.addEventListener('transitionend', onTransitionEnd);
        }
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
        this.addObserver(() => {
            this.render();
        });
        this.render();
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
        // Use 'selection' instead of 'selected' for the new structure
        wildcard.selection = selectedValue;
        if (wildcard.path && this.processor) {
            this.processor.updateNodeData({
                wildcards_structure_data: JSON.stringify(this.structureData)
            });
        }
        this._notifyObservers();
    }

    setSelectedByTarget(target, value) {
        // Navigate the new structure using the path
        if (this.structureData && this.structureData.nodes && this.structureData.nodes[target]) {
            this.structureData.nodes[target].selection = value;
            this._notifyObservers();
        }
    }

    findRootWildcards(data) {
        const wildcards = [];
        
        // Check if data is valid
        if (!data) {
            console.warn('Structure data is undefined or null');
            return wildcards;
        }
        
        // Handle the new structure with nodes and root_nodes
        if (data.nodes && data.root_nodes) {
            // Start with root nodes
            data.root_nodes.forEach(rootNodeId => {
                const rootNode = data.nodes[rootNodeId];
                if (rootNode) {
                    this._collectWildcardNodes(rootNode, data.nodes, wildcards);
                }
            });
        } else {
            // Fallback to the old structure for compatibility
            for (const key in data) {
                if (data.hasOwnProperty(key) && typeof data[key] === 'object' && data[key] !== null) {
                    for (const nestedKey in data[key]) {
                        if (data[key].hasOwnProperty(nestedKey)) {
                            const nested = data[key][nestedKey];
                            if (typeof nested === 'object' && nested !== null && Array.isArray(nested.options)) {
                                wildcards.push(nested);
                            }
                        }
                    }
                }
            }
        }
        
        return wildcards;
    }
    
    _collectWildcardNodes(node, allNodes, wildcards) {
        if (node.type === 'wildcard' && Array.isArray(node.options)) {
            // Add displayText to object options
            if (node.options) {
                node.options = node.options.map(option => {
                    if (typeof option === 'object' && option !== null && option.id && allNodes[option.id]) {
                        return {
                            ...option,
                            displayText: allNodes[option.id].content
                        };
                    }
                    return option;
                });
            }
            wildcards.push(node);
        }
        
        // Process children
        if (node.children) {
            Object.keys(node.children).forEach(childId => {
                const childNode = allNodes[childId];
                if (childNode) {
                    this._collectWildcardNodes(childNode, allNodes, wildcards);
                }
            });
        }
    }

    buildDropdownsData() {
        const dropdownsData = [];
        const rootWildcards = this.findRootWildcards(this.structureData);
        rootWildcards.forEach(wildcard => {
            dropdownsData.push({ wildcard, parent: null });
            // Use 'selection' instead of 'selected'
            this._collectChildDropdowns(wildcard, wildcard.selection, dropdownsData, null);
        });
        return dropdownsData;
    }

    _collectChildDropdowns(wildcard, selectedValue, dropdownsData, parentContainer) {
        if (selectedValue !== '' && wildcard.options) {
            // Find the selected option in the options array
            const selectedOption = wildcard.options.find(opt =>
                (typeof opt === 'string' && opt === selectedValue) ||
                (typeof opt === 'object' && opt !== null && opt.id === selectedValue)
            );
            
            if (selectedOption) {
                let optionId = null;
                if (typeof selectedOption === 'object' && selectedOption.id) {
                    optionId = selectedOption.id;
                } else if (typeof selectedOption === 'string') {
                    optionId = selectedOption;
                }
                
                if (optionId && this.structureData && this.structureData.nodes && this.structureData.nodes[optionId]) {
                    const nestedNode = this.structureData.nodes[optionId];
                    
                    // Check if this node has children (which would be nested wildcards)
                    if (nestedNode.children) {
                        Object.keys(nestedNode.children).forEach(childId => {
                            const childNode = this.structureData.nodes[childId];
                            if (childNode && childNode.type === 'wildcard' && Array.isArray(childNode.options)) {
                                // Add displayText to object options
                                if (childNode.options) {
                                    childNode.options = childNode.options.map(option => {
                                        if (typeof option === 'object' && option !== null && option.id && this.structureData.nodes[option.id]) {
                                            return {
                                                ...option,
                                                displayText: this.structureData.nodes[option.id].content
                                            };
                                        }
                                        return option;
                                    });
                                }
                                dropdownsData.push({ wildcard: childNode, parent: parentContainer });
                                // Use 'selection' instead of 'selected'
                                this._collectChildDropdowns(childNode, childNode.selection, dropdownsData, parentContainer);
                            }
                        });
                    }
                }
            }
        }
    }

    render() {
        const dropdownsData = this.buildDropdownsData();
        this.ui.render(dropdownsData);
    }

    refresh() {
        this._notifyObservers();
    }
}