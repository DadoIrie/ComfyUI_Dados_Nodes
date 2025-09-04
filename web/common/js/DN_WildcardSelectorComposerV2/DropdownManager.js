export class DropdownManager {
    constructor(sidebar, structureData) {
        this.sidebar = sidebar;
        this.structureData = structureData;
        this.dropdowns = []; // Track created dropdowns
        this.activeOverlay = null;
    }

    /**
     * Create dropdowns based on the structure data
     */
    createDropdowns() {
        // Clear existing dropdowns
        this.clearDropdowns();
        
        // Find root level wildcards (objects with options key)
        const rootWildcards = this.findRootWildcards(this.structureData);
        
        // Create dropdowns for each root wildcard
        rootWildcards.forEach(wildcard => {
            this.createDropdownForWildcard(wildcard, null);
        });
    }

    /**
     * Find root level wildcards in the structure data
     */
    findRootWildcards(data) {
        const wildcards = [];
        
        // Iterate through the top-level properties of the data object
        for (const key in data) {
            if (data.hasOwnProperty(key) && typeof data[key] === 'object' && data[key] !== null) {
                // Check if this object has nested wildcards
                for (const nestedKey in data[key]) {
                    if (data[key].hasOwnProperty(nestedKey) && typeof data[key][nestedKey] === 'object' && data[key][nestedKey] !== null) {
                        // Check if this nested object is a wildcard (has options key)
                        if (data[key][nestedKey].options && Array.isArray(data[key][nestedKey].options)) {
                            wildcards.push(data[key][nestedKey]);
                        }
                    }
                }
            }
        }
        
        return wildcards;
    }

    /**
     * Create a dropdown for a specific wildcard
     */
    createDropdownForWildcard(wildcard, parentElement) {
        // Create dropdown container
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'wildcard-dropdown-container';
        
        // Create custom dropdown
        const customDropdown = this._createCustomDropdown(wildcard);
        
        dropdownContainer.appendChild(customDropdown);
        
        // Add to sidebar or after parent element
        if (parentElement) {
            // Insert child dropdown inside parent container
            parentElement.appendChild(dropdownContainer);
        } else {
            this.sidebar.appendChild(dropdownContainer);
        }
        
        // Store reference to dropdown
        this.dropdowns.push({
            element: dropdownContainer,
            wildcard: wildcard,
            parent: parentElement
        });
        
        return dropdownContainer;
    }

    /**
     * Create a custom dropdown element
     */
    _createCustomDropdown(wildcard) {
        const container = document.createElement('div');
        container.className = 'custom-dropdown';
        
        const button = document.createElement('button');
        button.className = 'custom-dropdown-button';
        button.type = 'button';
        
        const arrow = document.createElement('div');
        arrow.className = 'custom-dropdown-arrow';
        arrow.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
        `;
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-dropdown-options';
        
        // Set initial button text
        const selectedValue = wildcard.selected || '';
        const selectedIndex = selectedValue ? wildcard.options.indexOf(selectedValue) : -1;
        button.textContent = selectedIndex === -1 ? '(not selected)' : this.truncateOption(wildcard[selectedValue]?.raw || selectedValue);
        
        // Add the "(not selected)" option first
        const notSelectedOption = document.createElement('div');
        notSelectedOption.className = 'custom-dropdown-option not-selected';
        notSelectedOption.dataset.value = '';
        notSelectedOption.dataset.index = -1;
        notSelectedOption.textContent = '(not selected)';
        
        if (selectedIndex === -1) {
            notSelectedOption.classList.add('selected');
        }
        
        notSelectedOption.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleCustomDropdownSelection(container, wildcard, '', -1);
        });
        
        optionsContainer.appendChild(notSelectedOption);
        
        // Add actual options
        wildcard.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'custom-dropdown-option';
            optionElement.dataset.value = option;
            optionElement.dataset.index = index;
            
            // Use raw text for display if available, otherwise use the option key
            const displayText = this.truncateOption(wildcard[option]?.raw || option);
            optionElement.textContent = displayText;
            
            if (index === selectedIndex) {
                optionElement.classList.add('selected');
            }
            
            optionElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleCustomDropdownSelection(container, wildcard, option, index);
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        // Add event listener for button click
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleCustomDropdown(container);
        });
        
        container.appendChild(button);
        container.appendChild(arrow);
        container.appendChild(optionsContainer);
        
        // Store reference to the dropdown container for this specific wildcard
        container.dataset.wildcardId = this._generateWildcardId(wildcard);
        
        return container;
    }

    /**
     * Generate a unique ID for a wildcard
     */
    _generateWildcardId(wildcard) {
        // Create a unique ID based on the wildcard properties
        return btoa(JSON.stringify({
            raw: wildcard.raw,
            options: wildcard.options,
            target: wildcard.target
        })).replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * Toggle custom dropdown open/closed
     */
    _toggleCustomDropdown(container) {
        const isOpen = container.classList.contains('open');
        
        // Close all other dropdowns
        this._closeAllCustomDropdowns();
        
        if (isOpen) {
            this._closeCustomDropdown(container);
        } else {
            this._openCustomDropdown(container);
        }
    }

    /**
     * Open custom dropdown
     */
    _openCustomDropdown(container) {
        container.classList.add('open');
        this.activeOverlay = container;
        
        // Add click outside handler
        const handleClickOutside = (e) => {
            if (!container.contains(e.target)) {
                this._closeCustomDropdown(container);
                document.removeEventListener('mousedown', handleClickOutside);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
    }

    /**
     * Close custom dropdown
     */
    _closeCustomDropdown(container) {
        container.classList.remove('open');
        if (this.activeOverlay === container) {
            this.activeOverlay = null;
        }
    }

    /**
     * Close all custom dropdowns
     */
    _closeAllCustomDropdowns() {
        document.querySelectorAll('.custom-dropdown.open').forEach(dropdown => {
            this._closeCustomDropdown(dropdown);
        });
    }

    /**
     * Handle custom dropdown selection
     */
    _handleCustomDropdownSelection(container, wildcard, selectedOption, selectedIndex) {
        const button = container.querySelector('.custom-dropdown-button');
        const options = container.querySelectorAll('.custom-dropdown-option');
        
        // Update button text using raw text if available
        const displayText = selectedIndex === -1 ? '(not selected)' : this.truncateOption(wildcard[selectedOption]?.raw || selectedOption);
        button.textContent = displayText;
        
        // Update selected option styling
        options.forEach(opt => opt.classList.remove('selected'));
        if (selectedIndex === -1) {
            // Select the "(not selected)" option which is the first child
            const notSelectedOption = container.querySelector('.custom-dropdown-option.not-selected');
            if (notSelectedOption) {
                notSelectedOption.classList.add('selected');
            }
        } else {
            // Select the actual option (shift by 1 because of "(not selected)")
            options[selectedIndex + 1].classList.add('selected');
        }
        
        // Close dropdown
        this._closeCustomDropdown(container);
        
        // Handle the selection change
        const selectedValue = selectedIndex === -1 ? '' : selectedOption;
        // Find the dropdown container element (parent of the custom dropdown)
        const dropdownContainer = container.closest('.wildcard-dropdown-container');
        if (dropdownContainer) {
            this.handleDropdownChange(wildcard, selectedValue, dropdownContainer);
        }
    }

    /**
     * Truncate option text if too long
     */
    truncateOption(option) {
        const maxLength = 50;
        return option.length <= maxLength ? option : option.substring(0, maxLength) + '...';
    }

    /**
     * Handle dropdown change event
     */
    handleDropdownChange(wildcard, selectedValue, dropdownContainer) {
        // Remove existing child dropdowns
        this.removeChildDropdowns(dropdownContainer);

        // If a valid option is selected (not "nothing selected")
        if (selectedValue !== '' && wildcard[selectedValue]) {
            // Get the selected option
            const selectedOption = wildcard[selectedValue];

            // Iterate in the order of the options array
            if (selectedOption.options && Array.isArray(selectedOption.options)) {
                selectedOption.options.forEach(optKey => {
                    const nestedItem = selectedOption[optKey];
                    if (
                        nestedItem &&
                        typeof nestedItem === 'object' &&
                        nestedItem.options &&
                        Array.isArray(nestedItem.options) &&
                        nestedItem.options.length > 0
                    ) {
                        // Create dropdown for this nested wildcard
                        this.createDropdownForWildcard(nestedItem, dropdownContainer);
                    }
                });
            }
        }
    }

    /**
     * Remove child dropdowns of a specific dropdown container
     */
    removeChildDropdowns(parentContainer) {
        // Find and remove all dropdowns that are children of this container
        const childDropdowns = this.dropdowns.filter(d => d.parent === parentContainer);
        
        childDropdowns.forEach(childDropdown => {
            // Remove from DOM
            childDropdown.element.remove();
            
            // Remove from tracking array
            const index = this.dropdowns.indexOf(childDropdown);
            if (index > -1) {
                this.dropdowns.splice(index, 1);
            }
            
            // Recursively remove children of this child
            this.removeChildDropdowns(childDropdown.element);
        });
    }

    /**
     * Clear all dropdowns
     */
    clearDropdowns() {
        this._closeAllCustomDropdowns();
        this.dropdowns.forEach(dropdown => {
            dropdown.element.remove();
        });
        this.dropdowns = [];
    }
}