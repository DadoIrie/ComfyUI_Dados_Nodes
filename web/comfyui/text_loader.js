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
            
            this.updateBackend = async function() {
                if (!this.id || this.id === -1) return;
                
                await fetchSend(MESSAGE_ROUTE, this.id, "update_state", {
                    path: this.properties.path,
                    file_selection: this.properties.file_selection,
                    use_cached_file: this.properties.use_cached_file
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

            const editFileButton = this.addWidget("button", "edit_file", null, async () => {
                if (!this.properties.path || !this.properties.file_selection) {
                    alert("Please select a file first");
                    return;
                }

                try {
                    const response = await fetchSend(MESSAGE_ROUTE, this.id, "get_file_content", {
                        path: this.properties.path,
                        file_selection: this.properties.file_selection
                    });

                    let textContent = '';
                    if (response && response.status === "success") {
                        textContent = response.content || '';
                    }

                    const constants = {
                        EXTENSION_NAME: EXTENSION_NAME,
                        MESSAGE_ROUTE: MESSAGE_ROUTE
                    };

                    const { createTextEditorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/text_editor_modal.js`);
                    createTextEditorModal(this, textContent, constants, this.properties.path, this.properties.file_selection);
                } catch (error) {
                    console.error("Error getting file content:", error);
                    alert("Error loading file content");
                }
            });
            editFileButton.tooltip = "Edit the selected text file";

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
        });
        
        chainCallback(nodeType.prototype, "onConfigure", function(o) {
            if (o.properties) {
                this.properties = this.properties || {};
                this.properties.path = o.properties.path || "";
                this.properties.file_selection = o.properties.file_selection || "";
                this.properties.use_cached_file = o.properties.use_cached_file !== undefined ? o.properties.use_cached_file : true;
                
                if (this.widgets) {
                    const pathWidget = this.widgets.find(w => w.name === "path");
                    const fileSelectionWidget = this.widgets.find(w => w.name === "file_selection");
                    const useCachedWidget = this.widgets.find(w => w.name === "use_cached_file");
                    
                    if (pathWidget) pathWidget.value = this.properties.path;
                    if (useCachedWidget) useCachedWidget.value = this.properties.use_cached_file;
                    
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