import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Event identifier constant for consistency
const EVENT_PINTEREST_UPDATE = "dadosNodes/PinterestNode";

/**
 * Make API calls to our backend routes
 */
async function apiRoute(data = null, id = null) {
    const full_route = `/${EVENT_PINTEREST_UPDATE}`;
    var blob = {
        method: "GET",
        headers: { "Content-Type": "application/json" }
    }

    // if we are passing data, or need a specific node by ID, we must use a POST
    if (data != null || id != null) {
        blob['method'] = "POST",
        blob['body'] = JSON.stringify({
            id: id,
            ...data
        });
    }

    try {
        const response = await api.fetchApi(full_route, blob);
        if (!response.ok) {
            throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("API call to Pinterest node failed:", error);
        throw error;
    }
}

/**
 * Request user boards from the backend
 */
async function requestUserBoards(node, username) {
    if (!username || username.trim() === "") return;
    
    console.log(`Requesting boards for user ${username} (node ${node.id})`);
    
    try {
        const response = await apiRoute({
            operation: "get_user_boards",
            username: username
        }, node.id);
        
        console.log("Backend API response for boards:", response);
    } catch (error) {
        console.error("Failed to request boards:", error);
    }
}

/**
 * Handle messages from backend to a specific Pinterest node
 */
function handleNodeMessages(node, detail) {
    console.log(`Received message for node ${node.id}:`, detail);
    
    const handlers = {
        status_update: () => {
            console.log(`Node ${node.id}: ${detail.message}`);
            
            // Update existing message widget if it exists
            const existingWidget = node.widgets.find(w => w.name === "message_widget");
            if (existingWidget) {
                existingWidget.value = detail.message || "Status updated";
                app.graph.setDirtyCanvas(true, true);
            }
        },
        
        oauth_started: () => {
            console.log(`Node ${node.id} - OAuth started: ${detail.message}`);
            
            // If OAuth URL is provided, potentially open in new window
            if (detail.oauth_url) {
                window.open(detail.oauth_url, "_blank");
            }
            
            // Update message widget
            const messageWidget = node.widgets.find(w => w.name === "message_widget");
            if (messageWidget) {
                messageWidget.value = "Authentication started. Please complete in the opened browser window.";
                app.graph.setDirtyCanvas(true, true);
            }
        },
        
        auth_complete: () => {
            console.log(`Node ${node.id} - OAuth complete: ${detail.message}`);
            
            // Update message widget
            const messageWidget = node.widgets.find(w => w.name === "message_widget");
            if (messageWidget) {
                messageWidget.value = detail.message || "Authentication complete!";
                app.graph.setDirtyCanvas(true, true);
            }
            
            if (detail.username) {
                const usernameWidget = node.widgets.find(w => w.name === "username");
                if (usernameWidget) {
                    usernameWidget.value = detail.username;
                    app.graph.setDirtyCanvas(true, true);
                }
                
                // Request boards now that we are authenticated
                requestUserBoards(node, detail.username);
            }
        },
        
        boards_loaded: () => {
            console.log(`Node ${node.id} - Boards loaded: ${detail.message}`);
            
            if (detail.boards && Array.isArray(detail.boards)) {
                node.boardsList = detail.boards;
                
                // Update message widget with board info
                const messageWidget = node.widgets.find(w => w.name === "message_widget");
                if (messageWidget) {
                    messageWidget.value = `${detail.message}\nAvailable boards: ${detail.boards.map(b => b.name).join(", ")}`;
                    app.graph.setDirtyCanvas(true, true);
                }
                
                console.log(`Available Pinterest boards for node ${node.id}:`, 
                    detail.boards.map(b => b.name).join(", "));
            }
        },
        
        pins_loaded: () => {
            console.log(`Node ${node.id} - Pins loaded: ${detail.message}`);
            
            if (detail.pins && Array.isArray(detail.pins)) {
                node.pinsList = detail.pins;
                
                // Update message widget with pin info
                const messageWidget = node.widgets.find(w => w.name === "message_widget");
                if (messageWidget) {
                    messageWidget.value = `${detail.message}\nAvailable pins: ${detail.pins.map(p => p.title).join(", ")}`;
                    app.graph.setDirtyCanvas(true, true);
                }
            }
        }
    };
    
    // Call the appropriate handler if it exists
    const handler = handlers[detail.operation];
    if (handler) {
        handler();
    } else {
        console.warn(`Unknown operation: ${detail.operation}`);
    }
}

app.registerExtension({
    name: "Dados.PinterestNode",
    
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PinterestNode") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            // Call the original onNodeCreated
            const result = onNodeCreated?.apply(this, arguments);
            
            console.log("Setting up Pinterest node", this.id);
            
            // Create message widget
            const messageWidget = this.addWidget(
                "text",                  // widget type
                "message_widget",        // name
                "Waiting for data...",   // default value
                function(v) { return v; } // callback
            );
            
            // Add tooltip
            messageWidget.tooltip = "Message from Pinterest backend";
            // Set up username widget callback
            const usernameWidget = this.widgets.find(w => w.name === "username");
            if (usernameWidget) {
                const originalCallback = usernameWidget.callback;
                const node = this; // Capture the node reference
                usernameWidget.callback = function(value) {
                    // Call original callback if it exists
                    if (originalCallback) originalCallback.call(this, value);
                    
                    // Request boards with new username
                    if (value && value.trim() !== "") {
                        requestUserBoards(node, value); // Use the captured node reference
                    }
                    
                    return value;
                };
            }
            // Create event handler
            const eventHandler = ({ detail }) => {
                handleNodeMessages(this, detail);
            };
            
            // Just use the global event identifier
            api.addEventListener(EVENT_PINTEREST_UPDATE, eventHandler);
            
            // Add cleanup when node is removed
            const onRemoved = this.onRemoved;
            // And for cleanup
            this.onRemoved = function() {
                api.removeEventListener(EVENT_PINTEREST_UPDATE, eventHandler);
                console.log(`Removed event listener for ${EVENT_PINTEREST_UPDATE}`);
                return onRemoved?.apply(this, arguments);
            };
            
            // Update node size to fit widgets
            this.setSize([250, 120]);
            return result;
        };
    }
});
