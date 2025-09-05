
// Dropdown UI/UX logic (DOM manipulation, rendering, event handling, animations)
class DropdownUI {
    constructor(sidebar, onSelect) {
        this.sidebar = sidebar;
        this.onSelect = onSelect;
        this.activeOverlay = null;
        this._setupGlobalClickListener();
    }

    // Pure renderer: receives dropdownsData (array of wildcards) and renders them
    render(dropdownsData) {
        this.clearDropdowns();
        dropdownsData.forEach(({ wildcard, parent }) => {
            this.renderDropdownForWildcard(wildcard, parent);
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

        const button = document.createElement('button');
        button.className = 'custom-dropdown-button';
        button.type = 'button';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-text';

        const selectedValue = wildcard.selected;
        let displayText;
        if (!selectedValue) {
            displayText = 'nothing selected (random selection)';
        } else if (wildcard.options.includes(selectedValue)) {
            displayText = DropdownUI.truncateOption(wildcard[selectedValue]?.raw || selectedValue);
        } else {
            displayText = selectedValue;
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

        const optionsContainer = this.renderOptions(wildcard, wildcard.options.indexOf(selectedValue), (option, index) => {
            if (this.onSelect) {
                this.onSelect(wildcard, option, index, container);
            }
        });

        button.addEventListener('mousedown', e => {
            e.stopPropagation();
            this.toggleCustomDropdown(container);
        });

        container.appendChild(button);
        container.appendChild(optionsContainer);
        container.dataset.wildcardId = DropdownUI.generateWildcardId(wildcard);

        return container;
    }

    renderOptions(wildcard, selectedIndex, onSelect) {
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

        wildcard.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'custom-dropdown-option';
            optionElement.dataset.value = option;
            optionElement.dataset.index = index;
            optionElement.textContent = DropdownUI.truncateOption(wildcard[option]?.raw || option);

            optionElement.addEventListener('click', e => {
                e.stopPropagation();
                onSelect(option, index);
            });
            optionsContainer.appendChild(optionElement);
        });

        return optionsContainer;
    }

    static generateWildcardId(wildcard) {
        return btoa(JSON.stringify({
            raw: wildcard.raw,
            options: wildcard.options,
            target: wildcard.target
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
        if (options) {
            options.style.maxHeight = options.scrollHeight + 'px';
        }
    }

    closeCustomDropdown(container) {
        container.classList.remove('open');
        if (this.activeOverlay === container) {
            this.activeOverlay = null;
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

// Dropdown management logic (data/state management, structure updates, selection logic)
export class DropdownManager {
    constructor(sidebar, structureData, processor) {
        this.sidebar = sidebar;
        this.structureData = structureData;
        this.processor = processor;
        this.ui = new DropdownUI(sidebar, (wildcard, selectedValue, selectedIndex, container) => {
            this.handleUserSelection(wildcard, selectedValue, selectedIndex, container);
        });
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

    // Observer pattern
    addObserver(fn) {
        this.observers.push(fn);
    }

    removeObserver(fn) {
        this.observers = this.observers.filter(obs => obs !== fn);
    }

    _notifyObservers() {
        this.observers.forEach(fn => fn());
    }

    // Centralized state change for selection
    handleUserSelection(wildcard, selectedValue, selectedIndex, container) {
        this.setSelected(wildcard, selectedValue);
    }

    setSelected(wildcard, selectedValue) {
        wildcard.selected = selectedValue;
        if (wildcard.target && this.processor) {
            this.processor.updateNodeData({
                wildcards_structure_data: JSON.stringify(this.structureData)
            });
        }
        this._notifyObservers();
    }

    // Programmatic API for updating dropdowns
    setSelectedByTarget(target, value) {
        let obj = this.structureData;
        for (let i = 0; i < target.length; i++) {
            obj = obj[target[i]];
        }
        obj.selected = value;
        this._notifyObservers();
    }

    // Find all root wildcards for initial rendering
    findRootWildcards(data) {
        const wildcards = [];
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
        return wildcards;
    }

    // Build dropdowns data for UI rendering
    buildDropdownsData() {
        const dropdownsData = [];
        const rootWildcards = this.findRootWildcards(this.structureData);
        rootWildcards.forEach(wildcard => {
            dropdownsData.push({ wildcard, parent: null });
            this._collectChildDropdowns(wildcard, wildcard.selected, dropdownsData, null);
        });
        return dropdownsData;
    }

    _collectChildDropdowns(wildcard, selectedValue, dropdownsData, parentContainer) {
        if (selectedValue !== '' && wildcard[selectedValue]) {
            const selectedOption = wildcard[selectedValue];
            if (Array.isArray(selectedOption.options)) {
                selectedOption.options.forEach(optKey => {
                    const nestedItem = selectedOption[optKey];
                    if (nestedItem && typeof nestedItem === 'object' && Array.isArray(nestedItem.options) && nestedItem.options.length > 0) {
                        dropdownsData.push({ wildcard: nestedItem, parent: parentContainer });
                        this._collectChildDropdowns(nestedItem, nestedItem.selected, dropdownsData, parentContainer);
                    }
                });
            }
        }
    }

    // UI rendering delegation
    render() {
        const dropdownsData = this.buildDropdownsData();
        this.ui.render(dropdownsData);
    }

    // Programmatic API to refresh UI
    refresh() {
        this._notifyObservers();
    }
}