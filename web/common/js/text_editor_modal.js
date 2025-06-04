import { createModal } from "./modal.js";
import { fetchSend } from "./utils.js";

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

    // Only show delete button for existing files
    if (!isNewFile) {
        deleteButton.onclick = async () => {
            const confirmDelete = confirm(`Are you sure you want to delete "${fileName}.txt"?`);
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
                    console.log('File deleted successfully');
                    
                    // Refresh the dropdown
                    const fileSelectionWidget = node.widgets.find(w => w.name === "file_selection");
                    if (fileSelectionWidget) {
                        await node.updateFileDropdown(filePath, fileSelectionWidget);
                    }
                    
                    await node.updateBackend();
                    
                    alert('File deleted successfully');
                    
                    // Close the modal
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

    contentDiv.appendChild(filePathDiv);
    contentDiv.appendChild(textarea);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';

    if (!isNewFile) {
        buttonContainer.appendChild(deleteButton);
    } else {
        // Add empty div to maintain spacing when no delete button
        const spacer = document.createElement('div');
        buttonContainer.appendChild(spacer);
    }

    buttonContainer.appendChild(saveButton);

    contentDiv.appendChild(buttonContainer);

    const modalConfig = {
        content: contentDiv,
        onClose: () => console.log('Text editor modal closed'),
    };

    const modal = createModal(modalConfig);
    return modal;
}