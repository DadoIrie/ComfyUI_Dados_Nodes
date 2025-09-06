import { fetchSend } from "../utils.js";

export class Textbox {
    constructor(node, nodeDataProcessor, { constants = {}, onStructureUpdate } = {}) {
        this.node = node;
        this.nodeDataProcessor = nodeDataProcessor;
        this.constants = constants;
        this.textbox = null;
        this.textboxContent = null;
        this.clearBtn = null;
        this.saveBtn = null;
        this.onStructureUpdate = onStructureUpdate;
        this.structureData = null;
    }

    async createTextbox() {
        this.textbox = document.createElement("div");
        this.textbox.className = "textbox";

        const textboxTopbar = document.createElement("div");
        textboxTopbar.className = "topbar";
        textboxTopbar.textContent = this.node.title;
        this.textbox.appendChild(textboxTopbar);

        // Dynamically load CodeMirror via CDN if not already loaded
        await this.loadCodeMirrorCDN();

        // Create CodeMirror container
        const cmContainer = document.createElement("div");
        cmContainer.className = "textbox-content";
        cmContainer.style.height = "200px";
        this.textbox.appendChild(cmContainer);

        // Get initial value
        const wildcardsPrompt = this.nodeDataProcessor.getWildcardsPrompt() || "";

        // Initialize CodeMirror
        this.cmEditor = window.CodeMirror(cmContainer, {
            value: wildcardsPrompt,
            mode: "text",
            lineNumbers: true,
            theme: "default",
            viewportMargin: Infinity,
            spellcheck: false,
        });

        // Custom { } insertion on "{" key
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
            // Clear structureData and widget
            this.structureData = {};
            this.nodeDataProcessor.updateNodeData({ wildcards_structure_data: "{}" });
            if (this.onStructureUpdate) {
                this.onStructureUpdate(this.structureData);
            }
        });

        this.saveBtn.addEventListener("click", async () => {
            await this.saveAndSync();
        });

        return this.textbox;
    }

    async loadCodeMirrorCDN() {
        // Only load if not already loaded
        if (window.CodeMirror) return;
        // Load CSS
        if (!document.getElementById("cm-css")) {
            const link = document.createElement("link");
            link.id = "cm-css";
            link.rel = "stylesheet";
            link.href = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css";
            document.head.appendChild(link);
        }
        // Load JS
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js");
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
        // Send both prompt and current structure (with selections) to backend
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
