import random
import json
from typing import Any, Dict, Optional, Tuple, List
from aiohttp import web
from ..utils.api_routes import register_operation_handler
from ..utils.api_routes import send_message
from ..utils.pinterest_oauth_handler import (
    start_oauth_flow, is_authenticated, refresh_authentication,
    get_valid_auth_header, make_pinterest_request, handle_callback
)

# API Base URL
PINTEREST_API_BASE = "https://api.pinterest.com/v5"
TOKEN_VALIDATION_CACHE = {}

class PinterestFetch:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "pinterest_node_function"
    CATEGORY = "Dado's Nodes/Pinterest"

    def pinterest_node_function(self, unique_id):
        print(f"EXECUTION START: Node {unique_id}")

        # Send a message to the frontend using the standardized message function
        send_message(
            node_id=unique_id,
            operation="status_update", 
            status="success",
            message="Node execution started"
        )

        return ("EXECUTION DONE",)

    @classmethod
    def IS_CHANGED(cls, unique_id):
        return random.randint(1, 1000000)

# ----------------------------------------
# Authentication Callbacks
# ----------------------------------------
async def after_auth_callback(node_id, username):
    """Called after successful authentication"""
    # Store validation in cache after successful auth
    TOKEN_VALIDATION_CACHE[node_id] = {
        "valid": True,
        "username": username
    }
    print(f"Updated token validation cache for node {node_id}")
    
    send_message(
        node_id=node_id,
        operation="auth_complete",
        status="success",
        message=f"Authentication successful for {username}.",
        payload={"username": username}
    )

# ----------------------------------------
# Authentication Handling
# ----------------------------------------
async def ensure_authentication(node_id: str, app_id: str = None, app_secret: str = None, custom_scope: str = None) -> Tuple[bool, Optional[str], Optional[Dict]]:
    """
    Ensures authentication is valid before making API calls.
    Returns a tuple of (is_authenticated, oauth_url_if_needed, error_response_if_any)
    """
    print(f"AUTH_DEBUG: Validating authentication for node {node_id}")
    
    # Check if token exists
    if not is_authenticated(node_id):
        # No token exists, try to start the authentication flow
        oauth_url = await start_oauth_flow(node_id, after_auth_callback, app_id, app_secret, custom_scope)
        
        if not oauth_url:
            return False, None, {
                "status": "error",
                "message": "Failed to start authentication process",
                "code": 500
            }
        
        # Send an event to the frontend about authentication starting
        send_message(
            node_id=node_id,
            operation="oauth_started",
            status="info",
            message="Authentication required. Please authenticate with Pinterest.",
            payload={"oauth_url": oauth_url}
        )
        
        return False, oauth_url, None
    
    # Try to refresh the token if needed
    refresh_success = await refresh_authentication(node_id, app_id, app_secret)
    if not refresh_success:
        return False, None, {
            "status": "error",
            "message": "Authentication token is invalid or could not be refreshed",
            "code": 401
        }
    
    # Authentication is valid
    return True, None, None

# ----------------------------------------
# API Data Functions
# ----------------------------------------
async def get_pinterest_items(node_id: str, item_type: str, app_id: str = None, app_secret: str = None) -> Optional[List[Dict]]:
    """Generic function to get Pinterest items (boards or pins)"""
    # Define the endpoints for different item types
    endpoints = {
        "boards": f"{PINTEREST_API_BASE}/boards",
        "pins": f"{PINTEREST_API_BASE}/pins"
    }
    
    if item_type not in endpoints:
        print(f"Unknown item type: {item_type}")
        return None
    
    # Get a valid auth header
    headers = await get_valid_auth_header(node_id, app_id, app_secret)
    if not headers:
        print(f"Failed to get valid auth header for node {node_id}")
        return None
    
    # Make the request to the Pinterest API
    try:
        response = await make_pinterest_request(
            node_id=node_id,
            endpoint=endpoints[item_type],
            method="GET",
            app_id=app_id,
            app_secret=app_secret
        )
        
        if not response:
            return None
        
        # Process the response
        items = []
        if item_type == "boards":
            items = response.get("items", [])
        elif item_type == "pins":
            items = response.get("items", [])
        
        # Print the full API response for boards
        if item_type == "boards":
            print("\nPinterest Boards API Response:")
            print(json.dumps(response, indent=4))
        
        # Print item information
        item_name_key = "name" if item_type == "boards" else "title"
        print(f"\nPinterest {item_type.capitalize()}:")
        for item in items:
            print(f"- {item.get(item_name_key, 'Untitled')}")
        
        return items
    except Exception as e:
        print(f"Error getting Pinterest {item_type}: {str(e)}")
        return None

# ----------------------------------------
# Operation Handlers
# ----------------------------------------
async def handle_get_pinterest_items(node_id: str, item_type: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Generic handler for getting Pinterest items (boards or pins)"""
    try:
        # Ensure authentication before making API calls
        auth_valid, oauth_url, error = await ensure_authentication(node_id, app_id, app_secret)
        
        if error:
            return web.json_response({
                "status": error["status"],
                "message": error["message"]
            }, status=error.get("code", 400))
        
        if not auth_valid:
            return web.json_response({
                "status": "auth_required",
                "message": "Authentication required",
                "oauth_url": oauth_url
            }, status=401)
        
        # Now we can fetch the items
        items = await get_pinterest_items(node_id, item_type, app_id, app_secret)
        
        if not items:
            return web.json_response({
                "status": "error",
                "message": f"No {item_type} found or error retrieving them"
            })
        
        item_payload = []
        if item_type == "boards":
            item_payload = [{"id": item.get("id"), "name": item.get("name")} for item in items]
        if item_type == "pins":
            item_payload = [{"id": item.get("id"), "title": item.get("title", "Untitled")} for item in items]
        
        send_message(
            node_id=node_id,
            operation=f"{item_type}_loaded",
            status="success",
            message=f"{item_type.capitalize()} retrieved successfully",
            payload={item_type: item_payload}
        )
        
        return web.json_response({
            "status": "success",
            "message": f"{item_type.capitalize()} request processed"
        })
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Failed to retrieve {item_type}: {str(e)}"
        }, status=500)

async def handle_get_user_boards(node_id: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Handle the get_user_boards operation"""
    return await handle_get_pinterest_items(node_id, "boards", app_id, app_secret)

async def handle_get_user_pins(node_id: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Handle the get_user_pins operation"""
    return await handle_get_pinterest_items(node_id, "pins", app_id, app_secret)

async def handle_get_token_validation(node_id: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Handle the get_token_validation operation"""
    print(f"VALIDATE_DEBUG: Processing validate_token for node {node_id} with app_id present: {bool(app_id)}")
    
    # Check if token exists without starting the authentication flow
    if not is_authenticated(node_id):
        return web.json_response({
            "status": "info",
            "valid": False,
            "token_status": "missing",
            "message": "No authentication token found"
        })
    
    # Check if we have a cached validation result
    if node_id in TOKEN_VALIDATION_CACHE:
        print(f"Using cached token validation result for node {node_id}")
        cached_result = TOKEN_VALIDATION_CACHE[node_id]
        return web.json_response({
            "status": "success",
            "valid": cached_result["valid"],
            "token_status": "valid",
            "username": cached_result["username"]
        })
    
    # Try to refresh the token if needed
    refresh_success = await refresh_authentication(node_id, app_id, app_secret)
    if not refresh_success:
        return web.json_response({
            "status": "warning",
            "valid": False,
            "token_status": "invalid",
            "message": "Authentication token is invalid or could not be refreshed"
        })
    
    # Token is valid, verify it with an API call
    try:
        # Make a request to get user account information
        response = await make_pinterest_request(
            node_id=node_id,
            endpoint=f"{PINTEREST_API_BASE}/user_account",
            method="GET",
            app_id=app_id,
            app_secret=app_secret
        )
        
        if response is not None:
            # Cache the validation result
            TOKEN_VALIDATION_CACHE[node_id] = {
                "valid": True,
                "username": response.get("username")
            }
            
            return web.json_response({
                "status": "success",
                "valid": True,
                "token_status": "valid",
                "username": response.get("username")
            })
        else:
            return web.json_response({
                "status": "warning",
                "valid": False,
                "token_status": "invalid",
                "message": "Authentication token is invalid or expired"
            })
    except Exception as e:
        return web.json_response({
            "status": "error",
            "valid": False,
            "token_status": "error",
            "message": str(e)
        })

async def handle_start_authentication(node_id: str, app_id: str = None, app_secret: str = None, custom_scope: str = None) -> web.Response:
    """Handle explicitly starting the authentication process"""
    # This will start the auth flow and return the oauth_url
    _, oauth_url, error = await ensure_authentication(node_id, app_id, app_secret, custom_scope)
    
    if error:
        return web.json_response({
            "status": error["status"],
            "message": error["message"]
        }, status=error.get("code", 400))
    
    # If we got here, authentication process started successfully
    return web.json_response({
        "status": "auth_initiated",
        "message": "Authentication process started",
        "oauth_url": oauth_url
    })

async def handle_oauth_callback(node_id: str, code: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Handle OAuth callback with authorization code"""
    try:
        success = await handle_callback(node_id, code, after_auth_callback, app_id, app_secret)
        
        if success:
            return web.json_response({
                "status": "success",
                "message": "Authentication completed successfully"
            })
        else:
            return web.json_response({
                "status": "error",
                "message": "Failed to complete authentication"
            }, status=400)
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Error handling callback: {str(e)}"
        }, status=500)

OPERATION_HANDLERS = {
    "get_user_boards": handle_get_user_boards,
    "get_user_pins": handle_get_user_pins,
    "get_token_validation": handle_get_token_validation,
    "start_authentication": handle_start_authentication,
    "oauth_callback": handle_oauth_callback
}

@register_operation_handler
@register_operation_handler
async def handle_pinterest_operations(request) -> Any:
    """Handle Pinterest-specific operations"""
    json_data = await request.json()
    node_id = json_data.get("id")
    operation = json_data.get("operation")
    payload = json_data.get("payload", {})
    app_id = payload.get("app_id")
    app_secret = payload.get("app_secret")
    custom_scope = payload.get("scope")
    
    # Check if we have a handler for this operation
    if operation not in OPERATION_HANDLERS:
        return web.json_response({"error": "Unknown operation"}, status=400)
    
    # Special handling for operations that don't need authentication first
    if operation in ["get_token_validation", "start_authentication", "oauth_callback"]:
        # For oauth_callback, extract the code from payload
        if operation == "oauth_callback":
            code = payload.get("code")
            if not code:
                return web.json_response({
                    "status": "error",
                    "message": "No authorization code provided"
                }, status=400)
            
            return await handle_oauth_callback(node_id, code, app_id, app_secret)
        
        # Handle start_authentication with custom_scope
        if operation == "start_authentication":
            return await handle_start_authentication(node_id, app_id, app_secret, custom_scope)
            
        # For other operations (like get_token_validation) that don't need custom_scope
        return await OPERATION_HANDLERS[operation](node_id, app_id, app_secret)
    
    # For all other operations, ensure authentication first
    auth_valid, oauth_url, error = await ensure_authentication(node_id, app_id, app_secret)
    
    if error:
        return web.json_response({
            "status": error["status"],
            "message": error["message"]
        }, status=error.get("code", 400))
    
    if not auth_valid:
        return web.json_response({
            "status": "auth_required",
            "message": "Authentication required",
            "oauth_url": oauth_url
        }, status=401)
    
    # Execute the operation handler
    return await OPERATION_HANDLERS[operation](node_id, app_id, app_secret)
