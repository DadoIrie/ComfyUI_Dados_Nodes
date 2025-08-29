import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

app.registerExtension({
    name: "DN_CSVMultiDropDownNode",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DN_CSVMultiDropDownNode") return;

        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            this.properties = this.properties || {};
            this.properties.csvText = this.properties.csvText || "";
            this.properties.removeDuplicates = this.properties.removeDuplicates || "false";
            this.dropdownWidgets = {};

            const csvWidget = this.widgets.find(w => w.name === "csv_text");
            if (csvWidget && csvWidget.element) {
                /* csvWidget.element.addEventListener('focus', () => {
                    console.log("csv_text focused", this.id);
                }); */
                csvWidget.element.addEventListener('blur', () => {
                    for (const id in this.dropdownWidgets) {
                        const widget = this.dropdownWidgets[id];
                        const index = this.widgets.indexOf(widget);
                        if (index !== -1) {
                            this.widgets.splice(index, 1);
                        }
                    }
                    this.dropdownWidgets = {};
                    this.properties.csvText = csvWidget.value;
                    this.parseCSVToDropdowns(csvWidget.value);
                });
            }

            this.updateBackend = async function() {
                if (!this.id || this.id === -1) return;
                const payload = {};
                for (const [id, widget] of Object.entries(this.dropdownWidgets)) {
                    let value = widget.value;
                    payload[id] = value;
                    if (value === "random") {
                        payload[id + "_entries"] = widget.options.values.filter(v => v !== "random");
                    }
                }
                await fetchSend(MESSAGE_ROUTE, this.id, "update_selections", payload);
            };

/*             app.widgets['STRING'](this, "CSV", ["STRING", { multiline: true, placeholder: "Enter CSV data here..." }], (value) => {
                this.properties.csvText = value;
                this.parseCSVToDropdowns(value);
                return value;
            }); */

/*             this.addWidget("combo", "remove duplicates", this.properties.removeDuplicates, (value) => {
                this.properties.removeDuplicates = value;
                this.parseCSVToDropdowns(this.properties.csvText);
                return value;
            }, { values: ["true", "false"] }); */

            this.parseCSVToDropdowns = function(csvText) {
                if (!csvText) return;
                const rows = csvText.split(/\r?\n/).filter(r => r.trim() !== "");
                
                const newDropdownWidgets = {};
                
                for (const row of rows) {
                    let parts = row.split(",");
                    let id, options;

                    if (parts.length === 2 && parts[1].includes('"')) {
                        id = parts[0].replace(/^"|"$/g, "").trim();
                        options = parts[1].replace(/^"|"$/g, "").split(",").map(o => o.trim().replace(/^"|"$/g, ''));
                    } else if (parts.length > 1) {
                        id = parts[0].trim();
                        options = parts.slice(1).map(o => o.trim().replace(/^"|"$/g, ''));
                    } else {
                        continue;
                    }

                    if (this.properties.removeDuplicates === "true") {
                        options = [...new Set(options)];
                    }
                    if (options.length > 1) options.push("random");

                    let widget = this.dropdownWidgets[id];
                    if (!widget) {
                        const initialValue = (this.properties[id] !== undefined && options.includes(this.properties[id]))
                            ? this.properties[id]
                            : options[0];
                        widget = this.addWidget("combo", id, initialValue, async (value) => {
                            this.properties[id] = value;
                            await this.updateBackend();
                            console.log(`Dropdown ${id} changed to ${value}`);
                            return value;
                        }, { values: options });
                    } else {
                        widget.options.values = options;
                        if (widget.value && options.includes(widget.value)) {
                            widget.value = widget.value;
                        } else {
                            widget.value = options[0];
                        }
                    }
                    newDropdownWidgets[id] = widget;
                }

                this.dropdownWidgets = newDropdownWidgets;
                this.setDirtyCanvas(true, true);
                this.updateBackend().catch(() => {/* silent error */});
            };

            if (this.properties.csvText) {
                setTimeout(() => this.parseCSVToDropdowns(this.properties.csvText), 50);
            }
        });

        chainCallback(nodeType.prototype, "onConfigure", function(o) {
            if (this.properties.csvText) {
                this.parseCSVToDropdowns(this.properties.csvText);
            }
        });

        return nodeType;
    },
    
    setup(app) {
        const originalOnNodeRemoved = app.graph.onNodeRemoved;
        app.graph.onNodeRemoved = function(node) {
            if (node.type === "DN_CSVMultiDropDownNode") {
                fetchSend(MESSAGE_ROUTE, node.id, "remove_selection");
            }
            originalOnNodeRemoved?.apply(this, arguments);
        };
    }
})

