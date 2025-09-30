import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

  ({chainCallback, fetchSend} =
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

class DN_pyPinNode {
    constructor(node) {
        this.node = node;
        this.nodeDataWidget = this.node.widgets?.find(w => w.name === "node_data");
        this.widgetDataList = [
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

        this.initializeWidgets();
    }

    createWidget({ name, type, value, options, tooltip, action }) {
        const widgetTypes = {
            // string: ["string", value => { this.widgetCallback({ name, value, type }); return value; }],
            combo: ["combo", value => { this.widgetCallback({ name, value, type }); return value; }, { values: options }],
            button: ["button", function() {
                if (action) action.call(this.node);
                this.widgetCallback({ name, type });
            }.bind(this)],
        };

        const [widgetType, callback, widgetOptions] = widgetTypes[type];
        const widget = this.node.addWidget(widgetType, name, value, callback, widgetOptions);
        widget.tooltip = tooltip;

        return widget;
    }

    initializeWidgets() {
        if (this.nodeDataWidget) {
            this.nodeDataWidget.hidden = true;
            this.nodeDataWidget.computeSize = () => [0, -4];
        }

        this.widgetDataList.forEach(widgetData => this.createWidget(widgetData));

        const usernameWidget = this.node.widgets?.find(w => w.name === "username");
        if (usernameWidget) {
            usernameWidget.callback = (value) => {
                this.widgetCallback({ name: "username", value, type: "string" });
                return value;
            };
        }

        setTimeout(() => {
            const imageOutputWidget = this.node.widgets?.find(w => w.name === "image_output");
            if (imageOutputWidget && imageOutputWidget.value === "circular shuffle") {
                this.resetPoolButtonHandler("add");
            }
            this.initializeNodeData();
        }, 0);

        this.node.setDirtyCanvas(true);
    }

    widgetCallback(changedWidget) {
        this.updateNodeConfigs(changedWidget.name, changedWidget.value);

        if (changedWidget.name === "board") {
            this.updateWidgetsFromData();
        } else if (changedWidget.name === "username") {
            const originalOnDrawForeground = this.node.onDrawForeground;
            this.node.onDrawForeground = function(ctx) {
                ctx.strokeStyle = "#FFFF00";
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, this.size[0], this.size[1]);
                if (originalOnDrawForeground) originalOnDrawForeground.call(this, ctx);
            };
            this.node.setDirtyCanvas(true);

            fetchSend(MESSAGE_ROUTE, this.node.id, "username_changed", { username: changedWidget.value })
                .then(response => {
                    this.node.onDrawForeground = originalOnDrawForeground;
                    if (this.nodeDataWidget) {
                        let current = JSON.parse(this.nodeDataWidget.value);
                        current.data = response.data;
                        this.nodeDataWidget.value = JSON.stringify(current, null, 2);
                    }
                    this.updateWidgetsFromData();
                    this.node.setDirtyCanvas(true);
                })
                .catch(error => {
                    console.error("Error sending username change:", error);
                    this.node.onDrawForeground = originalOnDrawForeground;
                    this.node.setDirtyCanvas(true);
                });
        } else if (changedWidget.name === "image_output") {
            if (changedWidget.value === "circular shuffle") {
                this.resetPoolButtonHandler("add");
            } else {
                this.resetPoolButtonHandler("remove");
            }
        }
    }

    resetPoolButtonHandler(action) {
        const buttonName = "reset pool";
        const existingButton = this.node.widgets?.find(w => w.name === buttonName);

        if (action === "add") {
            if (!existingButton) {
                this.createWidget({
                    name: buttonName,
                    type: "button",
                    action: () => {
                        console.log("Reset pool button clicked");
                        // Add reset pool logic here if needed
                    },
                    tooltip: "Reshuffle the pool with all images from chosen board/section"
                });
                console.log("Reset pool button added");
            }
        } else if (action === "remove") {
            if (existingButton) {
                const index = this.node.widgets.indexOf(existingButton);
                if (index > -1) {
                    this.node.widgets.splice(index, 1);
                    console.log("Reset pool button removed");
                }
            }
        }
        this.node.setDirtyCanvas(true);
    }

    updateWidgetsFromData() {
        if (!this.nodeDataWidget) return;
        const current = JSON.parse(this.nodeDataWidget.value);
        this.updateBoardOptions(current);
        this.updateSectionOptions(current);
    }

    updateBoardOptions(current) {
        if (!current.data?.board_map) return;
        const boardMap = current.data.board_map;
        const boardOptions = ["all", ...Object.keys(boardMap)];
        const boardWidget = this.node.widgets?.find(w => w.name === "board");
        if (!boardWidget) return;

        boardWidget.options.values = boardOptions;
        const boardData = this.widgetDataList.find(w => w.name === "board");
        if (boardData && !boardOptions.includes(boardWidget.value)) {
            boardWidget.value = boardOptions.includes(boardData.value) ? boardData.value : boardOptions[0];
        }
        this.node.setDirtyCanvas(true);
    }

    updateSectionOptions(current) {
        const boardWidget = this.node.widgets?.find(w => w.name === "board");
        const sectionWidget = this.node.widgets?.find(w => w.name === "section");
        if (!boardWidget || !sectionWidget) return;

        const sectionData = this.widgetDataList.find(w => w.name === "section");
        if (!sectionData) return;

        let options = [...sectionData.options];
        const selectedBoard = boardWidget.value;
        if (selectedBoard !== "all" && current.data?.board_map) {
            const boardMap = current.data.board_map;
            const boardId = boardMap[selectedBoard];
            if (boardId) {
                const boardData = current.data.boards?.[boardId];
                const sectionsMap = boardData?.sections_map || {};
                if (Object.keys(sectionsMap).length > 0) {
                    options.push(...Object.keys(sectionsMap));
                }
            }
        }

        sectionWidget.options.values = options;
        if (!options.includes(sectionWidget.value)) {
            sectionWidget.value = options.includes(sectionData.value) ? sectionData.value : options[0];
        }
        this.node.setDirtyCanvas(true);
    }


    updateNodeConfigs(widgetName, value) {
        if (this.nodeDataWidget && widgetName !== "node_data") {
            let current = JSON.parse(this.nodeDataWidget.value);
            const widget = this.node.widgets?.find(w => w.name === widgetName);
            if (!widget || widget.type !== "button") {
                current.configs[widgetName] = value;
                this.nodeDataWidget.value = JSON.stringify(current, null, 2);
            }
        }
    }

    updateImageUrl() {
        if (this.nodeDataWidget?.value) {
            const nodeData = JSON.parse(this.nodeDataWidget.value);
            this.imageUrl = nodeData.configs?.last_image || '';
        }
    }

    initializeNodeData() {
        if (this.nodeDataWidget) {
            let current = JSON.parse(this.nodeDataWidget.value || '{"configs":{},"data":{}}');
            current.configs.node_id ??= this.node.id;
            current.configs.last_image ??= "";
            
            const widgets = this.node.widgets || [];
            for (const widget of widgets) {
                if (widget.name !== "node_data" && widget.type !== "button") {
                    current.configs[widget.name] = widget.value;
                }
            }
            this.nodeDataWidget.value = JSON.stringify(current, null, 2);
            this.updateWidgetsFromData();
        }
    }
}

app.registerExtension({
    name: "DN_pyPinNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_pyPinNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', async function () {
                const pyPinNode = new DN_pyPinNode(this);
                this.pyPinNode = pyPinNode;
                //this.pyPinNode.updateImageUrl();
                //console.log(this.loadedImage.src)
                setTimeout(() => this.pyPinNode.updateImageUrl(), 0);

            });

            chainCallback(nodeType.prototype, 'onDrawBackground', function(ctx) {
                if (this.flags?.collapsed || !this.pyPinNode || !this.pyPinNode.nodeDataWidget) {
                    return;
                }
/*                 if (!this.pyPinNode.imageUrl) {
                    this.pyPinNode.updateImageUrl();
                } */
                const imageUrl = this.pyPinNode.imageUrl;

                if (this.loadedImage && this.loadedImage.src !== imageUrl) {
                    this.loadedImage = null;
                    this.hasAdjustedHeight = false;
                }

                if (!imageUrl) return;

                const MARGIN = 10;
                const availableWidth = this.size[0] - MARGIN * 2;
                const initialHeight = this.computeSize()[1];

                const loadAndDrawImage = () => {
                    if (!this.loadedImage) {
                        this.loadedImage = new Image();
                        this.loadedImage.src = imageUrl;
                        console.log(this.loadedImage.src);
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

            chainCallback(nodeType.prototype, 'onExecuted', function(event) {
                if (this.pyPinNode) {
                    this.pyPinNode.nodeDataWidget.value = event.node_data.join('');
                    this.pyPinNode.updateImageUrl()
                }
            });

            chainCallback(nodeType.prototype, 'onResize', function(size) {
                this.setDirtyCanvas(true);
            });
        }
    }
});
