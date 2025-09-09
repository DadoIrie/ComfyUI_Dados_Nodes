import time
import os
from typing import Any, Dict, Optional, Callable, List
from aiohttp import web
from server import PromptServer
from ... import constants, MESSAGE_ROUTE, EXTENSION_NAME

class TimedOutException(Exception):
    """Exception raised when waiting for a message times out"""
    pass

class ComfyAPIMessage:
    """
    Message collector for node communications
    """
    MESSAGE = {}

    @classmethod
    def poll(cls, identifier, period=0.01, timeout=3) -> Any:
        """Poll for a message with the given identifier"""
        start_time = time.monotonic()
        if isinstance(identifier, (set, list, tuple)):
            identifier = identifier[0]
        index = str(identifier)
        while not (index in cls.MESSAGE) and time.monotonic() - start_time < timeout:
            time.sleep(period)
        if index in cls.MESSAGE:
            message = cls.MESSAGE.pop(index)
            return message
        else:
            raise TimedOutException

def send_message(node_id: str, operation: str, status: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
    """Send a standardized message to the frontend"""
    msg = {
        "id": node_id,
        "operation": operation,
        "status": status,
        "message": message
    }
    
    if payload is not None:
        msg["payload"] = payload
        
    print(f"Sending response to {node_id}: {operation} ({status})")
    PromptServer.instance.send_sync(MESSAGE_ROUTE, msg)


operation_handlers: List[Callable] = []

def register_operation_handler(handler_func: Callable):
    """Register a handler function for operations"""
    operation_handlers.append(handler_func)
    return handler_func

def register_routes():
    """Register all routes for the extension"""
    
    @PromptServer.instance.routes.get(MESSAGE_ROUTE)
    async def route_message_get() -> Any:
        """Returns all messages stored in the Message Bus"""
        return web.json_response(ComfyAPIMessage.MESSAGE)

    @PromptServer.instance.routes.post(MESSAGE_ROUTE)
    async def route_message_post(request) -> Any:
        """Handle incoming messages"""
        json_data = await request.json()
        node_id = json_data.get("id")
        
        if node_id and "operation" not in json_data:
            ComfyAPIMessage.MESSAGE[str(node_id)] = json_data
            return web.json_response(json_data)
        
        if "operation" in json_data:
            for handler in operation_handlers:
                response = await handler(request)
                if response is not None:
                    return response
                
        return web.json_response({"status": "success"})
    
    @PromptServer.instance.routes.get(f"/extensions/{EXTENSION_NAME}/common/{{path:.*}}")
    async def serve_common_file(request):
        path = request.match_info['path']
        BASE_DIR = constants.BASE_DIR
        COMMON_DIRECTORY = "./web/common"
        file_path = os.path.join(BASE_DIR, COMMON_DIRECTORY, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return web.FileResponse(file_path)
        return web.Response(status=404)
    
    @PromptServer.instance.routes.get("/dadosConstants")
    async def dados_constants(request):
        constants_data = {
            "EXTENSION_NAME": EXTENSION_NAME,
            "MESSAGE_ROUTE": MESSAGE_ROUTE,
        }
        return web.json_response(constants_data)
        
    print(f"All routes registered for {EXTENSION_NAME}")
