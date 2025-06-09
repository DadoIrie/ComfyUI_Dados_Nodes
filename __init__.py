# flake8: noqa: E402
# pylint: disable=wrong-import-position
import os
from server import PromptServer  # type: ignore pylint: disable=import-error

# Define core constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXTENSION_NAME = os.path.basename(BASE_DIR)
MESSAGE_ROUTE = "/dadosNodes"

class Constants:
    @property
    def BASE_DIR(self):
        return BASE_DIR

constants = Constants()

# Define web directories
WEB_DIRECTORY = "./web/comfyui"
COMMON_DIRECTORY = "./web/common"


# Import node definitions
# from .nodes.inactive_pinterest_image import inactivePinterestImageNode
from .nodes.DN_MultilineString import DN_MultilineString
from .nodes.DN_TextConcatenateNode import DN_TextConcatenateNode
from .nodes.DN_TextDropDownNode import DN_TextDropDownNode
from .nodes.DN_WildcardPromptEditorNode import DN_WildcardPromptEditorNode
from .nodes.DN_WildcardsProcessor import DN_WildcardsProcessor
from .nodes.DN_SmolVLMNode import DN_SmolVLMNode
# from .nodes.pinterest_fetch import PinterestFetch
from .nodes.DN_MiaoshouAITaggerNode import DN_MiaoshouAITaggerNode
from .nodes.DN_JoyTaggerNode import DN_JoyTaggerNode

# Node class mappings
NODE_CLASS_MAPPINGS = {
    # "inactivePinterestImageNode": inactivePinterestImageNode,
    "DN_MultilineString": DN_MultilineString,
    "DN_TextConcatenateNode": DN_TextConcatenateNode,
    "DN_TextDropDownNode": DN_TextDropDownNode,
    "DN_WildcardPromptEditorNode": DN_WildcardPromptEditorNode,
    "DN_WildcardsProcessor": DN_WildcardsProcessor,
    "DN_SmolVLMNode": DN_SmolVLMNode,
    # "PinterestFetch": PinterestFetch,
    "DN_MiaoshouAITaggerNode": DN_MiaoshouAITaggerNode,
    "DN_JoyTaggerNode": DN_JoyTaggerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # "inactivePinterestImageNode": "Pinterest Node (WIP - broken)",
    "DN_MultilineString": "Multiline String",
    "DN_TextConcatenateNode": "Dynamic Text Concatenate",
    "DN_TextDropDownNode": "Text DropDown",
    "DN_WildcardPromptEditorNode": "Wildcard Prompt Editor",
    "DN_WildcardsProcessor": "Wildcards Processor",
    "DN_SmolVLMNode": "SmolVLM Image Describer",
    # "PinterestNode": "Pinterest Node",
    "DN_MiaoshouAITaggerNode": "MiaoshouAI Tagger",
    "DN_JoyTaggerNode": "JoyTagger",
}

from .utils.api_routes import register_routes
register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
