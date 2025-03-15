import spacy
import re

nlp = spacy.load("en_core_web_sm")

def is_relevant_token(token):
    if token.is_stop and token.text.lower() != "or":
        return False
    if token.pos_ == "ADV" and token.dep_ in {"advmod", "amod"} and token.is_stop:
        return False
    return not (token.pos_ == "DET" or 
                (token.dep_ == "advmod" and token.head.pos_ == "ADJ") or 
                (token.pos_ in ("ADP", "PART", "CCONJ", "SCONJ") and token.text.lower() != "or"))

def find_hyphenated_terms(doc):
    hyphenated_terms = {}
    skip_indices = set()
    for i, token in enumerate(doc):
        if token.text == "-" and 0 < i < len(doc) - 1:
            if not doc[i - 1].is_space and not doc[i + 1].is_space:
                skip_indices.update([i - 1, i, i + 1])
                hyphenated_terms[i] = f"{doc[i - 1].text.lower()}-{doc[i + 1].text.lower()}"
    return hyphenated_terms, skip_indices

def find_compound_modifiers(doc):
    compound_modifiers = {}
    for token in doc:
        if token.dep_ == "compound" and token.head.pos_ in ("ADJ", "NOUN"):
            compound_modifiers.setdefault(token.head.i, []).append(token.i)
    return compound_modifiers

def process_noun(token, doc, hyphenated_terms, compound_modifiers):
    keywords = {token.text.lower()}
    modifiers = []

    for child in token.children:
        if (child.dep_ in ("amod", "compound") or child.pos_ == "ADJ") and is_relevant_token(child):
            if child.i in hyphenated_terms:
                modifiers.append(hyphenated_terms[child.i])
            elif child.i in compound_modifiers:
                compound_parts = [doc[i].text.lower() for i in compound_modifiers[child.i] if is_relevant_token(doc[i])]
                compound_parts.append(child.text.lower())
                compound_parts.sort(key=lambda x: doc.text.lower().find(x))
                modifiers.append(" ".join(compound_parts))
            else:
                modifiers.append(child.text.lower())
                
    phrases = set()
    if modifiers:
        phrases.add(" ".join(modifiers + [token.text.lower()]))
        
    return keywords, phrases

def process_adjective(token, doc, compound_modifiers):
    keywords = set()
    if token.i in compound_modifiers:
        modifier_parts = [doc[i].text.lower() for i in compound_modifiers[token.i]]
        modifier_parts.append(token.text.lower())
        modifier_parts.sort(key=lambda x: doc.text.lower().find(x))
        keywords.add(" ".join(modifier_parts))
    else:
        keywords.add(token.text.lower())
    return keywords

def process_prepositional_object(token, doc, compound_modifiers):
    keywords = {token.text.lower()}
    phrases = set()
    for child in token.children:
        if child.dep_ == "amod":
            if child.i in compound_modifiers:
                modifier_parts = [doc[i].text.lower() for i in compound_modifiers[child.i]]
                modifier_parts.append(child.text.lower())
                modifier_parts.sort(key=lambda x: doc.text.lower().find(x))
                phrases.add(f"{' '.join(modifier_parts)} {token.text.lower()}")
            else:
                phrases.add(f"{child.text.lower()} {token.text.lower()}")
    return keywords, phrases

def remove_exact_duplicates(phrases):
    unique_phrases = []
    for phrase in phrases:
        if " or " in phrase:
            unique_phrases.append(phrase)
            continue
            
        words = phrase.lower().split()
        unique_words = []
        
        for i, word in enumerate(words):
            if i > 0 and word == words[i-1]:
                continue
            if word not in unique_words or (i > 0 and words[i-1] + " " + word) not in phrase[:i]:
                unique_words.append(word)
        
        if unique_words:
            unique_phrases.append(" ".join(unique_words))
    
    return unique_phrases

def extract_keywords(text):
    doc = nlp(text)
    keywords = set()
    phrases = set()

    hyphenated_terms, skip_indices = find_hyphenated_terms(doc)
    compound_modifiers = find_compound_modifiers(doc)
    
    for i, term in hyphenated_terms.items():
        keywords.add(term)

    for token in doc:
        if token.i in skip_indices:
            continue
            
        if token.pos_ == "NOUN":
            noun_keywords, noun_phrases = process_noun(token, doc, hyphenated_terms, compound_modifiers)
            keywords.update(noun_keywords)
            phrases.update(noun_phrases)

        elif token.pos_ == "ADJ" and token.dep_ in ("ROOT", "acomp", "ccomp"):
            adj_keywords = process_adjective(token, doc, compound_modifiers)
            keywords.update(adj_keywords)

        elif token.dep_ == "pobj" and token.head.dep_ == "prep" and token.head.text.lower() in ("of", "with", "in"):
            pobj_keywords, pobj_phrases = process_prepositional_object(token, doc, compound_modifiers)
            keywords.update(pobj_keywords)
            phrases.update(pobj_phrases)

    for chunk in doc.noun_chunks:
        if len(chunk) > 1:
            filtered_tokens = [token.text.lower() for token in chunk if is_relevant_token(token)]
            if len(filtered_tokens) > 1:
                phrases.add(" ".join(filtered_tokens))

    all_phrases = sorted(phrases, key=lambda x: text.lower().find(x))
    clean_keywords = sorted([k for k in keywords if not any(k in p for p in all_phrases)], key=lambda x: text.lower().find(x))
    
    all_phrases = [phrase.strip() for phrase in all_phrases]
    clean_keywords = [keyword.strip() for keyword in clean_keywords]
    
    unique_result = list(dict.fromkeys(all_phrases + clean_keywords))
    unique_result = remove_exact_duplicates(unique_result)
    
    seen_entries = set()
    final_result = []
    for entry in unique_result:
        entry_lower = entry.lower()
        if entry_lower not in seen_entries:
            seen_entries.add(entry_lower)
            final_result.append(entry)
    
    return categorize_keywords(final_result)

def check_category_conditions(doc, conditions):
    return any(condition(doc) for condition in conditions)

def categorize_keywords(keywords):
    categories = {
        "subjects": [],
        "descriptors": [],
        "settings": [],
        "styles": [],
        "other": []
    }
    
    category_conditions = {
        "subjects": [
            lambda doc: any(token.pos_ == "NOUN" and (token.dep_ in ["nsubj", "ROOT"] or 
                                                     not any(child.dep_ == "pobj" for child in token.children)) 
                           for token in doc)
        ],
        "descriptors": [
            lambda doc: (any(token.pos_ in ["ADJ", "ADV"] for token in doc) and 
                        any(token.dep_ in ["amod", "advmod"] for token in doc) and 
                        not any(token.text.lower() in ["in", "at", "on", "inside"] for token in doc))
        ],
        "settings": [
            lambda doc: any(token.text.lower() in ["in", "at", "on", "inside", "outside", "room", "scene", "setting"] 
                           for token in doc),
            lambda doc: any(token.dep_ == "pobj" and token.head.text.lower() in ["in", "at", "on"] 
                           for token in doc),
            lambda doc: any(ent.label_ in ["LOC", "FAC", "GPE"] for ent in doc.ents)
        ],
        "styles": [
            lambda doc: any(token.lemma_.lower() in ["style", "artistic", "rendered", "painted", "drawn", "art"] 
                           for token in doc),
            lambda doc: any(ent.label_ in ["PERSON", "ORG"] for ent in doc.ents)
        ]
    }
    
    for keyword in keywords:
        doc = nlp(keyword)
        categorized = False
        
        for category, conditions in category_conditions.items():
            if check_category_conditions(doc, conditions):
                categories[category].append(keyword)
                categorized = True
                break
                
        if not categorized:
            categories["other"].append(keyword)
    
    return format_prompt(categories)

def expand_synonyms(phrases, max_replacements=2):
    if not phrases:
        return phrases
        
    word_counts = {}
    for phrase in phrases:
        for word in phrase.split():
            if word.isalpha() and len(word) > 3:
                word_counts[word.lower()] = word_counts.get(word.lower(), 0) + 1
    
    repetitive_words = {word: count for word, count in word_counts.items() if count > 1}
    
    if not repetitive_words:
        return phrases
    
    result = phrases.copy()
    replacements_made = 0
    
    for word in sorted(repetitive_words.keys(), key=lambda w: repetitive_words[w], reverse=True):
        if replacements_made >= max_replacements:
            break
            
        word_doc = nlp(word)
        if not word_doc.vector_norm:
            continue
            
        similar_words = []
        for token in nlp.vocab:
            if token.is_alpha and len(token.text) > 3 and token.has_vector and token.text.lower() != word:
                similarity = token.similarity(word_doc[0])
                if similarity > 0.7:
                    similar_words.append((token.text, similarity))
        
        similar_words.sort(key=lambda x: x[1], reverse=True)
        
        if similar_words:
            for i, phrase in enumerate(result):
                if word in phrase.lower():
                    result[i] = phrase.replace(word, similar_words[0][0])
                    replacements_made += 1
                    break
    
    return result

def format_prompt(categories):
    categories["descriptors"] = expand_synonyms(categories["descriptors"])
    
    structured_parts = []
    if categories["subjects"]:
        structured_parts.append(", ".join(categories["subjects"]))
    if categories["descriptors"]:
        structured_parts.append(", ".join(categories["descriptors"]))
    if categories["settings"]:
        structured_parts.append("in " + ", ".join(categories["settings"]))
    if categories["styles"]:
        style_terms = []
        for style in categories["styles"]:
            doc = nlp(style)
            if any(token.lemma_.lower() in ["style", "art", "painting", "artistic"] for token in doc) or any(ent.label_ == "PERSON" for ent in doc.ents):
                style_terms.append("in style of " + style)
            else:
                style_terms.append(style)
        structured_parts.append(", ".join(style_terms))
    if categories["other"]:
        structured_parts.append(", ".join(categories["other"]))
    
    prompt = ", ".join(filter(None, structured_parts))    
    prompt = prompt.replace(" ,", ",")
    prompt = re.sub(r'(\w+)\s+-\s+(\w+)', r'\1-\2', prompt)
    
    return prompt

def main():
    input_file = "input.txt"
    try:
        with open(input_file, "r", encoding="utf-8") as file:
            text = file.read()
            sd_prompt = extract_keywords(text)
            print("Generated Stable Diffusion Prompt:\n", sd_prompt)
    except FileNotFoundError:
        print(f"Error: {input_file} not found. Please place the text file in the script directory.")

if __name__ == "__main__":
    main()
