from pathlib import Path

import numpy as np
from huggingface_hub import snapshot_download
from comfy_api.latest import io

from .. import constants


# Lazy caches, filled on first run (module-level: V3 locks class attributes)
_ABSTRACT_COLLISION_KV = None
_ABSTRACT_COLLISION_POOLS = {}


class DN_AbstractCollisionNode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DN_AbstractCollisionNode",
            display_name="Abstract Collision",
            category="Dado's Nodes/Text & Prompt",
            description=(
                "Draws two unrelated words from GloVe, finds bridge words between them "
                "(pushed toward the theme and away from cliche words), and builds an "
                "instruction for an LLM to write an abstract visual concept sentence."
            ),
            inputs=[
                io.String.Input(
                    "theme",
                    default="surrender",
                    tooltip="Underlying theme. Steers the bridge words; the LLM must convey it without writing the word.",
                ),
                io.String.Input(
                    "banned_words",
                    multiline=True,
                    default=(
                        "ethereal, cosmic, celestial, eternal, whisper, dance, tapestry, symphony, "
                        "journey, golden, glow, dreamy, passion, seductive, alluring, sensual, "
                        "breath, exhale, gasp, shiver, tremble"
                    ),
                    tooltip="Comma separated. Forbidden in the LLM output and subtracted from the bridge search.",
                ),
                io.Float.Input(
                    "max_similarity",
                    default=0.05,
                    min=-0.2,
                    max=0.5,
                    step=0.01,
                    tooltip="Seed pair must score below this cosine similarity. Lower = more unrelated.",
                ),
                io.Int.Input(
                    "vocab_start",
                    default=3000,
                    min=0,
                    max=100000,
                    tooltip="Skip the most common N words.",
                ),
                io.Int.Input(
                    "vocab_end",
                    default=30000,
                    min=1000,
                    max=400000,
                    tooltip="Ignore everything rarer than this rank.",
                ),
                io.Boolean.Input(
                    "nouns_only",
                    default=True,
                    tooltip="Filter the pool to WordNet nouns (needs nltk, falls back silently).",
                ),
                io.Int.Input(
                    "seed",
                    default=0,
                    min=0,
                    max=0xFFFFFFFFFFFFFFFF,
                    control_after_generate=True,
                    tooltip="Seed for deterministic selection",
                ),
            ],
            outputs=[
                io.String.Output(display_name="llm_instruction"),
            ],
        )

    @classmethod
    def _load_vectors(cls):
        global _ABSTRACT_COLLISION_KV
        if _ABSTRACT_COLLISION_KV is None:
            from gensim.models import KeyedVectors

            model_dir = Path(constants.BASE_DIR) / "embedding_models" / "glove-wiki-gigaword-100"
            model_dir.mkdir(parents=True, exist_ok=True)

            repo_id = "fse/glove-wiki-gigaword-100"
            model_file = "glove-wiki-gigaword-100.model"

            local = snapshot_download(
                repo_id=repo_id,
                local_dir=str(model_dir),
                repo_type="model",
            )
            _ABSTRACT_COLLISION_KV = KeyedVectors.load(str(Path(local) / model_file))
        return _ABSTRACT_COLLISION_KV

    @classmethod
    def _word_pool(cls, kv, start, end, nouns_only):
        global _ABSTRACT_COLLISION_POOLS
        key = (start, end, nouns_only)
        if key not in _ABSTRACT_COLLISION_POOLS:
            words = [w for w in kv.index_to_key[start:end] if w.isalpha() and len(w) > 3]
            if nouns_only:
                try:
                    from nltk.corpus import wordnet as wn

                    try:
                        wn.synsets("test")
                    except LookupError:
                        import nltk

                        nltk.download("wordnet", quiet=True)
                    words = [w for w in words if wn.synsets(w, pos="n")]
                except Exception:
                    pass  # no nltk/wordnet: keep the unfiltered pool
            _ABSTRACT_COLLISION_POOLS[key] = words
        return _ABSTRACT_COLLISION_POOLS[key]

    @classmethod
    def execute(cls, theme, banned_words, max_similarity,
                vocab_start, vocab_end, nouns_only, seed):
        kv = cls._load_vectors()

        def pick(count, prime):
            # Deterministic index derived from the seed itself
            return (seed * prime) % count

        def mean_vec(words):
            vecs = [kv[w] for w in words if w in kv]
            return np.mean(vecs, axis=0) if vecs else None

        banned = [
            w.strip().lower()
            for w in banned_words.replace("\n", ",").split(",")
            if w.strip()
        ]
        theme_words = theme.lower().replace(",", " ").split()

        pool = [
            w for w in cls._word_pool(kv, vocab_start, vocab_end, nouns_only)
            if w not in theme_words
        ]
        if len(pool) < 2:
            raise ValueError("Word pool is empty. Widen vocab_start/vocab_end.")

        # Two unrelated seed words: a comes straight from the seed, b is the
        # first word after a seed-derived offset that is unrelated enough to a
        n = len(pool)
        a = pool[seed % n]
        start = pick(n, 7919)
        b, best = None, 2.0
        for step in range(n):
            word = pool[(start + step) % n]
            if word == a:
                continue
            sim = kv.similarity(a, word)
            if sim < best:
                b, best = word, sim
            if sim < max_similarity:
                break

        # Bridge words: midpoint + theme - cliche
        mid = (kv[a] + kv[b]) / 2
        theme_v = mean_vec(theme_words)
        cliche_v = mean_vec(banned)
        if theme_v is not None:
            mid = mid + 0.5 * theme_v
        if cliche_v is not None:
            mid = mid - 0.5 * cliche_v

        pool_set = set(pool)
        candidates = [
            w for w, _ in kv.similar_by_vector(mid, topn=80)
            if w in pool_set and w not in (a, b) and w not in banned
        ][:25]
        m = len(candidates)
        if m >= 2:
            i = pick(m, 104729)
            j = (i + 1 + pick(m - 1, 1299709)) % m
            bridge = [candidates[i], candidates[j]]
        else:
            bridge = candidates


        never_use = ", ".join(dict.fromkeys([a, b] + bridge + theme_words + banned))
        hints = ", ".join(bridge) if bridge else "none"
        instruction = (
            f"Write one sentence of under 25 words describing an abstract visual "
            f"in which {a} and {b} collide. Use {hints} only as hints for what "
            f"connects them. Convey the theme '{theme}' through what is physically "
            f"shown, never by writing the word itself. "
            f"Never use any of these words in your output: {never_use}. "
            f"No colors, no people, no named objects. "
            f"Output only the sentence."
        )

        return io.NodeOutput(instruction)

    @classmethod
    def fingerprint_inputs(cls, **kwargs):
        return kwargs["seed"]