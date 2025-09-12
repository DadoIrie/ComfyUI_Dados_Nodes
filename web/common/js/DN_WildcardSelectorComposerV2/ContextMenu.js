class ContextMenuFactory {
    constructor(textbox) {
        this.textbox = textbox;
    }

    createMenu(entries, x, y, level = 0, selection = '') {
        const menuElement = document.createElement("div");
        menuElement.className = "textbox-context-menu";
        menuElement.style.visibility = 'visible';
        menuElement.style.pointerEvents = 'auto';

        entries.forEach(entry => {
            if (entry.type === 'separator') {
                const separator = document.createElement("div");
                separator.className = "textbox-context-menu-separator";
                menuElement.appendChild(separator);
            } else {
                const item = this.createMenuItem(entry, selection, level);
                this.textbox.actions.logEntryTextOnRightClick(item); // Apply the new behavior to each entry
                menuElement.appendChild(item);
            }
        });

        document.body.appendChild(menuElement);
        this.textbox.activeMenus.push({ element: menuElement, level });

        this.textbox.contextMenuManager._adjustMenuPosition(menuElement, x, y);

        return menuElement;
    }

    createMenuItem(entry, selection, level) {
        const item = document.createElement("div");
        item.className = "textbox-context-menu-item";

        const text = entry.dynamic && typeof entry.text === 'function'
            ? entry.text(selection)
            : entry.text;

        item.textContent = text;

        const requiresSelection = entry.requiresSelection || false;
        const hasSelection = selection && selection.length > 0;

        if (requiresSelection && !hasSelection) {
                item.classList.add('disabled');
    return item;
        }

        item.addEventListener("contextmenu", (e) => e.preventDefault());

        if (!item.classList.contains('disabled')) {
            if (entry.type === 'submenu') {
                item.onmouseenter = (e) => {
                    const rect = item.getBoundingClientRect();
                    const submenuX = rect.right;
                    const submenuY = rect.top;

                    this.textbox.activeMenus
                        .filter(menu => menu.level > level)
                        .forEach(menu => {
                            menu.element.style.visibility = 'hidden';
                            menu.element.style.pointerEvents = 'none';
                        });

                    const submenuEntries = this.textbox.contextMenuManager.menuSpecifications[entry.submenu];
                    if (submenuEntries) {
                        this.createMenu(submenuEntries, submenuX, submenuY, level + 1, selection);
                    }
                };
            } else if (entry.type === 'function') {
                item.onclick = () => {
                    if (!requiresSelection || hasSelection) {
                        entry.callback(entry.value);
                        this.textbox.contextMenuManager._hideAllMenus();
                    }
                };
            }
        }

        return item;
    }
}

class ContextMenuManager {
    constructor(textbox) {
        this.textbox = textbox;
        this.factory = new ContextMenuFactory(textbox);
        this.menuSpecifications = {
            main: [
                {
                    type: 'function',
                    text: 'Cut',
                    value: 'cut',
                    callback: () => this.textbox.actions._handleCopyOrCutAction(true),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Copy',
                    value: 'copy',
                    callback: () => this.textbox.actions._handleCopyOrCutAction(false),
                    requiresSelection: true
                },
                {
                    type: (this.textbox.customClipboard.length === 1) ? 'function' : 'submenu',
                    text: 'Paste',
                    value: 'paste',
                    callback: (this.textbox.customClipboard.length === 1) ? (value) => this.textbox.actions._handlePasteAction(value) : null,
                    submenu: (this.textbox.customClipboard.length > 1) ? 'clipboard' : null
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
                    callback: () => this.textbox.actions._handleSelectionAction(),
                    requiresSelection: true
                }
            ],
            wildcard: [
                {
                    type: 'function',
                    text: 'Add Wildcard',
                    value: 'add_wildcard',
                    callback: () => this.textbox.actions._handleAddWildcard()
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
                    callback: (value) => this.textbox.actions._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Style',
                    value: '{style}',
                    callback: (value) => this.textbox.actions._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Setting',
                    value: '{setting}',
                    callback: (value) => this.textbox.actions._insertText(value)
                }
            ],
            advanced: [
                {
                    type: 'function',
                    text: 'Multiple Choice',
                    value: '{option1|option2|option3}',
                    callback: (value) => this.textbox.actions._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Range',
                    value: '{1-10}',
                    callback: (value) => this.textbox.actions._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Weighted',
                    value: '{option1::2|option2::1}',
                    callback: (value) => this.textbox.actions._insertText(value)
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
                    callback: () => this.textbox.actions._handleTransformAction('uppercase'),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Lowercase',
                    callback: () => this.textbox.actions._handleTransformAction('lowercase'),
                    requiresSelection: true
                }
            ],
            clipboard: []
        };

        this._updateClipboardMenuEntries();
    }

    showContextMenu(x, y) {
        this._hideAllMenus();
        const selection = this.textbox.cmEditor ? this.textbox.cmEditor.getSelection() : '';

        this.menuSpecifications.main[2].type = (this.textbox.customClipboard.length === 1) ? 'function' : 'submenu';
        this.menuSpecifications.main[2].callback = (this.textbox.customClipboard.length === 1) ?
            (value) => this.textbox.actions._handlePasteAction(this.textbox.customClipboard[0]) : null;
        this.menuSpecifications.main[2].submenu = (this.textbox.customClipboard.length > 1) ? 'clipboard' : null;

        this._updateClipboardMenuEntries();

        this.factory.createMenu(this.menuSpecifications.main, x, y, 0, selection);
    }

    _hideAllMenus() {
        this.textbox.activeMenus.forEach(menu => {
            menu.element.style.visibility = 'hidden';
            menu.element.style.pointerEvents = 'none';
        });
        this.textbox.activeMenus = [];
    }

    _isClickInsideMenus(target) {
        return this.textbox.activeMenus.some(menu => menu.element.contains(target));
    }

    _adjustMenuPosition(menuElement, x, y) {
        const rect = menuElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x;
        let adjustedY = y;

        if (x + rect.width > viewportWidth) {
            adjustedX = viewportWidth - rect.width;
        }

        if (y + rect.height > viewportHeight) {
            adjustedY = viewportHeight - rect.height;
        }

        menuElement.style.left = `${adjustedX}px`;
        menuElement.style.top = `${adjustedY}px`;
    }

    _updateClipboardMenuEntries() {
        this.menuSpecifications.clipboard = [];

        for (let i = this.textbox.customClipboard.length - 1; i >= 0; i--) {
            const text = this.textbox.customClipboard[i];
            const displayText = text.replace(/\n/g, ' ').substring(0, 20) + (text.length > 20 ? '...' : '');
            this.menuSpecifications.clipboard.push({
                type: 'function',
                text: displayText,
                value: text,
                callback: (value) => this.textbox.actions._handlePasteAction(value)
            });
        }
    }
}

class Actions {
    constructor(textbox) {
        this.textbox = textbox;
    }

    logEntryTextOnRightClick(entryElement) {
        entryElement.addEventListener("contextmenu", (e) => {
            e.preventDefault(); // Block the system context menu
            console.log(entryElement.textContent.trim()); // Log the visible text of the entry
        });
    }

    _handleCopyOrCutAction(isCut) {
        if (this.textbox.cmEditor) {
            const selection = this.textbox.cmEditor.getSelection();
            if (selection) {
                if (this.textbox.customClipboard.length === 0 || this.textbox.customClipboard[0] !== selection) {
                    this.textbox.customClipboard.unshift(selection);

                    if (this.textbox.customClipboard.length > 10) {
                        this.textbox.customClipboard.pop();
                    }

                    this.textbox.contextMenuManager._updateClipboardMenuEntries();
                }

                if (isCut) {
                    this.textbox.cmEditor.replaceSelection('');
                }
                this.textbox.contextMenuManager._hideAllMenus();
            }
        }
    }

    _handlePasteAction(value) {
        if (this.textbox.cmEditor) {
            let textToPaste = '';

            if (value) {
                textToPaste = value;
            } else if (this.textbox.customClipboard.length > 0) {
                textToPaste = this.textbox.customClipboard[0];
            }

            if (textToPaste) {
                this.textbox.cmEditor.replaceSelection(textToPaste);
                this.textbox.contextMenuManager._hideAllMenus();
            }
        }
    }

    _handleSystemCutOrCopy(isCut) {
        if (this.textbox.cmEditor) {
            const selection = this.textbox.cmEditor.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection);
                if (isCut) {
                    this.textbox.cmEditor.replaceSelection('');
                }
                this.textbox.contextMenuManager._hideAllMenus();
            }
        }
    }

    _handleSystemPaste() {
        if (this.textbox.cmEditor) {
            navigator.clipboard.readText().then(text => {
                this.textbox.cmEditor.replaceSelection(text);
                this.textbox.contextMenuManager._hideAllMenus();
            }).catch(err => {
                console.error("Could not access system clipboard", err);
            });
        }
    }

    _handleSelectionAction() {
        const selection = this.textbox.cmEditor ? this.textbox.cmEditor.getSelection() : '';
        if (selection) {
            this._insertText(selection);
            this.textbox.contextMenuManager._hideAllMenus();
        }
    }

    _handleAddWildcard() {
        this._insertText('{}');
        if (this.textbox.cmEditor) {
            const cursor = this.textbox.cmEditor.getCursor();
            this.textbox.cmEditor.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
            this.textbox.contextMenuManager._hideAllMenus();
        }
    }

    _insertText(text) {
        if (this.textbox.cmEditor) {
            this.textbox.cmEditor.replaceSelection(text);
        }
    }

    _handleTransformAction(value) {
        if (!this.textbox.cmEditor) {
            console.error("CodeMirror editor is not initialized.");
            return;
        }

        const selection = this.textbox.cmEditor.getSelection();
        if (!selection) {
            console.warn("No text selected.");
            return;
        }

        let transformedText;

        switch (value) {
            case 'uppercase':
                transformedText = selection.toUpperCase();
                break;
            case 'lowercase':
                transformedText = selection.toLowerCase();
                break;
            default:
                console.error("Unrecognized transformation value:", value);
                return;
        }

        this.textbox.cmEditor.replaceSelection(transformedText);
        this.textbox.contextMenuManager._hideAllMenus();
    }
}

export { ContextMenuManager, Actions };
