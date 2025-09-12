import { ContextMenuManager, Actions } from './ContextMenu.js';

class CodeMirrorLoader {
    constructor(extensionName) {
        this.extensionName = extensionName;
        this.basePath = `/extensions/${extensionName}/common/vendor/js/codemirror/`;
    }

    async loadCodeMirror() {
        if (window.CodeMirror) return;
        
        await this.loadStylesheet();
        await this.loadMainScript();
        await this.loadAdditionalScripts();
    }

    async loadStylesheet() {
        if (!document.getElementById("cm-css")) {
            const link = document.createElement("link");
            link.id = "cm-css";
            link.rel = "stylesheet";
            link.href = `/extensions/${this.extensionName}/common/vendor/css/codemirror/codemirror.min.css`;
            document.head.appendChild(link);
        }
    }

    async loadMainScript() {
        await this.loadScript(`${this.basePath}codemirror.min.js`);
    }

    async loadAdditionalScripts() {
        await Promise.all([
            this.loadScript(`${this.basePath}mark-selection.min.js`),
            this.loadScript(`${this.basePath}searchcursor.min.js`)
        ]);
    }

    loadScript(scriptSource) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src='${scriptSource}']`)) {
                resolve();
                return;
            }
            
            const script = document.createElement("script");
            script.src = scriptSource;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}

class WildcardsCodeMirrorMode {
    static register() {
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
    }
}

class KeyboardShortcutHandler {
    constructor(editor, saveCallback, textboxActions) {
        this.editor = editor;
        this.saveCallback = saveCallback;
        this.textboxActions = textboxActions;
    }

    async setupKeyboardHandlers() {
        const bracketPairs = { '{': '}', '(': ')', '[': ']' };
        const openingBrackets = Object.keys(bracketPairs);
        const closingBrackets = Object.values(bracketPairs);
        
        this.editor.on("keydown", async (codeMirror, event) => {
            const document = codeMirror.getDoc();
            const selections = document.listSelections();
            
            if (await this.handleTabKey(event, codeMirror, document, selections)) return;
            if (this.handleOpeningBrackets(event, bracketPairs, openingBrackets, codeMirror, document, selections)) return;
            if (this.handleClosingBrackets(event, closingBrackets, codeMirror, document, selections)) return;
            if (this.handleEnterKey(event, openingBrackets, bracketPairs, codeMirror, document)) return;
            if (this.handleSaveShortcut(event)) return;
            
            await this.handleClipboardShortcuts(event, codeMirror);
        });
    }

    async handleTabKey(event, codeMirror, document, selections) {
        if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            
            const tabSpaces = await window.app.extensionManager.setting.get("wildcard_selector.tab_spaces");
            const spaces = " ".repeat(tabSpaces);
            
            if (selections.length === 1 && selections[0].empty()) {
                document.replaceSelection(spaces, "end");
            } else {
                codeMirror.execCommand("defaultTab");
            }
            return true;
        }
        return false;
    }

    handleOpeningBrackets(event, bracketPairs, openingBrackets, codeMirror, document, selections) {
        if (openingBrackets.includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            
            const openBracket = event.key;
            const closeBracket = bracketPairs[openBracket];
            
            if (selections.some(selection => !selection.empty())) {
                this.wrapSelectionsWithBrackets(document, selections, openBracket, closeBracket);
            } else {
                this.insertBracketPair(document, openBracket, closeBracket);
            }
            return true;
        }
        return false;
    }

    wrapSelectionsWithBrackets(document, selections, openBracket, closeBracket) {
        let newSelections = [];
        
        for (let index = selections.length - 1; index >= 0; index--) {
            const selection = selections[index];
            const fromPosition = selection.anchor;
            const toPosition = selection.head;
            const orderedSelection = CodeMirror.cmpPos(fromPosition, toPosition) <= 0 ? 
                {start: fromPosition, end: toPosition} : 
                {start: toPosition, end: fromPosition};
            
            const selectedText = document.getRange(orderedSelection.start, orderedSelection.end);
            document.replaceRange(openBracket + selectedText + closeBracket, orderedSelection.start, orderedSelection.end);
            
            let startPosition = { line: orderedSelection.start.line, ch: orderedSelection.start.ch + 1 };
            let endPosition = { line: orderedSelection.end.line, ch: orderedSelection.end.ch + 1 };
            
            if (CodeMirror.cmpPos(fromPosition, toPosition) > 0) {
                newSelections.unshift({ anchor: endPosition, head: startPosition });
            } else {
                newSelections.unshift({ anchor: startPosition, head: endPosition });
            }
        }
        
        document.setSelections(newSelections);
    }

    insertBracketPair(document, openBracket, closeBracket) {
        document.replaceSelection(openBracket + closeBracket, "around");
        const cursor = document.getCursor();
        document.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
    }

    handleClosingBrackets(event, closingBrackets, codeMirror, document, selections) {
        if (closingBrackets.includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const closeBracket = event.key;
            
            if (selections.some(selection => !selection.empty())) {
                event.preventDefault();
                this.moveToAfterClosingBrackets(document, selections, closeBracket);
                return true;
            } else {
                return this.skipOverMatchingClosingBracket(event, document, closeBracket);
            }
        }
        return false;
    }

    moveToAfterClosingBrackets(document, selections, closeBracket) {
        let newSelections = [];
        
        for (let index = selections.length - 1; index >= 0; index--) {
            const selection = selections[index];
            const fromPosition = selection.anchor;
            const toPosition = selection.head;
            const orderedSelection = CodeMirror.cmpPos(fromPosition, toPosition) <= 0 ? 
                {start: fromPosition, end: toPosition} : 
                {start: toPosition, end: fromPosition};
            
            let afterClosePosition = { line: orderedSelection.end.line, ch: orderedSelection.end.ch };
            const lineContent = document.getLine(afterClosePosition.line);
            
            if (lineContent[afterClosePosition.ch] === closeBracket) {
                afterClosePosition = { line: afterClosePosition.line, ch: afterClosePosition.ch + 1 };
            }
            
            newSelections.unshift({ anchor: afterClosePosition, head: afterClosePosition });
        }
        
        document.setSelections(newSelections);
    }

    skipOverMatchingClosingBracket(event, document, closeBracket) {
        const cursor = document.getCursor();
        const lineContent = document.getLine(cursor.line);
        
        if (lineContent[cursor.ch] === closeBracket) {
            event.preventDefault();
            document.setCursor({ line: cursor.line, ch: cursor.ch + 1 });
            return true;
        }
        return false;
    }

    handleEnterKey(event, openingBrackets, bracketPairs, codeMirror, document) {
        if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const cursor = document.getCursor();
            const lineContent = document.getLine(cursor.line);
            const previousCharacter = cursor.ch > 0 ? lineContent[cursor.ch - 1] : "";
            
            if (openingBrackets.includes(previousCharacter) && 
                lineContent[cursor.ch] === bracketPairs[previousCharacter]) {
                
                event.preventDefault();
                this.insertFormattedBracketBlock(document, cursor, lineContent, previousCharacter, bracketPairs);
                return true;
            }
        }
        return false;
    }

    insertFormattedBracketBlock(document, cursor, lineContent, openBracket, bracketPairs) {
        const closeBracket = bracketPairs[openBracket];
        const openLine = cursor.line;
        const openCharacter = cursor.ch - 1;
        
        const leadingSpaces = this.countLeadingSpaces(lineContent, openCharacter);
        const cursorIndentation = " ".repeat(leadingSpaces + 2);
        const closingIndentation = " ".repeat(openCharacter);
        
        const middleLineContent = cursorIndentation;
        
        document.replaceRange("\n" + middleLineContent + "\n", cursor, cursor);
        
        const closeLine = openLine + 2;
        const targetLineContent = document.getLine(closeLine);
        const expectedClosing = closingIndentation + closeBracket;
        
        if (targetLineContent.startsWith(closeBracket)) {
            document.replaceRange("", { line: closeLine, ch: 0 }, { line: closeLine, ch: 1 });
        }
        
        const updatedLineContent = document.getLine(closeLine);
        if (!updatedLineContent.startsWith(expectedClosing)) {
            document.replaceRange(expectedClosing, { line: closeLine, ch: 0 }, { line: closeLine, ch: 0 });
        }
        
        document.setCursor({ line: openLine + 1, ch: middleLineContent.length });
    }

    countLeadingSpaces(lineContent, upToCharacter) {
        let spaceCount = 0;
        for (let index = 0; index < upToCharacter; index++) {
            if (lineContent[index] === " ") {
                spaceCount++;
            } else {
                break;
            }
        }
        return spaceCount;
    }

    handleSaveShortcut(event) {
        if (event.key === "s" && event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            if (this.saveCallback) {
                this.saveCallback();
            }
            return true;
        }
        return false;
    }

    async handleClipboardShortcuts(event, codeMirror) {
        const contextMenuMode = await window.app.extensionManager.setting.get("wildcard_selector.contextMenuMode");
        const keyPressed = event.key.toLowerCase();
        
        if (!event.ctrlKey || event.altKey || event.metaKey) return;
        
        const isCustomMode = contextMenuMode === 'custom';
        const useSystemAction = isCustomMode === event.shiftKey;
        
        if (keyPressed === 'x' && (event.shiftKey || isCustomMode)) {
            event.preventDefault();
            event.stopPropagation();
            if (useSystemAction) {
                await this.textboxActions.handleSystemCutOrCopy(true);
            } else {
                this.textboxActions.handleCopyOrCutAction(true);
            }
        } else if (keyPressed === 'c' && (event.shiftKey || isCustomMode)) {
            event.preventDefault();
            event.stopPropagation();
            if (useSystemAction) {
                await this.textboxActions.handleSystemCutOrCopy(false);
            } else {
                this.textboxActions.handleCopyOrCutAction(false);
            }
        } else if (keyPressed === 'v' && (event.shiftKey || isCustomMode)) {
            event.preventDefault();
            event.stopPropagation();
            if (useSystemAction) {
                await this.textboxActions.handleSystemPaste();
            } else {
                this.textboxActions.handlePasteAction();
            }
        }
    }
}

class TextboxUIBuilder {
    constructor(nodeTitle) {
        this.nodeTitle = nodeTitle;
    }

    createTextboxElement() {
        const textbox = document.createElement("div");
        textbox.className = "textbox";
        
        const topbar = this.createTopbar();
        const contentContainer = this.createContentContainer();
        
        textbox.appendChild(topbar);
        textbox.appendChild(contentContainer);
        
        return { textbox, contentContainer };
    }

    createTopbar() {
        const topbar = document.createElement("div");
        topbar.className = "topbar";
        topbar.textContent = this.nodeTitle;
        return topbar;
    }

    createContentContainer() {
        const container = document.createElement("div");
        container.className = "textbox-content";
        container.style.height = "100%";
        return container;
    }

    createActionBar(buttons) {
        const actionBar = document.createElement("div");
        actionBar.className = "textbox-action-bar";
        
        buttons.forEach(button => {
            actionBar.appendChild(button);
        });
        
        return actionBar;
    }

    createActionButton(buttonText, className) {
        const button = document.createElement("button");
        button.className = `textbox-action-btn ${className}`;
        button.textContent = buttonText;
        return button;
    }
}

export class Textbox {
    constructor(node, mediator, { constants = {}, onStructureUpdate } = {}) {
        this.node = node;
        this.mediator = mediator;
        this.constants = constants;
        this.onStructureUpdate = onStructureUpdate;
        
        this.codeMirrorLoader = new CodeMirrorLoader(constants.EXTENSION_NAME);
        this.uiBuilder = new TextboxUIBuilder(node.title);
        
        this.structureData = null;
        this.textbox = null;
        this.cmEditor = null;
        this.clearButton = null;
        this.saveButton = null;
        this.cmContainer = null;
        
        this.contextMenu = null;
        this.activeMenus = [];
        this.customClipboard = [];
        this.contextMenuManager = null;
        this.actions = null;
        
        this.initializeContextMenu();
    }

    async createTextbox() {
        this.createTextboxElements();
        await this.initializeCodeMirror();
        
        this.contextMenuMode = await window.app.extensionManager.setting.get(
            "wildcard_selector.contextMenuMode"
        );
        
        this.setupKeyboardHandlers();
        this.setupActionBar();
        this.setupContextMenuEventListeners();
        
        return this.textbox;
    }

    initializeContextMenu() {
        this.contextMenu = document.createElement("div");
        this.contextMenu.className = "textbox-context-menu";
        document.body.insertBefore(this.contextMenu, document.body.firstChild);
        
        this.contextMenuManager = new ContextMenuManager(this);
        this.actions = new Actions(this);
    }

    createTextboxElements() {
        const { textbox, contentContainer } = this.uiBuilder.createTextboxElement();
        this.textbox = textbox;
        this.cmContainer = contentContainer;
    }

    async initializeCodeMirror() {
        await this.codeMirrorLoader.loadCodeMirror();
        
        const initialContent = this.mediator.getWildcardsPrompt();
        WildcardsCodeMirrorMode.register();
        
        const lineWrapping = await window.app.extensionManager.setting.get("wildcard_selector.lineWrap");
        
        this.cmEditor = window.CodeMirror(this.cmContainer, {
            value: initialContent,
            mode: "wildcards",
            lineNumbers: false,
            theme: "default",
            viewportMargin: Infinity,
            spellcheck: false,
            autofocus: true,
            autoRefresh: true,
            styleSelectedText: true,
            lineWrapping: lineWrapping
        });
        
        setTimeout(() => {
            this.cmEditor.refresh();
            this.cmEditor.focus();
        }, 1);
    }

    setupKeyboardHandlers() {
        const keyboardHandler = new KeyboardShortcutHandler(
            this.cmEditor,
            () => this.saveButton?.click(),
            this.actions
        );
        
        keyboardHandler.setupKeyboardHandlers();
    }

    setupActionBar() {
        const clearButton = this.uiBuilder.createActionButton("Clear", "clear");
        const saveButton = this.uiBuilder.createActionButton("Save", "save");
        
        const actionBar = this.uiBuilder.createActionBar([clearButton, saveButton]);
        
        this.clearButton = clearButton;
        this.saveButton = saveButton;
        
        this.setupButtonEventListeners();
        this.textbox.appendChild(actionBar);
    }

    setupButtonEventListeners() {
        this.clearButton.addEventListener("click", () => {
            this.cmEditor.setValue("");
            this.cmEditor.focus();
            this.structureData = {};
            this.mediator.updateNodeData({ wildcards_structure_data: "{}" });
            
            if (this.onStructureUpdate) {
                this.onStructureUpdate(this.structureData);
            }
        });

        this.saveButton.addEventListener("click", async () => {
            await this.saveAndSync();
        });
    }

    setupContextMenuEventListeners() {
        if (this.cmEditor && this.cmEditor.getWrapperElement) {
            const wrapper = this.cmEditor.getWrapperElement();
            wrapper.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                this.contextMenuManager.showContextMenu(event.clientX, event.clientY);
            });
        }

        document.addEventListener("mousedown", (event) => {
            if (!this.contextMenuManager.isClickInsideMenus(event.target)) {
                this.contextMenuManager.hideAllMenus();
            }
        });
    }

    getContent() {
        return this.cmEditor.getValue();
    }

    async saveAndSync() {
        this.mediator.queueEvent('save-request', {});
    }

    showSuccessMessage(message) {
        const originalText = this.saveButton.textContent;
        this.saveButton.textContent = message;
        setTimeout(() => {
            this.saveButton.textContent = originalText;
        }, 1000);
    }

    showErrorMessage(message) {
        alert(message);
    }

    markText(startPosition, endPosition, className = 'wildcard-mark') {
        if (!this.cmEditor) return;
        
        const document = this.cmEditor.getDoc();
        const fromPosition = document.posFromIndex(startPosition);
        const toPosition = document.posFromIndex(endPosition);
        
        document.setSelection(fromPosition, toPosition);
        document.markText(fromPosition, toPosition, { className });
        this.cmEditor.scrollIntoView({from: fromPosition, to: toPosition});
    }

    clearMarks(className = 'wildcard-mark') {
        if (!this.cmEditor) return;
        
        const marks = this.cmEditor.getDoc().getAllMarks();
        marks.forEach(mark => {
            if (mark.className === className) {
                mark.clear();
            }
        });
        
        const document = this.cmEditor.getDoc();
        const cursor = document.getCursor();
        document.setSelection(cursor, cursor);
    }

    mark(searchString, markType = 'button', startPosition = null, endPosition = null, optionIndex = null) {
        if (!searchString || !this.cmEditor) return;
        
        const className = markType === 'option' ? 'option-mark' : 'wildcard-mark';
        
        if (typeof startPosition === 'number' && typeof endPosition === 'number') {
            this.markText(startPosition, endPosition, className);
        }
    }

    unmark(markType = 'button') {
        const className = markType === 'option' ? 'option-mark' : 'wildcard-mark';
        this.clearMarks(className);
    }

    async handleContextMenuEvent(event) {
        const contextMenuMode = await window.app.extensionManager.setting.get("wildcard_selector.contextMenuMode");
        const showCustomMenu = (contextMenuMode === "custom") ? !event.ctrlKey : event.ctrlKey;

        if (showCustomMenu) {
            event.preventDefault();
            this.contextMenuManager.showContextMenu(event.clientX, event.clientY);
        }
    }
}