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
        this.configsWidget = this.node.widgets?.find(w => w.name === "node_configs");
        this.pinterestDataWidget = this.node.widgets?.find(w => w.name === "pinterest_data");

        this.boardWidget = null;
        this.sectionWidget = null;
        this.usernameWidget = null;
        this.imageOutputWidget = null;
        this.apiRequestsWidget = null;

        this.isLoading = false;
        this.originalOnDrawForeground = null;
        
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
                name: "resize_image",
                type: "string",
                value: "",
                tooltip: "Resize image by setting the target size for the longest side (maintains aspect ratio, leave empty for original size)"
            },
            {
                name: "max_images",
                type: "number",
                value: 100,
                options: { min: 0, max: 1000, step: 1, precision: 0 },
                tooltip: "Max image amount per board/section\nIMPORTANT: 100 is recommended, anything above that at own risk"
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
            string: ["string", value => { this.widgetCallback({ name, value, type }); return value; }],
            combo: ["combo", value => { this.widgetCallback({ name, value, type }); return value; }, { values: options }],
            number: ["number", value => { this.widgetCallback({ name, value, type }); return value; }, options],
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
        if (this.configsWidget && this.pinterestDataWidget) {
            this.configsWidget.hidden = true;
            this.pinterestDataWidget.hidden = true;
            
            this.configsWidget.computeSize = () => [0, -4];
            this.pinterestDataWidget.computeSize = () => [0, -4];
        }

        this.widgetDataList.forEach(widgetData => this.createWidget(widgetData));

        this.usernameWidget = this.node.widgets?.find(w => w.name === "username");
        if (this.usernameWidget) {
            this.usernameWidget.callback = (value) => {
                this.widgetCallback({ name: "username", value, type: "string" });
                return value;
            };
        }

        setTimeout(() => {
            this.imageOutputWidget = this.node.widgets?.find(w => w.name === "image_output");
            this.apiRequestsWidget = this.node.widgets?.find(w => w.name === "api_requests");
            if (this.imageOutputWidget && this.imageOutputWidget.value === "circular shuffle") {
                this.resetPoolButtonHandler("add");
            }
            if (this.apiRequestsWidget && this.apiRequestsWidget.value === "cached") {
                this.updateBoardButtonHandler("add");
            }
            // Cache board and section widgets after all widgets are created
            this.sectionWidget = this.node.widgets?.find(w => w.name === "section");
            this.boardWidget = this.node.widgets?.find(w => w.name === "board");
            this.initializeNodeData();
            

            // Update widget options from saved pinterest_data on reload
            this.updateWidgetsFromData();
        }, 0);

        this.node.setDirtyCanvas(true);
    }

    widgetCallback(changedWidget) {
        this.updateNodeConfigs(changedWidget.name, changedWidget.value);

        if (changedWidget.name === "board") {
            // Single entry point for section control
            const data = this.getPinterestData();
            this.updateSectionOptions(data);
            if (changedWidget.value && this.usernameWidget && this.apiRequestsWidget.value != "cached") {
                this.fetchCurrentBoardData(changedWidget.value);
            }
        } else if (changedWidget.name === "username") {
            // Always reset board widget to defaults from widgetDataList
            const boardData = this.widgetDataList.find(w => w.name === "board");
            this.boardWidget.value = boardData.value;
            this.boardWidget.options.values = boardData.options;

            // Exit early if api_requests is "cached" to prevent API call
            if (this.apiRequestsWidget.value === "cached") return;

            this.startLoading();

            const maxImagesWidget = this.node.widgets?.find(w => w.name === "max_images");
            const maxImages = maxImagesWidget ? maxImagesWidget.value : 100;
            fetchSend(MESSAGE_ROUTE, this.node.id, "username_changed", { username: changedWidget.value, max_images: maxImages })
                .then(response => {
                    if (this.pinterestDataWidget) {
                        this.setPinterestData(response.data);
                    }
                    this.updateWidgetsFromData();
                    this.fetchCurrentBoardData(this.boardWidget.value);
                    this.node.setDirtyCanvas(true);
                })
                .catch(error => {
                    console.error("Error sending username change:", error);
                    this.stopLoading();
                    this.node.setDirtyCanvas(true);
                });
        } else if (changedWidget.name === "image_output") {
            if (changedWidget.value === "circular shuffle") {
                this.resetPoolButtonHandler("add");
            } else {
                this.resetPoolButtonHandler("remove");
            }
        } else if (changedWidget.name === "api_requests") {
            if (changedWidget.value === "cached") {
                this.updateBoardButtonHandler("add");
            } else {
                this.updateBoardButtonHandler("remove");
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
                        this.updateNodeConfigs("reset_pool", true);
                        this.node.setDirtyCanvas(true);
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

    updateBoardButtonHandler(action) {
        const buttonName = "update board data";
        const existingButton = this.node.widgets?.find(w => w.name === buttonName);

        if (action === "add") {
            if (!existingButton) {
                this.createWidget({
                    name: buttonName,
                    type: "button",
                    action: () => {
                        console.log("Update board data button clicked");
                        this.startLoading();
                        this.fetchCurrentBoardData(this.boardWidget.value);
                    },
                    tooltip: "Fetch/update images and sections for the currently selected board"
                });
                console.log("Update board data button added");
            }
        } else if (action === "remove") {
            if (existingButton) {
                const index = this.node.widgets.indexOf(existingButton);
                if (index > -1) {
                    this.node.widgets.splice(index, 1);
                    console.log("Update board data button removed");
                }
            }
        }
        this.node.setDirtyCanvas(true);
    }

    fetchCurrentBoardData(selectedBoard) {
        // const data = this.getPinterestData();
        if (!selectedBoard) return;

        const maxImagesWidget = this.node.widgets?.find(w => w.name === "max_images");
        const max_images = maxImagesWidget ? maxImagesWidget.value : 100;
        const usernameWidget = this.node.widgets?.find(w => w.name === "username");
        const username = usernameWidget ? usernameWidget.value : '';

        fetchSend(MESSAGE_ROUTE, this.node.id, "board_selected", { username, board_display_name: selectedBoard, max_images })
            .then(response => {
                const currentData = this.getPinterestData();
                if (!currentData.boards) currentData.boards = {};
                Object.assign(currentData.boards, response.data);
                if (response.board_map) {
                    currentData.board_map = response.board_map;
                    this.updateBoardOptions(currentData);
                }
                this.setPinterestData(currentData);
                this.updateSectionOptions(currentData);
                this.stopLoading();
                this.node.setDirtyCanvas(true);
            })
            .catch(error => {
                console.error("Error fetching board data:", error);
                this.stopLoading();
            });
    }

    getConfigs() {
        return this.configsWidget?.value ? JSON.parse(this.configsWidget.value) : {};
    }

    setConfigs(configs) {
        this.configsWidget.value = JSON.stringify(configs, null, 2);
    }

    getPinterestData() {
        return this.pinterestDataWidget?.value ? JSON.parse(this.pinterestDataWidget.value) : {};
    }

    setPinterestData(data) {
        this.pinterestDataWidget.value = JSON.stringify(data, null, 2);
    }

    updateWidgetsFromData() {
        const data = this.getPinterestData();
        this.updateBoardOptions(data);
        this.updateSectionOptions(data);
    }

    updateBoardOptions(data) {
        if (!data.board_map) return;
        const boardMap = data.board_map;
        const boardOptions = ["all", ...Object.keys(boardMap)];
        if (!this.boardWidget) return;

        this.boardWidget.options.values = boardOptions;
        const boardData = this.widgetDataList.find(w => w.name === "board");
        if (boardData && !boardOptions.includes(this.boardWidget.value)) {
            this.boardWidget.value = boardOptions.includes(boardData.value) ? boardData.value : boardOptions[0];
        }
        this.node.setDirtyCanvas(true);
    }

    updateSectionOptions(data) {
        if (!this.boardWidget || !this.sectionWidget) return;

        const sectionData = this.widgetDataList.find(w => w.name === "section");
        if (!sectionData) return;

        // Build options based on selected board
        let options = [...sectionData.options];
        const selectedBoard = this.boardWidget.value;
        
        if (selectedBoard !== "all" && data.board_map) {
            const boardMap = data.board_map;
            const boardId = boardMap[selectedBoard];
            if (boardId) {
                const boardData = data.boards?.[boardId];
                const sectionsMap = boardData?.sections_map || {};
                if (Object.keys(sectionsMap).length > 0) {
                    options.push(...Object.keys(sectionsMap));
                }
            }
        }

        // Update options
        this.sectionWidget.options.values = options;
        
        // Reset to first option if current value is invalid
        if (!options.includes(this.sectionWidget.value)) {
            this.sectionWidget.value = options[0];
            this.updateNodeConfigs("section", this.sectionWidget.value);
        }
        
        this.node.setDirtyCanvas(true);
    }


    updateNodeConfigs(widgetName, value) {
        if (this.configsWidget && widgetName !== "node_configs" && widgetName !== "pinterest_data") {
            let configs = this.getConfigs();
            const widget = this.node.widgets?.find(w => w.name === widgetName);
            if (!widget || widget.type !== "button") {
                configs[widgetName] = value;
                this.setConfigs(configs);
            }
        }
    }

    updateImageUrl() {
        if (this.configsWidget?.value) {
            const configs = this.getConfigs();
            this.imageUrl = configs.last_image || '';
        }
    }

    initializeNodeData() {
        if (this.configsWidget) {
            let configs = this.getConfigs();
            configs.node_id ??= this.node.id;
            configs.last_image ??= "";

            const widgets = this.node.widgets || [];
            for (const widget of widgets) {
                if (widget.name !== "node_configs" && widget.name !== "pinterest_data" && widget.type !== "button") {
                    if (!(widget.name in configs)) {
                        configs[widget.name] = widget.value;
                    }
                }
            }
            this.setConfigs(configs);
        }
    }

    startLoading() {
        if (this.isLoading) return;
        this.originalOnDrawForeground = this.node.onDrawForeground;
        this.isLoading = true;
        this.node.onDrawForeground = function(ctx) {
            ctx.strokeStyle = "#FFFF00";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, this.size[0], this.size[1]);
            if (this.pyPinNode.originalOnDrawForeground) this.pyPinNode.originalOnDrawForeground.call(this, ctx);
        };
        this.node.setDirtyCanvas(true);
    }

    stopLoading() {
        if (!this.isLoading) return;
        this.node.onDrawForeground = this.originalOnDrawForeground;
        this.isLoading = false;
        this.node.setDirtyCanvas(true);
    }
}

app.registerExtension({
    name: "DN_pyPinNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_pyPinNode") {
            chainCallback(nodeType.prototype, 'onNodeCreated', async function () {
                const pyPinNode = new DN_pyPinNode(this);
                this.pyPinNode = pyPinNode;
                setTimeout(() => this.pyPinNode.updateImageUrl(), 0);
            });

            chainCallback(nodeType.prototype, 'onDrawBackground', function(ctx) {
                if (this.flags?.collapsed || !this.pyPinNode || !this.pyPinNode.configsWidget) {
                    return;
                }
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
                    const configsValue = event.node_configs.join('');
                    const dataValue = event.pinterest_data.join('');
                    
                    this.pyPinNode.configsWidget.value = configsValue;
                    this.pyPinNode.pinterestDataWidget.value = dataValue;
                    
                    this.pyPinNode.updateImageUrl();
                    setTimeout(() => {
                        api.dispatchCustomEvent('graphChanged', app.graph.serialize());
                    }, 100);
                }
            });

            chainCallback(nodeType.prototype, 'onResize', function(size) {
                this.setDirtyCanvas(true);
            });
        }
    }
});

