import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"

// TODO clean up setDirtyCanvas where needed and where redundant

// TODO if 'cached' no 

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
        this.cachedUsernamesWidget = null;
        this.imageOutputWidget = null;
        this.apiRequestsWidget = null;
        this.displayToBoardName = {};
        this.displayToSectionName = {};
        this.isLoading = false;
        this.originalOnDrawForeground = null;
        
        this.widgetDataList = [
            {
                name: "cached_usernames",
                type: "combo",
                value: "none",
                options: ["none"],
                tooltip: "Select cached username to load boards from"
            },
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
                type: "number",
                value: 0,
                options: { min: 0, max: 10000, step: 1, precision: 0 },
                tooltip: "Resize image by setting the target size for the longest side (maintains aspect ratio, 0 for original size)"
            },
            {
                name: "max_images",
                type: "number",
                value: 100,
                options: { min: 0, max: 10000, step: 1, precision: 0 },
                tooltip: "Max image amount per board/section\nIMPORTANT: 100 is recommended, anything above that at own risk"
            },
            {
                name: "Select Image",
                type: "button",
                action: () => {
                    this.handleSelectImage();
                },
                tooltip: "Browse Pinterest for images"
            },
        ];

        this.initializeWidgets();
    }

    buildDisplayToNameMappings(type) {
        const data = this.getPinterestData();
        
        // Always build board mappings if type is "board"
        if (type === "board") {
            this.displayToBoardName = {};
            this.displayToBoardName["all"] = "all";
            
            for (const boardId in data.boards) {
                const board = data.boards[boardId];
                this.displayToBoardName[board.display_name] = board['board-name'];
            }
        }
        
        // Build section mappings if type is "section" or "board"
        if (type === "section" || type === "board") {
            this.displayToSectionName = {};
            this.displayToSectionName["included"] = "included";
            this.displayToSectionName["excluded"] = "excluded";
            
            const selectedBoard = this.boardWidget ? this.boardWidget.value : null;
            
            if (selectedBoard && selectedBoard !== "all" && data.board_map) {
                const boardName = this.displayToBoardName[selectedBoard] || selectedBoard;
                const boardId = data.board_map[boardName];
                
                if (boardId && data.boards[boardId]) {
                    const boardData = data.boards[boardId];
                    const sections = boardData.sections || {};
                    
                    for (const sectionId in sections) {
                        const section = sections[sectionId];
                        const displayName = section.display_name;
                        const title = section.title;
                        if (displayName && title) {
                            this.displayToSectionName[displayName] = title;
                        }
                    }
                }
            }
        }
    }

    getBoardName(displayName) {
        return this.displayToBoardName[displayName];
    }
    
    getSectionName(displayName) {
        return this.displayToSectionName[displayName];
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
        const widget = this.node.addWidget(widgetType, name, value, callback.bind(this), widgetOptions);
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

        // In initializeWidgets method
        this.widgetDataList.forEach(widgetData => {
            const boundCallback = widgetData.callback ? widgetData.callback.bind(this) : null;
            this.createWidget({...widgetData, callback: boundCallback});
        });


        this.usernameWidget = this.node.widgets?.find(w => w.name === "username");
        if (this.usernameWidget) {
            this.usernameWidget.callback = (value) => {
                this.widgetCallback({ name: "username", value, type: "string" });
                return value;
            };
        }

        setTimeout(() => {
            this.cachedUsernamesWidget = this.node.widgets?.find(w => w.name === "cached_usernames");
            this.imageOutputWidget = this.node.widgets?.find(w => w.name === "image_output");
            this.apiRequestsWidget = this.node.widgets?.find(w => w.name === "api_requests");
            if (this.imageOutputWidget && this.imageOutputWidget.value === "circular shuffle") {
                this.resetPoolButtonHandler("add");
            }
            if (this.apiRequestsWidget && this.apiRequestsWidget.value === "cached") {
                this.updateBoardButtonHandler("add");
            }

            this.sectionWidget = this.node.widgets?.find(w => w.name === "section");
            this.boardWidget = this.node.widgets?.find(w => w.name === "board");
            this.initializeNodeData();


            this.buildDisplayToNameMappings("board");
            const data = this.getPinterestData();
            this.updateBoardOptions(data);
            this.updateSectionOptions(data);
            this.node.setDirtyCanvas(true);
        }, 0);
        
    }

    widgetCallback(changedWidget) {
        this.updateNodeConfigs(changedWidget.name, changedWidget.value);

        if (changedWidget.name === "board") {
            const data = this.getPinterestData();
            this.buildDisplayToNameMappings("section");
            this.updateSectionOptions(data);
            
            if (changedWidget.value && this.usernameWidget && this.apiRequestsWidget.value != "cached") {
                this.fetchCurrentBoardData(changedWidget.value);
            }
        } else if (changedWidget.name === "username") {
            const boardData = this.widgetDataList.find(w => w.name === "board");
            this.boardWidget.value = boardData.value;
            this.boardWidget.options.values = boardData.options;

            if (this.apiRequestsWidget.value === "cached") return;
            
            if (!changedWidget.value || changedWidget.value.trim() === '') {
                console.log("Username is empty, skipping backend call");
                return;
            }
            
            this.startLoading();
            const maxImagesWidget = this.node.widgets?.find(w => w.name === "max_images");
            const maxImages = maxImagesWidget ? maxImagesWidget.value : 100;
            fetchSend(MESSAGE_ROUTE, this.node.id, "username_changed", { username: changedWidget.value, max_images: maxImages })
                .then(response => {
                    if (this.pinterestDataWidget) {
                        this.setPinterestData(response.data);
                    }
                    this.buildDisplayToNameMappings("board");
                    const data = this.getPinterestData();
                    this.updateBoardOptions(data);
                    this.updateSectionOptions(data);
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
                if (this.usernameWidget.value && this.boardWidget.options.values.length > 1) {
                    fetchSend(MESSAGE_ROUTE, this.node.id, "switch_to_cached", { username: this.usernameWidget.value });
                }
            } else {
                this.updateBoardButtonHandler("remove");
                const data = this.getPinterestData();
                if (this.usernameWidget.value && (!data.boards || Object.keys(data.boards).length === 0)) {
                    this.startLoading();
                    this.fetchCurrentBoardData("all");
                }
            }
        } else if (changedWidget.name === "cached_usernames") {
            if (changedWidget.value === "none") {
                this.usernameWidget.value = "";
                this.boardWidget.value = "all";
                this.boardWidget.options.values = ["all"];
                this.sectionWidget.value = "excluded";
                this.sectionWidget.options.values = ["included", "excluded"];
                this.displayToBoardName = {};
                this.displayToBoardName["all"] = "all";
                this.displayToSectionName = {};
                this.displayToSectionName["included"] = "included";
                this.displayToSectionName["excluded"] = "excluded";
                this.setPinterestData({});
                this.node.setDirtyCanvas(true);
            } else {
                this.apiRequestsWidget.value = "cached";
                this.usernameWidget.value = changedWidget.value;
                this.boardWidget.value = "all";
                this.sectionWidget.value = "excluded";
                this.sectionWidget.options.values = ["included", "excluded"];
                this.updateNodeConfigs("username", changedWidget.value);
                this.updateNodeConfigs("board", "all");
                this.updateNodeConfigs("section", "excluded");
                this.loadCachedDataForUsername(changedWidget.value);
            }
        }
    }
    
    async handleSelectImage() {
        try {
            const constants = { EXTENSION_NAME, MESSAGE_ROUTE };
            const { showPinterestModal } = await import(`/extensions/${EXTENSION_NAME}/common/js/DN_pyPinNode/PinterestModal.js`);
            
            const currentConfigs = this.getConfigs();
            
            const selectedImageUrl = await showPinterestModal(this.node, constants, fetchSend, {
                displayToBoardName: this.displayToBoardName,
                displayToSectionName: this.displayToSectionName
            });
            
            if (selectedImageUrl) {
                let configs = this.getConfigs();
                configs.last_image = selectedImageUrl;
                configs.image_output = "fixed";
                
                if (this.boardWidget) {
                    configs.board = this.getBoardName(this.boardWidget.value);
                }
                if (this.sectionWidget) {
                    configs.section = this.getSectionName(this.sectionWidget.value);
                }
                
                this.setConfigs(configs);
                
                if (this.imageOutputWidget) {
                    this.imageOutputWidget.value = "fixed";
                }
                
                this.updateImageUrl();
                
                api.dispatchCustomEvent('graphChanged', app.graph.serialize());
            }
        } catch (error) {
            console.error("Error loading modal:", error);
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
                        this.updateNodeConfigs("reset_pool", true);
                        this.node.setDirtyCanvas(true);
                    },
                    tooltip: "Reshuffle the pool with all images from chosen board/section"
                });
            }
        } else if (action === "remove") {
            if (existingButton) {
                const index = this.node.widgets.indexOf(existingButton);
                if (index > -1) {
                    this.node.widgets.splice(index, 1);
                }
            }
        }
        this.node.setDirtyCanvas(true);
    }

    loadCachedDataForUsername(username) {
        fetchSend(MESSAGE_ROUTE, this.node.id, "load_cached_data", { username })
            .then(response => {
                const currentData = {};
                currentData.boards = response.data;
                currentData.board_map = response.board_map;
                this.setPinterestData(currentData);
                this.buildDisplayToNameMappings("board");
                this.updateBoardOptions(currentData);
                this.updateSectionOptions(currentData);
                if (response.cached_usernames && this.cachedUsernamesWidget) {
                    this.cachedUsernamesWidget.options.values = response.cached_usernames;
                }
                this.node.setDirtyCanvas(true);
            })
            .catch(error => {
                console.error("Error loading cached data:", error);
            });
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
                        this.startLoading();
                        this.fetchCurrentBoardData(this.boardWidget.value);
                    },
                    tooltip: "Fetch/update images and sections for the currently selected board"
                });
            }
        } else if (action === "remove") {
            if (existingButton) {
                const index = this.node.widgets.indexOf(existingButton);
                if (index > -1) {
                    this.node.widgets.splice(index, 1);
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

        // Don't make backend calls if username is empty
        if (!username || username.trim() === '') {
            console.log("Username is empty, skipping backend call");
            return;
        }
        
        fetchSend(MESSAGE_ROUTE, this.node.id, "board_selected", { username, board_name: this.getBoardName(selectedBoard), max_images, api_requests: this.apiRequestsWidget.value })
            .then(response => {
                const currentData = this.getPinterestData();
                if (!currentData.boards) currentData.boards = {};
                currentData.boards = response.data;
                if (response.board_map) {
                    currentData.board_map = response.board_map;
                }
                this.setPinterestData(currentData);
                if (response.board_map) {
                    this.buildDisplayToNameMappings("board");
                    this.updateBoardOptions(currentData);
                }
                if (response.cached_usernames && this.cachedUsernamesWidget) {
                    this.cachedUsernamesWidget.options.values = response.cached_usernames;
                }
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


    updateBoardOptions(data) {
        if (!data.board_map) return;
        const boardOptions = Object.keys(this.displayToBoardName);
        if (!this.boardWidget) return;

        const currentSelection = this.boardWidget.value;
        
        this.boardWidget.options.values = boardOptions;
        
        if (currentSelection) {
            if (currentSelection === "all" || boardOptions.includes(currentSelection)) {
                this.boardWidget.value = currentSelection;
            } else {
                const boardName = currentSelection.split(' (')[0];
                const matchingOption = boardOptions.find(opt => opt.startsWith(boardName + " ("));
                if (matchingOption) {
                    this.boardWidget.value = matchingOption;
                }
            }
        }
        this.node.setDirtyCanvas(true);
    }

    updateSectionOptions(data) {
        if (!this.boardWidget || !this.sectionWidget) return;

        const sectionData = this.widgetDataList.find(w => w.name === "section");
        if (!sectionData) return;

        const sectionOptions = Object.keys(this.displayToSectionName);
        
        this.sectionWidget.options.values = sectionOptions;
        
        if (!sectionOptions.includes(this.sectionWidget.value)) {
            this.sectionWidget.value = sectionOptions[0];
            this.updateNodeConfigs("section", this.sectionWidget.value);
        }
        
        this.node.setDirtyCanvas(true);
    }


    updateNodeConfigs(widgetName, value) {
        if (this.configsWidget && widgetName !== "node_configs" && widgetName !== "pinterest_data") {
            let configs = this.getConfigs();
            const widget = this.node.widgets?.find(w => w.name === widgetName);
            if (!widget || widget.type !== "button") {
                if (widgetName === "board") {
                    configs[widgetName] = this.getBoardName(value);
                } else if (widgetName === "section") {
                    configs[widgetName] = this.getSectionName(value);
                } else {
                    configs[widgetName] = value;
                }
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
                        if (widget.name === "board") {
                            configs[widget.name] = this.getBoardName(widget.value);
                        } else if (widget.name === "section") {
                            configs[widget.name] = this.getSectionName(widget.value);
                        } else {
                            configs[widget.name] = widget.value;
                        }
                    }
                }
            }
            this.setConfigs(configs);
        }
        if (this.cachedUsernamesWidget) {
            fetchSend(MESSAGE_ROUTE, this.node.id, "get_cached_usernames").then(response => {
                if (response.cached_usernames) {
                    this.cachedUsernamesWidget.options.values = response.cached_usernames;
                }
            });
        }
    }

    startLoading() {
        if (this.isLoading) return;
        
        this.originalOnDrawForeground = this.node.onDrawForeground;
        this.isLoading = true;
        
        this.node.onDrawForeground = (ctx) => {
            ctx.strokeStyle = "#FFFF00";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, this.node.size[0], this.node.size[1]);
            if (this.originalOnDrawForeground) {
                this.originalOnDrawForeground.call(this.node, ctx);
            }
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
                    
                    const configs = this.pyPinNode.getConfigs();
                    
                    if (configs.board && configs.board !== "all") {
                        const actualBoardName = this.pyPinNode.displayToBoardName[configs.board];
                        if (actualBoardName) {
                            configs.board = actualBoardName;
                            this.pyPinNode.setConfigs(configs);
                        }
                    }
                    
                    if (configs.section && configs.section !== "included" && configs.section !== "excluded") {
                        const actualSectionName = this.pyPinNode.displayToSectionName[configs.section];
                        if (actualSectionName) {
                            configs.section = actualSectionName;
                            this.pyPinNode.setConfigs(configs);
                        }
                    }
                    
                    this.pyPinNode.updateImageUrl();
                    setTimeout(() => {
                        api.dispatchCustomEvent('graphChanged', app.graph.serialize());
                    }, 100);
                }
            });

            const originalOnNodeRemoved = app.graph.onNodeRemoved;
            app.graph.onNodeRemoved = function(node) {
                if (node.type === "DN_pyPinNode") {
                    fetchSend(MESSAGE_ROUTE, node.id, "remove_boards_cache");
                }
                originalOnNodeRemoved?.apply(this, arguments);
            };

/*            chainCallback(nodeType.prototype, 'onResize', function(size) {
                this.setDirtyCanvas(true);
            });*/
        }
    }
});


