import http.server
import socketserver
import threading
import ssl
import asyncio
import secrets
import os
import logging
import datetime
import time
from aiohttp import ClientSession
from .pinterest_token import (REDIRECT_URI, construct_oauth_url, create_auth_header, create_basic_auth_header)
from .. import constants

class PinterestOAuthServer:
    def __init__(self, app_id, app_secret, oauth_sessions, log_dir=None):
        self.app_id = app_id
        self.app_secret = app_secret
        self.oauth_sessions = oauth_sessions
        
        # Set up logging directory
        self.log_dir = log_dir or constants.BASE_DIR
        self.pinterest_logs_dir = os.path.join(self.log_dir, ".cred_root", "pinterest_logs")
        os.makedirs(self.pinterest_logs_dir, exist_ok=True)
        
        self.logger = None
        self.httpd = None
        self.server_thread = None
        self.timeout_timer = None
        
    def mask_sensitive_data(self, text):
        """Masks sensitive data like tokens"""
        return '*' * len(text) if text else text
    
    def setup_logging(self):
        """Set up logging"""
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = os.path.join(self.pinterest_logs_dir, f"oauth_{timestamp}.log")

        logger = logging.getLogger('pinterest_oauth')
        logger.setLevel(logging.INFO)
        
        # Clear existing handlers
        if logger.handlers:
            for handler in logger.handlers:
                logger.removeHandler(handler)
        
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(file_handler)
        
        print(f"Pinterest OAuth logging initialized. Log file: {log_file}")
        self.logger = logger
        
    def log(self, level, message, *args):
        """Unified logging method"""
        if not self.logger:
            return
            
        log_methods = {
            'info': self.logger.info,
            'debug': self.logger.debug,
            'error': self.logger.error
        }
        
        if level in log_methods:
            log_methods[level](message, *args)
    
    def start_server(self, node_id, on_token_received):
        """Start a temporary OAuth server"""
        self.setup_logging()
        self.log('info', f"Starting OAuth server for node {node_id}")
        
        # Check if credentials are missing
        missing_credentials = []
        if not self.app_id:
            missing_credentials.append("App ID")
        if not self.app_secret:
            missing_credentials.append("App Secret")
            
        # Generate state parameter for security
        oauth_state = secrets.token_hex()
        
        # Store in the sessions dictionary
        if node_id not in self.oauth_sessions:
            self.oauth_sessions[node_id] = {}
            
        self.oauth_sessions[node_id]['state'] = oauth_state
        self.oauth_sessions[node_id]['missing_credentials'] = missing_credentials
        
        def create_handler():
            """Create a request handler with access to our instance variables"""
            outer_self = self  # Capture the outer self reference
            
            class OAuthHandler(http.server.BaseHTTPRequestHandler):
                def log_message(self, format, *args):
                    msg = format % args
                    
                    # Mask sensitive data in logs
                    if "code=" in msg or "state=" in msg:
                        parts = msg.split()
                        if len(parts) >= 3:
                            masked_msg = f"{parts[0]} [OAuth URL with masked params] {' '.join(parts[2:])}"
                            outer_self.log('info', f"HTTP: {masked_msg}")
                    else:
                        outer_self.log('info', f"HTTP: {msg}")
                
                def do_GET(self):
                    masked_path = outer_self.mask_sensitive_data(self.path)
                    outer_self.log('info', f"Received callback: {masked_path}")
                    
                    from urllib.parse import urlparse, parse_qs
                    
                    # Parse query parameters
                    query = parse_qs(urlparse(self.path).query)
                    code = query.get('code', [''])[0]
                    state = query.get('state', [''])[0]
                    
                    # Validate state
                    state_valid = state == oauth_state
                    error_param = query.get('error', [''])[0]
                    error_desc = query.get('error_description', [''])[0]
                    
                    # Check for missing credentials
                    missing_credentials = outer_self.oauth_sessions[node_id].get('missing_credentials', [])
                    
                    # Determine status based on conditions
                    status = 'success'
                    if missing_credentials:
                        status = 'missing_credentials'
                        self.send_response(400)
                    elif not state_valid:
                        status = 'invalid_state'
                        self.send_response(400)
                    elif error_param:
                        status = 'pinterest_error'
                        self.send_response(400)
                    else:
                        # Success case
                        # Store auth code
                        outer_self.oauth_sessions[node_id]['auth_code'] = code
                        self.send_response(200)
                    
                    # Create appropriate HTML response
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    
                    # Generate dynamic content based on status
                    h1_color = '#4CAF50' if status == 'success' else '#D32F2F'
                    
                    # Initialize title and message variables
                    title = ""
                    message = ""
                    
                    if status == 'success':
                        title = "Pinterest Authentication Complete!"
                        message = "You can close this window and return to the application."
                    elif status == 'missing_credentials':
                        title = "Pinterest Authentication Failed!"
                        message = f"Missing credentials: {', '.join(missing_credentials)}"
                    elif status == 'invalid_state':
                        title = "Pinterest Authentication Failed!"
                        message = "Invalid state parameter received."
                    elif status == 'pinterest_error':
                        title = "Pinterest Authentication Failed!"
                        message = f"Error: {error_param} - {error_desc}"
                    
                    # Common HTML template
                    html = f"""
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
                    """
                    
                    self.wfile.write(html.encode('utf-8'))
                    
                    # Process token exchange and shut down server if we have a valid code
                    if status == 'success':
                        outer_self.log('info', "Starting token exchange process")
                        threading.Thread(target=lambda: process_auth_code(code)).start()
                    else:
                        outer_self.log('error', f"Authentication failed: {status}")
                    
                    # Schedule server shutdown
                    threading.Thread(target=lambda: shutdown_after_delay()).start()            
            return OAuthHandler
        
        def process_auth_code(code):
            """Process the auth code and exchange it for a token"""
            self.log('info', "Processing auth code")
            
            # Set up asyncio event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                loop.run_until_complete(self.exchange_code_for_token(code, node_id, on_token_received))
            except Exception as e:
                self.log('error', f"Error processing auth code: {str(e)}")
            finally:
                loop.close()

        def shutdown_after_delay():
            """Shut down server after a delay"""
            time.sleep(3)  # Wait to ensure response is sent
            self.shutdown_server()
        
        # Create and start the server
        handler_class = create_handler()
        
        try:
            self.log('info', "Creating HTTPS server")
            self.httpd = socketserver.TCPServer(("localhost", 8085), handler_class)
            
            # Set up SSL
            self.setup_ssl()
            
            # Start server in separate thread
            self.log('info', "Starting server thread")
            self.server_thread = threading.Thread(target=self.httpd.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            
            self.log('info', f"OAuth server started on port 8085 for node {node_id}")
            
            # Set up timeout timer (5 minutes)
            if self.timeout_timer:
                self.timeout_timer.cancel()
            self.timeout_timer = threading.Timer(300, lambda: self.handle_timeout(node_id, on_token_received))
            self.timeout_timer.daemon = True
            self.timeout_timer.start()
            
            # Check for missing credentials and handle differently
            if missing_credentials:
                self.log('error', f"Missing credentials: {', '.join(missing_credentials)}")
                # Return a URL that will show the error page directly
                return f"https://localhost:8085/?missing_credentials=true&state={oauth_state}"
            
            # Create OAuth URL using token_configs function
            oauth_url = construct_oauth_url(self.app_id, oauth_state)
            
            print(f"Generated OAuth URL: [URL with state={oauth_state[:4]}...]")
            return oauth_url
            
        except Exception as e:
            self.log('error', f"Failed to start server: {str(e)}")
            raise

    def handle_timeout(self, node_id, on_token_received):
        """Handle server timeout after 5 minutes"""
        self.log('info', f"OAuth server timeout for node {node_id}")
        
        # Check if token was already received
        if node_id in self.oauth_sessions and 'auth_code' in self.oauth_sessions[node_id]:
            self.log('info', "Token was already received, ignoring timeout")
            return
            
        # Signal timeout to the handler
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(on_token_received(node_id, None, None, timeout=True))
        except Exception as e:
            self.log('error', f"Error handling timeout: {str(e)}")
        finally:
            loop.close()
            
        # Shut down server
        self.shutdown_server()
      
    async def exchange_code_for_token(self, code, node_id, on_token_received):
        """Exchange authorization code for access token"""
        self.log('info', "Exchanging code for token")

        try:
            # Get auth header using token_configs function
            auth_header = create_basic_auth_header(self.app_id, self.app_secret)

            async with ClientSession() as session:
                self.log('info', "Starting token request")
                start_time = datetime.datetime.now()

                async with session.post(
                    "https://api.pinterest.com/v5/oauth/token",
                    headers=auth_header,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": REDIRECT_URI
                    },
                    timeout=60
                ) as response:
                    elapsed = (datetime.datetime.now() - start_time).total_seconds()
                    self.log('info', f"Token request completed in {elapsed:.2f} seconds")

                    if response.status != 200:
                        self.log('error', f"Error exchanging code: {await response.text()}")
                        return

                    token_data = await response.json()
                    self.log('info', "Successfully received access token")
                    access_token = token_data.get("access_token")

                    # Get user info using the auth header function
                    user_headers = create_auth_header(access_token)
                    async with session.get(
                        "https://api.pinterest.com/v5/user_account",
                        headers=user_headers,
                        timeout=60
                    ) as user_response:
                        if user_response.status != 200:
                            self.log('error', f"Error getting user info: {await user_response.text()}")
                            return

                        user_data = await user_response.json()
                        username = user_data.get("username")
                        self.log('info', f"Successfully retrieved username: {self.mask_sensitive_data(username)}")

                        # Call the token received callback
                        await on_token_received(node_id, token_data, username)
        except Exception as e:
            self.log('error', f"Error in token exchange: {str(e)}")

    def setup_ssl(self):
        """Configure SSL for the server"""
        self.log('info', "Setting up SSL")
        
        # Create directories
        creds_dir = os.path.join(constants.BASE_DIR, ".cred_root")
        cert_dir = os.path.join(creds_dir, "certs")
        os.makedirs(cert_dir, exist_ok=True)
        
        # Check for existing certificates
        cert_file = os.path.join(cert_dir, "server.crt")
        key_file = os.path.join(cert_dir, "server.key")
        
        if not os.path.exists(cert_file) or not os.path.exists(key_file):
            # Generate certificate
            self.log('info', "Generating self-signed SSL certificate...")
            import subprocess
            
            try:
                subprocess.run([
                    "openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048",
                    "-keyout", key_file, "-out", cert_file, "-days", "365",
                    "-subj", "/C=US/ST=State/L=City/O=Organization/CN=localhost"
                ], check=True)
                
                self.log('info', f"SSL certificate generated: {cert_file}")
            except subprocess.SubprocessError as e:
                self.log('error', f"Failed to generate certificate: {str(e)}")
                raise
        else:
            self.log('info', "Using existing SSL certificates")
        
        # Create SSL context
        try:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=cert_file, keyfile=key_file)
            self.httpd.socket = context.wrap_socket(self.httpd.socket, server_side=True)
            self.log('info', "SSL successfully configured")
        except ssl.SSLError as e:
            self.log('error', f"SSL configuration error: {str(e)}")
            raise

    def shutdown_server(self):
        """Shutdown the OAuth server"""
        if not self.httpd:
            return False
            
        self.log('info', "Shutting down OAuth server...")
        try:
            self.httpd.shutdown()
            self.httpd.server_close()
            if self.server_thread and self.server_thread.is_alive():
                self.server_thread.join(timeout=5)
            
            # Clean up
            if self.timeout_timer:
                self.timeout_timer.cancel()
                
            self.httpd = None
            self.server_thread = None
            self.timeout_timer = None
            
            self.log('info', "OAuth server has been shut down")
            return True
        except Exception as e:
            self.log('error', f"Error shutting down server: {str(e)}")
            return False
