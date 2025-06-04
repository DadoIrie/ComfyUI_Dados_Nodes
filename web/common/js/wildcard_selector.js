import { createModal } from "./modal.js";

export function createWildcardModal(node, inputText) {
    const contentDiv = document.createElement('div');
    contentDiv.style.padding = '20px';
    contentDiv.style.fontFamily = 'monospace';
    contentDiv.style.whiteSpace = 'pre-wrap';
    contentDiv.textContent = inputText || 'No input text available';

    const modalConfig = {
        content: contentDiv,
        onClose: () => console.log('Wildcard modal closed'),
    };

    createModal(modalConfig);
}