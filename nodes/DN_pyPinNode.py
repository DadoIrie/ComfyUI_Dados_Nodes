import torch
import requests
import contextlib
import io

from py3pin.Pinterest import Pinterest
from .. import constants

@contextlib.contextmanager
def suppress_specific_output():
    temp_stdout = io.StringIO()
    temp_stderr = io.StringIO()
    with contextlib.redirect_stdout(temp_stdout), contextlib.redirect_stderr(temp_stderr):
        yield
    output = temp_stdout.getvalue() + temp_stderr.getvalue()
    filtered_output = '\n'.join([line for line in output.split('\n')
                                 if not (line.startswith("No credentials stored [Errno 21] Is a directory:") and ".cred_root" in line)])
    print(filtered_output, end='')

def check_user_exists(username):
    cred_root = constants.BASE_DIR + "/.cred_root"
    with suppress_specific_output():
        pinterest = Pinterest(username=username, cred_root=cred_root)

    USER_RESOURCE = "https://www.pinterest.com/_ngjs/resource/UserResource/get/"
    options = {
        "isPrefetch": "false",
        "username": username,
        "field_set_key": "profile",
    }
    try:
        url = pinterest.req_builder.buildGet(url=USER_RESOURCE, options=options)
        pinterest.get(url=url)
        return True
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error occurred: {e}")
        if e.response.status_code == 404:
            print("User not found. Please check the username.")
            return False
        return False

class DN_pyPinNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_data": ("STRING", {"default": "", "multiline": False}),
                "username": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)

    FUNCTION = "get_image"
    CATEGORY = "Dado's Nodes"

    def get_image(self, username, unique_id):
        # Barebone implementation: return minimal image
        img_tensor = torch.zeros(1, 64, 64, 3, dtype=torch.float32)
        return (img_tensor,)

    @classmethod
    def IS_CHANGED(cls):
        return True
