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

    createTextbox() {
        this.textbox = document.createElement("div");
        this.textbox.className = "textbox";

        const textboxTopbar = document.createElement("div");
        textboxTopbar.className = "topbar";
        textboxTopbar.textContent = this.node.title;
        this.textbox.appendChild(textboxTopbar);

        this.textboxContent = document.createElement("textarea");
        this.textboxContent.className = "textbox-content";
        this.textboxContent.placeholder = "Type here...";
        this.textboxContent.spellcheck = false;
        const wildcardsPrompt = this.nodeDataProcessor.getWildcardsPrompt();
        if (wildcardsPrompt) this.textboxContent.value = wildcardsPrompt;
        this.textbox.appendChild(this.textboxContent);

        this.textboxContent.addEventListener("keydown", (event) => {
            if (event.key === "{" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                const textarea = event.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                event.preventDefault();
                textarea.focus();
                const scrollTop = textarea.scrollTop;
                if (start === end) {
                    document.execCommand('insertText', false, '{}');
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                    textarea.scrollTop = scrollTop;
                } else {
                    const selected = textarea.value.slice(start, end);
                    document.execCommand('insertText', false, '{' + selected + '}');
                    textarea.selectionStart = start;
                    textarea.selectionEnd = start + selected.length + 2;
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
            this.textboxContent.value = "";
            this.textboxContent.focus();
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

    getContent() {
        return this.textboxContent ? this.textboxContent.value : "";
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
