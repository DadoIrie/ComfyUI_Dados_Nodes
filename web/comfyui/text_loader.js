import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

class TextLoaderNode {
    constructor(node) {
        this.node = node;
        this.widgets = {};
        this.initializeProperties();
    }

    initializeProperties() {
        this.node.properties = this.node.properties || {};
        this.node.properties.path = this.node.properties.path || "";
        this.node.properties.file_selection = this.node.properties.file_selection || "";
        this.node.properties.use_cached_file = this.node.properties.use_cached_file !== undefined ? 
            this.node.properties.use_cached_file : true;
    }

    async updateBackend() {
        if (!this.node.id || this.node.id === -1) return;
        
        await fetchSend(MESSAGE_ROUTE, this.node.id, "update_state", {
            path: this.node.properties.path,
            file_selection: this.node.properties.file_selection,
            use_cached_file: this.node.properties.use_cached_file
        });
    }

    getWidget(name) {
        return this.widgets[name] || this.node.widgets.find(w => w.name === name);
    }

    isValidPath() {
        return this.node.properties.path && 
               this.node.properties.file_selection &&
               !["error", "invalid path", "no files"].includes(this.node.properties.file_selection);
    }

    isFileSelected() {
        return this.node.properties.path && 
               this.node.properties.file_selection &&
               !["error", "invalid path"].includes(this.node.properties.file_selection);
    }

    showError(message) {
        console.error(message);
        alert(message);
    }

    createPathWidget() {
        const widget = this.node.addWidget("STRING", "path", "", async (value) => {
            this.node.properties.path = value;
            await this.updateFileDropdown(value);
            this.updateBackend().catch(() => {});
            return value;
        });
        widget.tooltip = "Directory path containing .txt files";
        this.widgets.path = widget;
        return widget;
    }

    createFileSelectionWidget() {
        const widget = this.node.addWidget("combo", "file_selection", "", async (value) => {
            this.node.properties.file_selection = value;
            await this.updateBackend();
            this.updateButtonVisibility();
            return value;
        }, { values: [""] });
        widget.tooltip = "Select a .txt file from the directory";
        this.widgets.file_selection = widget;
        return widget;
    }

    createUseCachedWidget() {
        const widget = this.node.addWidget("toggle", "use_cached_file", true, async (value) => {
            this.node.properties.use_cached_file = value;
            await this.updateBackend();
            return value;
        });
        widget.tooltip = "Use cached file content if available.";
        this.widgets.use_cached = widget;
        return widget;
    }

    createEditFileButton() {
        const widget = this.node.addWidget("button", "Edit", null, async () => {
            await this.handleEditFile();
        });
        widget.tooltip = "Edit the selected text file";
        this.widgets.edit_file = widget;
        return widget;
    }

    createNewFileButton() {
        const widget = this.node.addWidget("button", "New", null, async () => {
            await this.handleNewFile();
        });
        widget.tooltip = "Create a new text file";
        this.widgets.create = widget;
        return widget;
    }

    createDeleteFileButton() {
        const widget = this.node.addWidget("button", "Delete", null, async () => {
            await this.handleDeleteFile();
        });
        widget.tooltip = "Delete the selected text file";
        this.widgets.delete_file = widget;
        return widget;
    }

    async handleEditFile() {
        if (!this.isFileSelected()) {
            this.showError("Please select a file first");
            return;
        }

        try {
            const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "get_file_content", {
                path: this.node.properties.path,
                file_selection: this.node.properties.file_selection
            });

            const textContent = response?.status === "success" ? response.content || '' : '';
            const constants = { EXTENSION_NAME, MESSAGE_ROUTE };
            
            const { createTextEditorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/text_editor_modal.js`);
            createTextEditorModal(
                this.node, 
                textContent, 
                constants, 
                this.node.properties.path, 
                this.node.properties.file_selection
            );
        } catch (error) {
            console.error("Error loading file content:", error);
            this.showError("Error loading file content");
        }
    }

    async handleNewFile() {
        if (!this.node.properties.path) {
            this.showError("Please enter a valid path first");
            return;
        }
        
        if (["error", "invalid path"].includes(this.node.properties.file_selection)) {
            this.showError("Please enter a valid path first");
            return;
        }
        
        const filename = prompt("Enter filename (with or without .txt extension):");
        if (!filename?.trim()) return;
        
        let processedFilename = filename.trim();
        if (!processedFilename.toLowerCase().endsWith('.txt')) {
            processedFilename += '.txt';
        }
        
        const filenameWithoutExt = processedFilename.slice(0, -4);
        const constants = { EXTENSION_NAME, MESSAGE_ROUTE };

        try {
            const { createTextEditorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/text_editor_modal.js`);
            createTextEditorModal(
                this.node, 
                "", 
                constants, 
                this.node.properties.path, 
                filenameWithoutExt, 
                true
            );
        } catch (error) {
            console.error("Error creating text editor modal:", error);
            this.showError("Error opening text editor");
        }
    }

    async handleDeleteFile() {
        const confirmDelete = confirm(`Are you sure you want to delete "${this.node.properties.file_selection}.txt"?`);
        if (!confirmDelete) return;

        try {
            const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "delete_file", {
                path: this.node.properties.path,
                file_selection: this.node.properties.file_selection
            });

            if (response?.status === "success") {
                await this.updateFileDropdown(this.node.properties.path);
                await this.updateBackend();
                alert('File deleted successfully');
            } else {
                this.showError('Failed to delete file');
            }
        } catch (error) {
            console.error("Error deleting file:", error);
            this.showError("Error deleting file");
        }
    }

    manageButton(buttonName, action) {
        const existingButton = this.getWidget(buttonName);
        
        if (action === "add" && !existingButton) {
            if (buttonName === "New") {
                this.createNewFileButton();
            } else if (buttonName === "Delete") {
                this.createDeleteFileButton();
            } else if (buttonName === "Edit") {
                this.createEditFileButton();
            }
        } else if (action === "remove" && existingButton) {
            const index = this.node.widgets.indexOf(existingButton);
            if (index > -1) {
                this.node.widgets.splice(index, 1);
                delete this.widgets[buttonName];
            }
        }
        
        this.node.setDirtyCanvas(true);
    }

    updateButtonVisibility() {
        const hasValidFiles = this.isValidPath();
        const hasNoFiles = this.node.properties.path && this.node.properties.file_selection === "no files";

        /* remove all for the sake of consistent visibility order */
        this.manageButton("Edit", "remove");
        this.manageButton("New", "remove");
        this.manageButton("Delete", "remove");
        
        if (hasValidFiles) {
            this.manageButton("Edit", "add");
            this.manageButton("New", "add");
            this.manageButton("Delete", "add");
        } else if (hasNoFiles) {
            this.manageButton("Edit", "remove");
            this.manageButton("New", "add");
            this.manageButton("Delete", "remove");
        } else {
            this.manageButton("Edit", "remove");
            this.manageButton("New", "remove");
            this.manageButton("Delete", "remove");
        }
    }

    async updateFileDropdown(path) {
        const fileSelectionWidget = this.getWidget("file_selection");
        if (!fileSelectionWidget) return;

        try {
            const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "get_txt_files", { path });
            
            if (response?.files) {
                fileSelectionWidget.options.values = response.files;
                
                const currentSelection = this.node.properties.file_selection;
                if (currentSelection && response.files.includes(currentSelection)) {
                    fileSelectionWidget.value = currentSelection;
                } else {
                    this.node.properties.file_selection = response.files[0];
                    fileSelectionWidget.value = response.files[0];
                }
                
                this.updateButtonVisibility();
                this.node.setDirtyCanvas(true, true);
            }
        } catch (error) {
            console.error("Error updating file dropdown:", error);
            fileSelectionWidget.options.values = ["error"];
            fileSelectionWidget.value = "error";
            this.node.properties.file_selection = "error";
            this.updateButtonVisibility();
        }
    }

    setupWidgets() {
        this.createPathWidget();
        this.createFileSelectionWidget();
        this.createUseCachedWidget();
        /* this.createEditFileButton(); */
        
        setTimeout(async () => {
            await this.updateBackend();
            if (this.node.properties.path) {
                await this.updateFileDropdown(this.node.properties.path);
            }
        }, 100);
    }

    handleSerialize(data) {
        data.properties = data.properties || {};
        data.properties.path = this.node.properties.path;
        data.properties.file_selection = this.node.properties.file_selection;
        data.properties.use_cached_file = this.node.properties.use_cached_file;
    }

    handleConfigure(data) {
        if (!data.properties) return;
        
        this.node.properties.path = data.properties.path || "";
        this.node.properties.file_selection = data.properties.file_selection || "";
        this.node.properties.use_cached_file = data.properties.use_cached_file !== undefined ? 
            data.properties.use_cached_file : true;
        
        if (this.node.widgets) {
            const pathWidget = this.getWidget("path");
            const fileSelectionWidget = this.getWidget("file_selection");
            const useCachedWidget = this.getWidget("use_cached_file");
            
            if (pathWidget) pathWidget.value = this.node.properties.path;
            if (useCachedWidget) useCachedWidget.value = this.node.properties.use_cached_file;
            
            if (fileSelectionWidget && this.node.properties.path) {
                this.updateFileDropdown(this.node.properties.path).then(() => {
                    if (this.node.properties.file_selection) {
                        fileSelectionWidget.value = this.node.properties.file_selection;
                    }
                });
            }
        }
        
        this.updateBackend().catch(() => {});
    }
}

app.registerExtension({
    name: "DynamicTextLoaderNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DynamicTextLoaderNode") {
            return;
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            const textLoader = new TextLoaderNode(this);
            this.textLoader = textLoader;
            textLoader.setupWidgets();
        });
        
        chainCallback(nodeType.prototype, "onSerialize", function(data) {
            if (this.textLoader) {
                this.textLoader.handleSerialize(data);
            }
        });
        
        chainCallback(nodeType.prototype, "onConfigure", function(data) {
            if (this.textLoader) {
                this.textLoader.handleConfigure(data);
            }
        });
        
        return nodeType;
    }
});