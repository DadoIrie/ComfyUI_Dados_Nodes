import http.server
import socketserver
import webbrowser
import threading
from urllib.parse import urlparse, parse_qs
from http import HTTPStatus

from .pinterest_token import (
    LOCAL_PORT, CALLBACK_PATH, construct_oauth_url, store_token,
    create_token_request, exchange_token
)

# Global event for token completion
token_event = threading.Event()

class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == CALLBACK_PATH:
            query_params = parse_qs(parsed_path.query)
            code = query_params.get('code', [None])[0]
            if code:
                try:
                    # Create token request and exchange for token
                    token_request = create_token_request("authorization_code", code=code)
                    token_data = exchange_token(token_request)
                    
                    if token_data:
                        # Store the token data for access in the parent process
                        self.server.token_data = token_data
                        
                        self.send_response(HTTPStatus.OK)
                        self.send_header("Content-type", "text/html")
                        self.end_headers()
                        self.wfile.write(b"""
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Authentication Successful</title>
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                                .success { color: green; }
                            </style>
                        </head>
                        <body>
                            <h1 class="success">Authentication Successful!</h1>
                            <p>You can now close this window and return to the application.</p>
                        </body>
                        </html>
                        """)
                    else:
                        self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
                        self.send_header("Content-type", "text/html")
                        self.end_headers()
                        self.wfile.write(b"""
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Authentication Error</title>
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                                .error { color: red; }
                            </style>
                        </head>
                        <body>
                            <h1 class="error">Authentication Failed</h1>
                            <p>Failed to exchange authorization code for token.</p>
                            <p>Please check your credentials and try again.</p>
                        </body>
                        </html>
                        """)
                        
                except Exception as e:
                    self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))
                
                finally:
                    token_event.set()
            else:
                self.send_error(HTTPStatus.BAD_REQUEST, "Authorization code missing")
                token_event.set()
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
    
    def log_message(self, format, *args):
        # Silence server logs
        return

def start_local_server():
    """Start a local server to handle the OAuth callback"""
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", LOCAL_PORT), OAuthCallbackHandler) as httpd:
        # Add token_data attribute to store the result
        httpd.token_data = None
        
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        
        # Wait for the token event or timeout after 5 minutes
        token_received = token_event.wait(timeout=300)
        token_data = httpd.token_data
        
        httpd.shutdown()
        httpd.server_close()
        
        return token_data if token_received else None

def initiate_oauth_flow():
    """Open a browser to start the Pinterest OAuth flow"""
    oauth_url = construct_oauth_url()
    if not oauth_url:
        print("Failed to construct OAuth URL")
        return False
        
    webbrowser.open(oauth_url)
    return True


def authenticate_pinterest(callback=None):
    """Complete Pinterest OAuth flow and store the token"""
    # Reset token event
    token_event.clear()
    
    # Start the OAuth flow
    if not initiate_oauth_flow():
        return False
    
    # Start the server and wait for the token
    token_data = start_local_server()
    
    if not token_data:
        print("Failed to obtain authentication token")
        return False
    
    # Store the token with the username from the token data
    username = token_data.get("user_id", "pinterest_user")
    store_token(token_data, username)
    
    # Print token info
    print(f"Access Token: {token_data.get('access_token')[:10]}...")
    print(f"Refresh Token: {token_data.get('refresh_token')[:10]}...")
    
    # Call the callback function if provided
    if callback and callable(callback):
        callback(username, token_data)
    
    return True

def refresh_pinterest_token(refresh_token_val):
    """Refresh an existing Pinterest token"""
    token_request = create_token_request("refresh_token", refresh_token=refresh_token_val)
    token_data = exchange_token(token_request)
    
    if token_data:
        # Store the refreshed token
        username = token_data.get("user_id", "pinterest_user")
        store_token(token_data, username)
        
        print(f"Refreshed Access Token: {token_data.get('access_token')[:10]}...")
        print(f"Refreshed Refresh Token: {token_data.get('refresh_token')[:10]}...")
        return True
    
    return False
