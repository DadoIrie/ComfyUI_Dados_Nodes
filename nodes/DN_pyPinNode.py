import torch
import torch.nn.functional as F
import requests
import contextlib
import io
import json
import random
import hashlib
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

def get_board_sections(pinterest, board_id, sections_map, max_images=100):
    sections = []
    section_batch = pinterest.get_board_sections(board_id=board_id)
    while section_batch:
        sections.extend(section_batch)
        section_batch = pinterest.get_board_sections(board_id=board_id)
    sections_data = {}
    for section in sections:
        section_id = section['id']
        title = section.get('title', '')
        processed_images = []
        preview_pins = section.get('preview_pins', [])
        for pin in preview_pins:
            if len(processed_images) >= max_images:
                break
            if not pin['is_video'] and 'image_medium_url' in pin:
                new_url = pin['image_medium_url'].replace('200x', '736x')
                processed_images.append(new_url)
        display_name = f"{title} ({len(processed_images)})" if title else f"Unnamed ({len(processed_images)})"
        sections_map[display_name] = section_id  # Key is display_name
        sections_data[section_id] = {
            "section-id": section_id,
            "title": title,
            "images": processed_images,
            "display_name": display_name
        }
    return sections_data


def get_board_images_via_feed(pinterest, board_id, board_name, max_images=100):
    all_pins = []
    batch_count = 0
    print(f"Starting board_feed for board {board_name}, max images: {max_images}")
    while len(all_pins) < max_images:
        feed_batch = pinterest.board_feed(board_id=board_id)
        if not feed_batch:
            break

        batch_count += 1
        remaining = max_images - len(all_pins)
        pins_to_add = feed_batch[:remaining]
        all_pins += pins_to_add
        print(f"Batch {batch_count}: {len(feed_batch)} pins available, added {len(pins_to_add)}, total so far: {len(all_pins)}")

    print(f"Finished board_feed for board {board_name}, total pins: {len(all_pins)}")

    # Extract original image URLs from all pins
    all_images = []
    for pin in all_pins:
        if "images" in pin and "orig" in pin["images"]:
            image_url = pin["images"]["orig"]["url"]
            all_images.append(image_url)
    print(f"Extracted {len(all_images)} image URLs")
    return all_images


def get_board_map(username):
    cred_root = constants.BASE_DIR + "/.cred_root"
    with suppress_specific_output():
        pinterest = Pinterest(username=username, cred_root=cred_root)
    boards = pinterest.boards(username=username, page_size=1000)

    board_map = {}
    for board in boards:
        board_id = board['id']
        board_name = board['name']
        board_map[board_name] = board_id
    return board_map

def get_board_data(pinterest, board, max_images):
    board_id = board['id']
    board_name = board['name']
    processed_images = get_board_images_via_feed(pinterest, board_id, board_name, max_images)

    sections = {}
    sections_map = {}
    if board.get('section_count', 0) > 0:
        sections = get_board_sections(pinterest, board_id, sections_map, max_images)

    all_section_images = set()
    for sec_data in sections.values():
        all_section_images.update(sec_data.get('images', []))
    processed_images = [img for img in processed_images if img not in all_section_images]

    board_data = {
        "board-id": board_id,
        "board-name": board_name,
        "display_name": f"{board_name} ({len(processed_images)})",
        "sections": sections,
        "sections_map": sections_map,
        "images": processed_images
    }
    return board_data


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

    board_map = get_board_map(username)
    return {"board_map": board_map}


class DN_pyPinNode:
    def __init__(self):
        self._reset_pools()

    def _reset_pools(self):
        self.current_pools = {}
        self.used_pools = {}
        self.last_boards = {}
        self.last_sections = {}
    
    def _get_all_images(self, selected_board, section, boards):
        if selected_board == 'all':
            all_images = []
            for board_data in boards.values():
                all_images.extend(board_data.get('images', []))
                for sec_data in board_data.get('sections', {}).values():
                    all_images.extend(sec_data.get('images', []))
            return all_images
        
        board_data = next(
            (b for b in boards.values() if b.get('board-name') == selected_board),
            None
        )
        if not board_data:
            return []
        
        board_images = board_data.get('images', [])
        sections = board_data.get('sections', {})
        sections_map = board_data.get('sections_map', {})
        
        if section == 'included':
            all_images = board_images.copy()
            for sec_data in sections.values():
                all_images.extend(sec_data.get('images', []))
            return all_images
        
        if section == 'excluded':
            return board_images
        
        if section in sections_map:
            sec_id = sections_map[section]
            if sec_id in sections:
                return sections[sec_id].get('images', [])
        
        return []
    
    def _select_chaotic_draw(self, all_images, unique_id, board, section):
        if not all_images:
            return ''
        self.last_boards[unique_id] = board
        self.last_sections[unique_id] = section
        return random.choice(all_images)
    
    def _select_fixed(self, all_images, unique_id, board, section, last_image):
        last_board = self.last_boards.get(unique_id)
        last_section = self.last_sections.get(unique_id)
        changed = last_board != board or last_section != section
        
        if changed or not last_image:
            if not all_images:
                return ''
            self.last_boards[unique_id] = board
            self.last_sections[unique_id] = section
            return random.choice(all_images)
        return last_image
    
    def _select_circular_shuffle(self, all_images, unique_id, board, section):
        last_board = self.last_boards.get(unique_id)
        last_section = self.last_sections.get(unique_id)
        changed = last_board != board or last_section != section
        
        if changed:
            self.last_boards[unique_id] = board
            self.last_sections[unique_id] = section
            self.current_pools[unique_id] = random.sample(all_images, len(all_images)) if all_images else []
            self.used_pools[unique_id] = []
        
        if unique_id not in self.current_pools or not self.current_pools[unique_id]:
            return ''
        
        selected_image = random.choice(self.current_pools[unique_id])
        self.current_pools[unique_id].remove(selected_image)
        self.used_pools[unique_id].append(selected_image)
        
        if not self.current_pools[unique_id]:
            self.current_pools[unique_id] = random.sample(self.used_pools[unique_id], len(self.used_pools[unique_id])) if self.used_pools[unique_id] else []
            self.used_pools[unique_id] = []
        
        return selected_image

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "node_configs": ("STRING", {"default": "{}", "multiline": False}),
                "pinterest_data": ("STRING", {"default": "{}", "multiline": False}),
                "username": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "JSON", "JSON")
    RETURN_NAMES = ("image", "configs", "data")

    FUNCTION = "get_image"
    CATEGORY = "Dado's Nodes"

    def get_image(self, node_configs, pinterest_data, username, unique_id):
        configs = json.loads(node_configs) if node_configs else {}
        data = json.loads(pinterest_data) if pinterest_data else {}

        # Check for manual pool reset
        if configs.get('reset_pool'):
            self._reset_pools()
            configs['last_boards_hash'] = None
            configs['reset_pool'] = False

        # Extract config values
        image_output, board, section, last_image, resize_image = [
            configs.get(k) for k in ('image_output', 'board', 'section', 'last_image', 'resize_image')
        ]
        boards = data.get('boards', {})

        # Reset dictionaries if boards data has changed
        boards_str = json.dumps(boards, sort_keys=True)
        current_hash = hashlib.md5(boards_str.encode()).hexdigest()
        if configs.get('last_boards_hash') != current_hash:
            self._reset_pools()
            configs['last_boards_hash'] = current_hash

        all_images = self._get_all_images(board, section, boards)
        
        mode_strategies = {
            'chaotic draw': lambda: self._select_chaotic_draw(all_images, unique_id, board, section),
            'fixed': lambda: self._select_fixed(all_images, unique_id, board, section, last_image),
            'circular shuffle': lambda: self._select_circular_shuffle(all_images, unique_id, board, section)
        }
        
        selection_strategy = mode_strategies.get(image_output)
        selected_image = selection_strategy() if selection_strategy else ''

        configs['last_image'] = selected_image
        img_tensor = load_image_from_url(selected_image)

        # Resize image if resize_image is set to a positive integer
        if resize_image:
            resize_str = resize_image.strip()
            if resize_str.isdigit() and int(resize_str) > 0:
                target_longest = int(resize_str)
                _, h, w, _ = img_tensor.shape
                if h == w:
                    new_h = new_w = target_longest
                else:
                    longest = max(h, w)
                    scale = target_longest / longest
                    new_h = int(h * scale)
                    new_w = int(w * scale)
                img_tensor = F.interpolate(img_tensor.permute(0, 3, 1, 2), size=(new_h, new_w), mode='bilinear', align_corners=False).permute(0, 2, 3, 1)

        pretty_configs = json.dumps(configs, indent=2)
        pretty_data = json.dumps(data, indent=2)

        return {
            "ui": {
                "node_configs": pretty_configs,
                "pinterest_data": pretty_data
            },
            "result": (img_tensor, pretty_configs, pretty_data)
        }

    @classmethod
    def IS_CHANGED(cls, node_data, username, unique_id):
        return random.random()

@register_operation_handler
async def handle_username_changed(request):
    """Handle username change messages from frontend"""
    try:
        data = await request.json()
        operation = data.get('operation')

        if operation not in ['username_changed', 'board_selected']:
            return None

        if operation == 'username_changed':
            # node_id = str(data.get('id', ''))
            payload = data.get('payload', {})
            username = payload.get('username', '')
            max_images = payload.get('max_images', 100)

            result = handle_username_data_fetch(username)
            return web.json_response({"data": result})

        if operation == 'board_selected':
            payload = data.get('payload', {})
            username = payload.get('username', '')
            board_display_name = payload.get('board_display_name', '')
            max_images = payload.get('max_images', 100)

            if not check_user_exists(username):
                return web.json_response({"error": "User not found"}, status=400)

            cred_root = constants.BASE_DIR + "/.cred_root"
            with suppress_specific_output():
                pinterest = Pinterest(username=username, cred_root=cred_root)
            boards = pinterest.boards(username=username, page_size=1000)

            fresh_board_map = {board['name']: board['id'] for board in boards}

            if board_display_name == 'all':
                all_boards_data = {}
                for board in boards:
                    board_data = get_board_data(pinterest, board, max_images)
                    all_boards_data[board['id']] = board_data
                return web.json_response({"data": all_boards_data, "board_map": fresh_board_map})
            else:
                board_id = fresh_board_map.get(board_display_name)
                if not board_id:
                    return web.json_response({"error": "Board not found"}, status=400)

                board = next((b for b in boards if b['id'] == board_id), None)
                if not board:
                    return web.json_response({"error": "Board not found"}, status=400)

                board_data = get_board_data(pinterest, board, max_images)
                return web.json_response({"data": {board_id: board_data}, "board_map": None})

        return web.json_response({"error": "Invalid operation"}, status=400)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
