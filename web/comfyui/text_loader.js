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
        this.initializeHiddenInputs();
    }

    initializeHiddenInputs() {
            const wildcardPromptWidget = this.node.widgets?.find(w => w.name === "wildcards_prompt");
            const wildcardSelectionsWidget = this.node.widgets?.find(w => w.name === "wildcards_selections");
            
            if (wildcardPromptWidget && wildcardSelectionsWidget) {
                wildcardPromptWidget.computeSize = () => [0, -4];
                wildcardSelectionsWidget.computeSize = () => [0, -4];
            }
    }

    getHiddenWidget(name) {
        return this.node.widgets?.find(w => w.name === name);
    }

    getHiddenWidgetValue(name) {
        const widget = this.getHiddenWidget(name);
        const value = widget ? widget.value : "";
        
        if (!widget || value == null) {
            return "";
        }
        
        return value;
    }

    updateHiddenWidget(name, value) {
        const widget = this.getHiddenWidget(name);
        if (widget) {
            widget.value = value || "";
        }
    }

    createEditContentButton() {
        const widget = this.node.addWidget("button", "Edit Content", null, async () => {
            await this.handleEditContent();
        });
    }

    async handleEditContent() {
        try {
            const wildcards_prompt = this.getHiddenWidgetValue("wildcards_prompt");
            const wildcards_selections = this.getHiddenWidgetValue("wildcards_selections");

            const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "get_content", {
                wildcards_prompt: wildcards_prompt,
                wildcards_selections: wildcards_selections
            });

            const textContent = response?.status === "success" ? response.content || '' : wildcards_prompt;
            const constants = { EXTENSION_NAME, MESSAGE_ROUTE };
            
            const { createTextEditorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/text_editor_modal.js`);
            createTextEditorModal(
                this.node, 
                textContent, 
                constants,
                this
            );
        } catch (error) {
            console.error("Error loading content:", error);
        }
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
            textLoader.createEditContentButton();
            
            setTimeout(() => {
                if (this.inputs) {
                    for (let i = 0; i < this.inputs.length; i++) {
                        const input = this.inputs[i];
                        input.color_on = "#00000000";
                        input.color_off = "#00000000";
                    }
                }
            }, 0);
        });

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, event, link_info, node_slot) {
            if (slotType === 1 && event === true) {
                console.log("Input connections are not allowed on DynamicTextLoaderNode");
                
                if (link_info) {
                    const linkId = link_info.id;
                    setTimeout(() => {
                        this.graph.removeLink(linkId);
                        this.graph.setDirtyCanvas(true);
                    }, 0);
                }
                return;
            }
            
            return onConnectionsChange?.apply(this, arguments);
        };

        return nodeType;
    }
});