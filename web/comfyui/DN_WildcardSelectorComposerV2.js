import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

class DN_WildcardSelectorComposerV2 {
    constructor(node) {
        this.node = node;
        this.initializeHiddenInputs();
    }

    initializeHiddenInputs() {
            const wildcardPromptWidget = this.node.widgets?.find(w => w.name === "wildcards_prompt");
            const wildcardSelectionsWidget = this.node.widgets?.find(w => w.name === "wildcard_structure_data");
            
/*             if (wildcardPromptWidget && wildcardSelectionsWidget) {
                wildcardPromptWidget.computeSize = () => [0, -4];
                wildcardSelectionsWidget.computeSize = () => [0, -4];
            } */
    }

    createEditContentButton() {
        const widget = this.node.addWidget("button", "Edit Content", null, async () => {
            await this.handleEditContent();
        });
    }

    async handleEditContent() {
        try {
            const constants = { EXTENSION_NAME, MESSAGE_ROUTE };
            const { showWildcardSelectorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/DN_WildcardSelectorComposerV2/modal_init.js`);
            showWildcardSelectorModal(
                this.node, 
                constants,
            );
        } catch (error) {
            console.error("Error loading content:", error);
        }
    }
}

app.registerExtension({
    name: "DN_WildcardSelectorComposerV2",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DN_WildcardSelectorComposerV2") {
            return;
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            const textLoader = new DN_WildcardSelectorComposerV2(this);
            this.textLoader = textLoader;
            textLoader.createEditContentButton();

            console.log(this.title);
            
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
                console.log("Input connections are not allowed on Wildcard Selector/Composer (DN_WildcardSelectorComposerV2)");
                
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