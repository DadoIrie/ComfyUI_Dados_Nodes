import os
import time
import json
from .. import constants

# Pinterest App credentials
PINTEREST_APP_ID = "1502601"

localWorker = True
WORKER_URL = "http://localhost:8787" if localWorker else "https://pinterest-oauth.dadoirie.workers.dev"

# Secret handshake for verification
SECRET_HANDSHAKE = "NGE7aGBkNjtoaTxuaio5cWFnNW4zN2poOj1udTk7OCI="

# Local server configuration
LOCAL_PORT = 8085
CALLBACK_PATH = "/callback"
REDIRECT_URI = f"localhost:{LOCAL_PORT}{CALLBACK_PATH}"

# OAuth scopes
OAUTH_SCOPES = "user_accounts:read,pins:read,pins:write,pins:read_secret,pins:write_secret,boards:read,boards:write,boards:read_secret,boards:write_secret"

# File to store Pinterest OAuth token
CREDS_DIR = os.path.join(constants.BASE_DIR, ".cred_root")
if not os.path.exists(CREDS_DIR):
    os.makedirs(CREDS_DIR)
PIN_TOKEN = os.path.join(CREDS_DIR, "pinterestOauthToken.json")

# In-memory token storage
oauth_token = None

def create_token_object(username, access_token, refresh_token, scope, expires_in):
    """Create a standardized token object"""
    return {
        "username": username,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "scope": scope,
        "expires_in": expires_in,
        "last_refreshed": int(time.time())
    }

def construct_oauth_url(app_id=None, oauth_state="", redirect_uri=None):
    """Construct the Pinterest OAuth URL"""
    # Use provided app_id or default constant
    # Check for None or empty string
    client_id = app_id if app_id else PINTEREST_APP_ID
    
    # Use provided redirect_uri or default
    final_redirect_uri = redirect_uri or REDIRECT_URI
    
    if not client_id:
        print("ERROR: Pinterest App ID is not configured")
        return None
        
    return (
        "https://www.pinterest.com/oauth/"
        f"?consumer_id={client_id}"
        f"&redirect_uri={final_redirect_uri}"
        "&response_type=code"
        "&refreshable=true"
        f"&scope={OAUTH_SCOPES}"
        f"&state={oauth_state}"
    )

def create_token_request(grant_type, code=None, refresh_token=None, app_id=None, app_secret=None):
    """Create a token request object based on grant type"""
    client_id = app_id or PINTEREST_APP_ID
    
    request = {
        "grant_type": grant_type,
        "app_id": client_id
    }
    
    if grant_type == "authorization_code" and code:
        request["code"] = code
    elif grant_type == "refresh_token" and refresh_token:
        request["refresh_token"] = refresh_token
    
    if app_secret is not None:
        request["secret_key"] = app_secret
        
    return request

def exchange_token(request_data):
    """Exchange authorization code or refresh token for an access token via worker"""
    import requests
    
    try:
        print(f"\n=== SENDING TOKEN REQUEST TO {WORKER_URL} ===")
        response = requests.post(
            f"{WORKER_URL}/",
            headers={"Content-Type": "application/json", "X-Secret-Handshake": SECRET_HANDSHAKE},
            json=request_data
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            response_data = response.json()
            print(f"Token exchange successful, received access token: {response_data.get('access_token', '')[:10]}...")
            
            # Store the token immediately when received
            if request_data.get("grant_type") == "authorization_code":
                username = response_data.get("user_id", "pinterest_user")
                store_token(response_data, username)
                
            return {"success": True, "data": response_data}
        else:
            error_message = f"Token exchange failed: {response.status_code}"
            try:
                error_data = response.json()
                error_details = error_data.get('error', 'Unknown error')
                error_message = error_details
            except ValueError:
                error_message = response.text
            
            print(f"ERROR: {error_message}")
            return {"success": False, "error": error_message}
    except Exception as e:
        error_message = f"Error exchanging token: {e}"
        print(f"EXCEPTION: {error_message}")
        return {"success": False, "error": error_message}
    
def save_token(token_data):
    """Save OAuth token to file"""
    global oauth_token
    
    with open(PIN_TOKEN, "w", encoding="utf-8") as f:
        f.write(json.dumps(token_data))
    
    # Also update in-memory copy
    oauth_token = token_data
    print(f"Token saved to {PIN_TOKEN}")

def load_token():
    """Load OAuth token from file if it exists"""
    global oauth_token
    
    # Return memory copy if available
    if oauth_token is not None:
        return oauth_token
    
    # Otherwise try to load from file
    if not os.path.exists(PIN_TOKEN):
        return None
    
    try:
        with open(PIN_TOKEN, "r", encoding="utf-8") as f:
            token_data = json.loads(f.read())
        
        # Update memory copy
        oauth_token = token_data
        print(f"Token loaded from {PIN_TOKEN}")
        return token_data
    except Exception as e:
        print(f"Error loading token: {e}")
        return None

def is_token_expired(token_data=None):
    """Check if the token is expired or will expire soon"""
    if token_data is None:
        token_data = load_token()
        
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

def get_token():
    """Get token data from memory or file"""
    return load_token()

def store_token(token_data, username):
    """Store a new token"""
    global oauth_token
    
    # Create a complete token object
    access_token = token_data.get("access_token")
    refresh_token_val = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    scope = token_data.get("scope", "")
    
    complete_token = create_token_object(
        username=username,
        access_token=access_token,
        refresh_token=refresh_token_val,
        scope=scope,
        expires_in=expires_in
    )
    
    # Update in-memory token
    oauth_token = complete_token
    
    # Save to file
    save_token(complete_token)
    
    print(f"Token stored: {access_token[:10]}...")
    return True

def clear_token():
    """Clear the token from memory and file"""
    global oauth_token
    oauth_token = None
    
    if os.path.exists(PIN_TOKEN):
        os.remove(PIN_TOKEN)
        print(f"Token file removed: {PIN_TOKEN}")
    return True
        
def has_token():
    """Check if a token exists"""
    return load_token() is not None

def get_token_info():
    """Get basic token information without exposing sensitive data"""
    token_data = load_token()
    if not token_data:
        return {
            "exists": False,
            "expired": True,
            "username": None
        }
    
    return {
        "exists": True,
        "expired": is_token_expired(token_data),
        "username": token_data.get("username"),
        "scope": token_data.get("scope")
    }
