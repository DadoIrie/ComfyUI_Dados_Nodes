import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";
import { $el } from "../../scripts/ui.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "DN_DummyComboNode";

const PROVIDER_MODELS = {
    "Groq": [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "moonshotai/kimi-k2-instruct-0905"
    ],
    "Chutes": [
        "zai-org/GLM-4.5-Air",
        "zai-org/GLM-4.5-FP8",
        "meta-llama/Llama-3.3-70B-Instruct",
        "Qwen/Qwen2.5-72B-Instruct",
        "unsloth/gemma-3-4b-it",
        "unsloth/gemma-3-12b-it",
        "unsloth/gemma-3-27b-it",
        "unsloth/Mistral-Small-24B-Instruct-2501",
        "deepseek-ai/DeepSeek-V3-0324",
        "deepseek-ai/DeepSeek-R1",
        "NousResearch/DeepHermes-3-Llama-3-8B-Preview",
        "NousResearch/DeepHermes-3-Mistral-24B-Preview",
        "NousResearch/Hermes-4-14B",
        "NousResearch/Hermes-4-70B",
        "cognitivecomputations/Dolphin3.0-Mistral-24B"
    ],
    "OpenAI": [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-3.5-turbo"
    ]
};

app.registerExtension({
    name: `DN.${NODE_NAME}`,
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === NODE_NAME) {
            const onAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function () {
                onAdded?.apply(this, arguments);
                
                const providerWidget = this.widgets.find(w => w.name === "provider");
                const modelWidget = this.widgets.find(w => w.name === "model");
                
                if (providerWidget && modelWidget) {
                    // Function to update model options
                    const updateModelOptions = (selectedProvider) => {
                        const newModels = PROVIDER_MODELS[selectedProvider] || [];
                        modelWidget.options.values = newModels;
                        
                        // Reset model if current value not in new list
                        if (!newModels.includes(modelWidget.value)) {
                            modelWidget.value = newModels[0] || "";
                        }
                        
                        // Refresh the widget display
                        modelWidget.callback?.(modelWidget.value);
                        app.graph.setDirtyCanvas(true, false);
                    };

                    // Initial setup
                    updateModelOptions(providerWidget.value);
                    
                    // Listen for provider changes
                    const originalProviderCallback = providerWidget.callback;
                    providerWidget.callback = function (value) {
                        const result = originalProviderCallback?.apply(this, arguments) ?? value;
                        updateModelOptions(result);
                        return result;
                    };
                    
                    // Trigger initial callback to set models (ensure it runs after node is fully added)
                    setTimeout(() => providerWidget.callback(providerWidget.value), 10);
                }
            };
        }
    },
});
