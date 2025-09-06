"""Handles Pinterest API calls with proper authentication"""
from typing import Optional, Dict, List, Any
from aiohttp import ClientSession
from .pinterest_token import get_token_for_node, create_auth_header

# API Base URL
PINTEREST_API_BASE = "https://api.pinterest.com/v5"

async def get_pinterest_data(node_id: str, endpoint: str, method: str = "GET", data: Optional[Dict] = None) -> Optional[Dict]:
    """
    Make a request to Pinterest API using stored token
    No need to pass app_id and app_secret as token should already be valid
    """
    # Get token from memory or file
    token_data = get_token_for_node(node_id)
    if not token_data or 'access_token' not in token_data:
        print(f"No valid token found for node {node_id}")
        return None
    
    # Create auth header from token
    headers = create_auth_header(token_data['access_token'])
    
    # Make the API request
    async with ClientSession() as session:
        request_method = getattr(session, method.lower())
        
        kwargs = {
            "headers": headers,
            "timeout": 30
        }
        
        if data and method != "GET":
            kwargs["json"] = data
            
        async with request_method(f"{PINTEREST_API_BASE}{endpoint}", **kwargs) as response:
            if response.status != 200:
                error_text = await response.text()
                print(f"Error in Pinterest API request: {error_text}")
                return None
                
            return await response.json()

async def get_user_boards(node_id: str) -> Optional[List[Dict]]:
    """Get the user's Pinterest boards"""
    data = await get_pinterest_data(node_id, "/boards")
    if not data:
        return None
    return data.get('items', [])

async def get_user_pins(node_id: str) -> Optional[List[Dict]]:
    """Get the user's Pinterest pins"""
    data = await get_pinterest_data(node_id, "/pins")
    if not data:
        return None
    return data.get('items', [])

async def get_user_account(node_id: str) -> Optional[Dict[str, Any]]:
    """Get user account information to validate token"""
    return await get_pinterest_data(node_id, "/user_account")
