export class WildcardsProcessor {
    constructor(node) {
        this.node = node;
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

    getNodeData() {
        return {
            wildcards_prompt: this.getHiddenWidgetValue("wildcards_prompt"),
            wildcards_selections: this.getHiddenWidgetValue("wildcards_selections")
        };
    }

    updateNodeData(data) {
        if (data.wildcards_prompt !== undefined) {
            this.updateHiddenWidget("wildcards_prompt", data.wildcards_prompt);
        }
        if (data.wildcards_selections !== undefined) {
            this.updateHiddenWidget("wildcards_selections", data.wildcards_selections);
        }
    }
}