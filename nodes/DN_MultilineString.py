class DN_MultilineString:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "process_text"
    CATEGORY = "Dado's Nodes/Text & Prompt"

    def process_text(self, text):
        return (text,)