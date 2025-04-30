import http.server
import os
import socketserver
import ssl
import threading
import webbrowser
from http import HTTPStatus
from urllib.parse import urlparse, parse_qs
import trustme
from .. import constants
from .pinterest_token import (
    LOCAL_PORT, CALLBACK_PATH, REDIRECT_URI, construct_oauth_url, store_token,
    create_token_request, exchange_token
)


# Configuration
USE_HTTPS = False  # Always use HTTPS with trusted certs
CERT_DIR = os.path.join(constants.BASE_DIR, ".cred_root", "certs")  # Certificate storage


def generate_trusted_certs():
    """Generate self-signed certificate for localhost using trustme"""
    
    if not os.path.exists(CERT_DIR):
        os.makedirs(CERT_DIR)
    
    # Simplified: Create a single certificate for localhost
    cert = trustme.CA()
    
    # Write certificate and key to files
    cert_path = os.path.join(CERT_DIR, "cert.pem")
    key_path = os.path.join(CERT_DIR, "key.pem")
    
    # Write the certificate and key
    cert.cert_pem.write_to_path(cert_path)
    cert.private_key_pem.write_to_path(key_path)


token_event = threading.Event()


def get_response_html(status='success', error_details=None):
    """Generate HTML response for OAuth callback based on status code"""
    # Default values for error states
    default_error = {
        'title': "Pinterest Authentication Failed!",
        'color': '#D32F2F'
    }
    
    # Map of status codes to their corresponding messages
    status_map = {
        'success': {
            'title': "Pinterest Authentication Complete!",
            'message': "You can close this window and return to the application.",
            'color': '#4CAF50'
        },
        'missing_code': {
            'message': "Authorization code missing"
        },
        'exchange_failure': {
            'message': f"{error_details}" if error_details else "Failed to exchange authorization code for token."
        },
        'error': {
            'message': f"Error: {error_details}" if error_details else "An unexpected error occurred"
        }
    }
    
    # Get status data with fallback to a default error for unknown status
    status_data = status_map.get(status, {'message': "Something went wrong with the authentication process."})
    
    # For error states, use default error title and color unless specified
    if status != 'success':
        title = status_data.get('title', default_error['title'])
        h1_color = status_data.get('color', default_error['color'])
    else:
        title = status_data['title']
        h1_color = status_data['color']
    
    message = status_data['message']
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                background-color: #333333;
                color: white;
                font-family: Arial, sans-serif;
                text-align: center;
                padding-top: 100px;
            }}
            h1 {{
                color: {h1_color};
            }}
            p {{
                font-size: 18px;
                margin-top: 20px;
            }}
        </style>
    </head>
    <body>
        <h1>{title}</h1>
        <p>{message}</p>
    </body>
    </html>
    """.encode('utf-8')


def start_local_server(app_id=None, app_secret=None):
    """Start a local server to handle the OAuth callback with non-blocking shutdown"""
    socketserver.TCPServer.allow_reuse_address = True
    
    httpd = None
    server_thread = None
    timeout_timer = None
    try:
        if USE_HTTPS:
            # Generate certs if needed
            if not os.path.exists(os.path.join(CERT_DIR, 'cert.pem')):
                generate_trusted_certs()
            
            # Create SSL context and load our generated certs
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(
                certfile=os.path.join(CERT_DIR, 'cert.pem'),
                keyfile=os.path.join(CERT_DIR, 'key.pem')
            )
            
            httpd = socketserver.TCPServer(("", LOCAL_PORT), OAuthCallbackHandler)
            httpd.socket = ssl_context.wrap_socket(
                httpd.socket,
                server_side=True
            )
            print(f"Starting HTTPS server on port {LOCAL_PORT}")
        else:
            httpd = socketserver.TCPServer(("", LOCAL_PORT), OAuthCallbackHandler)
        httpd.server_context = {
            "app_id": app_id,
            "app_secret": app_secret,
            "token_data": None,
            "error": None
        }
        
        # Start server in daemon thread (will exit when main thread exits)
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        
        # Set up timeout timer (5 minutes)
        def handle_timeout():
            if not token_event.is_set():
                print("OAuth server timeout - shutting down")
                httpd.server_context["error"] = "Timeout waiting for OAuth callback"
                token_event.set()
                if httpd:
                    httpd.shutdown()
        
        timeout_timer = threading.Timer(3000, handle_timeout)
        timeout_timer.daemon = True
        timeout_timer.start()
        
        # Return immediately - let caller poll for completion if needed
        return None
        
    except Exception as e:
        print(f"Error in OAuth server: {str(e)}")
        return None

def initiate_oauth_flow(app_id=None):
    """Open a browser to start the Pinterest OAuth flow"""
    # Get the redirect URI and add the appropriate protocol based on USE_HTTPS
    protocol = "https" if USE_HTTPS else "http"
    full_redirect_uri = f"{protocol}://{REDIRECT_URI}"
    
    oauth_url = construct_oauth_url(app_id, redirect_uri=full_redirect_uri)
    if not oauth_url:
        print("Failed to construct OAuth URL")
        return False
        
    webbrowser.open(oauth_url)
    return True


def authenticate_pinterest(callback=None, app_id=None, app_secret=None):
    """Start Pinterest OAuth flow (non-blocking)"""
    # Reset token event
    token_event.clear()
    
    # Store callback in global context
    if callback and callable(callback):
        token_event.callback = callback
    
    # Start the OAuth flow with app_id
    if not initiate_oauth_flow(app_id):
        return False
    
    # Start the server (non-blocking)
    start_local_server(app_id, app_secret)
    
    return True

def is_authentication_complete():
    """Check if OAuth authentication has completed"""
    return token_event.is_set()

def get_authentication_result():
    """Get authentication result if complete, None otherwise"""
    if token_event.is_set() and hasattr(token_event, 'token_data'):
        return token_event.token_data
    return None

def refresh_pinterest_token(refresh_token_val, app_id=None, app_secret=None):
    """Refresh an existing Pinterest token"""
    token_request = create_token_request("refresh_token", refresh_token=refresh_token_val, 
                                         app_id=app_id, app_secret=app_secret)
    result = exchange_token(token_request)
    
    if not result["success"]:
        return False
        
    token_data = result["data"]
    # Store the refreshed token
    username = token_data.get("user_id", "pinterest_user")
    store_token(token_data, username)
    
    print(f"Refreshed Access Token: {token_data.get('access_token')[:10]}...")
    print(f"Refreshed Refresh Token: {token_data.get('refresh_token')[:10]}...")
    return True

class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Return early if not the callback path
        if parsed_path.path != CALLBACK_PATH:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
            
        query_params = parse_qs(parsed_path.query)
        code = query_params.get('code', [None])[0]
        
        # Handle missing code
        if not code:
            self.send_response(HTTPStatus.BAD_REQUEST)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(get_response_html(status='missing_code'))
            token_event.set()
            return
        try:
            # Get credentials from the server context
            app_id = self.server.server_context.get("app_id")
            app_secret = self.server.server_context.get("app_secret")
            
            # Ensure app_secret is None instead of empty string if not provided
            # This will make the worker use its stored secret
            if app_secret == "":
                app_secret = None
            
            # Create token request and exchange for token
            token_request = create_token_request("authorization_code", code=code, app_id=app_id, app_secret=app_secret)
            
            # Debug logging
            print("\n=== TOKEN REQUEST (DEBUG) ===")
            print(f"Request data: {token_request}")
            print("==============================\n")
            
            # Exchange token
            result = exchange_token(token_request)
            # Handle token exchange failure
            if not result["success"]:
                print("\n=== TOKEN EXCHANGE FAILED ===")
                print(result["error"])
                print("=============================\n")
                
                self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
                self.send_header("Content-type", "text/html")
                self.end_headers()
                self.wfile.write(get_response_html(status='exchange_failure', error_details=result["error"]))
                return
                
            # Handle successful token exchange
            token_data = result["data"]
            self.server.server_context["token_data"] = token_data
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(get_response_html(status='success'))
                
        except Exception as e:
            self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(get_response_html(status='error', error_details=str(e)))
            
        finally:
            token_event.set()
