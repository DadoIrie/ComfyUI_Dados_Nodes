/* import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;

(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed:", error));


async function validatePinterestToken(node) {
    console.log(`Validating token for node ${node.id}`);
    
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




async function getPinterestCredentials() {
    const app_id = await app.extensionManager.setting.get("pinterest.app_id");
    const app_secret = await app.extensionManager.setting.get("pinterest.app_secret");
    const scope = await app.extensionManager.setting.get("pinterest.scope");
    const token_environment = await app.extensionManager.setting.get("pinterest.token_environment") || "standard";
    
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
                while (node.widgets.length > 0) {
                    node.widgets.splice(0, 1);
                }
                
                const widgetCreator = (widgetData) => {
                    return widgetFactory.createWidget(node, widgetData);
                };
                
                if (node._originalOutputs && node._originalOutputs.length > 0) {
                    node.outputs = node._originalOutputs;
                    delete node._originalOutputs;
                }
                
                authenticatedWidgets.map(widgetData => widgetCreator(widgetData));
                
                node.setDirtyCanvas(true);
                
                console.log(`Dynamically updated widgets for node ${node.id} after successful authentication`);
                
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

async function authenticate() {
    console.log(`Authentication was requested on node ${this.id}`);
    
    const credentials = await getPinterestCredentials();
    
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
    
}

function selectPinterestImage() {
    console.log(`Selecting Image was requested on node ${this.id}`);
    requestBoards(this);
}


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


function widgetCallback(node, changedWidget) {
    if (changedWidget.type === "button") {
        return;
    }
    
    console.log(`Widget [${changedWidget.name}] changed on node ${node.id}`);
}


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
            console.log("Extension constants in node:", {
                EXTENSION_NAME,
                MESSAGE_ROUTE
            });

            const credentials = await getPinterestCredentials();
            console.log("Pinterest credentials retrieved from settings, App ID present:", !!credentials.app_id);
            console.log("Setting up Pinterest node", this);
            
            const widgetCreator = (widgetData) => {
                return widgetFactory.createWidget(node, widgetData);
            };
                        
            try {
                const validationResult = await validatePinterestToken(node);
                console.log(`Token validation result for node ${node.id}:`, validationResult);
                
                const isAuthenticated = validationResult.valid === true;
                const widgetList = isAuthenticated ? authenticatedWidgets : unauthenticatedWidgets;
                
                if (!isAuthenticated) {
                    node._originalOutputs = [...node.outputs];
                    node.outputs = [];
                }
                
                widgetList.map(widgetData => widgetCreator(widgetData));
            } catch(error) {
                console.error(`Error validating token for node ${node.id}:`, error);
                node._originalOutputs = [...node.outputs];
                node.outputs = [];
                unauthenticatedWidgets.map(widgetData => widgetCreator(widgetData));
            }
            
            const eventHandler = ({ detail }) => {
                if (detail.node_id == node.id || detail.id == node.id) {
                    handleNodeMessages(node, detail);
                }
            };
            
            console.log(`Setting up global event listener for ${MESSAGE_ROUTE}`);
            api.addEventListener(MESSAGE_ROUTE, eventHandler);
            
            chainCallback(node, "onRemoved", function() {
                api.removeEventListener(MESSAGE_ROUTE, eventHandler);
                console.log(`Removed event listener for ${MESSAGE_ROUTE}`);
            });

            node.setDirtyCanvas(true);
        });
    }
}); */