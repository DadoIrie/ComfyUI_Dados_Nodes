import { createModal } from "./modal.js";
import { fetchSend } from "./utils.js";

export function createTextEditorModal(node, textContent, constants, filePath, fileName) {
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

    saveButton.onclick = async () => {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        
        try {
            const response = await fetchSend(
                constants.MESSAGE_ROUTE,
                node.id,
                "save_file",
                { content: textarea.value }
            );
            
            if (response && response.status === "success") {
                console.log('File saved successfully');
                saveButton.textContent = 'Saved!';
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
    contentDiv.appendChild(saveButton);

    const modalConfig = {
        content: contentDiv,
        onClose: () => console.log('Text editor modal closed'),
    };

    const modal = createModal(modalConfig);
    return modal;
}