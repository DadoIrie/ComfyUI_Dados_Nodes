import torch
import requests
import contextlib
import io
import json
import random
from PIL import Image
import numpy as np

from py3pin.Pinterest import Pinterest
from .. import constants
from .utils.api_routes import register_operation_handler
from aiohttp import web

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

def get_board_sections(pinterest, board_id, sections_map):
    sections = []
    section_batch = pinterest.get_board_sections(board_id=board_id)
    while section_batch:
        sections.extend(section_batch)
        section_batch = pinterest.get_board_sections(board_id=board_id)
    sections_data = {}
    for section in sections:
        section_id = section['id']
        title = section.get('title', '')
        sections_map[title] = section_id
        processed_images = []
        preview_pins = section.get('preview_pins', [])
        for pin in preview_pins:
            if not pin['is_video'] and 'image_medium_url' in pin:
                new_url = pin['image_medium_url'].replace('200x', '736x')
                processed_images.append(new_url)
        sections_data[section_id] = {
            "section-id": section_id,
            "title": title,
            "images": processed_images
        }
    return sections_data


def get_user_boards(username):
    cred_root = constants.BASE_DIR + "/.cred_root"
    with suppress_specific_output():
        pinterest = Pinterest(username=username, cred_root=cred_root)
    boards = pinterest.boards(username=username)

    # Test board_feed for first board
    if boards:
        first_board = boards[0]
        print("Getting board_feed for first board")
        feed = pinterest.board_feed(board_id=first_board['id'])
        print("Writing to debug_log.txt")
        with open('./debug_log.txt', 'w') as f:
            f.write(json.dumps(feed, indent=2))
        print("Written")

    board_map = {}
    boards_data = {}
    for board in boards:
        board_id = board['id']
        board_name = board['name']
        board_map[board_name] = board_id

        # Process images
        board_images = board.get('images', {})
        processed_images = []
        if '236x' in board_images:
            for img_obj in board_images['236x']:
                if 'url' in img_obj:
                    new_url = img_obj['url'].replace('236x', '736x')
                    processed_images.append(new_url)

        # Check section_count
        sections = {}
        sections_map = {}
        if board.get('section_count', 0) > 0:
            sections = get_board_sections(pinterest, board_id, sections_map)

        # Exclude section images from board images
        all_section_images = set()
        for sec_data in sections.values():
            all_section_images.update(sec_data.get('images', []))
        processed_images = [img for img in processed_images if img not in all_section_images]

        boards_data[board_id] = {
            "board-id": board_id,
            "board-name": board_name,
            "sections": sections,
            "sections_map": sections_map,
            "images": processed_images
        }
    return boards_data, board_map


def load_image_from_url(url):
    response = requests.get(url, timeout=5)
    img = Image.open(io.BytesIO(response.content))
    img = img.convert('RGB')
    img_array = np.array(img)
    img_tensor = torch.from_numpy(img_array).float() / 255.0
    return img_tensor.unsqueeze(0)

def handle_username_data_fetch(username):
    if not check_user_exists(username):
        return {"error": "User not found"}

    boards, board_map = get_user_boards(username)
    return {"board_map": board_map, "boards": boards}


class DN_pyPinNode:
    def __init__(self):
        self.current_pools = {}
        self.used_pools = {}
        self.last_boards = {}
        self.last_sections = {}

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

    RETURN_TYPES = ("IMAGE", "JSON")
    RETURN_NAMES = ("image", "data")

    FUNCTION = "get_image"
    CATEGORY = "Dado's Nodes"

    def get_image(self, node_data, username, unique_id):
        parsed = json.loads(node_data) if node_data else {}
        configs = parsed.get('configs', {})
        data = parsed.get('data', {})
        image_output = configs.get('image_output')
        board = configs.get('board')
        section = configs.get('section')
        last_image = configs.get('last_image')
        boards = data.get('boards', {})

        def get_all_images(selected_board, section, boards):
            if selected_board == 'all':
                all_images = []
                for board_data in boards.values():
                    all_images.extend(board_data.get('images', []))
                    # Include all section images
                    for sec_data in board_data.get('sections', {}).values():
                        all_images.extend(sec_data.get('images', []))
                return all_images
            # Find the selected board
            for b_data in boards.values():
                if b_data.get('board-name') == selected_board:
                    board_images = b_data.get('images', [])
                    sections = b_data.get('sections', {})
                    sections_map = b_data.get('sections_map', {})
                    if section == 'included':
                        all_images = board_images.copy()
                        for sec_data in sections.values():
                            all_images.extend(sec_data.get('images', []))
                        return all_images
                    if section == 'excluded':
                        return board_images
                    if section not in ['included', 'excluded']:
                        # Specific section
                        if section in sections_map:
                            sec_id = sections_map[section]
                            if sec_id in sections:
                                return sections[sec_id].get('images', [])
                        return []
            return []

        def update_last_state(uid, b, s):
            self.last_boards[uid] = b
            self.last_sections[uid] = s

        all_images = get_all_images(board, section, boards)
        selected_image = ''

        last_board = self.last_boards.get(unique_id)
        last_section = self.last_sections.get(unique_id)
        changed = last_board != board or last_section != section

        if image_output == 'chaotic draw':
            if all_images:
                selected_image = random.choice(all_images)
                update_last_state(unique_id, board, section)
        elif image_output == 'fixed':
            if changed or not last_image:
                if all_images:
                    selected_image = random.choice(all_images)
                    update_last_state(unique_id, board, section)
            else:
                selected_image = last_image
        elif image_output == 'circular shuffle':
            if changed:
                update_last_state(unique_id, board, section)
                self.current_pools[unique_id] = all_images.copy()
                self.used_pools[unique_id] = []
            if self.current_pools.get(unique_id, []):
                selected_image = random.choice(self.current_pools[unique_id])
                self.current_pools[unique_id].remove(selected_image)
                self.used_pools[unique_id].append(selected_image)
                if not self.current_pools[unique_id]:
                    self.current_pools[unique_id] = self.used_pools[unique_id].copy()
                    self.used_pools[unique_id] = []

        configs['last_image'] = selected_image
        img_tensor = load_image_from_url(selected_image)

        parsed['configs'] = configs
        pretty_data = json.dumps(parsed, indent=2)

        # Return UI data to trigger executed event
        return {"ui": {"node_data": pretty_data}, "result": (img_tensor, pretty_data)}

    @classmethod
    def IS_CHANGED(cls, node_data, username, unique_id):
        return random.random()

@register_operation_handler
async def handle_username_changed(request):
    """Handle username change messages from frontend"""
    try:
        data = await request.json()
        operation = data.get('operation')

        if operation not in ['username_changed']:
            return None

        if operation == 'username_changed':
            # node_id = str(data.get('id', ''))
            payload = data.get('payload', {})
            username = payload.get('username', '')

            result = handle_username_data_fetch(username)
            return web.json_response({"data": result})

        return web.json_response({"error": "Invalid operation"}, status=400)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
