import { app } from "../../scripts/app.js";
import { addValueControlWidget } from "../../scripts/widgets.js";

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

  ({chainCallback, fetchSend} =
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

class DN_ChutesImageGenNodeHandler {
    constructor(node) {
        this.node = node;
        this.modelMapping = {};
    }



    widgetCallback(changedWidget) {
        if (changedWidget.name === "model") {
            this.updateWidgetsForModel(changedWidget.value);
        }
    }

    async updateWidgetsForModel(modelDisplayName) {
        const modelKey = this.modelMapping[modelDisplayName];
        if (!modelKey) return;

        const payload = { model_key: modelKey };
        const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "chutes_img_model", payload);

        if (response && response.widgets) {
            const schemaMap = new Map(response.widgets.map(w => [Object.keys(w)[0], w[Object.keys(w)[0]]]));
            this.node.widgets.forEach(widget => {
                if (widget.name === "model") return;

                const widgetConfig = schemaMap.get(widget.name);
                if (widgetConfig) {
                    widget.hidden = false;
                    widget.computeSize = undefined;

                    if (widget.type === "number") {
                        widget.options.min = widgetConfig.min;
                        widget.options.max = widgetConfig.max;
                        widget.options.step = widgetConfig.step;
                        widget.options.precision = widgetConfig.precision;
                        if (widget.value < widget.options.min || widget.value > widget.options.max) {
                            widget.value = widgetConfig.default;
                        }
                    } else if (widget.type === "combo") {
                        widget.options.values = widgetConfig.values;
                        if (!widget.options.values.includes(widget.value)) {
                            widget.value = widgetConfig.default;
                        }
                    }
                } else {
                    widget.hidden = true;
                    widget.computeSize = () => [0, -4];
                }
            });
        }
        
        this.node.setDirtyCanvas(true);
    }
    
    async initialize() {
        const response = await fetchSend(MESSAGE_ROUTE, this.node.id, "get_models");
        const modelOptions = response.models;
        const defaultModel = response.default;
        this.modelMapping = response.model_mapping;
        
        const modelWidget = this.node.widgets.find(w => w.name === "model");
        if (modelWidget) {
            modelWidget.options.values = modelOptions;
            modelWidget.value = defaultModel;
            modelWidget.callback = (value) => { this.widgetCallback({ name: "model", value, type: "combo" }); return value; };
        }

        await this.updateWidgetsForModel(defaultModel);
        
        this.node.setDirtyCanvas(true)
    }
}

app.registerExtension({
    name: "DN_ChutesImageGenNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_ChutesImageGenNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', async function() {
                this.chutesImageGenNodeHandler = new DN_ChutesImageGenNodeHandler(this);
                setTimeout(async () => {
                    await this.chutesImageGenNodeHandler.initialize();
                }, 0);
            });
        }
    }
});
