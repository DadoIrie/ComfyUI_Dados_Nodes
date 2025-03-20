import { app } from "../../../scripts/app.js"

let dropDownEntries = ["empty"];

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

app.registerExtension({
    name: "TextDropDownNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TextDropDownNode") {
            return;
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            this.properties = this.properties || {};
            this.properties.option = dropDownEntries[0];
            this.properties.textValue = "";
            this.properties.actualSelection = this.properties.option;
            this.updateBackend = async function() {
                if (!this.id || this.id === -1) return;
                
                let payload = {
                    selection: this.properties.option
                };
                
                if (this.properties.option === "random") {
                    payload.entries = dropDownEntries.filter(entry => entry !== "random");
                }
                
                await fetchSend(MESSAGE_ROUTE, this.id, "update_selection", payload);
            };
            
            setTimeout(async () => {
                await this.updateBackend();
            }, 100);
            
            const textWidget = this.addWidget("STRING", "", "", (value) => {
                this.properties.textValue = value;
                
                this.regenerateDropdownEntries(value, dropdownWidget);
                
                return value;
            });

            const dropdownWidget = this.addWidget("combo", "option", dropDownEntries[0], async (value) => {
                this.properties.option = value;
                this.properties.actualSelection = value;
                
                await this.updateBackend();
                
                return value;
            }, { values: dropDownEntries });
            this.addWidget("combo", "remove duplicates", "false", async (value) => {
                this.properties.removeDuplicates = value;
                this.regenerateDropdownEntries(this.properties.textValue, dropdownWidget);
                await this.updateBackend();
                
                return value;
            }, { values: ["true", "false"] });
            this.regenerateDropdownEntries = function(text, dropdownWidget) {
                const rawText = text || "";
                let processedEntries = this.processTextToEntries(rawText);
                if (processedEntries.length > 1) {
                    processedEntries.push("random");
                }
                this.updateDropdownEntries(processedEntries, dropdownWidget);
                if (processedEntries.length > 0) {
                    this.properties.option = processedEntries[0];
                    this.properties.actualSelection = processedEntries[0];
                    dropdownWidget.value = processedEntries[0];
                    this.updateBackend().catch(() => {/* Silent error handling */});
                }
                this.setDirtyCanvas(true, true);
            };
            
            if (dropdownWidget.computeSize) {
                const originalComputeSize = dropdownWidget.computeSize;
                dropdownWidget.computeSize = function() {
                    const result = originalComputeSize.apply(this, arguments);
                    setTimeout(() => this.parent.setDirtyCanvas(true, true), 10);
                    return result;
                };
            }
            
            this.processTextToEntries = function(text) {
                let trimmedText = text.replace(/^[\s,]+/, "");
                if (!trimmedText) return ["empty"];
                trimmedText = trimmedText.replace(/\s*,\s*/g, ",");
                let entries = trimmedText.split(",").filter(entry => entry.trim() !== "");
                if (this.properties.removeDuplicates === "true") {
                    entries = [...new Set(entries)];
                }
                return entries.length > 0 ? entries : ["empty"];
            };
            
            this.updateDropdownEntries = function(newEntries, widget) {
                dropDownEntries = [...newEntries];
                widget.options.values = dropDownEntries;
            };
            this.updateBackend().catch(() => {/* Silent error handling */});
        });
        
        chainCallback(nodeType.prototype, "onSerialize", function(o) {
            o.properties = o.properties || {};
            o.properties.option = this.properties.option;
            o.properties.textValue = this.properties.textValue;
            o.properties.actualSelection = this.properties.actualSelection;
            o.properties.removeDuplicates = this.properties.removeDuplicates;
        });
        
        chainCallback(nodeType.prototype, "onConfigure", function(o) {
            if (o.properties) {
                this.properties = this.properties || {};
                if (o.properties.textValue !== undefined) {
                    this.properties.textValue = o.properties.textValue;
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
                if (this.widgets) {
                    const dropdownWidget = this.widgets.find(w => w.name === "option");
                    if (dropdownWidget && this.properties.textValue !== undefined) {
                        this.regenerateDropdownEntries(this.properties.textValue, dropdownWidget);
                        if (this.properties.option && dropDownEntries.includes(this.properties.option)) {
                            this.properties.actualSelection = this.properties.option;
                            dropdownWidget.value = this.properties.option;
                        }
                    }
                }
                this.updateBackend().catch(() => {/* Silent error handling */});
            }
        });
        
        return nodeType;
    },
    
    setup(app) {
        const originalOnNodeRemoved = app.graph.onNodeRemoved;
        app.graph.onNodeRemoved = function(node) {
            if (node.type === "TextDropDownNode") {
                fetchSend(
                    MESSAGE_ROUTE, 
                    node.id,
                    "remove_selection"
                );
            }
            originalOnNodeRemoved?.apply(this, arguments);
        };
    }
})
