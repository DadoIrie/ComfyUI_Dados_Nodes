export class Textbox {
    constructor(node, mediator, { constants = {}, onStructureUpdate } = {}) {
        this.node = node;
        this.mediator = mediator;
        this.constants = constants;
        this.onStructureUpdate = onStructureUpdate;
        this.structureData = null;
        this.textbox = null;
        this.cmEditor = null;
        this.clearBtn = null;
        this.saveBtn = null;
        this.searchBtn = null;
        
        // Context menu initialization
        this.contextMenu = null;
        this.activeMenus = [];
        this.contextMenuFactory = null;
        // Custom internal clipboard array
        this.customClipboard = [];
        this._initContextMenuCore();
    }

    async createTextbox() {
        this._createTextboxElement();
        await this._initCodeMirror();
        this._setupEditorFeatures();
        this._setupActionBar();
        this._setupContextMenuEventListeners();
        return this.textbox;
    }

    _initContextMenuCore() {
        this.contextMenu = document.createElement("div");
        this.contextMenu.className = "textbox-context-menu";
        document.body.insertBefore(this.contextMenu, document.body.firstChild);
        
        this.contextMenuFactory = new ContextMenuFactory(this);
        this._setupMenuSpecifications();
    }

    getContent() {
        return this.cmEditor.getValue();
    }

    async saveAndSync() {
        this.mediator.queueEvent('save-request', {});
    }

    _createTextboxElement() {
        this.textbox = document.createElement("div");
        this.textbox.className = "textbox";
        const textboxTopbar = document.createElement("div");
        textboxTopbar.className = "topbar";
        textboxTopbar.textContent = this.node.title;
        this.textbox.appendChild(textboxTopbar);
        this.cmContainer = document.createElement("div");
        this.cmContainer.className = "textbox-content";
        this.cmContainer.style.height = "100%";
        this.textbox.appendChild(this.cmContainer);
    }

    async _initCodeMirror() {
        await this.loadCodeMirror();
        const wildcardsPrompt = this.mediator.getWildcardsPrompt();
        if (!window.CodeMirror.modes["wildcards"]) {
            window.CodeMirror.defineMode("wildcards", function() {
                return {
                    token: function(stream) {
                        if (stream.match(/^#.*/)) {
                            return "comment";
                        }
                        stream.next();
                        return null;
                    }
                };
            });
        }
        this.cmEditor = window.CodeMirror(this.cmContainer, {
            value: wildcardsPrompt,
            mode: "wildcards",
            lineNumbers: false,
            theme: "default",
            viewportMargin: Infinity,
            spellcheck: false,
            autofocus: true,
            autoRefresh: true,
            styleSelectedText: true,
            lineWrapping: await window.app.extensionManager.setting.get("wildcard_selector.lineWrap")
        });
        setTimeout(() => {
            this.cmEditor.refresh();
            this.cmEditor.focus();

            // not sure if wanna move cursor to end on open - keep it commented for now
            /* const doc = this.cmEditor.getDoc();
            const lastLine = doc.lastLine();
            const lastCh = doc.getLine(lastLine).length;
            doc.setCursor({ line: lastLine, ch: lastCh }); */
        }, 1);
    }

    async loadCodeMirror() {
        if (window.CodeMirror) return;
        if (!document.getElementById("cm-css")) {
            const link = document.createElement("link");
            link.id = "cm-css";
            link.rel = "stylesheet";
            link.href = `/extensions/${this.constants.EXTENSION_NAME}/common/vendor/css/codemirror/codemirror.min.css`;
            document.head.appendChild(link);
        }
        const basePath = `/extensions/${this.constants.EXTENSION_NAME}/common/vendor/js/codemirror/`;
        await this.loadScript(`${basePath}codemirror.min.js`);
        await Promise.all([
            this.loadScript(`${basePath}mark-selection.min.js`),
            this.loadScript(`${basePath}searchcursor.min.js`)
        ]);
    }

    _setupEditorFeatures() {
        const pairs = { '{': '}', '(': ')', '[': ']' };
        const openKeys = Object.keys(pairs);
        const closeKeys = Object.values(pairs);
        this.cmEditor.on("keydown", async (cm, event) => {
            const doc = cm.getDoc();
            const selections = doc.listSelections();
            if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                const tabSpaces = await window.app.extensionManager.setting.get("wildcard_selector.tab_spaces");
                const spaces = " ".repeat(tabSpaces);
                if (selections.length === 1 && selections[0].empty()) {
                    doc.replaceSelection(spaces, "end");
                } else {
                    cm.execCommand("defaultTab");
                }
                return;
            }
            if (openKeys.includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                const open = event.key;
                const close = pairs[open];
                if (selections.some(sel => !sel.empty())) {
                    let newSelections = [];
                    for (let i = selections.length - 1; i >= 0; i--) {
                        const sel = selections[i];
                        const from = sel.anchor;
                        const to = sel.head;
                        const ordered = CodeMirror.cmpPos(from, to) <= 0 ? {start: from, end: to} : {start: to, end: from};
                        const selected = doc.getRange(ordered.start, ordered.end);
                        doc.replaceRange(open + selected + close, ordered.start, ordered.end);
                        let start = { line: ordered.start.line, ch: ordered.start.ch + 1 };
                        let end = { line: ordered.end.line, ch: ordered.end.ch + 1 };
                        if (CodeMirror.cmpPos(from, to) > 0) {
                            newSelections.unshift({ anchor: end, head: start });
                        } else {
                            newSelections.unshift({ anchor: start, head: end });
                        }
                    }
                    doc.setSelections(newSelections);
                } else {
                    doc.replaceSelection(open + close, "around");
                    const cursor = doc.getCursor();
                    doc.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
                }
                return;
            }
            if (closeKeys.includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                const close = event.key;
                if (selections.some(sel => !sel.empty())) {
                    event.preventDefault();
                    let newSelections = [];
                    for (let i = selections.length - 1; i >= 0; i--) {
                        const sel = selections[i];
                        const from = sel.anchor;
                        const to = sel.head;
                        const ordered = CodeMirror.cmpPos(from, to) <= 0 ? {start: from, end: to} : {start: to, end: from};
                        let afterClose = { line: ordered.end.line, ch: ordered.end.ch };
                        const lineContent = doc.getLine(afterClose.line);
                        if (lineContent[afterClose.ch] === close) {
                            afterClose = { line: afterClose.line, ch: afterClose.ch + 1 };
                        }
                        newSelections.unshift({ anchor: afterClose, head: afterClose });
                    }
                    doc.setSelections(newSelections);
                } else {
                    const cursor = doc.getCursor();
                    const lineContent = doc.getLine(cursor.line);
                    if (lineContent[cursor.ch] === close) {
                        event.preventDefault();
                        doc.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
                    }
                }
                return;
            }
            if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                const cursor = doc.getCursor();
                const lineContent = doc.getLine(cursor.line);
                const prevChar = cursor.ch > 0 ? lineContent[cursor.ch - 1] : "";
                if (
                    openKeys.includes(prevChar) &&
                    lineContent[cursor.ch] === pairs[prevChar]
                ) {
                    event.preventDefault();
                    const close = pairs[prevChar];
                    const openLine = cursor.line;
                    const openCh = cursor.ch - 1;
                    let spaceCount = 0;
                    for (let i = 0; i < openCh; i++) {
                        if (lineContent[i] === " ") spaceCount++;
                        else break;
                    }
                    let cursorSpaces = "";
                    for (let i = 0; i < spaceCount + 2; i++) cursorSpaces += " ";
                    let closeSpaces = "";
                    for (let i = 0; i < openCh; i++) closeSpaces += " ";
                    let middleLine = cursorSpaces;
                    doc.replaceRange("\n" + middleLine + "\n", cursor, cursor);
                    let closeLine = openLine + 2;
                    let targetLineContent = doc.getLine(closeLine);
                    let expectedClose = closeSpaces + close;
                    if (targetLineContent.startsWith(close)) {
                        doc.replaceRange("", { line: closeLine, ch: 0 }, { line: closeLine, ch: 1 });
                        targetLineContent = doc.getLine(closeLine);
                    }
                    if (!targetLineContent.startsWith(expectedClose)) {
                        doc.replaceRange(expectedClose, { line: closeLine, ch: 0 }, { line: closeLine, ch: 0 });
                    }
                    doc.setCursor({ line: openLine + 1, ch: middleLine.length });
                }
                return;
            }
            if (event.key === "s" && event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                this.saveBtn.click();
                return;
            }
        });
    }

    _setupActionBar() {
        const actionBar = document.createElement("div");
        actionBar.className = "textbox-action-bar";
        this.clearBtn = this.createActionButton("Clear", "clear");
        this.saveBtn = this.createActionButton("Save", "save");
        actionBar.appendChild(this.clearBtn);
        actionBar.appendChild(this.saveBtn);
        this.textbox.appendChild(actionBar);

        this.clearBtn.addEventListener("click", () => {
            this.cmEditor.setValue("");
            this.cmEditor.focus();
            this.structureData = {};
            this.mediator.updateNodeData({ wildcards_structure_data: "{}" });
            if (this.onStructureUpdate) {
                this.onStructureUpdate(this.structureData);
            }
        });

        this.saveBtn.addEventListener("click", async () => {
            await this.saveAndSync();
        });
    }

    createActionButton(text, className) {
        const btn = document.createElement("button");
        btn.className = `textbox-action-btn ${className}`;
        btn.textContent = text;
        return btn;
    }

    showSuccessMessage(message) {
        const originalText = this.saveBtn.textContent;
        this.saveBtn.textContent = message;
        setTimeout(() => {
            this.saveBtn.textContent = originalText;
        }, 1000);
    }

    showErrorMessage(message) {
        alert(message);
    }

    markText(start, end, className = 'wildcard-mark') {
        if (!this.cmEditor) return;
        
        const doc = this.cmEditor.getDoc();
        const from = doc.posFromIndex(start);
        const to = doc.posFromIndex(end);
        
        doc.setSelection(from, to);
        doc.markText(from, to, { className });
        this.cmEditor.scrollIntoView({from, to});
    }

    clearMarks(className = 'wildcard-mark') {
        if (!this.cmEditor) return;
        
        const marks = this.cmEditor.getDoc().getAllMarks();
        marks.forEach(mark => {
            if (mark.className === className) {
                mark.clear();
            }
        });
        
        const doc = this.cmEditor.getDoc();
        const cursor = doc.getCursor();
        doc.setSelection(cursor, cursor);
    }

    mark(str, type = 'button', start = null, end = null, optionIndex = null) {
        if (!str || !this.cmEditor) return;
        
        const className = type === 'option' ? 'option-mark' : 'wildcard-mark';
        
        if (typeof start === 'number' && typeof end === 'number') {
            this.markText(start, end, className);
        }
    }

    unmark(type = 'button') {
        const className = type === 'option' ? 'option-mark' : 'wildcard-mark';
        this.clearMarks(className);
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src='${src}']`)) {
                resolve();
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    _setupMenuSpecifications() {
        this.menuSpecifications = {
            main: [
                {
                    type: 'function',
                    text: 'Cut',
                    value: 'cut',
                    callback: () => this._handleCutAction(),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Copy',
                    value: 'copy',
                    callback: () => this._handleCopyAction(),
                    requiresSelection: true
                },
                {
                    type: (this.customClipboard.length === 1) ? 'function' : 'submenu',
                    text: 'Paste',
                    value: 'paste',
                    callback: (this.customClipboard.length === 1) ? (value) => this._handlePasteAction(value) : null,
                    submenu: (this.customClipboard.length > 1) ? 'clipboard' : null
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
                    callback: () => this._handleSelectionAction(),
                    requiresSelection: true
                }
            ],
            wildcard: [
                {
                    type: 'function',
                    text: 'Add Wildcard',
                    value: 'add_wildcard',
                    callback: () => this._handleAddWildcard()
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
                    callback: (value) => this._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Style',
                    value: '{style}',
                    callback: (value) => this._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Setting',
                    value: '{setting}',
                    callback: (value) => this._insertText(value)
                }
            ],
            advanced: [
                {
                    type: 'function',
                    text: 'Multiple Choice',
                    value: '{option1|option2|option3}',
                    callback: (value) => this._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Range',
                    value: '{1-10}',
                    callback: (value) => this._insertText(value)
                },
                {
                    type: 'function',
                    text: 'Weighted',
                    value: '{option1::2|option2::1}',
                    callback: (value) => this._insertText(value)
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
                    value: 'uppercase',
                    callback: (value) => this._handleTransformAction(value),
                    requiresSelection: true
                },
                {
                    type: 'function',
                    text: 'Lowercase',
                    value: 'lowercase',
                    callback: (value) => this._handleTransformAction(value),
                    requiresSelection: true
                }
            ],
            clipboard: [] // This will be populated dynamically
        };
        
        // Update clipboard menu entries dynamically
        this._updateClipboardMenuEntries();
    }
    
    _updateClipboardMenuEntries() {
        // Clear existing clipboard entries
        this.menuSpecifications.clipboard = [];
        
        // Add entries in reverse order (newest first)
        for (let i = this.customClipboard.length - 1; i >= 0; i--) {
            const text = this.customClipboard[i];
            // Format display text: limit to 20 chars and remove newlines
            const displayText = text.replace(/\n/g, ' ').substring(0, 20) + (text.length > 20 ? '...' : '');
            
            this.menuSpecifications.clipboard.push({
                type: 'function',
                text: displayText,
                value: text,
                callback: (value) => this._handlePasteAction(value)
            });
        }
    }

    _setupContextMenuEventListeners() {
        if (this.cmEditor && this.cmEditor.getWrapperElement) {
            const wrapper = this.cmEditor.getWrapperElement();
            wrapper.addEventListener("contextmenu", (e) => {
                this._handleContextMenuEvent(e);
            });
        }

        document.addEventListener("mousedown", (e) => {
            if (!this._isClickInsideMenus(e.target)) {
                this._hideAllMenus();
            }
        });
    }

    async _handleContextMenuEvent(e) {
        const contextMenuMode = await window.app.extensionManager.setting.get("wildcard_selector.contextMenuMode");
        const showCustomMenu = (contextMenuMode === "custom") ? !e.ctrlKey : e.ctrlKey;
        
        if (showCustomMenu) {
            e.preventDefault();
            this._showContextMenu(e.clientX, e.clientY);
        }
    }

    _showContextMenu(x, y) {
        this._hideAllMenus();
        const selection = this.cmEditor ? this.cmEditor.getSelection() : '';
        
        // Update the paste menu entry type based on clipboard contents
        this.menuSpecifications.main[2].type = (this.customClipboard.length === 1) ? 'function' : 'submenu';
        this.menuSpecifications.main[2].callback = (this.customClipboard.length === 1) ?
            (value) => this._handlePasteAction(this.customClipboard[0]) : null;
        this.menuSpecifications.main[2].submenu = (this.customClipboard.length > 1) ? 'clipboard' : null;
        
        // Update clipboard menu entries
        this._updateClipboardMenuEntries();
        
        this.contextMenuFactory.createMenu(this.menuSpecifications.main, x, y, 0, selection);
    }

    _hideAllMenus() {
        this.activeMenus.forEach(menu => {
            menu.element.style.visibility = 'hidden';
            menu.element.style.pointerEvents = 'none';
        });
        this.activeMenus = [];
    }

    _isClickInsideMenus(target) {
        return this.activeMenus.some(menu => menu.element.contains(target));
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

    _handleCutAction() {
        if (this.cmEditor) {
            const selection = this.cmEditor.getSelection();
            if (selection) {
                // Only add to clipboard if it's different from the first item
                if (this.customClipboard.length === 0 || this.customClipboard[0] !== selection) {
                    // Add to custom clipboard at the beginning (newest first)
                    this.customClipboard.unshift(selection);
                    
                    // Keep only the most recent 10 items
                    if (this.customClipboard.length > 10) {
                        this.customClipboard = this.customClipboard.slice(0, 10);
                    }
                    
                    // Update clipboard menu entries
                    this._updateClipboardMenuEntries();
                }
                
                // Also update system clipboard for external use
                navigator.clipboard.writeText(selection).then(() => {
                    this.cmEditor.replaceSelection('');
                });
            }
        }
    }

    _handleCopyAction() {
        if (this.cmEditor) {
            const selection = this.cmEditor.getSelection();
            if (selection) {
                // Only add to clipboard if it's different from the first item
                if (this.customClipboard.length === 0 || this.customClipboard[0] !== selection) {
                    // Add to custom clipboard at the beginning (newest first)
                    this.customClipboard.unshift(selection);
                    
                    // Keep only the most recent 10 items
                    if (this.customClipboard.length > 10) {
                        this.customClipboard = this.customClipboard.slice(0, 10);
                    }
                    
                    // Update clipboard menu entries
                    this._updateClipboardMenuEntries();
                }
                
                // Also update system clipboard for external use
                navigator.clipboard.writeText(selection);
            }
        }
    }

    _handlePasteAction(value) {
        if (this.cmEditor) {
            let textToPaste = '';
            
            // If value is provided, use it (from clipboard submenu)
            if (value) {
                textToPaste = value;
            } else if (this.customClipboard.length > 0) {
                // Otherwise use the most recent item
                textToPaste = this.customClipboard[0];
            }
            
            if (textToPaste) {
                this.cmEditor.replaceSelection(textToPaste);
            }
        }
    }

    _handleSelectionAction() {
        const selection = this.cmEditor ? this.cmEditor.getSelection() : '';
        if (selection) {
            this._insertText(selection);
        }
    }

    _handleAddWildcard() {
        this._insertText('{}');
        if (this.cmEditor) {
            const cursor = this.cmEditor.getCursor();
            this.cmEditor.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
        }
    }

    _insertText(text) {
        if (this.cmEditor) {
            this.cmEditor.replaceSelection(text);
        }
    }

    _handleTransformAction(value) {
        if (!this.cmEditor) return;
        
        const selection = this.cmEditor.getSelection();
        if (!selection) return;
        
        let transformedText = selection;
        
        switch (value) {
            case 'uppercase':
                transformedText = selection.toUpperCase();
                break;
            case 'lowercase':
                transformedText = selection.toLowerCase();
                break;
        }
        
        this.cmEditor.replaceSelection(transformedText);
    }
}

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
                menuElement.appendChild(item);
            }
        });

        document.body.appendChild(menuElement);
        this.textbox.activeMenus.push({ element: menuElement, level });
        
        this.textbox._adjustMenuPosition(menuElement, x, y);
        
        return menuElement;
    }

    createMenuItem(entry, selection, level) {
        const item = document.createElement("div");
        item.className = "textbox-context-menu-item";
        
        const text = entry.dynamic && typeof entry.text === 'function'
            ? entry.text(selection)
            : entry.text;
        
        item.textContent = text;
        item.onmousedown = (e) => e.preventDefault();
        
        // Check if the item requires selection and disable if none exists
        const requiresSelection = entry.requiresSelection || false;
        const hasSelection = selection && selection.length > 0;
        
        if (requiresSelection && !hasSelection) {
            item.classList.add('disabled');
        }
        
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
                
                const submenuEntries = this.textbox.menuSpecifications[entry.submenu];
                if (submenuEntries) {
                    this.createMenu(submenuEntries, submenuX, submenuY, level + 1, selection);
                }
            };
        } else if (entry.type === 'function') {
            item.onclick = () => {
                if (!requiresSelection || hasSelection) {
                    entry.callback(entry.value);
                    this.textbox._hideAllMenus();
                }
            };
        }
        
        return item;
    }
}
