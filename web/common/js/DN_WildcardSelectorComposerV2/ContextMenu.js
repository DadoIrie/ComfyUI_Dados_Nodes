class MenuRenderer {
    constructor() {
        this.activeMenus = [];
    }

    createMenu(entries, xPosition, yPosition, level = 0, selection = '') {
        const menuElement = this.createMenuElement();
        
        entries.forEach(entry => {
            const menuItem = this.createMenuItem(entry, selection, level);
            menuElement.appendChild(menuItem);
        });
        
        document.body.appendChild(menuElement);
        this.activeMenus.push({ element: menuElement, level });
        
        this.positionMenu(menuElement, xPosition, yPosition);
        
        return menuElement;
    }

    createMenuElement() {
        const menu = document.createElement("div");
        menu.className = "textbox-context-menu";
        menu.style.visibility = 'visible';
        menu.style.pointerEvents = 'auto';
        return menu;
    }

    createMenuItem(entry, selection, level) {
        if (entry.type === 'separator') return this.createSeparator();
        
        const item = document.createElement("div");
        item.className = "textbox-context-menu-item";
        
        const itemText = this.getItemText(entry, selection);
        item.textContent = itemText;
        
        this.setupItemBehavior(item, entry, selection, level);
        // Right-click behavior: prevent native menu + log entry
        item.addEventListener("contextmenu", (event) => { event.preventDefault(); console.log(item.textContent.trim()); });
        
        return item;
    }

    createSeparator() {
        const separator = document.createElement("div");
        separator.className = "textbox-context-menu-separator";
        return separator;
    }

    getItemText(entry, selection) {
        if (entry.dynamic && typeof entry.text === 'function') {
            return entry.text(selection);
        }
        return entry.text;
    }

    setupItemBehavior(item, entry, selection, level) {
        const requiresSelection = entry.requiresSelection || false;
        const hasSelection = selection && selection.length > 0;
        
        if (requiresSelection && !hasSelection) {
            item.classList.add('disabled');
            return;
        }
        
        if (entry.disabled) {
            item.classList.add('disabled');
            return;
        }
        
        if (!item.classList.contains('disabled')) {
            if (entry.type === 'submenu') {
                this.setupSubmenuBehavior(item, entry, selection, level);
            } else if (entry.type === 'function') {
                this.setupFunctionBehavior(item, entry);
            }
        }
    }

    setupSubmenuBehavior(item, entry, selection, level) {
        item.onmouseenter = () => {
            const rect = item.getBoundingClientRect();
            const submenuX = rect.right;
            const submenuY = rect.top;
            
            this.hideSubmenusBeyondLevel(level);
            
            if (this.onSubmenuOpen) this.onSubmenuOpen(entry.submenu, submenuX, submenuY, level + 1, selection);
        };
    }

    setupFunctionBehavior(item, entry) {
        item.onclick = () => {
            if (entry.callback) {
                entry.callback(entry.value);
            }
            this.hideAllMenus();
        };
    }



    positionMenu(menuElement, xPosition, yPosition) {
        const rect = menuElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let adjustedX = xPosition;
        let adjustedY = yPosition;
        
        if (xPosition + rect.width > viewportWidth) {
            adjustedX = viewportWidth - rect.width;
        }
        
        if (yPosition + rect.height > viewportHeight) {
            adjustedY = viewportHeight - rect.height;
        }
        
        menuElement.style.left = `${adjustedX}px`;
        menuElement.style.top = `${adjustedY}px`;
    }

    hideSubmenusBeyondLevel(level) {
        this.activeMenus
            .filter(menu => menu.level > level)
            .forEach(menu => {
                menu.element.style.visibility = 'hidden';
                menu.element.style.pointerEvents = 'none';
            });
    }

    hideAllMenus() {
        this.activeMenus.forEach(menu => {
            menu.element.style.visibility = 'hidden';
            menu.element.style.pointerEvents = 'none';
        });
        this.activeMenus = [];
    }

    isClickInsideMenus(target) {
        return this.activeMenus.some(menu => menu.element.contains(target));
    }
}

class ClipboardManager {
    constructor() {
        this.clipboard = [];
        this.maxClipboardSize = 10;
    }

    addToClipboard(text) {
        if (!text) return;
        
        if (this.clipboard.length === 0 || this.clipboard[0] !== text) {
            this.clipboard.unshift(text);
            
            if (this.clipboard.length > this.maxClipboardSize) this.clipboard.pop();
        }
    }

    getClipboard() {
        return this.clipboard;
    }

    getLatestItem() {
        return this.clipboard[0] || '';
    }

    formatClipboardEntry(text) {
        const sanitizedText = text.replace(/\n/g, ' ');
        const maxLength = 20;
        
        if (sanitizedText.length > maxLength) return sanitizedText.substring(0, maxLength) + '...';
        
        return sanitizedText;
    }
}

export class ContextMenuManager {
    constructor(textbox) {
        this.textbox = textbox;
        this.clipboardManager = new ClipboardManager();
        this.menuRenderer = new MenuRenderer();
        
        this.menuSpecifications = {
            main: [
                {
                    type: 'function',
                    text: 'Cut',
                    value: 'cut',
                    callback: () => this.textbox.actions.handleCopyOrCutAction(true),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Copy',
                    value: 'copy',
                    callback: () => this.textbox.actions.handleCopyOrCutAction(false),
                    requiresSelection: true
                },
                {
                    type: (this.clipboardManager.getClipboard().length === 1) ? 'function' : 'submenu',
                    text: 'Paste',
                    value: 'paste',
                    callback: (this.clipboardManager.getClipboard().length === 1) ? 
                        () => this.textbox.actions.handlePasteAction(this.clipboardManager.getLatestItem()) : null,
                    submenu: (this.clipboardManager.getClipboard().length > 1) ? 'clipboard' : null
                },
                {
                    type: 'separator'
                },
                {
                    type: 'submenu',
                    text: 'Wildcards',
                    submenu: 'wildcard'
                },
                {
                    type: 'submenu',
                    text: 'Text Operations',
                    submenu: 'textops'
                },
                {
                    type: 'function',
                    text: (selection) => selection ? `Use "${selection}"` : 'No selection',
                    value: 'selection',
                    dynamic: true,
                    callback: () => this.textbox.actions.handleSelectionAction(),
                    requiresSelection: true
                }
            ],
            wildcard: [
                {
                    type: 'function',
                    text: 'Add Wildcard',
                    value: 'add_wildcard',
                    callback: () => this.textbox.actions.handleAddWildcard()
                },
                {
                    type: 'submenu',
                    text: 'Presets',
                    submenu: 'presets'
                },
                {
                    type: 'submenu',
                    text: 'Advanced',
                    submenu: 'advanced'
                }
            ],
            presets: [
                {
                    type: 'function',
                    text: 'Character',
                    value: '{character}',
                    callback: (value) => this.textbox.actions.insertText(value)
                },
                {
                    type: 'function',
                    text: 'Style',
                    value: '{style}',
                    callback: (value) => this.textbox.actions.insertText(value)
                },
                {
                    type: 'function',
                    text: 'Setting',
                    value: '{setting}',
                    callback: (value) => this.textbox.actions.insertText(value)
                }
            ],
            advanced: [
                {
                    type: 'function',
                    text: 'Multiple Choice',
                    value: '{option1|option2|option3}',
                    callback: (value) => this.textbox.actions.insertText(value)
                },
                {
                    type: 'function',
                    text: 'Range',
                    value: '{1-10}',
                    callback: (value) => this.textbox.actions.insertText(value)
                },
                {
                    type: 'function',
                    text: 'Weighted',
                    value: '{option1::2|option2::1}',
                    callback: (value) => this.textbox.actions.insertText(value)
                }
            ],
            textops: [
                {
                    type: 'submenu',
                    text: 'Transform',
                    submenu: 'transform'
                }
            ],
            transform: [
                {
                    type: 'function',
                    text: 'Uppercase',
                    callback: () => this.textbox.actions.handleTransformAction('uppercase'),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Lowercase',
                    callback: () => this.textbox.actions.handleTransformAction('lowercase'),
                    requiresSelection: true
                }
            ],
            clipboard: []
        };
        
        this.setupRendererCallbacks();
        this.textbox.customClipboard = this.clipboardManager.getClipboard();
        this.updateClipboardMenuEntries();
    }

    setupRendererCallbacks() {
        this.menuRenderer.onSubmenuOpen = (submenuName, x, y, level, selection) => {
            const submenuEntries = this.menuSpecifications[submenuName];
            
            if (submenuEntries) this.menuRenderer.createMenu(submenuEntries, x, y, level, selection);
        };
    }

    showContextMenu(xPosition, yPosition) {
        this.hideAllMenus();
        
        const selection = this.getSelectionText();
        
        this.updatePasteMenuItem();
        this.updateClipboardMenuEntries();
        
        this.menuRenderer.createMenu(this.menuSpecifications.main, xPosition, yPosition, 0, selection);
    }

    buildClipboardMenu(clipboard) {
        const items = [];
        for (let index = 0; index < clipboard.length; index++) {
            const clipboardText = clipboard[index];
            const displayText = this.clipboardManager.formatClipboardEntry(clipboardText);
            items.push({
                type: 'function',
                text: displayText,
                value: clipboardText,
                callback: (value) => this.textbox.actions.handlePasteAction(value)
            });
        }
        return items;
    }

    buildPasteEntry(clipboard) {
        const baseEntry = {
            text: 'Paste',
            value: 'paste',
            type: 'function'
        };

        if (clipboard.length === 0) {
            return { ...baseEntry, callback: null };
        }

        return {
            ...baseEntry,
            ...(clipboard.length === 1
                ? { callback: () => this.textbox.actions.handlePasteAction(this.clipboardManager.getLatestItem()) }
                : { type: 'submenu', submenu: 'clipboard' }
            )
        };
    }

    updatePasteMenuItem() {
        const cb = this.clipboardManager.getClipboard();
        const paste = this.buildPasteEntry(cb);
        const pasteMenuItem = this.menuSpecifications.main[2];

        pasteMenuItem.type = paste.type;
        pasteMenuItem.callback = paste.callback || null;
        pasteMenuItem.submenu = paste.submenu || null;
        
        pasteMenuItem.disabled = cb.length === 0;
    }

    updateClipboardMenuEntries() {
        const clipboard = this.clipboardManager.getClipboard();
        
        this.menuSpecifications.clipboard = this.buildClipboardMenu(clipboard);
        this.textbox.customClipboard = clipboard;
    }

    hideAllMenus() {
        this.menuRenderer.hideAllMenus();
    }

    isClickInsideMenus(target) {
        return this.menuRenderer.isClickInsideMenus(target);
    }

    addToClipboard(text) {
        this.clipboardManager.addToClipboard(text);
        this.updateClipboardMenuEntries();
    }
    getSelectionText() {
        return this.textbox.cmEditor ? this.textbox.cmEditor.getSelection() : '';
    }
}

export class Actions {
    constructor(textbox) {
        this.textbox = textbox;
    }

    logEntryTextOnRightClick(entryElement) {
        entryElement.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            console.log(entryElement.textContent.trim());
        });
    }

    handleCopyOrCutAction(isCut) {
        if (!this.textbox.cmEditor) return;
        
        const selection = this.textbox.cmEditor.getSelection();
        if (selection) {
            if (this.textbox.contextMenuManager) this.textbox.contextMenuManager.addToClipboard(selection);
            if (isCut) this.textbox.cmEditor.replaceSelection('');
            
            this.textbox.contextMenuManager?.hideAllMenus();
        }
    }

    handlePasteAction(value) {
        if (!this.textbox.cmEditor) return;
        
        let textToPaste = '';
        
        if (value) {
            textToPaste = value;
        } else if (this.textbox.customClipboard && this.textbox.customClipboard.length > 0) {
            textToPaste = this.textbox.customClipboard[0];
        }
        
        if (textToPaste) {
            this.textbox.cmEditor.replaceSelection(textToPaste);
            this.textbox.contextMenuManager?.hideAllMenus();
        }
    }

    async handleSystemCutOrCopy(isCut) {
        if (!this.textbox.cmEditor) return;
        
        const selection = this.textbox.cmEditor.getSelection();
        if (selection) {
            await navigator.clipboard.writeText(selection);
            
            if (isCut) this.textbox.cmEditor.replaceSelection('');
            
            this.textbox.contextMenuManager?.hideAllMenus();
        }
    }

    async handleSystemPaste() {
        if (!this.textbox.cmEditor) return;
        
        try {
            const text = await navigator.clipboard.readText();
            this.textbox.cmEditor.replaceSelection(text);
            this.textbox.contextMenuManager?.hideAllMenus();
        } catch (error) {
            console.error("Could not access system clipboard", error);
        }
    }

    handleSelectionAction() {
        const selection = this.textbox.cmEditor ? this.textbox.cmEditor.getSelection() : '';
        if (selection) {
            this.insertText(selection);
            this.textbox.contextMenuManager?.hideAllMenus();
        }
    }

    handleAddWildcard() {
        this.insertText('{}');
        
        if (this.textbox.cmEditor) {
            const cursor = this.textbox.cmEditor.getCursor();
            this.textbox.cmEditor.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
            this.textbox.contextMenuManager?.hideAllMenus();
        }
    }

    insertText(text) {
        if (this.textbox.cmEditor) this.textbox.cmEditor.replaceSelection(text);
    }

    handleTransformAction(transformationType) {
        if (!this.textbox.cmEditor) {
            console.error("CodeMirror editor is not initialized");
            return;
        }
        
        const selection = this.textbox.cmEditor.getSelection();
        if (!selection) {
            console.warn("No text selected");
            return;
        }
        
        let transformedText;
        
        switch (transformationType) {
            case 'uppercase':
                transformedText = selection.toUpperCase();
                break;
            case 'lowercase':
                transformedText = selection.toLowerCase();
                break;
            default:
                console.error("Unrecognized transformation type:", transformationType);
                return;
        }
        
        this.textbox.cmEditor.replaceSelection(transformedText);
        this.textbox.contextMenuManager?.hideAllMenus();
    }
}
