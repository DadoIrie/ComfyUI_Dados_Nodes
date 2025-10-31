import base64
import io
from PIL import Image
from groq import Groq

_GROQ_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "moonshotai/kimi-k2-instruct-0905"
]

_VISION_MODELS_GROQ = [
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "meta-llama/llama-4-scout-17b-16e-instruct"
]

class DN_GroqLLMNode:
    GROQ_MODELS = _GROQ_MODELS
    VISION_MODELS = _VISION_MODELS_GROQ

    MODEL_OPTIONS = [
        f"{model} (Vision)" if model in _VISION_MODELS_GROQ else model
        for model in _GROQ_MODELS
    ]

    def _image_to_base64_data_url(self, image_tensor):
        """Convert ComfyUI image tensor to base64 data URL for API"""
        arr = (image_tensor[0].cpu().numpy() * 255).clip(0, 255).astype('uint8')

        pil_image = Image.fromarray(arr)

        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()

        base64_string = base64.b64encode(image_bytes).decode("utf-8")

        return f"data:image/png;base64,{base64_string}"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "system": ("STRING", {"default": "", "multiline": True}),
                "user": ("STRING", {"default": "", "multiline": True}),
                "model": (cls.MODEL_OPTIONS, {"default": "openai/gpt-oss-20b"}),
            },
            "optional": {
                "image": ("IMAGE",),
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.1}),
                "max_tokens": ("INT", {"default": 4056, "min": 1, "max": 20000, "step": 1}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("thinking", "response")

    FUNCTION = "generate_response"
    CATEGORY = "Dado's Nodes"

    def generate_response(self, system, user, model, image=None, temperature=0.7, max_tokens=4056):
        # Strip labels for API compatibility
        model = model.replace(" (Vision)", "")

        # Build the message structure
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]

        # If this is a vision model and image is provided, include it in user content
        if model in self.VISION_MODELS and image is not None:
            image_data_url = self._image_to_base64_data_url(image)
            messages = [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": image_data_url}}
                    ]
                }
            ]

        # Use Groq API
        client = Groq(api_key="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")

        # Make the API call (non-streaming for simplicity)
        completion = client.chat.completions.create(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False
        )

        response = completion.choices[0].message.content.strip()

        # Groq models don't use thinking tags, return response directly
        return ("", response)