import { createModal } from "./modal.js";
import { fetchSend } from "./utils.js";
import { getIcon } from "./svg_icons.js";

class WildcardManager {
    constructor(node, constants, textLoaderInstance, operations) {
        Object.assign(this, { node, constants, textLoaderInstance, operations });
        this.wildcardData = [];
    }

    async loadWildcards(container) {
        try {
            const response = await this._fetchWildcards();
            if (response?.status === "success" && response.wildcards) {
                this.wildcardData = response.wildcards;
                this.createWildcardUI(container, response.wildcards);
                this.restoreSelectionStates(response.wildcards);
                return this.countTotalWildcards(response.wildcards);
            }
            return 0;
        } catch (error) {
            console.error('Error loading wildcards:', error);
            return 0;
        }
    }

    async _fetchWildcards() {
        const wildcards_prompt = this.textLoaderInstance.getHiddenWidgetValue("wildcards_prompt");
        const wildcards_selections = this.textLoaderInstance.getHiddenWidgetValue("wildcards_selections");
        
        return await fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "get_content", {
            wildcards_prompt, wildcards_selections
        });
    }

    restoreSelectionStates(wildcards) {
        wildcards.forEach(wildcard => this.restoreWildcardState(wildcard));
    }

    restoreWildcardState(wildcard) {
        const section = document.querySelector(`[data-wildcard-index="${wildcard.index}"]`);
        const dropdown = section?.querySelector('.wildcard-dropdown');
        
        if (dropdown && wildcard.selected) {
            dropdown.value = wildcard.selected;
            const selectedIndex = wildcard.options.indexOf(wildcard.selected);
            if (selectedIndex > 0 && !wildcard.is_entry_wildcard) {
                this.updateChildrenVisibility(wildcard, selectedIndex, true);
            }
        }
    }

    createWildcardUI(container, wildcards) {
        container.innerHTML = '';
        if (wildcards.length === 0) {
            this._createNoWildcardsMessage(container);
            return;
        }
        wildcards.forEach(wildcard => container.appendChild(this.createWildcardSection(wildcard)));
    }

    _createNoWildcardsMessage(container) {
        const noWildcards = document.createElement('div');
        noWildcards.className = 'no-wildcards-message';
        noWildcards.textContent = 'No wildcards found in text';
        container.appendChild(noWildcards);
    }

    createWildcardSection(wildcard) {
        const section = document.createElement('div');
        section.className = 'wildcard-section';
        section.dataset.wildcardIndex = wildcard.index;
        section.appendChild(this.createDropdown(wildcard));

        if (wildcard.children) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'wildcard-children';
            childrenContainer.style.display = 'none';
            section.appendChild(childrenContainer);
        }
        return section;
    }

    createDropdown(wildcard) {
        const container = document.createElement('div');
        container.className = 'wildcard-dropdown-container';
        
        const label = this._createElement('div', 'wildcard-label', `Wildcard ${wildcard.index}`);
        const dropdown = this._createSelect(wildcard);

        container.appendChild(label);
        container.appendChild(dropdown);
        return container;
    }

    _createElement(tag, className, textContent = '') {
        const element = document.createElement(tag);
        element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    }

    _createSelect(wildcard) {
        const dropdown = document.createElement('select');
        dropdown.className = 'wildcard-dropdown';
        dropdown.dataset.wildcardIndex = wildcard.index;

        wildcard.options.forEach((option, index) => {
            const optionElement = document.createElement('option');
            optionElement.value = index === 0 ? '' : option;
            optionElement.textContent = index === 0 ? '(not selected)' : this.truncateOption(option);
            dropdown.appendChild(optionElement);
        });

        dropdown.value = wildcard.selected || '';
        dropdown.onchange = () => this.handleSelectionChange(wildcard, dropdown.value, dropdown.selectedIndex);
        return dropdown;
    }

    async handleSelectionChange(wildcard, selectedValue, selectedIndex) {
        try {
            this.operations.updatePendingSelection(wildcard.index, selectedValue, wildcard.original);
            this.updateChildrenVisibility(wildcard, selectedIndex, false);
        } catch (error) {
            console.error('Error updating wildcard selection:', error);
        }
    }

    updateChildrenVisibility(wildcard, selectedIndex, isSaved = false) {
        const section = document.querySelector(`[data-wildcard-index="${wildcard.index}"]`);
        const childrenContainer = section?.querySelector('.wildcard-children');
        const label = section?.querySelector('.wildcard-label');
        
        this._updateLabel(label, wildcard.index, selectedIndex, isSaved);
        this._updateChildren(childrenContainer, wildcard, selectedIndex);
    }

    _updateLabel(label, wildcardIndex, selectedIndex, isSaved) {
        if (!label) return;

        if (selectedIndex === 0) {
            label.textContent = `Wildcard ${wildcardIndex}`;
            label.classList.toggle('unsaved-selection', !isSaved);
        } else {
            label.innerHTML = `Wildcard ${wildcardIndex}${getIcon("chevron_right")}${selectedIndex}`;
            
            if (isSaved) {
                label.classList.add('flash-update');
                label.classList.remove('unsaved-selection');
                setTimeout(() => label.classList.remove('flash-update'), 300);
            } else {
                label.classList.add('unsaved-selection');
            }
        }
    }

    _updateChildren(childrenContainer, wildcard, selectedIndex) {
        if (!childrenContainer) return;

        childrenContainer.innerHTML = '';
        
        if (selectedIndex === 0) {
            childrenContainer.style.display = 'none';
            return;
        }

        const selectedOptionIndex = selectedIndex.toString();
        const childWildcards = wildcard.children?.[selectedOptionIndex];
        const entryWildcards = wildcard.entry_wildcards?.[selectedOptionIndex];
        
        let hasContent = false;

        if (childWildcards?.length > 0) {
            childWildcards.forEach(child => childrenContainer.appendChild(this.createWildcardSection(child)));
            hasContent = true;
        } else if (entryWildcards?.length > 0) {
            entryWildcards.forEach(entry => childrenContainer.appendChild(this.createEntryWildcardDropdown(entry)));
            hasContent = true;
        }

        if (hasContent) {
            childrenContainer.style.display = 'block';
            setTimeout(() => this._restoreChildStates(childWildcards, entryWildcards), 50);
        } else {
            childrenContainer.style.display = 'none';
        }
    }

    _restoreChildStates(childWildcards, entryWildcards) {
        const wildcards = childWildcards || entryWildcards;
        wildcards?.forEach(wildcard => this.restoreWildcardState(wildcard));
    }

    createEntryWildcardDropdown(entryWildcard) {
        const container = document.createElement('div');
        container.className = 'wildcard-dropdown-container entry-wildcard';
        container.dataset.wildcardIndex = entryWildcard.index;
        
        const label = this._createElement('div', 'wildcard-label entry-label', entryWildcard.original);
        const dropdown = this._createEntrySelect(entryWildcard);

        container.appendChild(label);
        container.appendChild(dropdown);
        return container;
    }

    _createEntrySelect(entryWildcard) {
        const dropdown = document.createElement('select');
        dropdown.className = 'wildcard-dropdown entry-dropdown';
        dropdown.dataset.wildcardIndex = entryWildcard.index;
        
        entryWildcard.options.forEach((option, index) => {
            const optionElement = document.createElement('option');
            optionElement.value = index === 0 ? '' : option;
            optionElement.textContent = index === 0 ? '(not selected)' : option;
            dropdown.appendChild(optionElement);
        });
        
        dropdown.value = entryWildcard.selected || '';
        dropdown.onchange = () => this.handleEntryWildcardChange(entryWildcard.index, dropdown.value, entryWildcard.original);
        return dropdown;
    }

    async handleEntryWildcardChange(wildcardIndex, selectedValue, originalWildcard) {
        try {
            const response = await fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "update_wildcard_selection", {
                wildcard_index: wildcardIndex,
                selected_value: selectedValue,
                original_wildcard: originalWildcard,
                wildcards_selections: this.textLoaderInstance.getHiddenWidgetValue("wildcards_selections")
            });
            
            if (response?.status === "success" && response.selections_json) {
                this.textLoaderInstance.updateHiddenWidget("wildcards_selections", response.selections_json);
            }
        } catch (error) {
            console.error('Error updating entry wildcard selection:', error);
        }
    }

    truncateOption(option) {
        const maxLength = 50;
        return option.length <= maxLength ? option : option.substring(0, maxLength) + '...';
    }

    countTotalWildcards(wildcards) {
        return wildcards.reduce((count, wildcard) => {
            let total = count + 1;
            if (wildcard.children) {
                total += Object.values(wildcard.children).reduce((sum, childArray) => 
                    sum + this.countTotalWildcards(childArray), 0);
            }
            if (wildcard.entry_wildcards) {
                total += Object.values(wildcard.entry_wildcards).reduce((sum, entryArray) => 
                    sum + entryArray.length, 0);
            }
            return total;
        }, 0);
    }

    async resetAll(container) {
        try {
            const { selectedLabels, unsavedLabels } = this._collectLabelsForReset(container);
            
            const response = await fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "reset_wildcards", {});
            
            if (response?.status === "success" && response.selections_json) {
                this._updateOperationsAfterReset(response.selections_json);
                this._applyResetVisualEffects(selectedLabels, unsavedLabels);
                
                setTimeout(() => this.loadWildcards(container), selectedLabels.length > 0 ? 350 : 0);
            }
        } catch (error) {
            console.error('Error resetting wildcards:', error);
        }
    }

    _collectLabelsForReset(container) {
        const selectedLabels = [];
        const unsavedLabels = [];
        
        container.querySelectorAll('.wildcard-label').forEach(label => {
            if (label.querySelector('svg') || label.innerHTML.includes('<svg')) {
                selectedLabels.push(label);
            }
            if (label.classList.contains('unsaved-selection')) {
                unsavedLabels.push(label);
            }
        });
        
        return { selectedLabels, unsavedLabels };
    }

    _updateOperationsAfterReset(selectionsJson) {
        this.textLoaderInstance.updateHiddenWidget("wildcards_selections", selectionsJson);
        Object.assign(this.operations, {
            pendingSelections: {},
            hasUnsavedSelectionChanges: false,
            originalSelections: selectionsJson
        });
    }

    _applyResetVisualEffects(selectedLabels, unsavedLabels) {
        selectedLabels.forEach(label => label.classList.add('flash-reset'));
        unsavedLabels.forEach(label => label.classList.remove('unsaved-selection'));
    }

    updateFromSave(container, wildcards) {
        if (!wildcards) return 0;
        
        this.wildcardData = wildcards;
        this.createWildcardUI(container, wildcards);
        this.restoreSelectionStates(wildcards);
        const totalCount = this.countTotalWildcards(wildcards);
        this.showNotification(container, `Wildcards updated (${totalCount} found)`);
        return totalCount;
    }

    showNotification(container, message) {
        const notification = this._createElement('div', 'wildcard-update-notification', message);
        container.insertBefore(notification, container.firstChild);
        setTimeout(() => notification.parentNode?.removeChild(notification), 3000);
    }

    async saveSelections(container) {
        try {
            await this._savePendingSelections();
            await this.operations.saveSelections();
            this._flashSavedLabels(container);
        } catch (error) {
            console.error('Error saving selections:', error);
        }
    }

    async _savePendingSelections() {
        for (const [wildcardIndex, selectionData] of Object.entries(this.operations.pendingSelections)) {
            const response = await fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "update_wildcard_selection", {
                wildcard_index: wildcardIndex,
                selected_value: selectionData.selected,
                original_wildcard: selectionData.original,
                wildcards_selections: this.textLoaderInstance.getHiddenWidgetValue("wildcards_selections")
            });
            
            if (response?.status === "success" && response.selections_json) {
                this.textLoaderInstance.updateHiddenWidget("wildcards_selections", response.selections_json);
            }
        }
    }

    _flashSavedLabels(container) {
        container.querySelectorAll('.wildcard-label.unsaved-selection').forEach(label => {
            label.classList.add('flash-update');
            label.classList.remove('unsaved-selection');
            setTimeout(() => label.classList.remove('flash-update'), 300);
        });
    }
}

class Operations {
    constructor(node, constants, textLoaderInstance) {
        Object.assign(this, { node, constants, textLoaderInstance });
        this.hasUnsavedTextChanges = false;
        this.hasUnsavedSelectionChanges = false;
        this.originalText = '';
        this.originalSelections = '';
        this.pendingSelections = {};
    }

    initialize(textContent) {
        this.originalText = textContent || '';
        this.originalSelections = this.textLoaderInstance.getHiddenWidgetValue("wildcards_selections");
        this.pendingSelections = {};
    }

    checkForTextChanges(currentText) {
        this.hasUnsavedTextChanges = currentText !== this.originalText;
    }

    updatePendingSelection(wildcardIndex, selectedValue, originalWildcard) {
        this.pendingSelections[wildcardIndex] = {
            selected: selectedValue,
            original: originalWildcard
        };
        this.hasUnsavedSelectionChanges = true;
    }

    async saveContent(content) {
        this.textLoaderInstance.updateHiddenWidget("wildcards_prompt", content);
        
        const response = await fetchSend(this.constants.MESSAGE_ROUTE, this.node.id, "get_content", {
            wildcards_prompt: content,
            wildcards_selections: this.textLoaderInstance.getHiddenWidgetValue("wildcards_selections")
        });

        this.originalText = content;
        this.hasUnsavedTextChanges = false;

        return {
            status: "success",
            wildcards: response?.status === "success" ? response.wildcards : []
        };
    }

    async saveSelections() {
        let currentSelections = {};
        try {
            currentSelections = JSON.parse(this.originalSelections || '{}');
        } catch (e) {
            currentSelections = {};
        }

        Object.assign(currentSelections, this.pendingSelections);
        this.textLoaderInstance.updateHiddenWidget("wildcards_selections", JSON.stringify(currentSelections));
        
        this.originalSelections = JSON.stringify(currentSelections);
        this.pendingSelections = {};
        this.hasUnsavedSelectionChanges = false;
        
        return { status: "success" };
    }

    discardSelectionChanges() {
        this.pendingSelections = {};
        this.hasUnsavedSelectionChanges = false;
    }

    hasUnsavedChanges() {
        return this.hasUnsavedTextChanges || this.hasUnsavedSelectionChanges;
    }
}

class ModalElements {
    constructor() {
        this.elements = {};
    }

    createContentHeader() {
        return this._createElement('div', 'text-editor-content-header', 'Text Content with Wildcards');
    }

    createTextarea(textContent) {
        const textarea = document.createElement('textarea');
        Object.assign(textarea, {
            className: 'text-editor-textarea',
            value: textContent || '',
            placeholder: 'Enter your text here...',
            spellcheck: false
        });
        this.elements.textarea = textarea;
        return textarea;
    }

    createButton(className, text, handler) {
        const button = document.createElement('button');
        Object.assign(button, {
            className,
            textContent: text,
            onclick: handler
        });
        return button;
    }

    createSidebar() {
        const sidebar = this._createElement('div', 'text-editor-sidebar');
        const content = this._createElement('div', 'text-editor-sidebar-content');
        
        sidebar.appendChild(content);
        Object.assign(this.elements, { sidebar, sidebarContent: content });
        return sidebar;
    }

    createWildcardControls() {
        const controls = this._createElement('div', 'wildcard-controls');
        const dropdowns = this._createElement('div', 'wildcard-dropdowns');
        
        controls.appendChild(dropdowns);
        this.elements.wildcardDropdowns = dropdowns;
        return controls;
    }

    autoExpandSidebar(wildcardCount) {
        if (this.elements.sidebar) {
            if (wildcardCount > 0) {
                setTimeout(() => this.elements.sidebar.classList.add('expanded'), 150);
            } else {
                this.elements.sidebar.classList.remove('expanded');
            }
        }
    }

    _createElement(tag, className, textContent = '') {
        const element = document.createElement(tag);
        element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    }
}

class ButtonManager {
    constructor(elements, operations, wildcardManager, modal) {
        Object.assign(this, { elements, operations, wildcardManager, modal });
    }

    createSaveButton() {
        return this.elements.createButton('text-editor-save-button', 'Save', () => this.handleSave());
    }

    createResetButton() {
        return this.elements.createButton('wildcard-reset-button', 'Reset', () => this.handleReset());
    }

    createSaveSelectionsButton() {
        return this.elements.createButton('wildcard-save-button', 'Apply', () => this.handleSaveSelections());
    }

    async handleSave() {
        const textarea = this.elements.elements.textarea;
        const saveButton = document.querySelector('.text-editor-save-button');
        
        if (!textarea.value.trim()) {
            alert('Empty content is not allowed');
            return;
        }

        this.setButtonState(saveButton, 'Saving...', true);

        try {
            const response = await this.operations.saveContent(textarea.value);
            this.setButtonState(saveButton, 'Saved!', true);

            if (response.wildcards) {
                const wildcardCount = this.wildcardManager.updateFromSave(
                    this.elements.elements.wildcardDropdowns, 
                    response.wildcards
                );
                this.elements.autoExpandSidebar(wildcardCount);
            }

            setTimeout(() => {
                this.setButtonState(saveButton, 'Save', false);
                this.modal?.close?.();
            }, 1000);
        } catch (error) {
            console.error('Error saving content:', error);
            alert('Error saving content');
            this.setButtonState(saveButton, 'Save', false);
        }
    }

    async handleSaveSelections() {
        try {
            await this.wildcardManager.saveSelections(this.elements.elements.wildcardDropdowns);
        } catch (error) {
            console.error('Error saving selections:', error);
        }
    }

    async handleReset() {
        if (window.confirm('Are you sure you want to reset all wildcard selections?')) {
            await this.wildcardManager.resetAll(this.elements.elements.wildcardDropdowns);
        }
    }

    async handleModalClose() {
        if (this.operations.hasUnsavedChanges()) {
            const message = this.operations.hasUnsavedTextChanges 
                ? 'You have unsaved prompt changes. Do you want to save before closing?'
                : 'You have not applied selection changes. Do you want to apply those before closing?';
                
            const result = window.confirm(message);
            if (result) {
                if (this.operations.hasUnsavedTextChanges) {
                    await this.handleSave();
                } else {
                    await this.handleSaveSelections();
                }
            } else {
                this.operations.discardSelectionChanges();
            }
        }
        return true;
    }

    setButtonState(button, text, disabled) {
        if (button) {
            button.textContent = text;
            button.disabled = disabled;
        }
    }
}

export function createTextEditorModal(node, textContent, constants, textLoaderInstance) {
    const loadTextEditorCSS = async () => {
        if (!document.querySelector('link[href$="/text_editor_modal.css"]')) {
            const cssLink = document.createElement('link');
            Object.assign(cssLink, {
                rel: 'stylesheet',
                href: `/extensions/${constants.EXTENSION_NAME}/common/css/text_editor_modal.css`
            });
            
            return new Promise((resolve) => {
                cssLink.onload = () => resolve();
                cssLink.onerror = () => resolve();
                document.head.appendChild(cssLink);
            });
        }
        return Promise.resolve();
    };

    const operations = new Operations(node, constants, textLoaderInstance);
    operations.initialize(textContent);
    
    const wildcardManager = new WildcardManager(node, constants, textLoaderInstance, operations);
    const elements = new ModalElements();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'text-editor-modal';

    const mainSection = document.createElement('div');
    mainSection.className = 'text-editor-main-section';

    mainSection.appendChild(elements.createContentHeader());
    
    const textarea = elements.createTextarea(textContent);
    textarea.addEventListener('input', () => operations.checkForTextChanges(textarea.value));
    mainSection.appendChild(textarea);

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        justifyContent: 'space-between'
    });

    const sidebar = elements.createSidebar();
    const wildcardControls = elements.createWildcardControls();
    
    let modal;
    const buttonManager = new ButtonManager(elements, operations, wildcardManager, modal);

    const sidebarButtonsContainer = document.createElement('div');
    Object.assign(sidebarButtonsContainer, {
        className: 'sidebar-buttons-container'
    });
    Object.assign(sidebarButtonsContainer.style, {
        display: 'flex',
        gap: '10px',
        marginBottom: '15px'
    });

    sidebarButtonsContainer.appendChild(buttonManager.createResetButton());
    sidebarButtonsContainer.appendChild(buttonManager.createSaveSelectionsButton());
    
    wildcardControls.insertBefore(sidebarButtonsContainer, elements.elements.wildcardDropdowns);
    elements.elements.sidebarContent.appendChild(wildcardControls);

    buttonContainer.appendChild(document.createElement('div'));
    buttonContainer.appendChild(buttonManager.createSaveButton());

    mainSection.appendChild(buttonContainer);
    contentDiv.appendChild(mainSection);
    contentDiv.appendChild(sidebar);

    const modalConfig = {
        content: contentDiv,
        loadAdditionalCSS: loadTextEditorCSS,
        onClose: async () => {
            await buttonManager.handleModalClose();
            const sidebar = contentDiv.querySelector('.text-editor-sidebar');
            if (sidebar && sidebar.classList.contains('expanded')) {
                sidebar.classList.remove('expanded');
                return 150;
            }
            return 0;
        },
        customLogic: async () => {
            const wildcardCount = await wildcardManager.loadWildcards(elements.elements.wildcardDropdowns);
            elements.autoExpandSidebar(wildcardCount);
        }
    };

    modal = createModal(modalConfig);
    buttonManager.modal = modal;
    return modal;
}