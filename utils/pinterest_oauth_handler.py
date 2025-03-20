import asyncio
import webbrowser
from server import PromptServer  # type: ignore pylint: disable=import-error
from aiohttp import ClientSession
from .pinterest_oauth_server import PinterestOAuthServer
from .pinterest_token import (
    oauth_sessions, refresh_token, on_token_received,
    get_token_for_node, is_token_expired, refresh_token_sync,
    create_auth_header
)

# Event identifier for consistency
EVENT_PINTEREST_UPDATE = "/dadosNodes/PinterestNode"

# Centralized function to send messages to frontend
def send_to_frontend(node_id, operation, message, data=None):
    """Send data to frontend with consistent format"""
    payload = {
        "operation": operation,
        "node_id": node_id,
        "message": message,
        "id": node_id  # Required for the frontend
    }

    # Add additional data if provided
    if data:
        payload.update(data)

    print(f"Sending message to frontend: {EVENT_PINTEREST_UPDATE} for node {node_id}")
    PromptServer.instance.send_sync(EVENT_PINTEREST_UPDATE, payload)
    return True


# Create OAuth server when needed with provided credentials
oauth_server = None

# Start OAuth flow
async def start_oauth_flow(node_id, callback_function=None, app_id=None, app_secret=None):
    """Start the OAuth flow by generating a URL and opening the browser"""
    global oauth_server
    
    if not app_id or not app_secret:
        print("ERROR: Pinterest App ID or Secret not provided")
        send_to_frontend(
            node_id,
            "oauth_error",
            "Authentication failed: Pinterest App ID or Secret not provided"
        )
        return None
    
    # Create new server with provided credentials if needed or recreate it
    oauth_server = PinterestOAuthServer(app_id, app_secret, oauth_sessions)
    
    # Check if server is already running
    if hasattr(oauth_server, 'httpd') and oauth_server.httpd:
        print("OAuth server is already running, shutting it down first")
        oauth_server.shutdown_server()
        # Give it a moment to fully release the socket
        await asyncio.sleep(1)
    
    # Notify frontend that we're starting OAuth
    send_to_frontend(
        node_id,
        "oauth_started",
        "Please authenticate with Pinterest in your browser"
    )
    
    # Create wrapper for the callback if provided
    async def on_token_callback(node_id, token_data, username, timeout=False):
        if timeout:
            send_to_frontend(
                node_id,
                "oauth_timeout",
                "Authentication timed out. Please try again."
            )
            return
        
        await on_token_received(node_id, token_data, username)
        
        send_to_frontend(
            node_id,
            "oauth_complete",
            f"Authentication successful for {username}.",
            {"username": username}
        )
        
        # Call the node's callback if provided
        if callback_function:
            await callback_function(node_id, username)
    
    # Start the OAuth server and get the URL
    try:
        oauth_url = oauth_server.start_server(node_id, on_token_callback)
        
        # Open the browser with the OAuth URL
        webbrowser.open(oauth_url)
        
        print(f"OAuth flow started for node {node_id} - browser opened")
        return oauth_url
    except Exception as e:
        print(f"Failed to start OAuth server: {str(e)}")
        send_to_frontend(
            node_id,
            "oauth_error",
            f"Authentication failed: {str(e)}"
        )
        return None
    
def is_authenticated(node_id):
    """Check if a node is authenticated with Pinterest"""
    token_data = get_token_for_node(node_id)
    
    if not token_data:
        print("No token found")
        return False
        
    return not is_token_expired(token_data)

async def refresh_authentication(node_id, app_id=None, app_secret=None):
    """Refresh authentication if token is expired"""
    token_data = get_token_for_node(node_id)
    
    if not token_data:
        print("No token found")
        return False
        
    if is_token_expired(token_data):
        print("Token is expired, needs refresh")
        try:
            return await refresh_token(node_id, app_id, app_secret)
        except Exception as e:
            print(f"Error refreshing token: {e}")
            return False
            
    return True

def refresh_authentication_sync(node_id, app_id=None, app_secret=None):
    """Synchronous version of authentication refresh"""
    try:
        return refresh_token_sync(node_id, app_id, app_secret)
    except Exception as e:
        print(f"Error refreshing token: {e}")
        return False

async def get_valid_auth_header(node_id, app_id=None, app_secret=None):
    """Get a valid auth header, refreshing token if needed"""
    token_data = get_token_for_node(node_id)
    if not token_data:
        print("No access token available for node", node_id)
        return None
    
    # Check if token needs refresh
    if is_token_expired(token_data):
        print("Token expired or will expire soon, refreshing...")
        success = await refresh_token(node_id, app_id, app_secret)
        if not success:
            print("Failed to refresh token")
            return None
    
    access_token = token_data['access_token']
    return create_auth_header(access_token)

async def make_pinterest_request(node_id, endpoint, method="GET", data=None, app_id=None, app_secret=None):
    """Make a request to Pinterest API with authentication"""
    headers = await get_valid_auth_header(node_id, app_id, app_secret)
    if not headers:
        send_to_frontend(
            node_id,
            "api_error",
            "Authentication failed. Please re-authenticate."
        )
        return None
        
    async with ClientSession() as session:
        request_method = getattr(session, method.lower())
        
        kwargs = {
            "headers": headers,
            "timeout": 30
        }
        
        if data and method != "GET":
            kwargs["json"] = data
            
        async with request_method(endpoint, **kwargs) as response:
            if response.status != 200:
                error_text = await response.text()
                print(f"Error in Pinterest API request: {error_text}")
                send_to_frontend(
                    node_id,
                    "api_error",
                    f"Pinterest API error: {response.status}"
                )
                return None
                
            return await response.json()
