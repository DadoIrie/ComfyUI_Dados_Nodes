# ComfyUI Dados Nodes

A collection of custom nodes for ComfyUI featuring AI vision models, advanced text processing tools, and wildcard prompt utilities.

## Features

### 🤖 AI Vision Models
- **SmolVLM Node** - Lightweight multimodal model for image description and analysis
- **JoyTagger** - Advanced image tagging with customizable tag counts
- **MiaoshouAI Tagger** - Florence-2 based prompt generation and captioning

### 📝 Text Processing
- **Dynamic Text Concatenate** - Flexible text combination with custom delimiters
- **Text DropDown** - Interactive dropdown selections with random options
- **Multiline String** - Simple multiline text input handling

### 🎲 Wildcard System
- **Wildcard Prompt Editor** - Advanced wildcard editing with nested selections
- **Wildcards Processor** - Process wildcards with seed control and attention support

## Installation

### Option 1: ComfyUI Manager (Recommended)
Simply search for "Dados Nodes" in ComfyUI Manager and install.

### Option 2: Manual Installation
1. Navigate to your ComfyUI custom nodes directory:
   ```bash
   cd ComfyUI/custom_nodes/
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/dadoirie/ComfyUI_Dados_Nodes.git
   ```

3. Install dependencies:
   ```bash
   cd ComfyUI_Dados_Nodes
   pip install -r requirements.txt
   ```

4. Restart ComfyUI

## Node Details

### SmolVLM Image Describer
- Supports multiple model sizes (256M, 500M)
- Both SmolVLM and SmolVLM2 variants available
- Automatic model downloading from HuggingFace
- Customizable prompts and token limits

### JoyTagger
- High-quality image tagging
- Adjustable tag count (1-100)
- Automatic model downloading
- Clean tag processing and formatting

### MiaoshouAI Tagger
- Multiple instruction types: GENERATE_TAGS, CAPTION, DETAILED_CAPTION
- Florence-2 base and large models
- Version 1.5 and 2.0 support
- Configurable token limits

### Wildcards Processor
- Seed-based randomization
- Attention generator support
- Compatible with dynamic prompts syntax
- Deterministic results with same seed

### Wildcard Prompt Editor
- Interactive web-based editor
- Nested wildcard support
- Real-time preview
- Selection persistence

## Requirements

- [dynamicprompts](https://github.com/adieyal/dynamicprompts) - For wildcard processing functionality

## Model Storage

Models are automatically downloaded to:
```
ComfyUI_Dados_Nodes/models/
├── smolvlm-256m-instruct/
├── smolvlm-500m-instruct/
├── smolvlm2-256m-video-instruct/
├── smolvlm2-500m-video-instruct/
├── florence-2-base-promptgen-v1.5/
├── florence-2-large-promptgen-v1.5/
├── florence-2-base-promptgen-v2.0/
├── florence-2-large-promptgen-v2.0/
└── joytag/
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/dadoirie/ComfyUI_Dados_Nodes).

---

**Note**: This project is actively developed. Some features may change between versions.