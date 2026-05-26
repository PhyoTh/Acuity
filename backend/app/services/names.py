"""Random display-name generator.

When a profile is first created we don't yet know what name the user wants. Showing their email
in the participant panel would leak personal info, so we generate a fun adjective+animal pair
("sillyraccoon") instead. The user can edit it later via `PATCH /auth/me`.
"""

from __future__ import annotations

import secrets

_ADJECTIVES = (
    "silly",
    "sleepy",
    "snappy",
    "sneaky",
    "sunny",
    "stormy",
    "spicy",
    "wiggly",
    "wobbly",
    "witty",
    "fluffy",
    "feisty",
    "fearless",
    "fuzzy",
    "grumpy",
    "groovy",
    "giddy",
    "happy",
    "hasty",
    "hungry",
    "jolly",
    "jumpy",
    "lucky",
    "mighty",
    "merry",
    "nimble",
    "noisy",
    "peppy",
    "plucky",
    "quirky",
    "rowdy",
    "rusty",
    "smug",
    "spry",
    "tiny",
    "tipsy",
    "zany",
    "zesty",
)

_ANIMALS = (
    "raccoon",
    "otter",
    "panda",
    "ferret",
    "badger",
    "beaver",
    "bison",
    "cheetah",
    "chipmunk",
    "dolphin",
    "duckling",
    "falcon",
    "frog",
    "gecko",
    "gibbon",
    "hedgehog",
    "ibex",
    "jaguar",
    "koala",
    "lemur",
    "lynx",
    "manatee",
    "marmot",
    "moose",
    "narwhal",
    "ocelot",
    "okapi",
    "owl",
    "panther",
    "penguin",
    "quokka",
    "rabbit",
    "seal",
    "sloth",
    "squirrel",
    "tapir",
    "toucan",
    "walrus",
    "wombat",
    "yak",
)


def random_display_name() -> str:
    """Return an adjective+animal display name, e.g. "sillyraccoon"."""
    return f"{secrets.choice(_ADJECTIVES)}{secrets.choice(_ANIMALS)}"
