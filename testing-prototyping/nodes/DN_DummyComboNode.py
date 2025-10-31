class DN_DummyComboNode:
    PROVIDERS = ["Groq", "Chutes", "OpenAI"]
    GROQ_MODELS = [
        "llama-3.1-8b-instant",
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "moonshotai/kimi-k2-instruct-0905"
    ]
    CHUTES_MODELS = [
        "zai-org/GLM-4.5-Air",
        "zai-org/GLM-4.5-FP8",
        "meta-llama/Llama-3.3-70B-Instruct",
        "Qwen/Qwen2.5-72B-Instruct",
        "unsloth/gemma-3-4b-it",
        "unsloth/gemma-3-12b-it",
        "unsloth/gemma-3-27b-it",
        "unsloth/Mistral-Small-24B-Instruct-2501",
        "deepseek-ai/DeepSeek-V3-0324",
        "deepseek-ai/DeepSeek-R1",
        "NousResearch/DeepHermes-3-Llama-3-8B-Preview",
        "NousResearch/DeepHermes-3-Mistral-24B-Preview",
        "NousResearch/Hermes-4-14B",
        "NousResearch/Hermes-4-70B",
        "cognitivecomputations/Dolphin3.0-Mistral-24B"
    ]
    OPENAI_MODELS = [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-3.5-turbo"
    ]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "provider": (cls.PROVIDERS, {"default": "Groq"}),
                "model": ([""], {"dynamic": True}),  # This will be dynamically populated by JS
                "text_input": ("STRING", {"forceInput": True, "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "execute"
    CATEGORY = "Dado's Nodes/Dummy"

    def execute(self, provider, model, text_input):
        # This is a dummy node, so it just returns a string with the selected values
        return (f"Provider: {provider}, Model: {model}, Text: {text_input}",)