import { app } from "../../scripts/app.js";

const TypeSlot = {
    Input: 1,
    Output: 2,
};

const TypeSlotEvent = {
    Connect: true,
    Disconnect: false,
};

const _ID = "TextConcatenatorNode";
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
                            node_slot.name = `${_PREFIX}_`;
                        }
                    }
                } else if (event === TypeSlotEvent.Disconnect) {
                    this.removeInput(slot_idx);
                }

                // Separate connected and empty text slots
                let connectedSlots = [];
                let emptySlots = [];
                
                for(let i = 0; i < this.inputs.length; i++) {
                    const slot = this.inputs[i];
                    
                    // Skip non-dynamic inputs
                    if (slot.name === 'delimiter' || slot.name === 'strip_newlines') {
                        continue;
                    }
                    
                    if (slot.link !== null && slot.name.startsWith(_PREFIX)) {
                        connectedSlots.push({slot: slot, index: i});
                    } else if (slot.link === null && slot.name.startsWith(_PREFIX)) {
                        emptySlots.push(i);
                    }
                }

                // Remove excess empty slots (keep only one)
                while (emptySlots.length > 1) {
                    this.removeInput(emptySlots.pop()); // Remove from end
                }

                // Renumber connected slots in order (1, 2, 3...)
                connectedSlots.forEach((item, index) => {
                    item.slot.name = `${_PREFIX}_${index + 1}`;
                });

                // Ensure exactly one empty slot exists at the end
                if (emptySlots.length === 0) {
                    this.addInput(_PREFIX, _TYPE);
                    const last = this.inputs[this.inputs.length - 1];
                    if (last) {
                        last.color_off = "#666";
                    }
                } else {
                    // Move empty slot to the end if it's not already there
                    const emptySlotIndex = emptySlots[0];
                    if (emptySlotIndex !== this.inputs.length - 1) {
                        const emptySlot = this.inputs[emptySlotIndex];
                        this.removeInput(emptySlotIndex);
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
