import { fetchSend } from "../utils.js";

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
    }

    async createTextbox() {
        this._createTextboxElement();
        await this._initCodeMirror();
        this._setupEditorFeatures();
        this._setupActionBar();
        return this.textbox;
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

    // Simple marking command - just executes what the mediator tells it to do
    markText(start, end, className = 'wildcard-mark') {
        if (!this.cmEditor) return;
        
        const doc = this.cmEditor.getDoc();
        const from = doc.posFromIndex(start);
        const to = doc.posFromIndex(end);
        
        doc.setSelection(from, to);
        doc.markText(from, to, { className });
        this.cmEditor.scrollIntoView({from, to});
    }

    // Simple unmark command - removes marks by type
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

    // Legacy method for backward compatibility
    mark(str, type = 'button', start = null, end = null, optionIndex = null) {
        if (!str || !this.cmEditor) return;
        
        const className = type === 'option' ? 'option-mark' : 'wildcard-mark';
        
        if (typeof start === 'number' && typeof end === 'number') {
            this.markText(start, end, className);
        }
    }

    // Legacy method for backward compatibility
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
}
