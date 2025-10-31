import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
   const constants = await fetch('/dadosConstants').then(response => response.json());
   EXTENSION_NAME = constants.EXTENSION_NAME;
   MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

   ({chainCallback, fetchSend} =
    await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})();

class DN_ChutesLLMNode {
    constructor(node) {
        this.node = node;
        this.node.addWidget("combo", "stored_prompts", "none", () => {}, { values: ["none"] });
        this.node.addWidget("button", "Save Prompt", null, () => { this.savePrompt(); });
        this.node.addWidget("button", "Delete Prompt", null, () => { this.deletePrompt(); });
        setTimeout(() => { this.loadPrompts(); }, 0);
    }

    loadPrompts() {
        return fetchSend(MESSAGE_ROUTE, this.node.id, "get_all_llm_prompts").then(response => {
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
        fetchSend(MESSAGE_ROUTE, this.node.id, "get_llm_prompt", { prompt_name: promptName }).then(response => {
            if (response.data) {
                const widgets = this.node.widgets;
                const system = widgets.find(w => w.name === "system");
                const user = widgets.find(w => w.name === "user");
                const model = widgets.find(w => w.name === "model");
                const temperature = widgets.find(w => w.name === "temperature");
                const max_tokens = widgets.find(w => w.name === "max_tokens");
                const seed = widgets.find(w => w.name === "seed");
                const top_p = widgets.find(w => w.name === "top_p");
                const top_k = widgets.find(w => w.name === "top_k");

                if (system) system.value = response.data.system;
                if (user) user.value = response.data.user;
                if (model) model.value = response.data.model;
                if (temperature) temperature.value = response.data.temperature;
                if (max_tokens) max_tokens.value = response.data.max_tokens;
                if (seed) seed.value = response.data.seed;
                if (top_p) top_p.value = response.data.top_p;
                if (top_k) top_k.value = response.data.top_k;

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
                system: widgets.find(w => w.name === "system")?.value,
                user: widgets.find(w => w.name === "user")?.value,
                model: widgets.find(w => w.name === "model")?.value,
                temperature: widgets.find(w => w.name === "temperature")?.value,
                max_tokens: widgets.find(w => w.name === "max_tokens")?.value,
                seed: widgets.find(w => w.name === "seed")?.value,
                top_p: widgets.find(w => w.name === "top_p")?.value,
                top_k: widgets.find(w => w.name === "top_k")?.value
            };
            fetchSend(MESSAGE_ROUTE, this.node.id, "store_llm_prompt", data).then(() => {
                this.loadPrompts();
            });
        } else {
            // Create new prompt - first get latest prompt list for validation
            fetchSend(MESSAGE_ROUTE, this.node.id, "get_all_llm_prompts").then(response => {
                const existingPrompts = response.prompts || [];
                this.getPromptName({
                    system: widgets.find(w => w.name === "system")?.value,
                    user: widgets.find(w => w.name === "user")?.value,
                    model: widgets.find(w => w.name === "model")?.value,
                    temperature: widgets.find(w => w.name === "temperature")?.value,
                    max_tokens: widgets.find(w => w.name === "max_tokens")?.value,
                    seed: widgets.find(w => w.name === "seed")?.value,
                    top_p: widgets.find(w => w.name === "top_p")?.value,
                    top_k: widgets.find(w => w.name === "top_k")?.value
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
        fetchSend(MESSAGE_ROUTE, this.node.id, "store_llm_prompt", { ...data, prompt_name: promptName }).then(() => {
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

        fetchSend(MESSAGE_ROUTE, this.node.id, "delete_llm_prompt", { prompt_name: selected }).then(response => {
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
    name: "DN_ChutesLLMNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_ChutesLLMNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', function () {
                new DN_ChutesLLMNode(this);
            });
        }
    }
});