import json
import random
import time
import contextlib
import io

# ! import for the code for research image resolutions purposes
# from collections import defaultdict

from PIL import Image
import torch
import numpy as np
import requests
from aiohttp import web

from py3pin.Pinterest import Pinterest
from py3pin.RequestBuilder import RequestBuilder

from server import PromptServer  # type: ignore pylint: disable=import-error
import comfy.model_management  # type: ignore pylint: disable=import-error
from .. import constants

def interrupt_processing(value=True):
    comfy.model_management.interrupt_current_processing(value)

def pil2tensor(image):
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)

def get_data(data, *keys):
    return tuple(data.get(key) for key in keys)

@contextlib.contextmanager
def suppress_specific_output():
    temp_stdout = io.StringIO()
    with contextlib.redirect_stdout(temp_stdout):
        yield
    output = temp_stdout.getvalue()
    filtered_output = '\n'.join([line for line in output.split('\n')
                                 if not (line.startswith("No credentials stored [Errno 21] Is a directory:")
                                         and "/.cred_root" in line)])
    print(filtered_output, end='')

def check_user_exists(pinterest, username, unique_id):
    """ USER_RESOURCE = "https://www.pinterest.com/_ngjs/resource/UserResource/get/"
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
            PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                "operation": "user_not_found",
                "message": "User not found. Please check the username."
            })
        return False """
    return True

class inactivePinterestImageNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "username": ("STRING", {"default": "", "multiline": False}),
                # "image_output": (["fixed", "chaotic draw", "circular shuffle"], {"default": "chaotic draw"}),
                # "api_requests": (["cached", "live"], {"default": "live"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)

    FUNCTION = "get_random_pinterest_image"
    CATEGORY = "Dado's Nodes/inactiveWIP"

    board = {}
    critical_response = None
    inputs = {}

    def __init__(self):
        self.pinterest = None
        self.last_image_url = {
            "img_tensor": None,
            "image_url": None,
            "metadata": None,
        }
        self.req_builder = RequestBuilder()

    @classmethod
    def update_board_name(cls, node_id, board):
        if node_id not in cls.board:
            cls.board[node_id] = {}
        cls.board[node_id]['board'] = board

    @classmethod
    def update_inputs(cls, node_id, username):
        print(f"Updating inputs for node ID: {node_id}")
        if node_id not in cls.inputs:
            cls.inputs[node_id] = {}
        print(f"Updating {username} for node ID: {node_id}")
        cls.inputs[node_id]['username'] = username

    def get_random_pinterest_image(self, username, unique_id):
        PromptServer.instance.send_sync(f'/dadosNodes/inactivePinterestNode/{unique_id}', {
            "operation": "get_inputs",
            "node_id": unique_id,
            "message": "NODE FUNCTION CALLED FROM OLD PIN NODE"
        })
        # ! critical deal-breaker setting the username to None - definitely a NO-NO
        # username = None
        print("inactivePinterestImageNode.critical_response", inactivePinterestImageNode.critical_response)
        print("inactivePinterestImageNode.inputs", inactivePinterestImageNode.inputs)
        if int(unique_id) not in inactivePinterestImageNode.inputs or not inactivePinterestImageNode.inputs[int(unique_id)]:
            PromptServer.instance.send_sync(f'/dadosNodes/inactivePinterestNode/{unique_id}', {
                "operation": "get_inputs",
                "node_id": unique_id
            })

            """ for _ in range(100):
                if inactivePinterestImageNode.critical_response:
                    break
                time.sleep(0.05)
            
            if inactivePinterestImageNode.critical_response:
                username = inactivePinterestImageNode.critical_response
                inactivePinterestImageNode.critical_response = None

                if username == 'No username input provided':
                    PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                        "operation": "user_not_found",
                        "message": username
                    })
                    interrupt_processing(True)
                    return (None,) """
                
            """ for _ in range(100):
                if int(unique_id) in inactivePinterestImageNode.inputs:
                    break
                time.sleep(0.05)
            if int(unique_id) not in inactivePinterestImageNode.inputs:
                raise ValueError("no inputs found")
            
        username = inactivePinterestImageNode.inputs.get(int(unique_id), {}).get('username') """
        print(f"username: {username}")

        if not username:
            PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                "operation": "user_not_found",
                "message": "No username input provided."
            })
            # raise ValueError("No username input provided")
            interrupt_processing(True)
            return (None,)
        
        cred_root = constants.BASE_DIR + "/.cred_root"
        if self.pinterest is None:
            with suppress_specific_output():
                self.pinterest = Pinterest(username=username, cred_root=cred_root)

        if not check_user_exists(self.pinterest, username, unique_id):
            interrupt_processing(True)
            return (None,)

        """ if image_output == "fixed" and self.last_image_url["img_tensor"] is not None:
            PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                "operation": "result",
                "result": {
                    "board": inactivePinterestImageNode.board[int(unique_id)],
                    "image_url": self.last_image_url["image_url"]}
            })
            return (self.last_image_url["img_tensor"],) """

        if int(unique_id) not in inactivePinterestImageNode.board or not inactivePinterestImageNode.board[int(unique_id)]:
            print(f"requesting selected board name for {unique_id} node")
            PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                "operation": "get_selected_board",
                "node_id": unique_id
            })

            for _ in range(100):
                if int(unique_id) in inactivePinterestImageNode.board:
                    break
                time.sleep(0.05)

            if int(unique_id) not in inactivePinterestImageNode.board:
                raise ValueError("no board name found")

        board = inactivePinterestImageNode.board[int(unique_id)]['board']

        print(f"Processing node with unique_id: {unique_id}")
        print("cred_root folder: ", cred_root)

        print(f"All board name: {inactivePinterestImageNode.board}")

        print(f"Getting random Pinterest image from board '{board}' for user '{username}'")

        with suppress_specific_output():
            self.pinterest = Pinterest(username=username, cred_root=cred_root)

        pins = []
        boards = self.pinterest.boards(username=username)

        if board == "all":
            batch = self.pinterest.get_user_pins(username=username)
            while batch:
                pins.extend([pin for pin in batch if 'images' in pin and '474x' in pin['images']])
                batch = self.pinterest.get_user_pins(username=username)

            # ! research image resolutions
            """ keysCount = {'boardsResponse': defaultdict(int), 'pinResponse': defaultdict(int)}
            pin_count = 0
            for pin in pins:
                pin_count += 1
                print(f"Processing pin {pin_count}")
                
                for key in pin.get('images', {}).keys():
                    keysCount['boardsResponse'][key] += 1
                
                pin_id = pin.get('id')
                if pin_id:
                    pin_response = self.pinterest.load_pin(pin_id=pin_id)
                    for key in pin_response.keys():
                        if key.startswith('imageSpec'):
                            keysCount['pinResponse'][key] += 1
            
            print(f"\nTotal pins processed: {pin_count}")
            
            # Print results
            print("\nBOARD:")
            for key, count in keysCount['boardsResponse'].items():
                print(f"{key} {count}")
            
            print("\nPIN:")
            for key, count in keysCount['pinResponse'].items():
                print(f"{key} {count}") """

        else:
            target_board = next(
                (board_item for board_item in boards if board_item['name'].lower() == board.lower()), None)
            if not target_board:
                raise ValueError(
                    f"Board '{board}' not found for user '{username}'")
            pins = [pin for pin in self.pinterest.board_feed(
                board_id=target_board['id']) if 'images' in pin and '474x' in pin['images']]
        if not pins:
            raise ValueError(
                f"No pins found for the selected board(s) board: {board}")

        while True:
            random_pin = random.choice(pins)
            if not random_pin.get('is_video', False):
                break
        image_url = random_pin['images']['474x']['url']

        """ # ! code for research purposes
        matching_pin = None
        for pin in pins:
            if pin is not None and isinstance(pin, dict):
                native_creator = pin.get('native_creator', {})
                if isinstance(native_creator, dict) and native_creator.get('type') != 'user':
                    matching_pin = pin
                    break

        if matching_pin:
            print(json.dumps(matching_pin, indent=2)) """

        if image_url:
            response = requests.get(image_url, timeout=30)
            img = Image.open(io.BytesIO(response.content))
            img_tensor = pil2tensor(img)

            # might be useful later
            metadata = json.dumps(random_pin, indent=2)
            # print(metadata)

            PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(unique_id), {
                "operation": "result",
                "result": {
                    "board": board,
                    "image_url": image_url}
            })
            self.last_image_url = {
                "img_tensor": img_tensor,
                "image_url": image_url,
                "metadata": metadata,
            }

            return (img_tensor,)

        raise ValueError("No suitable image URL found in the pin data")

    @classmethod
    def IS_CHANGED(cls):
        return random.randint(1, 1000000)

@PromptServer.instance.routes.post('/dadosNodes/inactivePinterestNode/')
async def api_pinterest_router(request):
    data = await request.json()
    
    # Extract the new structure
    id = data.get('id')
    operation = data.get('operation')
    payload = data.get('payload', {})
    
    # Extract username from payload
    username = payload.get('username')
    
    # Handle operations
    if operation == 'get_user_boards':
        print(f"Getting Boards from Pinterest username: {username}")
        node_id = id  # Now using the id from the new structure
        with suppress_specific_output():
            pinterest = Pinterest(username=username, cred_root=constants.BASE_DIR + "/.cred_root")
        user_exists = check_user_exists(pinterest, username, node_id)
        if not user_exists:
            interrupt_processing(True)
            return web.json_response({"error": "user not found"}, status=404)
        PromptServer.instance.send_sync('/dadosNodes/inactivePinterestNode/' + str(node_id), {
            "operation": "user_found",
            "message": "user found",
        })
        boards = pinterest.boards(username=username)
        board_names = ["all"] + [board['name'] for board in boards]
        return web.json_response({"board_names": board_names})

    if operation == 'update_selected_board_name':
        board = payload.get('board')
        username = payload.get('username')
        node_id = id  # Now using the id from the new structure
        print(f"Updating board for {username}: {board} (Node ID: {node_id})")
        inactivePinterestImageNode.update_board_name(node_id, board)
        return web.json_response({"status": "success", "board": board})
    
    if operation == 'update_backend_inputs':
        username = data.get('username')
        node_id = data.get('node_id')
        print(f"Updating username {username} (Node ID: {node_id})")
        inactivePinterestImageNode.update_inputs(node_id, username)
        return web.json_response({"status": "success"})
    
    if operation == 'common_test':
        message = data.get('message')
        print(f"Received message: {message}")
        return web.json_response({"status": "success", "reply": "you got it"})
    
    if operation == 'critical_response':
        message = payload.get('message')
        print(f"Received message: {message}")
        inactivePinterestImageNode.critical_response = message
        return web.json_response({"status": "success", "reply": "you got it"})

    return web.json_response({"error": "Unknown operation"}, status=400)