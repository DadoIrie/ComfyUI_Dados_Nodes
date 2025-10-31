# flake8: noqa: E402
# pylint: disable=wrong-import-position
import os
from server import PromptServer
import folder_paths

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USER_DATA_DIR = os.path.join(folder_paths.get_user_directory(), "DadosNodes")
EXTENSION_NAME = os.path.basename(BASE_DIR)
MESSAGE_ROUTE = "/dadosNodes"

class Constants:
    @property
    def BASE_DIR(self):
        return BASE_DIR

    @property
    def USER_DATA_DIR(self):
        return USER_DATA_DIR

constants = Constants()

WEB_DIRECTORY = "./web/comfyui"
COMMON_DIRECTORY = "./web/common"


#from .nodes.inactive_pinterest_image import inactivePinterestImageNode
from .nodes.DN_MultilineString import DN_MultilineString
from .nodes.DN_TextConcatenateNode import DN_TextConcatenateNode
from .nodes.DN_TextDropDownNode import DN_TextDropDownNode
from .nodes.DN_CSVMultiDropDownNode import DN_CSVMultiDropDownNode
from .nodes.DN_WildcardPromptEditorNode import DN_WildcardPromptEditorNode
from .nodes.DN_WildcardSelectorComposerV2 import DN_WildcardSelectorComposerV2
from .nodes.DN_PromptSectionsExtractor import DN_PromptSectionsExtractor
from .nodes.DN_WildcardsProcessor import DN_WildcardsProcessor
from .nodes.DN_SmolVLMNode import DN_SmolVLMNode
# from .nodes.pinterest_fetch import PinterestFetch
from .nodes.DN_JoyTaggerNode import DN_JoyTaggerNode
from .nodes.DN_PixAITaggerNode import DN_PixAITaggerNode
from .nodes.DN_TagOpsNode import DN_TagOpsNode
from .nodes.DN_pyPinNode import DN_pyPinNode
from .nodes.DN_GroqLLMNode import DN_GroqLLMNode
from .nodes.DN_ChutesLLMNode import DN_ChutesLLMNode
from .nodes.DN_ChutesQwenImageNode import DN_ChutesQwenImageNode
from .nodes.DN_ChutesQwenImageEditNode import DN_ChutesQwenImageEditNode
from .nodes.DN_ChutesChromaImageNode import DN_ChutesChromaImageNode
from .nodes.DN_ChutesFluxImageNode import DN_ChutesFluxImageNode
from .nodes.DN_ChutesHiDreamNode import DN_ChutesHiDreamNode
from .nodes.DN_ChutesHunyuanImage3Node import DN_ChutesHunyuanImage3Node
from .nodes.DN_ChutesIllustriousNode import DN_ChutesIllustriousNode
from .nodes.DN_ChutesSDxlNode import DN_ChutesSDxlNode
from .nodes.DN_ChutesNetaLuminaNode import DN_ChutesNetaLuminaNode
from .nodes.DN_ChutesImageGenNode import DN_ChutesImageGenNode
from .nodes.DN_ChutesTextToVideoNode import DN_ChutesTextToVideoNode
from .nodes.DN_ChutesImageToVideoNode import DN_ChutesImageToVideoNode
from .nodes.DN_PreviewImage import DN_PreviewImage
from .nodes.DN_ChutesParallelImageNode import DN_ChutesParallelImageNode
from .nodes.DN_ImageBatcher import DN_ImageBatcher
from .nodes.DN_MemoryStorage import DN_MemoryStorage

from .nodes.utils.api_routes import register_routes

NODE_CLASS_MAPPINGS = {
    #"inactivePinterestImageNode": inactivePinterestImageNode,
    "DN_MultilineString": DN_MultilineString,
    "DN_TextConcatenateNode": DN_TextConcatenateNode,
    "DN_TextDropDownNode": DN_TextDropDownNode,
    "DN_CSVMultiDropDownNode": DN_CSVMultiDropDownNode,
    "DN_WildcardPromptEditorNode": DN_WildcardPromptEditorNode,
    "DN_WildcardSelectorComposerV2": DN_WildcardSelectorComposerV2,
    "DN_PromptSectionsExtractor": DN_PromptSectionsExtractor,
    "DN_WildcardsProcessor": DN_WildcardsProcessor,
    "DN_SmolVLMNode": DN_SmolVLMNode,
    # "PinterestFetch": PinterestFetch,
    "DN_JoyTaggerNode": DN_JoyTaggerNode,
    "DN_PixAITaggerNode": DN_PixAITaggerNode,
    "DN_TagOpsNode": DN_TagOpsNode,
    "DN_pyPinNode": DN_pyPinNode,
    "DN_GroqLLMNode": DN_GroqLLMNode,
    "DN_ChutesLLMNode": DN_ChutesLLMNode,
    "DN_ChutesQwenImageNode": DN_ChutesQwenImageNode,
    "DN_ChutesQwenImageEditNode": DN_ChutesQwenImageEditNode,
    "DN_ChutesChromaImageNode": DN_ChutesChromaImageNode,
    "DN_ChutesFluxImageNode": DN_ChutesFluxImageNode,
    "DN_ChutesHiDreamNode": DN_ChutesHiDreamNode,
    "DN_ChutesHunyuanImage3Node": DN_ChutesHunyuanImage3Node,
    "DN_ChutesIllustriousNode": DN_ChutesIllustriousNode,
    "DN_ChutesSDxlNode": DN_ChutesSDxlNode,
    "DN_ChutesNetaLuminaNode": DN_ChutesNetaLuminaNode,
    "DN_ChutesImageGenNode": DN_ChutesImageGenNode,
    "DN_ChutesTextToVideoNode": DN_ChutesTextToVideoNode,
    "DN_ChutesImageToVideoNode": DN_ChutesImageToVideoNode,
    "DN_PreviewImage": DN_PreviewImage,
    "DN_ChutesParallelImageNode": DN_ChutesParallelImageNode,
    "DN_ImageBatcher": DN_ImageBatcher,
    "DN_MemoryStorage": DN_MemoryStorage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    #"inactivePinterestImageNode": "Pinterest Node (WIP - broken)",
    "DN_MultilineString": "Multiline String",
    "DN_TextConcatenateNode": "Dynamic Text Concatenate",
    "DN_TextDropDownNode": "Text DropDown",
    "DN_CSVMultiDropDownNode": "CSV MultiDropDown",
    "DN_WildcardPromptEditorNode": "Wildcard Prompt Editor (deprecation pending)",
    "DN_WildcardSelectorComposerV2": "Wildcard Selector/Composer",
    "DN_PromptSectionsExtractor": "Prompt Sections Extractor",
    "DN_WildcardsProcessor": "Wildcards Processor",
    "DN_SmolVLMNode": "SmolVLM Image Describer",
    # "PinterestNode": "Pinterest Node",
    "DN_JoyTaggerNode": "JoyTagger",
    "DN_PixAITaggerNode": "PixAI Tagger",
    "DN_TagOpsNode": "TagOps",
    "DN_pyPinNode": "PyPin Node",
    "DN_GroqLLMNode": "Groq LLM",
    "DN_ChutesLLMNode": "Chutes LLM",
    "DN_ChutesQwenImageNode": "Chutes Qwen Image Generator",
    "DN_ChutesQwenImageEditNode": "Chutes Qwen Image Editor",
    "DN_ChutesChromaImageNode": "Chutes Chroma Image Generator",
    "DN_ChutesFluxImageNode": "Chutes FLUX Image Generator",
    "DN_ChutesHiDreamNode": "Chutes HiDream Image Generator",
    "DN_ChutesHunyuanImage3Node": "Chutes Hunyuan Image 3 Generator",
    "DN_ChutesIllustriousNode": "Chutes Illustrious Image Generator",
    "DN_ChutesSDxlNode": "Chutes SDXL Image Generator",
    "DN_ChutesNetaLuminaNode": "Chutes Neta Lumina Generator",
    "DN_ChutesImageGenNode": "Chutes Image Generation",
    "DN_ChutesTextToVideoNode": "Chutes Text-to-Video Generator",
    "DN_ChutesImageToVideoNode": "Chutes Image-to-Video Generator",
    "DN_PreviewImage": "Preview Image (Dados Nodes)",
    "DN_ChutesParallelImageNode": "Chutes Parallel Image Generator",
    "DN_ImageBatcher": "Image Batcher",
    "DN_MemoryStorage": "Memory Storage",
}

register_routes()

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
