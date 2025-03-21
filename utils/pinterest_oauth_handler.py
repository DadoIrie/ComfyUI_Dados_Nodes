import webbrowser
from server import PromptServer  # type: ignore pylint: disable=import-error
from aiohttp import ClientSession
from .pinterest_token import (
    oauth_sessions, on_token_received,
    get_token_for_node, is_token_expired, refresh_token,
    create_auth_header, get_oauth_base_url, OAUTH_SCOPES
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

# Start OAuth flow
async def start_oauth_flow(node_id, callback_function=None, app_id=None, app_secret=None, custom_scope=None):
    """Start the OAuth flow by generating a URL and opening the browser"""
    
    if not app_id or not app_secret:
        print("ERROR: Pinterest App ID or Secret not provided")
        send_to_frontend(
            node_id,
            "oauth_error",
            "Authentication failed: Pinterest App ID or Secret not provided"
        )
        return None
    
    # Notify frontend that we're starting OAuth
    send_to_frontend(
        node_id,
        "oauth_started",
        "Please authenticate with Pinterest in your browser"
    )

    # Generate authentication URL directly
    try:
        oauth_base_url = get_oauth_base_url()
        
        # Prepare auth parameters
        auth_params = {
            "client_id": app_id,
            "redirect_uri": f"{oauth_base_url}/api/callback",
            "response_type": "code",
            "refreshable": "true",
            "scope": custom_scope if custom_scope else OAUTH_SCOPES
        }
        
        # Build the full authorization URL with parameters
        query_string = "&".join([f"{key}={value}" for key, value in auth_params.items()])
        auth_url = f"{oauth_base_url}/api/authorize?{query_string}"
        
        if not auth_url:
            print("ERROR: Failed to build authorization URL")
            send_to_frontend(
                node_id,
                "oauth_error",
                "Authentication failed: Unable to generate authorization URL"
            )
            return None
        
        # Store the association between node and callback function
        if node_id not in oauth_sessions:
            oauth_sessions[node_id] = {}
            
        oauth_sessions[node_id]["callback_function"] = callback_function
        
        # Open the browser with the OAuth URL
        webbrowser.open(auth_url)
        
        print(f"OAuth flow started for node {node_id} - browser opened")
        return auth_url
    except Exception as e:
        print(f"Failed to start OAuth flow: {str(e)}")
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
            # Use the refresh_token function instead
            return await refresh_token(node_id, app_id, app_secret)
        except Exception as e:
            print(f"Error refreshing token: {e}")
            return False
    
    return True

async def get_valid_auth_header(node_id, app_id=None, app_secret=None):
    """Get a valid auth header, refreshing token if needed"""
    token_data = get_token_for_node(node_id)
    if not token_data:
        print("No access token available for node", node_id)
        return None
    
    # Check if token needs refresh
    if is_token_expired(token_data):
        print("Token expired or will expire soon, refreshing...")
        success = await refresh_authentication(node_id, app_id, app_secret)
        if not success:
            print("Failed to refresh token")
            return None
        
        # Get updated token data
        token_data = get_token_for_node(node_id)
    
    access_token = token_data.get('access_token')
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

async def handle_callback(node_id, code, callback_function, app_id=None, app_secret=None):
    """Handle OAuth callback with authorization code"""
    try:
        # This should be Pinterest's token endpoint, not your callback URL
        token_endpoint = "https://api.pinterest.com/v5/oauth/token"
        oauth_base_url = get_oauth_base_url()
        redirect_uri = f"{oauth_base_url}/api/callback"
        
        # Prepare data for token exchange
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri
        }
        
        # Add credentials
        if app_id and app_secret:
            data["client_id"] = app_id
            data["client_secret"] = app_secret
        
        async with ClientSession() as session:
            async with session.post(token_endpoint, data=data) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Error obtaining token: {error_text}")
                    return False
                
                token_data = await response.json()
                
                # New detailed logging about the received token
                print("============= TOKEN RECEIVED =============")
                print(f"Node ID: {node_id}")
                if token_data:
                    print(f"Access Token: {token_data.get('access_token', 'None')[:10]}... (truncated)")
                    print(f"Refresh Token: {token_data.get('refresh_token', 'None')[:10]}... (truncated)")
                    print(f"Token Type: {token_data.get('token_type', 'None')}")
                    print(f"Expires In: {token_data.get('expires_in', 'None')} seconds")
                    print(f"Scope: {token_data.get('scope', 'None')}")
                else:
                    print("WARNING: No token data received from Pinterest!")
                print("==========================================")
                
                # Get the username from user_account endpoint
                auth_header = create_auth_header(token_data.get("access_token"))
                async with session.get(
                    "https://api.pinterest.com/v5/user_account",
                    headers=auth_header,
                    timeout=30
                ) as user_response:
                    if user_response.status != 200:
                        print(f"Error getting user info: {await user_response.text()}")
                        username = "Unknown"
                    else:
                        user_data = await user_response.json()
                        username = user_data.get("username", "Unknown")
                
                # Store the token
                await on_token_received(node_id, token_data, username)
                
                # Call the provided callback function if any
                if callback_function:
                    await callback_function(node_id, username)
                
                return True
    except Exception as e:
        print(f"Error handling callback: {str(e)}")
        return False
