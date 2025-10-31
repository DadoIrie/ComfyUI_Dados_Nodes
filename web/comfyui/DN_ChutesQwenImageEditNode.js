import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
   const constants = await fetch('/dadosConstants').then(response => response.json());
   EXTENSION_NAME = constants.EXTENSION_NAME;
   MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

   ({chainCallback, fetchSend} =
    await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})();

class DN_ChutesQwenImageEditNode {
    constructor(node) {
        this.node = node;
        this.node.addWidget("combo", "stored_prompts", "none", () => {}, { values: ["none"] });
        this.node.addWidget("button", "Save Prompt", null, () => { this.savePrompt(); });
        this.node.addWidget("button", "Delete Prompt", null, () => { this.deletePrompt(); });
        setTimeout(() => { this.loadPrompts(); }, 0);
    }

    loadPrompts() {
        return fetchSend(MESSAGE_ROUTE, this.node.id, "get_all_qwen_edit_prompts").then(response => {
            this.updateDropdown(response.prompts);
        });
    }

    updateDropdown(prompts) {
        const dropdown = this.node.widgets.find(w => w.name === "stored_prompts");
        dropdown.options.values = ["none", ...prompts];
        dropdown.callback = (value) => { if (value !== "none") this.loadPrompt(value); };
        this.node.setDirtyCanvas(true);
    }

    loadPrompt(promptName) {
        fetchSend(MESSAGE_ROUTE, this.node.id, "get_qwen_edit_prompt", { prompt_name: promptName }).then(response => {
            if (response.data) {
                const widgets = this.node.widgets;
                const cfg = widgets.find(w => w.name === "cfg");
                const steps = widgets.find(w => w.name === "steps");
                const seed = widgets.find(w => w.name === "seed");
                const prompt = widgets.find(w => w.name === "prompt");
                const neg = widgets.find(w => w.name === "negative_prompt");
                if (cfg) cfg.value = response.data.cfg;
                if (steps) steps.value = response.data.steps;
                if (seed) seed.value = response.data.seed;
                if (prompt) prompt.value = response.data.prompt;
                if (neg) neg.value = response.data.negative_prompt || "";
                this.node.setDirtyCanvas(true);
            }
        });
    }

    savePrompt() {
        const widgets = this.node.widgets;
        const selected = widgets.find(w => w.name === "stored_prompts")?.value;

        if (selected && selected !== "none") {
            // Update existing prompt
            const data = {
                prompt_name: selected,
                cfg: widgets.find(w => w.name === "cfg")?.value || 4.0,
                steps: widgets.find(w => w.name === "steps")?.value || 40,
                seed: widgets.find(w => w.name === "seed")?.value || 0,
                prompt: widgets.find(w => w.name === "prompt")?.value || "",
                negative_prompt: widgets.find(w => w.name === "negative_prompt")?.value || ""
            };
            fetchSend(MESSAGE_ROUTE, this.node.id, "store_qwen_edit_prompt", data).then(() => {
                this.loadPrompts();
            });
        } else {
            // Create new prompt - first get latest prompt list for validation
            fetchSend(MESSAGE_ROUTE, this.node.id, "get_all_qwen_edit_prompts").then(response => {
                const existingPrompts = response.prompts || [];
                this.getPromptName({
                    cfg: widgets.find(w => w.name === "cfg")?.value || 4.0,
                    steps: widgets.find(w => w.name === "steps")?.value || 40,
                    seed: widgets.find(w => w.name === "seed")?.value || 0,
                    prompt: widgets.find(w => w.name === "prompt")?.value || "",
                    negative_prompt: widgets.find(w => w.name === "negative_prompt")?.value || ""
                }, existingPrompts);
            });
        }
    }

    getPromptName(data, existingPrompts = []) {
        let promptName = prompt("Enter prompt name:");
        if (!promptName) return;
        promptName = promptName.trim();
        if (!promptName) {
            alert("Prompt name cannot be empty");
            return;
        }
        if (existingPrompts.includes(promptName)) {
            const overwrite = confirm(`Prompt "${promptName}" already exists. Do you want to overwrite it?`);
            if (!overwrite) {
                // Re-prompt for new name
                this.getPromptName(data, existingPrompts);
                return;
            }
        }
        fetchSend(MESSAGE_ROUTE, this.node.id, "store_qwen_edit_prompt", { ...data, prompt_name: promptName }).then(() => {
            // Refresh dropdown and switch to newly saved prompt
            this.loadPrompts().then(() => {
                const dropdown = this.node.widgets.find(w => w.name === "stored_prompts");
                if (dropdown) {
                    dropdown.value = promptName;
                    this.node.setDirtyCanvas(true);
                }
            });
        });
    }

    deletePrompt() {
        const selected = this.node.widgets.find(w => w.name === "stored_prompts")?.value;
        if (!selected || selected === "none") return;

        const confirmed = confirm(`Are you sure you want to delete the prompt "${selected}"?`);
        if (!confirmed) return;

        fetchSend(MESSAGE_ROUTE, this.node.id, "delete_qwen_edit_prompt", { prompt_name: selected }).then(response => {
            if (response.prompts) {
                this.updateDropdown(response.prompts);
                // Switch to none after deletion
                const dropdown = this.node.widgets.find(w => w.name === "stored_prompts");
                dropdown.value = "none";
                this.node.setDirtyCanvas(true);
            }
        });
    }
}

app.registerExtension({
    name: "DN_ChutesQwenImageEditNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_ChutesQwenImageEditNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', function () {
                new DN_ChutesQwenImageEditNode(this);
            });
        }
    }
});