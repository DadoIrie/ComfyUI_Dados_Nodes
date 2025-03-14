import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"

const _ID = "TextDropDownNode";
const _INPUT_NAME = "text";
const _TYPE = "STRING";
let dropDownEntries = ["empty"];

// Import fetchApiSend helper
const { fetchApiSend } = await import("/extensions/ComfyUI_Dados_Nodes/common/js/utils.js");
const API_ROUTE = '/dadoNodes/textDropdown/';

app.registerExtension({
    name: 'dados_nodes.' + _ID,
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== _ID) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const result = onNodeCreated?.apply(this);
            
            // Add a single input (commented out as requested)
            // this.addInput(_INPUT_NAME, _TYPE);
            
            // Initialize properties
            this.properties = this.properties || {};
            this.properties.option = dropDownEntries[0];
            this.properties.textValue = "";
            this.properties.actualSelection = this.properties.option; // Track actual selection for random
            
            // Create single line widget
            const textWidget = this.addWidget("STRING", "", "", (value) => {
                this.properties.textValue = value;
                return value;
            });

            // Create dropdown widget
            const dropdownWidget = this.addWidget("combo", "option", dropDownEntries[0], async (value) => {
                this.properties.option = value;
                
                // Send to backend
                if (this.id && this.id !== -1) {
                    try {
                        if (value === "random") {
                            // When random is selected, send all non-random entries to the backend
                            const nonRandomEntries = dropDownEntries.filter(entry => entry !== "random");
                            await fetchApiSend(API_ROUTE, "update_selection", {
                                node_id: this.id,
                                selection: value,
                                entries: nonRandomEntries
                            });
                        } else {
                            // For non-random selections, just send the selected value
                            await fetchApiSend(API_ROUTE, "update_selection", {
                                node_id: this.id,
                                selection: value
                            });
                        }
                    } catch (err) {
                        // Silent error handling
                    }
                }
                return value;
            }, { values: dropDownEntries });

            // Add remove duplicates dropdown widget
            this.addWidget("combo", "remove duplicates", "false", (value) => {
                this.properties.removeDuplicates = value;
                return value;
            }, { values: ["true", "false"] });

            // Add update button
            this.addWidget("button", "Update", null, () => {
                // Process text and update dropdown entries
                const rawText = this.properties.textValue || "";
                
                // Process the text to create new dropdown entries
                let processedEntries = this.processTextToEntries(rawText);
                
                // Add "random" entry if there's more than one entry
                if (processedEntries.length > 1) {
                    processedEntries.push("random");
                }
                
                // Update dropdown entries
                this.updateDropdownEntries(processedEntries, dropdownWidget);
                
                // Set the first entry as selected if available
                if (processedEntries.length > 0) {
                    this.properties.option = processedEntries[0];
                    this.properties.actualSelection = processedEntries[0];
                    dropdownWidget.value = processedEntries[0];
                    
                    // Update backend with new selection
                    if (this.id && this.id !== -1) {
                        fetchApiSend(API_ROUTE, "update_selection", {
                            node_id: this.id,
                            selection: this.properties.actualSelection
                        }).catch(() => {/* Silent error handling */});
                    }
                }
                
                // Refresh the canvas
                this.setDirtyCanvas(true, true);
            });
            
            // Optimize dropdown closing behavior
            if (dropdownWidget.computeSize) {
                const originalComputeSize = dropdownWidget.computeSize;
                dropdownWidget.computeSize = function() {
                    const result = originalComputeSize.apply(this, arguments);
                    setTimeout(() => this.parent.setDirtyCanvas(true, true), 10);
                    return result;
                };
            }
            // Helper method to process text into entries
            this.processTextToEntries = function(text) {
                // Trim leading whitespace and commas until first non-whitespace, non-comma character
                let trimmedText = text.replace(/^[\s,]+/, "");
                
                // If text is empty after trimming, return empty array
                if (!trimmedText) return ["empty"];
                
                // Process commas: remove spaces before and after commas
                // This regex matches: whitespace followed by comma OR comma followed by whitespace
                trimmedText = trimmedText.replace(/\s*,\s*/g, ",");
                
                // Split by comma and filter out empty entries
                let entries = trimmedText.split(",").filter(entry => entry.trim() !== "");
                
                // Remove duplicates if enabled
                if (this.properties.removeDuplicates === "true") {
                    entries = [...new Set(entries)];
                }
                
                // Return processed entries or "empty" if none found
                return entries.length > 0 ? entries : ["empty"];
            };
            
            // Helper method to update dropdown widget entries
            this.updateDropdownEntries = function(newEntries, widget) {
                // Update global variable
                dropDownEntries = [...newEntries];
                
                // Update widget values
                widget.options.values = dropDownEntries;
            };
            
            // Initialize backend with default selection
            if (this.id && this.id !== -1) {
                fetchApiSend(API_ROUTE, "update_selection", {
                    node_id: this.id,
                    selection: this.properties.actualSelection
                }).catch(() => {/* Silent error handling */});
            }
            
            return result;
        }
        
        // Serialize node properties
        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(o) {
            onSerialize?.apply(this, arguments);
            o.properties = o.properties || {};
            o.properties.option = this.properties.option;
            o.properties.textValue = this.properties.textValue;
            o.properties.actualSelection = this.properties.actualSelection;
            o.properties.removeDuplicates = this.properties.removeDuplicates;
        }
        
        // Configure node from serialized data
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(o) {
            onConfigure?.apply(this, arguments);
            
            if (o.properties) {
                this.properties = this.properties || {};
                
                if (o.properties.textValue !== undefined) {
                    this.properties.textValue = o.properties.textValue;
                    
                    // Process the text value to recreate dropdown options
                    if (this.widgets) {
                        const dropdownWidget = this.widgets.find(w => w.name === "option");
                        if (dropdownWidget) {
                            let processedEntries = this.processTextToEntries(o.properties.textValue);
                            
                            // Add "random" entry if there's more than one entry
                            if (processedEntries.length > 1) {
                                processedEntries.push("random");
                            }
                            
                            this.updateDropdownEntries(processedEntries, dropdownWidget);
                        }
                    }
                }
                
                if (o.properties.option !== undefined) {
                    this.properties.option = o.properties.option;
                }
                
                if (o.properties.actualSelection !== undefined) {
                    this.properties.actualSelection = o.properties.actualSelection;
                } else {
                    this.properties.actualSelection = this.properties.option;
                }
                
                if (o.properties.removeDuplicates !== undefined) {
                    this.properties.removeDuplicates = o.properties.removeDuplicates;
                }
                
                // Update backend with loaded selection
                if (this.id && this.id !== -1) {
                    fetchApiSend(API_ROUTE, "update_selection", {
                        node_id: this.id,
                        selection: this.properties.actualSelection
                    }).catch(() => {/* Silent error handling */});
                }
            }
        }
        // Method to handle getting node value
        const getNodeValue = nodeType.prototype.onExecuted || nodeType.prototype.onExecute;
        nodeType.prototype.onExecuted = function() {
            // Handle random selection each time the node is executed
            if (this.properties.option === "random") {
                // Get non-random entries
                const nonRandomEntries = dropDownEntries.filter(entry => entry !== "random");
                if (nonRandomEntries.length > 0) {
                    // Select a random entry
                    const randomIndex = Math.floor(Math.random() * nonRandomEntries.length);
                    this.properties.actualSelection = nonRandomEntries[randomIndex];
                    
                    // Update backend with new random selection
                    if (this.id && this.id !== -1) {
                        fetchApiSend(API_ROUTE, "update_selection", {
                            node_id: this.id,
                            selection: this.properties.actualSelection
                        }).catch(() => {/* Silent error handling */});
                    }
                }
            }
            
            // Call original method if exists
            if (typeof getNodeValue === 'function') {
                return getNodeValue.apply(this, arguments);
            }
        };
        
        return nodeType;
    },
    
    setup(app) {
        // Store original method
        app.graph._onNodeRemoved = app.graph.onNodeRemoved;
        
        // Override to clean up selections when node is removed
        app.graph.onNodeRemoved = function(node) {
            if (node.type === _ID) {
                fetchApiSend(API_ROUTE, "remove_selection", {
                    node_id: node.id
                }).catch(() => {/* Silent error handling */});
            }
            
            // Call original onNodeRemoved if it exists
            this._onNodeRemoved?.apply(this, arguments);
        };
    }
})