import { fetchSend } from "../utils.js";
export class WildcardsProcessor {
    constructor(node) {
        this.node = node;
        this.structureData = null; // Cache for structure data
    }

    getHiddenWidget(name) {
        return this.node.widgets?.find(w => w.name === name);
    }

    getHiddenWidgetValue(name) {
        const widget = this.getHiddenWidget(name);
        const value = widget ? widget.value : "";
        
        if (!widget || value == null) {
            return "";
        }
        
        return value;
    }

    updateHiddenWidget(name, value) {
        const widget = this.getHiddenWidget(name);
        if (widget) {
            widget.value = value || "";
        }
    }

    getWildcardsPrompt() {
        return this.getHiddenWidgetValue("wildcards_prompt")
    }

    getWildcardsStructure() {
        return this.getHiddenWidgetValue("wildcards_structure_data")
    }

    updateNodeData(data) {
        if (data.wildcards_prompt !== undefined) {
            this.updateHiddenWidget("wildcards_prompt", data.wildcards_prompt);
        }
        if (data.wildcards_structure_data !== undefined) {
            this.updateHiddenWidget("wildcards_structure_data", data.wildcards_structure_data);
        }
    }

/*     // NEW: Load structure data from backend
    async loadStructureData(constants) {
        try {
            const response = await fetchSend(
                constants.MESSAGE_ROUTE, 
                this.node.id, 
                "get_wildcard_structure"
            );
            
            if (response.status === 'success') {
                this.structureData = response.data;
                return this.structureData;
            }
        } catch (error) {
            console.error("Error loading structure data:", error);
        }
        return null;
    }

    // NEW: Save structure data to backend
    async saveStructureData(structureData, constants) {
        try {
            this.structureData = structureData;
            
            // Update widget
            this.updateNodeData({
                wildcards_structure_data: JSON.stringify(structureData)
            });
            
            // Send to backend
            const response = await fetchSend(
                constants.MESSAGE_ROUTE, 
                this.node.id, 
                "save_wildcard_structure", 
                structureData
            );
            
            return response.status === 'success';
        } catch (error) {
            console.error("Error saving structure data:", error);
            return false;
        }
    } */
}