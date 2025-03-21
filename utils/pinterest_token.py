import os
import time
import json
import base64
from aiohttp import ClientSession
from .. import constants

# Base URLs for OAuth service
OAUTH_LOCAL_URL = "http://localhost:8085"
OAUTH_PROD_URL = "https://vercel-pinterest-oauth.vercel.app"

# Development mode toggle - set to False in production
USE_LOCAL_OAUTH = False

# For backward compatibility
REDIRECT_URI = "https://localhost:8085/"
OAUTH_SCOPES = "user_accounts:read,pins:read,pins:write,pins:read_secret,pins:write_secret,boards:read,boards:write,boards:read_secret,boards:write_secret"

# File to store Pinterest OAuth token
CREDS_DIR = os.path.join(constants.BASE_DIR, ".cred_root")
if not os.path.exists(CREDS_DIR):
    os.makedirs(CREDS_DIR)
PIN_TOKEN = os.path.join(CREDS_DIR, "pinterestOauthToken.json")

def get_oauth_base_url():
    """Get the base URL for the OAuth service based on development mode"""
    return OAUTH_LOCAL_URL if USE_LOCAL_OAUTH else OAUTH_PROD_URL

def get_token_file_path():
    """Get the path to the Pinterest OAuth token file"""
    return PIN_TOKEN


oauth_sessions = {}

def create_token_object(access_token, refresh_token, username, scope, expires_in):
    """Create a standardized token object"""
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "username": username,
        "scope": scope,
        "expires_in": expires_in,
        "last_refreshed": int(time.time())
    }

def construct_oauth_url(app_id, oauth_state):
    """Construct the Pinterest OAuth URL"""
    if not app_id:
        print("ERROR: Pinterest App ID is not configured")
        return None
        
    return (
        "https://www.pinterest.com/oauth/"
        f"?consumer_id={app_id}"
        f"&redirect_uri={REDIRECT_URI}"
        "&response_type=code"
        "&refreshable=true"
        f"&scope={OAUTH_SCOPES}"
        f"&state={oauth_state}"
    )

def create_auth_header(access_token):
    """Create Authorization header with bearer token"""
    return {"Authorization": f"Bearer {access_token}"}
    
def create_basic_auth_header(app_id, app_secret):
    """Create Basic Authorization header"""
    if not app_id or not app_secret:
        print("ERROR: Pinterest App ID or Secret is not configured")
        return {}
        
    auth = f"{app_id}:{app_secret}"
    auth_b64 = base64.b64encode(auth.encode()).decode()
    return {"Authorization": f"Basic {auth_b64}"}

def save_token(token_data):
    """Save OAuth token to file"""
    with open(PIN_TOKEN, "w", encoding="utf-8") as f:
        f.write(json.dumps(token_data))
    print(f"Token saved to {PIN_TOKEN}")

def load_token():
    """Load OAuth token from file if it exists"""
    if not os.path.exists(PIN_TOKEN):
        return None
    
    try:
        with open(PIN_TOKEN, "r", encoding="utf-8") as f:
            token_data = json.loads(f.read())
        print(f"Token loaded from {PIN_TOKEN}")
        return token_data
    except Exception as e:
        print(f"Error loading token: {e}")
        return None

def is_token_expired(token_data):
    """Check if the token is expired or will expire soon"""
    if not token_data:
        return True
        
    # If no expiration info, assume we need to refresh
    if 'last_refreshed' not in token_data or 'expires_in' not in token_data:
        return True
        
    last_refreshed = token_data.get('last_refreshed', 0)
    expires_in = token_data.get('expires_in', 0)
    
    # Get current time with 5-minute buffer
    expiration_time = last_refreshed + expires_in - (5 * 60)
    return int(time.time()) >= expiration_time

def get_token_for_node(node_id):
    """Get token data for a node, from memory or file"""
    
    # Check if token exists in memory
    in_memory = node_id in oauth_sessions and 'access_token' in oauth_sessions[node_id]
    
    if in_memory:
        return oauth_sessions[node_id]
    
    # Try to load token from file
    print(f"Token not in memory, trying to load from file: {PIN_TOKEN}")
    print(f"File exists: {os.path.exists(PIN_TOKEN)}")
    
    token_data = load_token()
    if token_data and 'access_token' in token_data:
        print("Token loaded from file successfully")
        if node_id not in oauth_sessions:
            oauth_sessions[node_id] = token_data
        return token_data
    
    print("No token found in memory or file")
    return None

async def refresh_token(node_id, app_id=None, app_secret=None):
    """Refresh the access token using the refresh token"""
    print(f"Refreshing access token for node {node_id}")
    
    # Load tokens
    token_data = get_token_for_node(node_id)
    if not token_data or 'refresh_token' not in token_data:
        # Try to load directly from file as fallback
        token_data = load_token()
        if not token_data or 'refresh_token' not in token_data:
            print("No refresh token available")
            return False
    
    refresh_token_value = token_data['refresh_token']
    
    # Call the external OAuth service for token refresh
    oauth_base_url = get_oauth_base_url()
    refresh_url = f"{oauth_base_url}/api/refresh"
    
    data = {
        "refresh_token": refresh_token_value
    }
    
    # Add custom credentials if provided
    if app_id and app_secret:
        data["client_id"] = app_id
        data["client_secret"] = app_secret
    
    try:
        async with ClientSession() as session:
            async with session.post(refresh_url, json=data, timeout=30) as response:
                if response.status != 200:
                    print(f"Error refreshing token: {await response.text()}")
                    return False
                
                new_token_data = await response.json()
                
                # Update token in memory and file
                if node_id not in oauth_sessions:
                    oauth_sessions[node_id] = {}
                    
                oauth_sessions[node_id]['access_token'] = new_token_data.get('access_token')
                oauth_sessions[node_id]['refresh_token'] = new_token_data.get('refresh_token')
                
                # Save updated token
                save_token({
                    "access_token": new_token_data.get('access_token'),
                    "refresh_token": new_token_data.get('refresh_token'),
                    "username": oauth_sessions[node_id].get('username', token_data.get('username', 'Unknown')),
                    "scope": new_token_data.get('scope'),
                    "expires_in": new_token_data.get('expires_in'),
                    "last_refreshed": int(time.time())
                })
        
        print("Successfully refreshed access token")
        return True
            
    except Exception as e:
        print(f"Exception while refreshing token: {str(e)}")
        return False

async def on_token_received(node_id, token_data, username):
    """Callback function when OAuth token is received"""
    print(f"Token received for node {node_id}, username: {username}")
    
    # Store token for later use
    access_token = token_data.get("access_token")
    refresh_token_val = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    scope = token_data.get("scope", "")
    
    # Create a complete token object
    complete_token = {
        "access_token": access_token,
        "refresh_token": refresh_token_val,
        "username": username,
        "scope": scope,
        "expires_in": expires_in,
        "last_refreshed": int(time.time())
    }
    
    # Store in oauth_sessions
    if node_id not in oauth_sessions:
        oauth_sessions[node_id] = {}
    
    # Update all fields
    oauth_sessions[node_id].update(complete_token)
    
    # Save token to file
    save_token(complete_token)
    
    print(f"Token stored in memory for node {node_id}: {access_token[:10]}...")
    return None
