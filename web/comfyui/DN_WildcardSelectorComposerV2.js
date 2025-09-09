import { app } from "../../scripts/app.js"

const settingsList = [
    {
        id: "lineWrap",
        name: "Line Wrap",
        type: "boolean",
        defaultValue: true,
        tooltip: "Enable or disable line wrapping in the textbox."
    },
    {
        id: "tab_spaces",
        name: "Tab Spaces",
        type: "combo",
        defaultValue: 4,
        options: [
            { text: "2 spaces", value: 2 },
            { text: "4 spaces", value: 4 }
        ],
        tooltip: "Number of spaces to insert when Tab is pressed."
    }
];

function createSettings() {
    return settingsList.map(settingDef => ({
        id: `wildcard_selector.${settingDef.id}`,
        name: settingDef.name,
        type: settingDef.type,
        defaultValue: settingDef.defaultValue,
        category: ["Dado's Nodes", "Wildcard Selector", `Wildcard Selector ${settingDef.name}`],
        ...(settingDef.tooltip && { tooltip: settingDef.tooltip }),
        ...(settingDef.options && { options: settingDef.options })
    }));
}

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
        this.createEditContentButton();
    }

    initializeHiddenInputs() {
            const wildcardPromptWidget = this.node.widgets?.find(w => w.name === "wildcards_prompt");
            const wildcardStructureWidget = this.node.widgets?.find(w => w.name === "wildcards_structure_data");
            
/*             if (wildcardPromptWidget && wildcardStructureWidget) {
                wildcardPromptWidget.hidden = true;
                wildcardStructureWidget.hidden = true;
                wildcardPromptWidget.computeSize = () => [0, -4];
                wildcardStructureWidget.computeSize = () => [0, -4];
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
            const { showWildcardSelectorModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/DN_WildcardSelectorComposerV2/WildcardsModal.js`);
            await showWildcardSelectorModal(this.node, constants);
        } catch (error) {
            console.error("Error loading content:", error);
        }
    }

    updateProcessedPromptState(isConnected) {
        fetchSend(
            MESSAGE_ROUTE,
            this.node.id,
            "process_wildcards",
            { state: isConnected }
        );
    }
}

app.registerExtension({
    name: "DN_WildcardSelectorComposerV2",
    settings: createSettings(),
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DN_WildcardSelectorComposerV2") {
            return;
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            const textLoader = new DN_WildcardSelectorComposerV2(this);
            this.textLoader = textLoader;

            setTimeout(() => {
                if (this.inputs) {
                    for (let i = 0; i < this.inputs.length; i++) {
                        const input = this.inputs[i];
                        if (input.name !== "seed") {
                            input.color_on = "#00000000";
                            input.color_off = "#00000000";
                        }
                    }
                }
                const processedPromptOutput = this.outputs?.find(o => o.name === "processed_prompt");
                if (processedPromptOutput) {
                    textLoader.updateProcessedPromptState(processedPromptOutput.isConnected);
                }
            }, 0);
        });

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, event, link_info, node_slot) {
            if (slotType === 2 && node_slot?.name === "processed_prompt") {
                this.textLoader?.updateProcessedPromptState(node_slot.isConnected);
            }

            const input = this.inputs?.[slot_idx];
            if (slotType === 1 && event === true && input?.name !== "seed") {
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