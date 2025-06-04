# flake8: noqa: E402
# pylint: disable=wrong-import-position
import os
from server import PromptServer  # type: ignore pylint: disable=import-error

# Define core constants
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXTENSION_NAME = "ComfyUI_Dados_Nodes"
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
from .nodes.text_concat import TextConcatenatorNode
from .nodes.text_dropdown import TextDropDownNode
from .nodes.text_loader import DynamicTextLoaderNode
from .nodes.smolvlm_node import SmolVLMNode
from .nodes.pinterest_fetch import PinterestFetch
from .nodes.miaoshouai_tagger import MiaoshouAITaggerNode
from .nodes.multiline_string import DadosMultilineString
from .nodes.joytagger_node import JoyTaggerNode
from .nodes.wildcard_selector import WildcardSelectorNode
from .nodes.dn_wildcards_processor import DN_wildcards_processor

# Node class mappings
NODE_CLASS_MAPPINGS = {
    # "inactivePinterestImageNode": inactivePinterestImageNode,
    "TextConcatenatorNode": TextConcatenatorNode,
    "TextDropDownNode": TextDropDownNode,
    "DynamicTextLoaderNode": DynamicTextLoaderNode,
    "SmolVLMNode": SmolVLMNode,
    "PinterestFetch": PinterestFetch,
    "MiaoshouAITaggerNode": MiaoshouAITaggerNode,
    "DadosMultilineString": DadosMultilineString,
    "DadosJoyTaggerNode": JoyTaggerNode,
    "WildcardSelectorNode": WildcardSelectorNode,
    "DN_wildcards_processor": DN_wildcards_processor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # "inactivePinterestImageNode": "Pinterest Node (WIP - broken)",
    "TextConcatenatorNode": "Text Concatenator",
    "TextDropDownNode": "Text DropDown",
    "DynamicTextLoaderNode": "Dynamic Text Loader",
    "SmolVLMNode": "SmolVLM Image Describer",
    "PinterestNode": "Pinterest Node",
    "MiaoshouAITaggerNode": "MiaoshouAI Tagger",
    "DadosMultilineString": "Multiline String",
    "DadosJoyTaggerNode": "JoyTagger",
    "WildcardSelectorNode": "Wildcard Selector",
    "DN_wildcards_processor": "Wildcards Processor",
}

from .utils.api_routes import register_routes
register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
