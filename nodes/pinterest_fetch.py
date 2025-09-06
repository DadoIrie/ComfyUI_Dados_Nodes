import random
import json
from typing import Any, Dict, Optional, Tuple, List
from aiohttp import web, ClientSession
import asyncio
from .utils.api_routes import register_operation_handler
from .utils.api_routes import send_message

from .utils.pinterest_token import (
    construct_oauth_url, is_token_expired, has_token,
    get_token, exchange_token, create_token_request, store_token
)
from .utils.pinterest_oauth import (
    authenticate_pinterest, refresh_pinterest_token
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

async def after_auth_callback(node_id, username):
    """Called after successful authentication"""
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

async def ensure_authentication(node_id: str, app_id: str = None, app_secret: str = None, custom_scope: str = None) -> Tuple[bool, Optional[str], Optional[Dict]]:
    """Ensures authentication is valid before making API calls"""
    print(f"AUTH_DEBUG: Validating authentication for node {node_id}")
    
    if not has_token():
        oauth_url = construct_oauth_url(app_id)
        
        if not oauth_url:
            return False, None, {
                "status": "error",
                "message": "Failed to start authentication process",
                "code": 500
            }
        
        send_message(
            node_id=node_id,
            operation="oauth_started",
            status="info",
            message="Authentication required. Please authenticate with Pinterest.",
            payload={"oauth_url": oauth_url}
        )
        
        return False, oauth_url, None
    
    token_data = get_token()
    if is_token_expired(token_data):
        refresh_success = refresh_pinterest_token(token_data.get('refresh_token'))
    else:
        refresh_success = True
        
    if not refresh_success:
        return False, None, {
            "status": "error",
            "message": "Authentication token is invalid or could not be refreshed",
            "code": 401
        }
    
    return True, None, None

async def get_pinterest_items(node_id: str, item_type: str, app_id: str = None, app_secret: str = None) -> Optional[List[Dict]]:
    """Generic function to get Pinterest items (boards or pins)"""
    endpoints = {
        "boards": f"{PINTEREST_API_BASE}/boards",
        "pins": f"{PINTEREST_API_BASE}/pins"
    }
    
    if item_type not in endpoints:
        print(f"Unknown item type: {item_type}")
        return None
    
    token_data = get_token()
    if not token_data:
        print(f"Failed to get valid token data for node {node_id}")
        return None
        
    headers = {
        "Authorization": f"Bearer {token_data.get('access_token')}"
    }
    
    try:
        async with ClientSession() as session:
            async with session.get(endpoints[item_type], headers=headers) as response:
                if response.status != 200:
                    print(f"Error in Pinterest API request: {await response.text()}")
                    return None
                    
                response = await response.json()
        
        if not response:
            return None
        
        items = []
        if item_type == "boards":
            items = response.get("items", [])
        elif item_type == "pins":
            items = response.get("items", [])
        
        if item_type == "boards":
            print("\nPinterest Boards API Response:")
            print(json.dumps(response, indent=4))
        
        item_name_key = "name" if item_type == "boards" else "title"
        print(f"\nPinterest {item_type.capitalize()}:")
        for item in items:
            print(f"- {item.get(item_name_key, 'Untitled')}")
        
        return items
    except Exception as e:
        print(f"Error getting Pinterest {item_type}: {str(e)}")
        return None

async def handle_get_pinterest_items(node_id: str, item_type: str, app_id: str = None, app_secret: str = None) -> web.Response:
    """Generic handler for getting Pinterest items"""
    try:
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
    return await handle_get_pinterest_items(node_id, "boards", app_id, app_secret)

async def handle_get_user_pins(node_id: str, app_id: str = None, app_secret: str = None) -> web.Response:
    return await handle_get_pinterest_items(node_id, "pins", app_id, app_secret)

async def handle_get_token_validation(node_id: str, app_id: str = None, app_secret: str = None) -> web.Response:
    print(f"VALIDATE_DEBUG: Processing validate_token for node {node_id} with app_id present: {bool(app_id)}")
    
    if not has_token():
        return web.json_response({
            "status": "info",
            "valid": False,
            "token_status": "missing",
            "message": "No authentication token found"
        })
    
    if node_id in TOKEN_VALIDATION_CACHE:
        print(f"Using cached token validation result for node {node_id}")
        cached_result = TOKEN_VALIDATION_CACHE[node_id]
        return web.json_response({
            "status": "success",
            "valid": cached_result["valid"],
            "token_status": "valid",
            "username": cached_result["username"]
        })
    
    token_data = get_token()
    if is_token_expired(token_data):
        refresh_success = refresh_pinterest_token(token_data.get('refresh_token'))
    else:
        refresh_success = True
        
    if not refresh_success:
        return web.json_response({
            "status": "warning",
            "valid": False,
            "token_status": "invalid",
            "message": "Authentication token is invalid or could not be refreshed"
        })
    
    try:
        headers = {
            "Authorization": f"Bearer {token_data.get('access_token')}"
        }
        
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{PINTEREST_API_BASE}/user_account", headers=headers) as response:
                if response.status != 200:
                    return web.json_response({
                        "status": "warning",
                        "valid": False,
                        "token_status": "invalid",
                        "message": "Authentication token is invalid"
                    })
                    
                response = await response.json()
        
        if response is not None:
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
    def auth_success_callback(username, token_data):
        asyncio.create_task(after_auth_callback(node_id, username))
    
    try:
        success = authenticate_pinterest(
            callback=auth_success_callback,
            app_id=app_id,
            app_secret=app_secret
        )
        if success:
            return web.json_response({
                "status": "auth_initiated",
                "message": "Authentication process started"
            })
        else:
            return web.json_response({
                "status": "error",
                "message": "Failed to start authentication process"
            }, status=500)
    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": f"Error starting authentication: {str(e)}"
        }, status=500)

async def handle_oauth_callback(node_id: str, code: str, app_id: str = None, app_secret: str = None) -> web.Response:
    try:
        token_request = create_token_request("authorization_code", code=code, app_id=app_id, app_secret=app_secret)
        token_data = exchange_token(token_request)
        
        if token_data:
            username = token_data.get("user_id", "pinterest_user")
            success = store_token(token_data, username)
            await after_auth_callback(node_id, username)
        else:
            success = False
        
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
async def handle_pinterest_operations(request) -> Any:
    json_data = await request.json()
    node_id = json_data.get("id")
    operation = json_data.get("operation")
    payload = json_data.get("payload", {})
    app_id = payload.get("app_id")
    app_secret = payload.get("app_secret")
    custom_scope = payload.get("scope")
    
    if operation not in OPERATION_HANDLERS:
        return web.json_response({"error": "Unknown operation"}, status=400)
    
    if operation in ["get_token_validation", "start_authentication", "oauth_callback"]:
        if operation == "oauth_callback":
            code = payload.get("code")
            if not code:
                return web.json_response({
                    "status": "error",
                    "message": "No authorization code provided"
                }, status=400)
            
            return await handle_oauth_callback(node_id, code, app_id, app_secret)
        
        if operation == "start_authentication":
            return await handle_start_authentication(node_id, app_id, app_secret, custom_scope)
            
        return await OPERATION_HANDLERS[operation](node_id, app_id, app_secret)
    
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
    
    return await OPERATION_HANDLERS[operation](node_id, app_id, app_secret)
