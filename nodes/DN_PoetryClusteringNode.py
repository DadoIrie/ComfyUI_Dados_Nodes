import os
import glob
from pathlib import Path
from huggingface_hub import snapshot_download
from datasets import load_dataset
from comfy_api.latest import io

from .. import constants

CATEGORIES = [
    "alone",
    "america",
    "angel",
    "anger",
    "animal",
    "baby",
    "beach",
    "beautiful",
    "beauty",
    "believe",
    "birth",
    "brother",
    "butterfly",
    "car",
    "carpediem",
    "change",
    "chicago",
    "childhood",
    "children",
    "christmas",
    "cinderella",
    "city",
    "courage",
    "crazy",
    "culture",
    "dance",
    "dark",
    "daughter",
    "death",
    "depression",
    "despair",
    "destiny",
    "dream",
    "evil",
    "faith",
    "family",
    "father",
    "fear",
    "fire",
    "food",
    "football",
    "freedom",
    "friend",
    "frog",
    "funeral",
    "funny",
    "future",
    "girl",
    "god",
    "graduation",
    "greed",
    "green",
    "hair",
    "happiness",
    "happy",
    "hate",
    "heaven",
    "hero",
    "home",
    "hope",
    "house",
    "hunting",
    "husband",
    "identity",
    "innocence",
    "january",
    "joy",
    "june",
    "justice",
    "kiss",
    "laughter",
    "life",
    "lonely",
    "loss",
    "lost",
    "love",
    "lust",
    "marriage",
    "memory",
    "mirror",
    "money",
    "moon",
    "mother",
    "murder",
    "music",
    "nature",
    "night",
    "ocean",
    "paris",
    "passion",
    "peace",
    "pink",
    "poem",
    "poetry",
    "poverty",
    "power",
    "racism",
    "rain",
    "rainbow",
    "red",
    "remember",
    "respect",
    "river",
    "romance",
    "romantic",
    "rose",
    "running",
    "school",
    "sea",
    "sick",
    "silver",
    "sister",
    "sky",
    "sleep",
    "snake",
    "soldier",
    "sometimes",
    "son",
    "song",
    "sorrow",
    "spring",
    "star",
    "success",
    "suicide",
    "summer",
    "sun",
    "swimming",
    "sympathy",
    "teacher",
    "thanks",
    "time",
    "today",
    "together",
    "travel",
    "trust",
    "truth",
    "war",
    "warning",
    "water",
    "weather",
    "wedding",
    "winter",
    "work",
    "world"
]

class DN_PoetryClusteringNode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DN_PoetryClusteringNode",
            display_name="Poetry Clustering",
            category="Dado's Nodes/Text & Prompt",
            description="Downloads the English Poetry Topic Clustering dataset locally and extracts a random text block.",
            inputs=[
                io.Combo.Input(
                    "category",
                    options=CATEGORIES,
                    default="alone",
                    tooltip="Select a topic cluster to pull text from"
                ),
                io.Int.Input(
                    "seed",
                    default=0,
                    min=0,
                    max=0xFFFFFFFFFFFFFFFF,
                    tooltip="Seed for deterministic selection",
                ),
            ],
            outputs=[
                io.String.Output(display_name="text_block"),
            ],
        )

    @classmethod
    def execute(cls, category, seed):
        dataset_dir = Path(constants.BASE_DIR) / "datasets" / "EnglishPoetryTopicClustering"
        dataset_dir.mkdir(parents=True, exist_ok=True)
        
        repo_id = "PoetryMTEB/EnglishPoetryTopicClustering"
        
        local_path = snapshot_download(
            repo_id=repo_id,
            local_dir=str(dataset_dir),
            repo_type="dataset",
            local_dir_use_symlinks=False,
        )
        
        parquet_files = glob.glob(os.path.join(local_path, "**", "*.parquet"), recursive=True)
        if not parquet_files:
            raise FileNotFoundError(f"No parquet files found in {local_path}")
            
        ds = load_dataset("parquet", data_files=parquet_files, split="train")
        
        filtered_rows = [row["poem"] for row in ds if row["label_name"] == category]
        
        if not filtered_rows:
            return io.NodeOutput("No text found for this category.")
        
        row_index = seed % len(filtered_rows)
        selected_text = filtered_rows[row_index]
        
        lines = [line.strip() for line in selected_text.split('\n') if line.strip()]
        
        if len(lines) < 4:
            text_block = " ".join(lines)
        else:
            block_index = (seed // 1000) % (len(lines) - 3)
            text_block = " ".join(lines[block_index:block_index+4])
            
        return io.NodeOutput(text_block)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return kwargs["seed"]