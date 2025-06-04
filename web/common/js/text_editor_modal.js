import { createModal } from "./modal.js";
import { fetchSend } from "./utils.js";

// Helper functions
function updateWildcardDropdowns(node, constants, container, wildcards) {
    console.log('Updating wildcard dropdowns with new data:', wildcards);
    
    // Store current scroll position
    const scrollTop = container.scrollTop;
    
    // Get current selections before destroying dropdowns
    const currentSelections = {};
    const existingDropdowns = container.querySelectorAll('.wildcard-dropdown');
    existingDropdowns.forEach(dropdown => {
        const index = dropdown.dataset.wildcardIndex;
        const value = dropdown.value;
        if (value) {
            currentSelections[index] = value;
        }
    });
    
    console.log('Preserved current selections:', currentSelections);
    
    // Recreate dropdowns with backend data (which should already have preserved selections)
    createWildcardDropdowns(node, constants, container, wildcards);
    
    // Restore scroll position
    container.scrollTop = scrollTop;
    
    // Show notification
    showWildcardChangeNotification(container, wildcards);
    
    return wildcards.length;
}

// Better yet, let's make it even smarter - only update if wildcards actually changed
function smartUpdateWildcards(node, constants, container, newWildcards) {
    console.log('Smart updating wildcards...');
    
    // Get current wildcard structure
    const existingDropdowns = container.querySelectorAll('.wildcard-dropdown');
    const currentWildcards = Array.from(existingDropdowns).map(dropdown => {
        const label = dropdown.parentNode.querySelector('.wildcard-label');
        return {
            index: dropdown.dataset.wildcardIndex,
            original: label ? label.textContent : '',
            selected: dropdown.value
        };
    });
    
    // Compare structures - only update if wildcards actually changed
    const wildcardsChanged = !arraysEqual(currentWildcards, newWildcards);
    
    if (wildcardsChanged) {
        console.log('Wildcards structure changed, updating...');
        updateWildcardDropdowns(node, constants, container, newWildcards);
    } else {
        console.log('Wildcards structure unchanged, preserving current state');
        // Just show a subtle notification that save was successful
        showWildcardChangeNotification(container, newWildcards, 'Saved - wildcards preserved');
    }
    
    return newWildcards.length;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
        if (a[i].original !== b[i].original) return false;
    }
    
    return true;
}

function showWildcardChangeNotification(container, wildcards, customMessage = null) {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.className = 'wildcard-update-notification';
    notification.textContent = customMessage || `Wildcards updated (${wildcards.length} found)`;
    
    // Insert at top of container
    container.insertBefore(notification, container.firstChild);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function createWildcardDropdowns(node, constants, container, wildcards) {
    console.log('Creating wildcard dropdowns with data:', wildcards);
    
    // Clear existing dropdowns
    container.innerHTML = '';

    if (wildcards.length === 0) {
        const noWildcards = document.createElement('div');
        noWildcards.className = 'no-wildcards-message';
        noWildcards.textContent = 'No wildcards found in text';
        container.appendChild(noWildcards);
        return;
    }

    wildcards.forEach((wildcard, index) => {
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'wildcard-dropdown-container';

        const label = document.createElement('div');
        label.className = 'wildcard-label';
        label.textContent = wildcard.original;

        const dropdown = document.createElement('select');
        dropdown.className = 'wildcard-dropdown';
        dropdown.dataset.wildcardIndex = wildcard.index;

        // Add options
        wildcard.options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option || '(not selected)';
            dropdown.appendChild(optionElement);
        });

        // Set the selected value from backend (already preserved by content matching)
        dropdown.value = wildcard.selected || '';
        console.log(`Set wildcard ${wildcard.index} (${wildcard.original}) to: "${dropdown.value}"`);

        // Handle selection change
        dropdown.onchange = async () => {
            console.log(`Wildcard ${wildcard.index} selection changed to: "${dropdown.value}"`);
            await updateWildcardSelection(
                node, 
                constants, 
                wildcard.index, 
                dropdown.value, 
                wildcard.original
            );
        };

        dropdownContainer.appendChild(label);
        dropdownContainer.appendChild(dropdown);
        container.appendChild(dropdownContainer);
    });
}

async function loadWildcards(node, constants, container, textContent) {
    try {
        console.log('Loading wildcards for file:', node.properties.file_selection);
        
        const response = await fetchSend(
            constants.MESSAGE_ROUTE,
            node.id,
            "get_file_content",
            {
                path: node.properties.path,
                file_selection: node.properties.file_selection
            }
        );

        if (response && response.status === "success" && response.wildcards) {
            console.log('Loaded wildcards from JSON persistence:', response.wildcards);
            createWildcardDropdowns(node, constants, container, response.wildcards);
            return response.wildcards.length;
        }
        return 0;
    } catch (error) {
        console.error('Error loading wildcards:', error);
        return 0;
    }
}

async function updateWildcardSelection(node, constants, wildcardIndex, selectedValue, originalWildcard) {
    try {
        console.log(`Updating wildcard ${wildcardIndex} to "${selectedValue}"`);
        
        const response = await fetchSend(
            constants.MESSAGE_ROUTE,
            node.id,
            "update_wildcard_selection",
            {
                wildcard_index: wildcardIndex,
                selected_value: selectedValue,
                original_wildcard: originalWildcard
            }
        );

        if (response && response.status === "success") {
            console.log('Wildcard selection saved to JSON file');
        } else {
            console.error('Failed to save wildcard selection:', response);
        }
    } catch (error) {
        console.error('Error updating wildcard selection:', error);
    }
}

async function resetAllWildcards(node, constants, container) {
    try {
        console.log('Resetting all wildcards');
        
        const response = await fetchSend(
            constants.MESSAGE_ROUTE,
            node.id,
            "reset_wildcards",
            {}
        );

        if (response && response.status === "success") {
            console.log('All wildcards reset');
            // Reload wildcards to refresh UI
            await loadWildcards(node, constants, container);
        } else {
            console.error('Failed to reset wildcards:', response);
        }
    } catch (error) {
        console.error('Error resetting wildcards:', error);
    }
}

// Main modal creation function
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

    const contentDiv = document.createElement('div');
    contentDiv.className = 'text-editor-modal';

    const mainSection = document.createElement('div');
    mainSection.className = 'text-editor-main-section';

    const filePathDiv = document.createElement('div');
    filePathDiv.className = 'text-editor-file-path';

    const pathSpan = document.createElement('span');
    pathSpan.className = 'text-editor-path';
    pathSpan.textContent = `${filePath}${filePath.endsWith('/') ? '' : '/'}`;

    const filenameSpan = document.createElement('span');
    filenameSpan.className = 'text-editor-filename';
    filenameSpan.textContent = `${fileName}.txt`;

    filePathDiv.appendChild(pathSpan);
    filePathDiv.appendChild(filenameSpan);

    const textarea = document.createElement('textarea');
    textarea.className = 'text-editor-textarea';
    textarea.value = textContent || '';
    textarea.placeholder = 'Enter your text here...';
    textarea.spellcheck = false;

    const saveButton = document.createElement('button');
    saveButton.className = 'text-editor-save-button';
    saveButton.textContent = 'Save File';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'text-editor-delete-button';
    deleteButton.textContent = 'Delete File';

    // Sidebar section
    const sidebar = document.createElement('div');
    sidebar.className = 'text-editor-sidebar';

    const sidebarToggle = document.createElement('button');
    sidebarToggle.className = 'text-editor-sidebar-toggle';
    sidebarToggle.textContent = '>';
    
    const sidebarContent = document.createElement('div');
    sidebarContent.className = 'text-editor-sidebar-content';

    // Wildcard controls container
    const wildcardControls = document.createElement('div');
    wildcardControls.className = 'wildcard-controls';

    const resetButton = document.createElement('button');
    resetButton.className = 'wildcard-reset-button';
    resetButton.textContent = 'Reset All Wildcards';
    resetButton.onclick = async () => {
        const confirm = window.confirm('Are you sure you want to reset all wildcard selections?');
        if (confirm) {
            await resetAllWildcards(node, constants, wildcardDropdowns);
        }
    };

    const wildcardDropdowns = document.createElement('div');
    wildcardDropdowns.className = 'wildcard-dropdowns';

    wildcardControls.appendChild(resetButton);
    wildcardControls.appendChild(wildcardDropdowns);
    sidebarContent.appendChild(wildcardControls);

    // Auto-expand logic function
    const autoExpandSidebar = (wildcardCount) => {
        if (wildcardCount > 0) {
            sidebar.classList.add('expanded');
            sidebarToggle.textContent = '<';
            console.log(`Auto-expanded sidebar: ${wildcardCount} wildcards found`);
        }
    };

    // Load wildcards if not a new file
    if (!isNewFile) {
        loadWildcards(node, constants, wildcardDropdowns, textContent).then(wildcardCount => {
            autoExpandSidebar(wildcardCount);
        });
    }

    sidebarToggle.onclick = () => {
        sidebar.classList.toggle('expanded');
        sidebarToggle.textContent = sidebar.classList.contains('expanded') ? '<' : '>';
    };

    // Save button logic
    saveButton.onclick = async () => {
        if (!textarea.value.trim()) {
            alert('Empty files are not allowed');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            const response = await fetchSend(
                constants.MESSAGE_ROUTE,
                node.id,
                "save_file",
                {
                    content: textarea.value,
                    path: filePath,
                    file_selection: fileName,
                    is_new_file: isNewFile
                }
            );

            if (response && response.status === "success") {
                console.log('File saved successfully');
                saveButton.textContent = 'Saved!';

                // Use smart update instead of always recreating
                if (response.wildcards) {
                    const wildcardCount = smartUpdateWildcards(node, constants, wildcardDropdowns, response.wildcards);
                    // Auto-expand if wildcards are present after save
                    autoExpandSidebar(wildcardCount);
                }

                if (isNewFile) {
                    console.log('Updating dropdown for new file:', fileName);
                    
                    node.properties.file_selection = fileName;
                    
                    const fileSelectionWidget = node.widgets.find(w => w.name === "file_selection");
                    if (fileSelectionWidget) {
                        await node.updateFileDropdown(filePath, fileSelectionWidget);
                        
                        fileSelectionWidget.value = fileName;
                        node.properties.file_selection = fileName;
                        
                        node.setDirtyCanvas(true, true);
                        
                        console.log('Dropdown updated with new file:', fileName);
                    }
                    
                    await node.updateBackend();
                }

                setTimeout(() => {
                    saveButton.textContent = 'Save File';
                    saveButton.disabled = false;
                }, 1000);
            } else {
                console.error('Failed to save file:', response);
                alert('Failed to save file');
                saveButton.textContent = 'Save File';
                saveButton.disabled = false;
            }
        } catch (error) {
            console.error('Error saving file:', error);
            alert('Error saving file');
            saveButton.textContent = 'Save File';
            saveButton.disabled = false;
        }
    };

    // Delete button logic (only for existing files)
    if (!isNewFile) {
        deleteButton.onclick = async () => {
            const confirmDelete = confirm(`Are you sure you want to delete "${fileName}.txt"?\n\nThis will also delete any associated wildcard selections.`);
            if (!confirmDelete) return;

            deleteButton.disabled = true;
            deleteButton.textContent = 'Deleting...';

            try {
                const response = await fetchSend(
                    constants.MESSAGE_ROUTE,
                    node.id,
                    "delete_file",
                    {
                        path: filePath,
                        file_selection: fileName
                    }
                );

                if (response && response.status === "success") {
                    console.log('File and wildcard selections deleted successfully');
                    
                    const fileSelectionWidget = node.widgets.find(w => w.name === "file_selection");
                    if (fileSelectionWidget) {
                        await node.updateFileDropdown(filePath, fileSelectionWidget);
                    }
                    
                    await node.updateBackend();
                    
                    alert('File deleted successfully');
                    
                    // Close modal
                    if (modal && modal.closeModal) {
                        modal.closeModal();
                    }
                } else {
                    console.error('Failed to delete file:', response);
                    alert('Failed to delete file');
                    deleteButton.textContent = 'Delete File';
                    deleteButton.disabled = false;
                }
            } catch (error) {
                console.error('Error deleting file:', error);
                alert('Error deleting file');
                deleteButton.textContent = 'Delete File';
                deleteButton.disabled = false;
            }
        };
    }

    // Assemble main section
    mainSection.appendChild(filePathDiv);
    mainSection.appendChild(textarea);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';

    if (!isNewFile) {
        buttonContainer.appendChild(deleteButton);
    } else {
        const spacer = document.createElement('div');
        buttonContainer.appendChild(spacer);
    }

    buttonContainer.appendChild(saveButton);
    mainSection.appendChild(buttonContainer);

    // Assemble sidebar
    sidebar.appendChild(sidebarToggle);
    sidebar.appendChild(sidebarContent);

    // Assemble modal
    contentDiv.appendChild(mainSection);
    contentDiv.appendChild(sidebar);

    const modalConfig = {
        content: contentDiv,
        onClose: () => console.log('Text editor modal closed'),
    };

    const modal = createModal(modalConfig);
    return modal;
}