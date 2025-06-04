/* import { app } from "../../scripts/app.js"

let EXTENSION_NAME;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
})().catch(error => console.error("Failed to load utilities:", error));

app.registerExtension({
    name: "WildcardSelectorNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "WildcardSelectorNode") {
            return;
        }

        nodeType.prototype.onNodeCreated = function() {
            const openModalButton = this.addWidget("button", "Open Modal", null, async () => {
                const { createWildcardModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/wildcard_selector.js`);
                
                let inputText = "";
                const inputWidget = this.widgets.find(w => w.name === "input_text");
                if (inputWidget) {
                    inputText = inputWidget.value || "";
                }
                
                createWildcardModal(this, inputText);
            });
        };
        
        return nodeType;
    }
}); */