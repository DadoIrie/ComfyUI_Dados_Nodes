import concurrent.futures
import time

class DN_ChutesParallelImageNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "parallel_1": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_2": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_3": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_4": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_5": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_6": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_7": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_8": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_9": ("CHUTES_IMG_PARALLEL", {}),
                "parallel_10": ("CHUTES_IMG_PARALLEL", {}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("image_1", "image_2", "image_3", "image_4", "image_5", "image_6", "image_7", "image_8", "image_9", "image_10")
    FUNCTION = "execute_calls"
    CATEGORY = "Dado's Nodes/Chutes"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Force re-execution by returning current time
        return time.time()

    def execute_calls(self, **kwargs):
        handles = []
        connected_indices = []

        for i in range(1, 11):
            key = f'parallel_{i}'
            if key in kwargs and kwargs[key] is not None:
                handles.append(kwargs[key])
                connected_indices.append(i)

        if not handles:
            raise ValueError("No execution handles provided")

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(handles)) as executor:
            future_to_index = {executor.submit(handle.execute): i for i, handle in enumerate(handles)}
            results = [None] * len(handles)
            for future in concurrent.futures.as_completed(future_to_index):
                index = future_to_index[future]
                results[index] = future.result()

        result_mapping = {}
        for result_idx, input_idx in enumerate(connected_indices):
            result_mapping[input_idx] = results[result_idx][0]

        outputs = [None] * 10
        for input_idx, result in result_mapping.items():
            outputs[input_idx - 1] = result

        return tuple(outputs)