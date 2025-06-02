import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

app.registerExtension({
    name: "DynamicTextLoaderNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DynamicTextLoaderNode") {
            return;
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            this.properties = this.properties || {};
            this.properties.path = "";
            this.properties.file_selection = "";
            this.properties.use_cached_file = true;
            this.properties.random_prompt = false;
            this.properties.use_attention = false;
            this.properties.seed = 0;
            
            this.updateBackend = async function() {
                if (!this.id || this.id === -1) return;
                
                await fetchSend(MESSAGE_ROUTE, this.id, "update_state", {
                    path: this.properties.path,
                    file_selection: this.properties.file_selection,
                    use_cached_file: this.properties.use_cached_file,
                    random_prompt: this.properties.random_prompt,
                    use_attention: this.properties.use_attention,
                    seed: this.properties.seed
                });
            };

            const pathWidget = this.addWidget("STRING", "path", "", async (value) => {
                this.properties.path = value;
                await this.updateFileDropdown(value, fileSelectionWidget);
                this.updateBackend().catch(() => {});
                return value;
            });
            pathWidget.tooltip = "Directory path containing .txt files";

            const fileSelectionWidget = this.addWidget("combo", "file_selection", "", async (value) => {
                this.properties.file_selection = value;
                await this.updateBackend();
                return value;
            }, { values: [""] });
            fileSelectionWidget.tooltip = "Select a .txt file from the directory";

            const useCachedWidget = this.addWidget("toggle", "use_cached_file", true, async (value) => {
                this.properties.use_cached_file = value;
                await this.updateBackend();
                return value;
            });
            useCachedWidget.tooltip = "Use cached file content if available.";

            const randomPromptWidget = this.addWidget("toggle", "random_prompt", false, async (value) => {
                this.properties.random_prompt = value;
                await this.updateBackend();
                return value;
            });
            randomPromptWidget.tooltip = "Is the text a prompt with wildcards? Then turn this on.";

            const useAttentionWidget = this.addWidget("toggle", "use_attention", false, async (value) => {
                this.properties.use_attention = value;
                await this.updateBackend();
                return value;
            });
            useAttentionWidget.tooltip = "Use attention generator for emphasis. Only works when random_prompt is enabled.";

            const seedWidget = this.addWidget("INT", "seed", 0, async (value) => {
                this.properties.seed = parseInt(value) || 0;
                await this.updateBackend();
                return value;
            }, { min: 0, max: 2000000000 });
            seedWidget.tooltip = "The seed to use for generating images. Plug returned seed(s) into sampler.";

            this.updateFileDropdown = async function(path, widget) {
                try {
                    const response = await fetchSend(MESSAGE_ROUTE, this.id, "get_txt_files", { path });
                    
                    if (response && response.files) {
                        widget.options.values = response.files;
                        
                        if (response.valid_path && response.files.length > 0) {
                            const currentSelection = this.properties.file_selection;
                            if (currentSelection && response.files.includes(currentSelection)) {
                                widget.value = currentSelection;
                            } else {
                                this.properties.file_selection = response.files[0];
                                widget.value = response.files[0];
                            }
                        } else {
                            this.properties.file_selection = response.files[0];
                            widget.value = response.files[0];
                        }
                        
                        this.setDirtyCanvas(true, true);
                    }
                } catch (error) {
                    console.error("Error updating file dropdown:", error);
                    widget.options.values = ["error"];
                    widget.value = "error";
                    this.properties.file_selection = "error";
                }
            };

            setTimeout(async () => {
                await this.updateBackend();
                if (this.properties.path) {
                    await this.updateFileDropdown(this.properties.path, fileSelectionWidget);
                }
            }, 100);
        });
        
        chainCallback(nodeType.prototype, "onSerialize", function(o) {
            o.properties = o.properties || {};
            o.properties.path = this.properties.path;
            o.properties.file_selection = this.properties.file_selection;
            o.properties.use_cached_file = this.properties.use_cached_file;
            o.properties.random_prompt = this.properties.random_prompt;
            o.properties.use_attention = this.properties.use_attention;
            o.properties.seed = this.properties.seed;
        });
        
        chainCallback(nodeType.prototype, "onConfigure", function(o) {
            if (o.properties) {
                this.properties = this.properties || {};
                this.properties.path = o.properties.path || "";
                this.properties.file_selection = o.properties.file_selection || "";
                this.properties.use_cached_file = o.properties.use_cached_file !== undefined ? o.properties.use_cached_file : true;
                this.properties.random_prompt = o.properties.random_prompt || false;
                this.properties.use_attention = o.properties.use_attention || false;
                this.properties.seed = o.properties.seed || 0;
                
                if (this.widgets) {
                    const pathWidget = this.widgets.find(w => w.name === "path");
                    const fileSelectionWidget = this.widgets.find(w => w.name === "file_selection");
                    const useCachedWidget = this.widgets.find(w => w.name === "use_cached_file");
                    const randomPromptWidget = this.widgets.find(w => w.name === "random_prompt");
                    const useAttentionWidget = this.widgets.find(w => w.name === "use_attention");
                    const seedWidget = this.widgets.find(w => w.name === "seed");
                    
                    if (pathWidget) pathWidget.value = this.properties.path;
                    if (useCachedWidget) useCachedWidget.value = this.properties.use_cached_file;
                    if (randomPromptWidget) randomPromptWidget.value = this.properties.random_prompt;
                    if (useAttentionWidget) useAttentionWidget.value = this.properties.use_attention;
                    if (seedWidget) seedWidget.value = this.properties.seed;
                    
                    if (fileSelectionWidget && this.properties.path) {
                        this.updateFileDropdown(this.properties.path, fileSelectionWidget).then(() => {
                            if (this.properties.file_selection) {
                                fileSelectionWidget.value = this.properties.file_selection;
                            }
                        });
                    }
                }
                
                this.updateBackend().catch(() => {});
            }
        });
        
        return nodeType;
    }
});