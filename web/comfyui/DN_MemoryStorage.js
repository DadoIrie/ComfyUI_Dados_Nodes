import { app } from "../../scripts/app.js"

// TODO CRITICAL
// onnoderemoved not triggering when closing unsaved workflow?
// can we determine when a node is saved or not?

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

  ({chainCallback, fetchSend} =
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

class DN_MemoryStorage {
    constructor(node) {
        this.node = node;
        this.rootGraphIdWidget = this.node.widgets?.find(w => w.name === "root_graph_id");
        this.initializeWidgets();
    }
    
    initializeWidgets() {
        //setTimeout(() => {
            if (!this.rootGraphIdWidget.value) {
                this.rootGraphIdWidget.value = app.graph.rootGraph.id;
            }
        //}, 0);

        this.node.addWidget("button", "Test Dummy", null, () => {
            const payload = { rootGraphId: this.rootGraphIdWidget.value };
            fetchSend(MESSAGE_ROUTE, this.node.id, 'dummy_op', payload);
            this.checkRemainingNodes()
        });
    }

    checkRemainingNodes() {
        const rootGraph = app.graph.rootGraph;
        
        function countMemoryStorageNodes(graph, count = 0) {
            for (const node of graph.nodes) {
                if (node.type === "DN_MemoryStorage") {
                    count++;
                }
            }
            
            for (const subgraph of graph._subgraphs?.values() || []) {
                count = countMemoryStorageNodes(subgraph, count);
            }
            
            return count;
        }
        
        const nodeCount = countMemoryStorageNodes(rootGraph);
        console.log(`Found ${nodeCount} DN_MemoryStorage nodes in the workflow`);
        
        return nodeCount > 0;
    }
}

app.registerExtension({
    name: "DN_MemoryStorage",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DN_MemoryStorage") {
            let extensionContext;
            
            chainCallback(nodeType.prototype, 'onNodeCreated', async function () {
                const memoryStorage = new DN_MemoryStorage(this);
                extensionContext = memoryStorage;
            });
            const originalOnNodeRemoved = app.graph.onNodeRemoved;
            app.graph.onNodeRemoved = function(node) {
                if (node.type === "DN_MemoryStorage") {
                    const isPresent = extensionContext.checkRemainingNodes();
                    if (!isPresent) {
                        const rootGraphId = app.graph.rootGraph.id;
                        console.log(rootGraphId)
                        console.log("LAST NODE REMOVED")
                        const payload = {rootGraphId: rootGraphId, }
                        fetchSend(MESSAGE_ROUTE, node.id, "delete_memory_storage", payload);
                    }
                }
                originalOnNodeRemoved?.apply(this, arguments);
            };
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, event, link_info, node_slot) {
                if (slotType === 1 && event === true && node_slot.name === "root_graph_id") {
                    if (link_info) {
                        const linkId = link_info.id;
                        setTimeout(() => {
                            this.graph.removeLink(linkId);
                            this.graph.setDirtyCanvas(true);
                        }, 0);
                    }
                }
                onConnectionsChange?.apply(this, arguments);
            };
        }
    }
});