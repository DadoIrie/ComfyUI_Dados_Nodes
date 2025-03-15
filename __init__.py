# flake8: noqa: E402
# pylint: disable=wrong-import-position
import os
from aiohttp import web
from server import PromptServer  # type: ignore pylint: disable=import-error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Constants:
    @property
    def BASE_DIR(self):
        return BASE_DIR

constants = Constants()

from .nodes.pinterest_image import PinterestImageNode
from .nodes.text_concat import TextConcatenatorNode
from .nodes.text_dropdown import TextDropDownNode
from .nodes.text_loader import DynamicTextLoaderNode
from .nodes.smolvlm_node import SmolVLMNode

NODE_CLASS_MAPPINGS = {
    "PinterestImageNode": PinterestImageNode,
    "TextConcatenatorNode": TextConcatenatorNode,
    "TextDropDownNode": TextDropDownNode,
    "DynamicTextLoaderNode": DynamicTextLoaderNode,
    "SmolVLMNode": SmolVLMNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PinterestImageNode": "Pinterest Node (WIP)",
    "TextConcatenatorNode": "Text Concatenator",
    "TextDropDownNode": "Text DropDown",
    "DynamicTextLoaderNode": "Dynamic Text Loader",
    "SmolVLMNode": "SmolVLM Image Describer",
}
WEB_DIRECTORY = "./web/comfyui"
COMMON_DIRECTORY = "./web/common"

# Add routes for serving the common directory
# might be useful later on
def add_routes():
    @PromptServer.instance.routes.get("/extensions/ComfyUI_Dados_Nodes/common/{path:.*}")
    async def serve_common_file(request):
        path = request.match_info['path']
        file_path = os.path.join(BASE_DIR, COMMON_DIRECTORY, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return web.FileResponse(file_path)
        return web.Response(status=404)

add_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
