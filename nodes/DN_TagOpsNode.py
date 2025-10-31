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
                    all_occur = i+1 < len(rule) and rule[i+1] == '!'
                    partial = i > 0 and rule[i-1] == '?'
                    left = rule[:i-1 if partial else i].strip()
                    right = rule[i+1 + (1 if all_occur else 0):].strip()
                    return op, all_occur, partial, left, right
            return None, None, None, None, None  # No valid operator found

        def parse_rule(rule):
            op, all_occur_op, partial, left, right = find_main_operator_and_split(rule)
            if op is None:
                return None
            left_options = [normalize_tag(part.strip()) for part in left.split('|') if part.strip()]
            rights = split_outside_brackets(right)
            all_occur = all_occur_op
            if rights == ['DELETE']:
                if op != 'replace':
                    raise ValueError("delete op (DELETE) is only valid for replace (:) operations")
                op = 'delete'
                rights = []
            elif any(r.strip() == 'DELETE' for r in rights):
                raise ValueError("delete op (DELETE) must be alone")
            return op, left_options, rights, all_occur, partial

        tag_list = [tag.strip() for tag in tags.split(', ') if tag.strip()]

        for rule in operations.split(';'):
            rule = rule.strip()
            if not rule:
                continue
            parsed = parse_rule(rule)
            if parsed:
                op, left_options, rights, all_occur, partial = parsed
                if op == 'replace':
                    if all_occur:
                        i = 0
                        while i < len(tag_list):
                            normalized_tag = normalize_tag(tag_list[i])
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                tag_list[i:i+1] = rights
                                i += len(rights)
                            else:
                                i += 1
                    else:
                        for i, tag in enumerate(tag_list):
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                tag_list[i:i+1] = rights
                                break
                elif op == 'prepend':
                    if all_occur:
                        new_list = []
                        for tag in tag_list:
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                new_list.extend(rights)
                            new_list.append(tag)
                        tag_list = new_list
                    else:
                        for i, tag in enumerate(tag_list):
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                tag_list[i:i] = rights
                                break
                elif op == 'append':
                    if all_occur:
                        new_list = []
                        for tag in tag_list:
                            new_list.append(tag)
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                new_list.extend(rights)
                        tag_list = new_list
                    else:
                        for i, tag in enumerate(tag_list):
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                tag_list[i+1:i+1] = rights
                                break
                elif op == 'delete':
                    if all_occur:
                        tag_list = [tag for tag in tag_list if not (any(normalized_core in normalize_tag(tag) for normalized_core in left_options) if partial else normalize_tag(tag) in left_options)]
                    else:
                        for i, tag in enumerate(tag_list):
                            normalized_tag = normalize_tag(tag)
                            if (any(normalized_core in normalized_tag for normalized_core in left_options) if partial else normalized_tag in left_options):
                                del tag_list[i]
                                break

        result = ', '.join(tag_list)
        return (result,)