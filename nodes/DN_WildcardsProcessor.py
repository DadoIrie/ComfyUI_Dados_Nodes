from pathlib import Path
from dynamicprompts.generators import RandomPromptGenerator
from dynamicprompts.wildcards import WildcardManager
from comfy_api.latest import io

from .. import constants


class DN_WildcardsProcessor(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DN_WildcardsProcessor",
            display_name="Wildcards Processor",
            category="Dado's Nodes/Text & Prompt",
            description="Process text with wildcards using dynamic prompts",
            inputs=[
                io.String.Input(
                    "text",
                    multiline=True,
                    tooltip="Text with wildcards to process",
                ),
                io.Int.Input(
                    "seed",
                    default=0,
                    min=0,
                    max=0xFFFFFFFFFFFFFFFF,
                    tooltip="Seed for wildcard randomization",
                ),
                io.Int.Input(
                    "prompts",
                    default=1,
                    min=1,
                    max=0xFFFFFFFFFFFFFFFF,
                    tooltip="Number of prompts to generate",
                ),
            ],
            outputs=[
                io.String.Output(display_name="processed_text", is_output_list=True),
                io.Int.Output(display_name="seed"),
            ],
        )

    @classmethod
    def execute(cls, text, seed, prompts):
        if not text:
            return io.NodeOutput([text], seed)

        wildcard_dir = Path(constants.USER_DATA_DIR) / "DN_Wildcards"
        wildcard_dir.mkdir(parents=True, exist_ok=True)
        wildcard_manager = WildcardManager(wildcard_dir)

        generator = RandomPromptGenerator(wildcard_manager, seed=seed)

        generated = generator.generate(text, num_images=prompts)
        processed_text = list(generated) if generated else [text]

        return io.NodeOutput(processed_text, seed)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return kwargs["seed"]