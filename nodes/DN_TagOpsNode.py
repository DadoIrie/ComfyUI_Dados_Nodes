class DN_TagOpsNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tags": ("STRING", {"forceInput": True}),
                "operations": ("STRING", {
                    "multiline": True,
                    "default": "",
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "process_tags"
    CATEGORY = "Dado's Nodes/Text & Prompt"

    def process_tags(self, tags, operations):
        if not operations.strip():
            return (tags,)

        def normalize_tag(tag):
            return tag.replace(' ', '_')

        def split_outside_brackets(s, delimiter=','):
            parts = []
            balance = 0
            last_idx = 0
            for i, char in enumerate(s):
                if char in '({':
                    balance += 1
                elif char in ')}':
                    balance -= 1
                elif char == delimiter and balance == 0:
                    parts.append(s[last_idx:i].strip())
                    last_idx = i + 1
            parts.append(s[last_idx:].strip())
            return [p for p in parts if p]

        def find_main_operator_and_split(rule):
            operators = {':': 'replace', '<': 'prepend', '>': 'append'}
            
            # Iterate from right to left to find the rightmost operator outside brackets
            balance = 0
            for i in range(len(rule) - 1, -1, -1):
                char = rule[i]
                if char in ')}':
                    balance += 1
                elif char in '({':
                    balance -= 1
                elif char in operators and balance == 0:
                    op = operators[char]
                    left = rule[:i].strip()
                    right = rule[i+1:].strip()
                    return op, left, right
            return None, None, None  # No valid operator found

        def parse_rule(rule):
            op, left, right = find_main_operator_and_split(rule)
            if op is None:
                return None
            left_normalized = normalize_tag(left)
            rights = split_outside_brackets(right)
            return op, left_normalized, rights

        tag_list = [tag.strip() for tag in tags.split(', ') if tag.strip()]

        for rule in operations.split(';'):
            rule = rule.strip()
            if not rule:
                continue
            parsed = parse_rule(rule)
            if parsed:
                op, left_normalized, rights = parsed
                if op == 'replace':
                    i = 0
                    while i < len(tag_list):
                        normalized_tag = normalize_tag(tag_list[i])
                        if normalized_tag == left_normalized:
                            tag_list[i:i+1] = rights
                            i += len(rights)
                        else:
                            i += 1
                elif op == 'prepend':
                    new_list = []
                    for tag in tag_list:
                        normalized_tag = normalize_tag(tag)
                        if normalized_tag == left_normalized:
                            new_list.extend(rights)
                        new_list.append(tag)
                    tag_list = new_list
                elif op == 'append':
                    new_list = []
                    for tag in tag_list:
                        new_list.append(tag)
                        normalized_tag = normalize_tag(tag)
                        if normalized_tag == left_normalized:
                            new_list.extend(rights)
                    tag_list = new_list

        result = ', '.join(tag_list)
        return (result,)