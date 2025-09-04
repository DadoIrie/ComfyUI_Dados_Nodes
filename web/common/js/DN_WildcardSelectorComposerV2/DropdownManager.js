export class DropdownManager {
    constructor(sidebar, structureData) {
        this.sidebar = sidebar;
        this.structureData = structureData;
        this.dropdowns = new Map();
        this.activeOverlay = null;
        this._setupGlobalClickListener();
    }

    createDropdowns() {
        this.clearDropdowns();
        const rootWildcards = this.findRootWildcards(this.structureData);
        rootWildcards.forEach(wildcard => this.createDropdownForWildcard(wildcard, null));
    }

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

    createDropdownForWildcard(wildcard, parentElement) {
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'wildcard-dropdown-container';
        
        const customDropdown = this._createCustomDropdown(wildcard);
        dropdownContainer.appendChild(customDropdown);

        if (parentElement) {
            parentElement.appendChild(dropdownContainer);
        } else {
            this.sidebar.appendChild(dropdownContainer);
        }

        this.dropdowns.set(dropdownContainer, { wildcard, parent: parentElement });
        return dropdownContainer;
    }

    _createCustomDropdown(wildcard) {
        const container = document.createElement('div');
        container.className = 'custom-dropdown';

        const button = document.createElement('button');
        button.className = 'custom-dropdown-button';
        button.type = 'button';

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-dropdown-text';

        const selectedValue = wildcard.selected;
        let displayText;
        
        if (selectedValue && wildcard.options.includes(selectedValue)) {
            displayText = this.truncateOption(wildcard[selectedValue]?.raw || selectedValue);
        } else {
            displayText = selectedValue || '';
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

        const optionsContainer = this._renderOptions(wildcard, wildcard.options.indexOf(selectedValue), (option, index) => {
            this._handleCustomDropdownSelection(container, wildcard, option, index);
        });

        button.addEventListener('mousedown', e => {
            e.stopPropagation();
            this._toggleCustomDropdown(container);
        });

        container.appendChild(button);
        container.appendChild(optionsContainer);
        container.dataset.wildcardId = this._generateWildcardId(wildcard);

        return container;
    }

    _renderOptions(wildcard, selectedIndex, onSelect) {
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
            optionElement.textContent = this.truncateOption(wildcard[option]?.raw || option);

            optionElement.addEventListener('click', e => {
                e.stopPropagation();
                onSelect(option, index);
            });
            optionsContainer.appendChild(optionElement);
        });

        return optionsContainer;
    }

    _generateWildcardId(wildcard) {
        return btoa(JSON.stringify({
            raw: wildcard.raw,
            options: wildcard.options,
            target: wildcard.target
        })).replace(/[^a-zA-Z0-9]/g, '');
    }

    _toggleCustomDropdown(container) {
        const isOpen = container.classList.contains('open');
        this._closeAllCustomDropdowns();
        if (!isOpen) {
            this._openCustomDropdown(container);
        }
    }

    _openCustomDropdown(container) {
        container.classList.add('open');
        this.activeOverlay = container;

        const options = container.querySelector('.custom-dropdown-options');
        if (options) {
            options.style.maxHeight = options.scrollHeight + 'px';
        }
    }

    _closeCustomDropdown(container) {
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

    _closeAllCustomDropdowns() {
        document.querySelectorAll('.custom-dropdown.open').forEach(dropdown => {
            this._closeCustomDropdown(dropdown);
        });
    }

    _setupGlobalClickListener() {
        document.addEventListener('mousedown', e => {
            if (this.activeOverlay && !this.activeOverlay.contains(e.target)) {
                this._closeCustomDropdown(this.activeOverlay);
            }
        });
    }

    _handleCustomDropdownSelection(container, wildcard, selectedOption, selectedIndex) {
        const button = container.querySelector('.custom-dropdown-button');
        const options = container.querySelectorAll('.custom-dropdown-option');
        const displayText = selectedIndex === -1 
            ? (wildcard.selected || '') 
            : this.truncateOption(wildcard[selectedOption]?.raw || selectedOption);
        
        const textSpan = button.querySelector('.custom-dropdown-text');
        textSpan.textContent = displayText;

        options.forEach(opt => opt.classList.remove('selected'));
        const selectedOptionElement = selectedIndex === -1 ? options[0] : options[selectedIndex + 1];
        if (selectedOptionElement) {
            selectedOptionElement.classList.add('selected');
        }

        this._closeCustomDropdown(container);

        const selectedValue = selectedIndex === -1 ? '' : selectedOption;
        const dropdownContainer = container.closest('.wildcard-dropdown-container');
        if (dropdownContainer) {
            this.handleDropdownChange(wildcard, selectedValue, dropdownContainer);
        }
    }

    handleDropdownChange(wildcard, selectedValue, dropdownContainer) {
        this.removeChildDropdowns(dropdownContainer);

        if (selectedValue !== '' && wildcard[selectedValue]) {
            const selectedOption = wildcard[selectedValue];
            if (Array.isArray(selectedOption.options)) {
                selectedOption.options.forEach(optKey => {
                    const nestedItem = selectedOption[optKey];
                    if (nestedItem &&
                        typeof nestedItem === 'object' &&
                        Array.isArray(nestedItem.options) &&
                        nestedItem.options.length > 0) {
                        this.createDropdownForWildcard(nestedItem, dropdownContainer);
                    }
                });
            }
        }
    }

    removeChildDropdowns(parentContainer) {
        for (const [element, dropdown] of this.dropdowns.entries()) {
            if (dropdown.parent === parentContainer) {
                element.remove();
                this.dropdowns.delete(element);
            }
        }
    }

    clearDropdowns() {
        this.sidebar.querySelectorAll('.wildcard-dropdown-container').forEach(el => el.remove());
        this.dropdowns.clear();
    }

    truncateOption(option) {
        if (typeof option === 'string' && option.length > 40) {
            return option.slice(0, 40) + '...';
        }
        return option || '';
    }
}