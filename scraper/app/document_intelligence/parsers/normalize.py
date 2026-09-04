from __future__ import annotations

import re
import unicodedata


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).replace("\x00", "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return "\n".join(line.rstrip() for line in value.splitlines()).strip()


def clean_item(value: str) -> str:
    value = normalize_text(value).strip(" \t•*-–—")
    return re.sub(r"\s+", " ", value).strip()


def unique_items(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = clean_item(value)
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            result.append(item)
    return result


def section_lines(text: str, aliases: dict[str, set[str]]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    reverse = {alias.casefold(): name for name, values in aliases.items() for alias in values}
    for raw_line in text.splitlines():
        line = clean_item(raw_line)
        if not line:
            continue
        key = line.rstrip(":").casefold()
        if key in reverse:
            current = reverse[key]
            sections.setdefault(current, [])
            continue
        # Inline "Technical Skills: React, TypeScript"
        if ":" in line:
            label, value = line.split(":", 1)
            label_key = clean_item(label).rstrip(":").casefold()
            if label_key in reverse and value.strip():
                section_name = reverse[label_key]
                sections.setdefault(section_name, [])
                sections[section_name].append(clean_item(value))
                current = section_name
                continue
        if current:
            sections[current].append(line)
    return sections
