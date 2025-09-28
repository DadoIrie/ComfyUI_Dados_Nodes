import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

const widgetDataList = [
    {
        name: "board",
        type: "combo",
        value: "all",
        options: ["all"],
        tooltip: "only if username is set\n`all` all users pins are in the random pool (boards & sections)\n`board name` only pins of that board are in the random pool"
    },
    {
        name: "section",
        type: "combo",
        value: "excluded",
        options: ["included", "excluded"],
        tooltip: "does nothing if selected board is `all`\n`included` boards sections are included in random pool\n`excluded` boards sections are excluded from random pool\n`section name` only pins of that section are in the random pool"
    },
    {
        name: "api_requests",
        type: "combo",
        value: "cached",
        options: ["cached", "live"],
        tooltip: "Select an option"
    },
    {
        name: "image_output",
        type: "combo",
        value: "chaotic draw",
        options: ["fixed", "chaotic draw", "circular shuffle"],
        tooltip: "Select an option"
    },
    {
        name: "image_resolution",
        type: "combo",
        value: "564x",
        options: ["474x", "564x", "736x"],
        tooltip: "Select an option"
    },
    {
        name: "Select Image",
        type: "button", action: function() { },
        tooltip: "Browse Pinterest for images"
    },
];

function widgetCallback(node, changedWidget) {
    // Barebone: no logic
}

const widgetFactory = {
    createWidget: (node, { name, type, value, options, tooltip, action }) => {
        const widgetTypes = {
            // string: ["string", value => { widgetCallback(node, { name, value, type }); return value; }],
            combo: ["combo", value => { widgetCallback(node, { name, value, type }); return value; }, { values: options }],
            button: ["button", function() {
                if (action) action.call(node);
                widgetCallback(node, { name, type });
            }],
        };

        const [widgetType, callback, widgetOptions] = widgetTypes[type];
        const widget = node.addWidget(widgetType, name, value, callback, widgetOptions);
        widget.tooltip = tooltip;

        return widget;
    }
};

app.registerExtension({
    name: "Dados.DN_pyPinNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_pyPinNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', async function () {
                const nodeDataWidget = this.node.widgets?.find(w => w.name === "node_data");
                if (nodeDataWidget) {
                    nodeDataWidget.hidden = true;
                    nodeDataWidget.computeSize = () => [0, -4];
                }

                const widgetCreator = (widgetData) => {
                    return widgetFactory.createWidget(this, widgetData);
                };

                widgetDataList.forEach(widgetData => widgetCreator(widgetData));
                this.setDirtyCanvas(true);
            });

            chainCallback(nodeType.prototype, 'onDrawBackground', function(ctx) {
                if (this.flags?.collapsed || !this.images || this.images?.length === 0) return;

                const MARGIN = 10;
                const availableWidth = this.size[0] - MARGIN * 2;
                const initialHeight = this.computeSize()[1];

                const loadAndDrawImage = () => {
                    if (!this.loadedImage) {
                        this.loadedImage = new Image();
                        this.loadedImage.src = this.images[0];
                        this.loadedImage.onload = () => {
                            this.cachedImgAspectRatio = this.loadedImage.height / this.loadedImage.width;
                            if (!this.hasAdjustedHeight) {
                                this.size[1] = initialHeight + Math.min(availableWidth, this.loadedImage.width) * this.cachedImgAspectRatio;
                                this.hasAdjustedHeight = true;
                            }
                            this.setDirtyCanvas(true);
                            loadAndDrawImage();
                        };
                    } else if (this.loadedImage.complete) {
                        const availableHeight = this.size[1] - initialHeight - MARGIN;
                        const imageWidth = Math.min(availableWidth, this.loadedImage.width, availableHeight / this.cachedImgAspectRatio);
                        const imageHeight = imageWidth * this.cachedImgAspectRatio;

                        ctx.drawImage(this.loadedImage,
                            MARGIN + (availableWidth - imageWidth) / 2,
                            initialHeight,
                            imageWidth, imageHeight);
                    }
                };

                loadAndDrawImage();
            });

            chainCallback(nodeType.prototype, 'onResize', function(size) {
                this.setDirtyCanvas(true);
            });
        }
    }
});

