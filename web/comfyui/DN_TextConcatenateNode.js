import { app } from "../../scripts/app.js";

const TypeSlot = {
    Input: 1,
    Output: 2,
};

const TypeSlotEvent = {
    Connect: true,
    Disconnect: false,
};

const _ID = "DN_TextConcatenateNode";
const _PREFIX = "text";
const _TYPE = "STRING";

app.registerExtension({
    name: 'dados_nodes.' + _ID,
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Skip if not our node
        if (nodeData.name !== _ID) {
            return
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = async function () {
            const result = onNodeCreated?.apply(this);
            // Start with a new dynamic input
            this.addInput(_PREFIX, _TYPE);
            
            // Ensure the new slot has proper appearance
            const slot = this.inputs[this.inputs.length - 1];
            if (slot) {
                slot.color_off = "#666";
            }
            return result;
        }

        const onConnectionsChange = nodeType.prototype.onConnectionsChange
        nodeType.prototype.onConnectionsChange = function (slotType, slot_idx, event, link_info, node_slot) {
            
            const result = onConnectionsChange?.apply(this, arguments);
            
            
            if (slotType === TypeSlot.Input) {
                if (link_info && event === TypeSlotEvent.Connect) {
                    const fromNode = this.graph._nodes.find(
                        (otherNode) => otherNode.id == link_info.origin_id
                    )

                    if (fromNode) {
                        const parent_link = fromNode.outputs[link_info.origin_slot];
                        if (parent_link) {
                            node_slot.type = parent_link.type;
                            // If connecting to the unnumbered "text" slot, give it the next number
                            if (node_slot.name === _PREFIX) {
                                // Find the highest numbered slot
                                let maxNumber = 0;
                                for(const slot of this.inputs) {
                                    if (slot.name.startsWith(_PREFIX)) {
                                        const match = slot.name.match(/text_(\d+)/);
                                        if (match) {
                                            maxNumber = Math.max(maxNumber, parseInt(match[1]));
                                        }
                                    }
                                }
                                node_slot.name = `${_PREFIX}_${maxNumber + 1}`;
                            }
                        }
                    }
                } else if (event === TypeSlotEvent.Disconnect) {
                    if (this.inputs[slot_idx].name === _PREFIX) {
                        this.removeInput(slot_idx);
                    }
                    
                    // Count trailing empty numbered slots
                    let trailingEmpty = 0;
                    for(let i = this.inputs.length - 1; i >= 0; i--) {
                        const slot = this.inputs[i];
                        if (slot.name.startsWith(_PREFIX + '_') && slot.link === null) {
                            trailingEmpty++;
                        } else if (slot.name.startsWith(_PREFIX + '_')) {
                            break; // Stop at first connected numbered slot
                        }
                    }
                    
                    // Only clean up if we have more than 1 trailing empty slot
                    if (trailingEmpty > 1) {
                        let lastConnectedIndex = -1;
                        for(let i = 0; i < this.inputs.length; i++) {
                            const slot = this.inputs[i];
                            if (slot.name.startsWith(_PREFIX + '_') && slot.link !== null) {
                                lastConnectedIndex = i;
                            }
                        }
                        
                        if (lastConnectedIndex !== -1) {
                            // Remove excess trailing slots, keep only 1
                            for(let i = this.inputs.length - 1; i > lastConnectedIndex; i--) {
                                const slot = this.inputs[i];
                                if (slot.name.startsWith(_PREFIX + '_') && slot.link === null) {
                                    this.removeInput(i);
                                    trailingEmpty--;
                                    if (trailingEmpty <= 1) break; // Stop when we have only 1 left
                                }
                            }
                        }
                    }
                }

                // Handle unnumbered slots (always runs)
                let unnumberedSlots = [];
                for(let i = this.inputs.length - 1; i >= 0; i--) {
                    const slot = this.inputs[i];
                    if (slot.name === _PREFIX && slot.link === null) {
                        unnumberedSlots.push(i);
                    }
                }

                while (unnumberedSlots.length > 1) {
                    this.removeInput(unnumberedSlots.shift());
                }

                if (unnumberedSlots.length === 0) {
                    this.addInput(_PREFIX, _TYPE);
                    const last = this.inputs[this.inputs.length - 1];
                    if (last) {
                        last.color_off = "#666";
                    }
                } else {
                    // Move the unnumbered slot to the end if it's not already there
                    const unnumberedIndex = unnumberedSlots[0];
                    if (unnumberedIndex !== this.inputs.length - 1) {
                        this.removeInput(unnumberedIndex);
                        this.addInput(_PREFIX, _TYPE);
                        const newEmpty = this.inputs[this.inputs.length - 1];
                        if (newEmpty) {
                            newEmpty.color_off = "#666";
                        }
                    }
                }

                this?.graph?.setDirtyCanvas(true);
                return result;
            }
        }
        return nodeType;
    },
})
