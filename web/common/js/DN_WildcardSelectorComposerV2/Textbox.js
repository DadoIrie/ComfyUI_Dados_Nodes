
import { fetchSend } from "../utils.js";

export class Textbox {
    constructor(node, nodeDataProcessor, { constants = {}, onStructureUpdate, lineWrapping } = {}) {
        this.node = node;
        this.nodeDataProcessor = nodeDataProcessor;
        this.constants = constants;
        this.onStructureUpdate = onStructureUpdate;
        this.structureData = null;
        this.textbox = null;
        this.cmEditor = null;
        this.clearBtn = null;
        this.saveBtn = null;
        this.searchBtn = null;
        this.lineWrapping = lineWrapping; // flag for CodeMirror word wrap
    }

    async createTextbox() {
        this._createTextboxElement();
        await this._initCodeMirror();
        this._setupEditorFeatures();
        this._setupActionBar();
        return this.textbox;
    }

    mark(str, type = 'button') {
        this.unmark(type);
        if (!str || !this.cmEditor) return;
        const cursor = this.cmEditor.getSearchCursor(str);
        if (cursor.findNext()) {
            this.cmEditor.setSelection(cursor.from(), cursor.to());
            this.cmEditor.scrollIntoView({from: cursor.from(), to: cursor.to()});
            const className = type === 'option' ? 'option-mark' : 'wildcard-mark';
            this.cmEditor.getDoc().markText(cursor.from(), cursor.to(), { className });
        }
    }

    unmark(type = 'button') {
        if (this.cmEditor) {
            const marks = this.cmEditor.getDoc().getAllMarks();
            const className = type === 'option' ? 'option-mark' : 'wildcard-mark';
            marks.forEach(mark => {
                if (mark.className === className) {
                    mark.clear();
                }
            });
            const doc = this.cmEditor.getDoc();
            const cursor = doc.getCursor();
            doc.setSelection(cursor, cursor);
        }
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
        await this.loadCodeMirrorCDN();
        const wildcardsPrompt = this.nodeDataProcessor.getWildcardsPrompt() || "";
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
            lineWrapping: this.lineWrapping // set word wrap flag
        });
        setTimeout(() => {
            this.cmEditor.refresh();
        }, 1);
    }

    _setupEditorFeatures() {
        this.cmEditor.on("keydown", (cm, event) => {
            if (event.key === "{" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                const doc = cm.getDoc();
                const selections = doc.listSelections();
                if (selections.length === 1 && selections[0].empty()) {
                    doc.replaceSelection("{}", "around");
                    const cursor = doc.getCursor();
                    doc.setCursor({ line: cursor.line, ch: cursor.ch - 1 });
                } else {
                    selections.forEach(sel => {
                        const selected = doc.getRange(sel.anchor, sel.head);
                        doc.replaceRange("{" + selected + "}", sel.anchor, sel.head);
                    });
                }
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
            this.nodeDataProcessor.updateNodeData({ wildcards_structure_data: "{}" });
            if (this.onStructureUpdate) {
                this.onStructureUpdate(this.structureData);
            }
        });

        this.saveBtn.addEventListener("click", async () => {
            await this.saveAndSync();
        });
    }

    async loadCodeMirrorCDN() {
        if (window.CodeMirror) return;
        if (!document.getElementById("cm-css")) {
            const link = document.createElement("link");
            link.id = "cm-css";
            link.rel = "stylesheet";
            link.href = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css";
            document.head.appendChild(link);
        }
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js");
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/selection/mark-selection.min.js");
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/searchcursor.min.js");
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

    getContent() {
        return this.cmEditor ? this.cmEditor.getValue() : "";
    }

    async saveAndSync() {
        const content = this.getContent();
        const structureDataStr = this.nodeDataProcessor.getWildcardsStructure();
        this.structureData = structureDataStr ? JSON.parse(structureDataStr) : {};
        const currentStructure = this.structureData ? JSON.stringify(this.structureData) : "";
        try {
            this.nodeDataProcessor.updateNodeData({ wildcards_prompt: content });
            const response = await fetchSend(
                this.constants.MESSAGE_ROUTE,
                this.node.id,
                "update_wildcards_prompt",
                { content, wildcards_structure_data: currentStructure }
            );
            if (response.status === 'success' && response.wildcard_structure_data !== undefined) {
                this.nodeDataProcessor.updateNodeData({
                    wildcards_structure_data: response.wildcard_structure_data
                });
                this.structureData = JSON.parse(response.wildcard_structure_data);
                if (this.onStructureUpdate) {
                    this.onStructureUpdate(this.structureData);
                }
            }
            this.node.setDirtyCanvas(true, true);
            this.showSuccessMessage("Saved!");
        } catch (error) {
            console.error("Error saving content:", error);
            this.showErrorMessage("Save failed");
        }
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
}
