import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;

(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed:", error));

/**
 * Validates Pinterest token and updates node status
 */
/**
 * Validates Pinterest token and updates node status
 */
async function validatePinterestToken(node) {
    console.log(`Validating token for node ${node.id}`);
    
    // Get credentials directly in the function
    const credentials = await getPinterestCredentials();
    
    const response = await fetchSend(
        MESSAGE_ROUTE,
        node.id,
        "get_token_validation", 
        {
            app_id: credentials.app_id,
            app_secret: credentials.app_secret
        }
    );
    
    if (response.valid && response.username) {
        console.log(`Token validation for node ${node.id}: Valid token for user "${response.username}"`);
    } else {
        // Now we can differentiate between missing and invalid tokens
        if (response.token_status === "missing") {
            console.log(`Token validation for node ${node.id}: No token found, authentication required`);
        } else if (response.token_status === "invalid") {
            console.log(`Token validation for node ${node.id}: Token is invalid or expired`);
        } else {
            console.log(`Token validation for node ${node.id}: Authentication failed - ${response.message || "Unknown error"}`);
        }
    }
    
    return response;
}



/**
 * Get Pinterest credentials from settings
 */
async function getPinterestCredentials() {
    const app_id = await app.extensionManager.setting.get("pinterest.app_id");
    const app_secret = await app.extensionManager.setting.get("pinterest.app_secret");
    const scope = await app.extensionManager.setting.get("pinterest.scope");
    const token_environment = await app.extensionManager.setting.get("pinterest.token_environment") || "standard";
    
    // For special environments
    let accessToken = null;
    if (token_environment === "production_limited") {
        accessToken = await app.extensionManager.setting.get("pinterest.production_limited_access_token");
    } else if (token_environment === "sandbox") {
        accessToken = await app.extensionManager.setting.get("pinterest.sandbox_access_token");
    }
    
    return {
        app_id,
        app_secret,
        scope,
        token_environment,
        accessToken
    };
}


/**
 * Request boards from the backend
 */
async function requestBoards(node) {
    console.log(`Requesting boards (node ${node.id})`);
    
    const credentials = await getPinterestCredentials();
    
    const response = await fetchSend(
        MESSAGE_ROUTE, 
        node.id,
        "get_user_boards", 
        {
            app_id: credentials.app_id,
            app_secret: credentials.app_secret
        }
    );
    
    console.log("Backend API response for boards:", response);
}
 /**
 * Handle messages from backend to a specific Pinterest node
 */
function handleNodeMessages(node, detail) {
    const { operation, status, message, payload } = detail;
    
    console.log(`Received message for node ${node.id}: ${operation} (${status})`);
    
    switch (operation) {
        case "status_update":
            console.log(`Node ${node.id} status: ${message}`);
            break;
        
        case "oauth_started":
            console.log(`Node ${node.id} - OAuth started: ${message}`);
            if (payload?.oauth_url) {
                window.open(payload.oauth_url, "_blank");
            }
            break;
        
        case "auth_complete":
            console.log(`Node ${node.id} - OAuth complete: ${message}`);
            if (status === "success") {
                // Remove existing authentication button
                while (node.widgets.length > 0) {
                    node.widgets.splice(0, 1);
                }
                
                // Create authenticated widgets
                const widgetCreator = (widgetData) => {
                    return widgetFactory.createWidget(node, widgetData);
                };
                
                // Restore original outputs if they were saved
                if (node._originalOutputs && node._originalOutputs.length > 0) {
                    node.outputs = node._originalOutputs;
                    delete node._originalOutputs; // Clean up
                }
                
                // Add all authenticated widgets
                authenticatedWidgets.map(widgetData => widgetCreator(widgetData));
                
                // Update the canvas
                node.setDirtyCanvas(true);
                
                console.log(`Dynamically updated widgets for node ${node.id} after successful authentication`);
                
                // Request boards now that we are authenticated
                requestBoards(node);
            }
            break;
        
        case "boards_loaded":
            console.log(`Node ${node.id} - Boards loaded: ${message}`);
            if (status === "success" && payload?.boards && Array.isArray(payload.boards)) {
                node.boardsList = payload.boards;
                console.log(`Available Pinterest boards for node ${node.id}:`, 
                    payload.boards.map(b => b.name).join(", "));
            } else {
                console.error("Failed to load boards:", message);
            }
            break;
        
        case "pins_loaded":
            console.log(`Node ${node.id} - Pins loaded: ${message}`);
            if (status === "success" && payload?.pins && Array.isArray(payload.pins)) {
                node.pinsList = payload.pins;
                console.log(`Loaded ${payload.pins.length} pins`);
            } else {
                console.error("Failed to load pins:", message);
            }
            break;
            
        default:
            console.warn(`Unknown operation: ${operation}`);
    }
}
/**
 * Button action function for initiating Pinterest authentication
 */
async function authenticate() {
    console.log(`Authentication was requested on node ${this.id}`);
    
    // Get credentials from settings
    const credentials = await getPinterestCredentials();
    
    // Call the authentication operation directly
    const response = await fetchSend(
        MESSAGE_ROUTE,
        this.id,
        "start_authentication", 
        {
            app_id: credentials.app_id,
            app_secret: credentials.app_secret,
            scope: credentials.scope
        }
    );
    
    console.log("Authentication initiation response:", response);
    
    // The actual OAuth redirect will be handled by the handleNodeMessages function
    // when it receives the "oauth_started" message with the oauth_url
}

function selectPinterestImage() {
    console.log(`Selecting Image was requested on node ${this.id}`);
    // Call the existing requestBoards function with this node
    requestBoards(this);
}

/**
 * Widget factory for creating different types of widgets
 */
const widgetFactory = {
    createWidget: (node, { name, type, value, options, tooltip, action }) => {
        const widgetTypes = {
            string: ["text", value => { widgetCallback(node, { name, value, type }); return value; }],
            combo: ["combo", value => { widgetCallback(node, { name, value, type }); return value; }, { values: options }],
            button: ["button", function() { action.call(node); widgetCallback(node, { name, type });}],
        };

        const [widgetType, callback, widgetOptions] = widgetTypes[type];
        const widget = node.addWidget(widgetType, name, value, callback, widgetOptions);
        widget.tooltip = tooltip;

        return widget;
    }
};

/**
 * Callback function for widget changes
 */
function widgetCallback(node, changedWidget) {
    if (changedWidget.type === "button") {
        return;
    }
    
    console.log(`Widget [${changedWidget.name}] changed on node ${node.id}`);
}

/**
 * List of widget definitions
 */
const authenticatedWidgets = [
    {
        name: "Boards",
        type: "combo",
        value: "excluded",
        options: ["included", "excluded"],
    },
    {
        name: "Select Pinterest image",
        type: "button", 
        action: selectPinterestImage,
        tooltip: "Browse Pinterest for images"
    }
];

const unauthenticatedWidgets = [
    {
        name: "Authenticate",
        type: "button", 
        action: authenticate,
        tooltip: "Authenticate with Pinterest"
    }
];

const settingsList = [
    // This will appear FIRST in the UI
    {
        id: "app_id",
        name: "App ID",
        type: "text",
        defaultValue: "",
    },
    {
        id: "app_secret",
        name: "App secret key",
        type: "text",
        defaultValue: "",
    },
    {
        id: "scope",
        name: "Scope",
        type: "text",
        defaultValue: "",
        tooltip: "Optional custom OAuth scope (comma-separated list of permissions)"
    },
    {
        id: "token_environment",
        name: "Token environment",
        type: "combo",
        defaultValue: "standard",
        options: [
            { text: "Standard access", value: "standard" },
            { text: "Trial access", value: "trial" },
            { text: "Production limited", value: "production_limited" },
            { text: "Sandbox", value: "sandbox" },
        ],
    },
    {
        id: "production_limited_access_token",
        name: "Production Limited Access Token",
        type: "text",
        defaultValue: "",
        tooltip: "Only used if production limited is selected as token environment",
    },
    {
        id: "sandbox_access_token",
        name: "Sandbox Access Token",
        type: "text", 
        defaultValue: "",
        tooltip: "Only used if sandbox is selected as token environment",
    }
];

function createSettings() {
    return settingsList.slice().reverse().map(settingDef => ({
        id: `pinterest.${settingDef.id}`,
        name: settingDef.name,
        type: settingDef.type,
        defaultValue: settingDef.defaultValue,
        category: ["Dado's Nodes", "Pinterest", `Pinterest ${settingDef.name}`],
        ...(settingDef.tooltip && { tooltip: settingDef.tooltip }),
        ...(settingDef.options && { options: settingDef.options })
    }));
}

app.registerExtension({
    name: "PinterestNode",
    settings: createSettings(),
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "PinterestFetch") {
            return;
        }
        
        chainCallback(nodeType.prototype, "onNodeCreated", async function() {
            const node = this;
            // Log the constants here
            console.log("Extension constants in node:", {
                EXTENSION_NAME,
                MESSAGE_ROUTE
            });

            // Get credentials from settings
            const credentials = await getPinterestCredentials();
            console.log("Pinterest credentials retrieved from settings, App ID present:", !!credentials.app_id);
            console.log("Setting up Pinterest node", this);
            
            // Create widgets for the node
            const widgetCreator = (widgetData) => {
                return widgetFactory.createWidget(node, widgetData);
            };
                        
            // Validate token with credentials
            try {
                const validationResult = await validatePinterestToken(node);
                console.log(`Token validation result for node ${node.id}:`, validationResult);
                
                // Based on authentication status, choose the appropriate widget list
                const isAuthenticated = validationResult.valid === true;
                const widgetList = isAuthenticated ? authenticatedWidgets : unauthenticatedWidgets;
                
                // If not authenticated, store outputs and clear them
                if (!isAuthenticated) {
                    // Store original outputs for later restoration
                    node._originalOutputs = [...node.outputs];
                    // Clear outputs
                    node.outputs = [];
                }
                
                // Create all widgets from the selected list
                widgetList.map(widgetData => widgetCreator(widgetData));
            } catch(error) {
                console.error(`Error validating token for node ${node.id}:`, error);
                // In case of error, default to unauthenticated state
                node._originalOutputs = [...node.outputs];
                node.outputs = [];
                unauthenticatedWidgets.map(widgetData => widgetCreator(widgetData));
            }
            
            // Create event handler with filtering by node ID in the message payload
            const eventHandler = ({ detail }) => {
                // Only process messages intended for this node
                if (detail.node_id == node.id || detail.id == node.id) {
                    handleNodeMessages(node, detail);
                }
            };
            
            // Listen to global event (no node ID in event name)
            console.log(`Setting up global event listener for ${MESSAGE_ROUTE}`);
            api.addEventListener(MESSAGE_ROUTE, eventHandler);
            
            // Add cleanup when node is removed
            chainCallback(node, "onRemoved", function() {
                api.removeEventListener(MESSAGE_ROUTE, eventHandler);
                console.log(`Removed event listener for ${MESSAGE_ROUTE}`);
            });

            // Force canvas update to make widgets visible immediately
            node.setDirtyCanvas(true);
        });
    }
});