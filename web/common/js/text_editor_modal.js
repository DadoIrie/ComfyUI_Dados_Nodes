import { createModal } from "./modal.js";
import { fetchSend } from "./utils.js";
import { getIcon } from "./svg_icons.js";

class WildcardManager {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
    }

    async loadWildcards(container) {
        try {
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "get_file_content",
                {
                    path: this.node.properties.path,
                    file_selection: this.node.properties.file_selection
                }
            );

            if (response?.status === "success" && response.wildcards) {
                this.createDropdowns(container, response.wildcards);
                return response.wildcards.length;
            }
            return 0;
        } catch (error) {
            console.error('Error loading wildcards:', error);
            return 0;
        }
    }

    createDropdowns(container, wildcards) {
        container.innerHTML = '';

        if (wildcards.length === 0) {
            const noWildcards = document.createElement('div');
            noWildcards.className = 'no-wildcards-message';
            noWildcards.textContent = 'No wildcards found in text';
            container.appendChild(noWildcards);
            return;
        }

        wildcards.forEach(wildcard => {
            const dropdownContainer = this.createDropdownContainer(wildcard);
            container.appendChild(dropdownContainer);
        });
    }

    createDropdownContainer(wildcard) {
        const container = document.createElement('div');
        container.className = 'wildcard-dropdown-container';

        const label = document.createElement('div');
        label.className = 'wildcard-label';
        label.textContent = wildcard.original;

        const dropdown = this.createDropdown(wildcard);

        container.appendChild(label);
        container.appendChild(dropdown);
        return container;
    }

    createDropdown(wildcard) {
        const dropdown = document.createElement('select');
        dropdown.className = 'wildcard-dropdown';
        dropdown.dataset.wildcardIndex = wildcard.index;

        wildcard.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option || '(not selected)';
            dropdown.appendChild(optionElement);
        });

        dropdown.value = wildcard.selected || '';
        dropdown.onchange = () => this.handleSelectionChange(wildcard, dropdown.value);

        return dropdown;
    }

    async handleSelectionChange(wildcard, selectedValue) {
        try {
            await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "update_wildcard_selection",
                {
                    wildcard_index: wildcard.index,
                    selected_value: selectedValue,
                    original_wildcard: wildcard.original
                }
            );
        } catch (error) {
            console.error('Error updating wildcard selection:', error);
        }
    }

    async resetAll(container) {
        try {
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "reset_wildcards",
                {}
            );

            if (response?.status === "success") {
                await this.loadWildcards(container);
            }
        } catch (error) {
            console.error('Error resetting wildcards:', error);
        }
    }

    updateFromSave(container, wildcards) {
        if (wildcards) {
            this.createDropdowns(container, wildcards);
            this.showNotification(container, `Wildcards updated (${wildcards.length} found)`);
            return wildcards.length;
        }
        return 0;
    }

    showNotification(container, message) {
        const notification = document.createElement('div');
        notification.className = 'wildcard-update-notification';
        notification.textContent = message;
        
        container.insertBefore(notification, container.firstChild);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

class FileOperations {
    constructor(node, constants) {
        this.node = node;
        this.constants = constants;
    }

    async saveFile(content, filePath, fileName, isNewFile) {
        const response = await fetchSend(
            this.constants.MESSAGE_ROUTE,
            this.node.id,
            "save_file",
            {
                content,
                path: filePath,
                file_selection: fileName,
                is_new_file: isNewFile
            }
        );

        if (response?.status !== "success") {
            throw new Error('Failed to save file');
        }

        return response;
    }

    async deleteFile(filePath, fileName) {
        const response = await fetchSend(
            this.constants.MESSAGE_ROUTE,
            this.node.id,
            "delete_file",
            {
                path: filePath,
                file_selection: fileName
            }
        );

        if (response?.status !== "success") {
            throw new Error('Failed to delete file');
        }

        return response;
    }

    async updateNodeFileList(filePath, fileName) {
        this.node.properties.file_selection = fileName;
        
        if (this.node.textLoader) {
            await this.node.textLoader.updateFileDropdown(filePath);
            await this.node.textLoader.updateBackend();
            
            const fileSelectionWidget = this.node.textLoader.getWidget("file_selection");
            if (fileSelectionWidget) {
                fileSelectionWidget.value = fileName;
                this.node.properties.file_selection = fileName;
                this.node.setDirtyCanvas(true, true);
            }
        }
    }
}

class ModalElements {
    constructor() {
        this.elements = {};
    }

    createFilePathDisplay(filePath, fileName) {
        const container = document.createElement('div');
        container.className = 'text-editor-file-path';

        const pathSpan = document.createElement('span');
        pathSpan.className = 'text-editor-path';
        pathSpan.textContent = `${filePath}${filePath.endsWith('/') ? '' : '/'}`;

        const filenameSpan = document.createElement('span');
        filenameSpan.className = 'text-editor-filename';
        filenameSpan.textContent = `${fileName}.txt`;

        container.appendChild(pathSpan);
        container.appendChild(filenameSpan);
        return container;
    }

    createTextarea(textContent) {
        const textarea = document.createElement('textarea');
        textarea.className = 'text-editor-textarea';
        textarea.value = textContent || '';
        textarea.placeholder = 'Enter your text here...';
        textarea.spellcheck = false;
        this.elements.textarea = textarea;
        return textarea;
    }

    createButton(className, text, handler) {
        const button = document.createElement('button');
        button.className = className;
        button.textContent = text;
        button.onclick = handler;
        return button;
    }

    createSidebar() {
        const sidebar = document.createElement('div');
        sidebar.className = 'text-editor-sidebar';

        const content = document.createElement('div');
        content.className = 'text-editor-sidebar-content';

        sidebar.appendChild(content);

        this.elements.sidebar = sidebar;
        this.elements.sidebarContent = content;
        return sidebar;
    }

    createWildcardControls() {
        const controls = document.createElement('div');
        controls.className = 'wildcard-controls';

        const dropdowns = document.createElement('div');
        dropdowns.className = 'wildcard-dropdowns';

        controls.appendChild(dropdowns);
        this.elements.wildcardDropdowns = dropdowns;
        return controls;
    }

    autoExpandSidebar(wildcardCount) {
        if (this.elements.sidebar) {
            if (wildcardCount > 0) {
                setTimeout(() => {
                    this.elements.sidebar.classList.add('expanded');
                }, 150);
            } else {
                this.elements.sidebar.classList.remove('expanded');
            }
        }
    }
}

class ButtonManager {
    constructor(elements, fileOps, wildcardManager, modal) {
        this.elements = elements;
        this.fileOps = fileOps;
        this.wildcardManager = wildcardManager;
        this.modal = modal;
    }

    createSaveButton(filePath, fileName, isNewFile) {
        return this.elements.createButton(
            'text-editor-save-button',
            'Save File',
            () => this.handleSave(filePath, fileName, isNewFile)
        );
    }

    createDeleteButton(filePath, fileName) {
        return this.elements.createButton(
            'text-editor-delete-button',
            'Delete File',
            () => this.handleDelete(filePath, fileName)
        );
    }

    createResetButton() {
        return this.elements.createButton(
            'wildcard-reset-button',
            'Reset All Wildcards',
            () => this.handleReset()
        );
    }

    async handleSave(filePath, fileName, isNewFile) {
        const textarea = this.elements.elements.textarea;
        const saveButton = document.querySelector('.text-editor-save-button');
        
        if (!textarea.value.trim()) {
            alert('Empty files are not allowed');
            return;
        }

        this.setButtonState(saveButton, 'Saving...', true);

        try {
            const response = await this.fileOps.saveFile(
                textarea.value, 
                filePath, 
                fileName, 
                isNewFile
            );

            this.setButtonState(saveButton, 'Saved!', false);

            if (response.wildcards) {
                const wildcardCount = this.wildcardManager.updateFromSave(
                    this.elements.elements.wildcardDropdowns, 
                    response.wildcards
                );
                this.elements.autoExpandSidebar(wildcardCount);
            }

            if (isNewFile) {
                await this.fileOps.updateNodeFileList(filePath, fileName);
            }

            setTimeout(() => this.setButtonState(saveButton, 'Save File', false), 1000);
        } catch (error) {
            console.error('Error saving file:', error);
            alert('Error saving file');
            this.setButtonState(saveButton, 'Save File', false);
        }
    }

    async handleDelete(filePath, fileName) {
        const confirmDelete = confirm(
            `Are you sure you want to delete "${fileName}.txt"?\n\nThis will also delete any associated wildcard selections.`
        );
        if (!confirmDelete) return;

        const deleteButton = document.querySelector('.text-editor-delete-button');
        this.setButtonState(deleteButton, 'Deleting...', true);

        try {
            await this.fileOps.deleteFile(filePath, fileName);
            
            if (this.fileOps.node.textLoader) {
                await this.fileOps.node.textLoader.updateFileDropdown(filePath);
                await this.fileOps.node.textLoader.updateBackend();
            }
            
            alert('File deleted successfully');
            
            if (this.modal?.closeModal) {
                this.modal.closeModal();
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            alert('Error deleting file');
            this.setButtonState(deleteButton, 'Delete File', false);
        }
    }

    async handleReset() {
        const confirm = window.confirm('Are you sure you want to reset all wildcard selections?');
        if (confirm) {
            await this.wildcardManager.resetAll(this.elements.elements.wildcardDropdowns);
        }
    }

    setButtonState(button, text, disabled) {
        if (button) {
            button.textContent = text;
            button.disabled = disabled;
        }
    }
}

export function createTextEditorModal(node, textContent, constants, filePath, fileName, isNewFile = false) {
    const loadCSS = () => {
        if (!document.querySelector('link[href$="/text_editor_modal.css"]')) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = `/extensions/${constants.EXTENSION_NAME}/common/css/text_editor_modal.css`;
            document.head.appendChild(cssLink);
        }
    };

    loadCSS();

    const wildcardManager = new WildcardManager(node, constants);
    const fileOps = new FileOperations(node, constants);
    const elements = new ModalElements();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'text-editor-modal';

    const mainSection = document.createElement('div');
    mainSection.className = 'text-editor-main-section';

    mainSection.appendChild(elements.createFilePathDisplay(filePath, fileName));
    mainSection.appendChild(elements.createTextarea(textContent));

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';

    const sidebar = elements.createSidebar();
    const wildcardControls = elements.createWildcardControls();
    
    let modal;
    const buttonManager = new ButtonManager(elements, fileOps, wildcardManager, modal);

    const resetButton = buttonManager.createResetButton();
    wildcardControls.insertBefore(resetButton, elements.elements.wildcardDropdowns);
    elements.elements.sidebarContent.appendChild(wildcardControls);

    if (!isNewFile) {
        const deleteButton = buttonManager.createDeleteButton(filePath, fileName);
        buttonContainer.appendChild(deleteButton);
    } else {
        const spacer = document.createElement('div');
        buttonContainer.appendChild(spacer);
    }

    const saveButton = buttonManager.createSaveButton(filePath, fileName, isNewFile);
    buttonContainer.appendChild(saveButton);

    mainSection.appendChild(buttonContainer);
    contentDiv.appendChild(mainSection);
    contentDiv.appendChild(sidebar);

    if (!isNewFile) {
        wildcardManager.loadWildcards(elements.elements.wildcardDropdowns).then(wildcardCount => {
            elements.autoExpandSidebar(wildcardCount);
        });
    }

    const modalConfig = {
        content: contentDiv,
        onClose: () => {
            const sidebar = contentDiv.querySelector('.text-editor-sidebar.expanded');
            if (sidebar) {
                sidebar.classList.remove('expanded');
                return 150;
            }
            return 0;
        },
    };

    modal = createModal(modalConfig);
    buttonManager.modal = modal;
    return modal;
}