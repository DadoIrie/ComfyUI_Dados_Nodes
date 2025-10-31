import torch

class DN_ImageBatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "image_2": ("IMAGE",),
            },
            "optional": {
                "image_3": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "Dado's Nodes/Image"

    def run(self, image, image_2, image_3=None):
        images = [img for img in [image, image_2, image_3] if img is not None]

        dims = [(img.shape[1], img.shape[2]) for img in images]
        max_dims = (max(h for h, w in dims), max(w for h, w in dims))

        if all(h == max_dims[0] and w == max_dims[1] for h, w in dims):
            return (torch.cat(images, dim=0),)

        padded_images = []
        for img in images:
            h, w = img.shape[1], img.shape[2]
            if h == max_dims[0] and w == max_dims[1]:
                padded_images.append(img)
            else:
                padded = torch.zeros((img.shape[0], max_dims[0], max_dims[1], img.shape[3]), dtype=img.dtype, device=img.device)
                h_offset = (max_dims[0] - h) // 2
                w_offset = (max_dims[1] - w) // 2
                padded[:, h_offset:h_offset+h, w_offset:w_offset+w, :] = img
                padded_images.append(padded)

        return (torch.cat(padded_images, dim=0),)