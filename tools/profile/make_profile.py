# Builds the ready-made "WX Deck for StrataWX" profile for the Stream Deck + XL, packed into the plugin:
#   com.acms.stratawx.sdPlugin/profiles/StrataWX-PlusXL.streamDeckProfile
# Only this plugin's own actions: the six WX Deck keys across the top row, in the order on the
# owner's deck; every other key and all six dials empty (owner, 2026-10-31: "No other buttons or
# stuff just whats relevant so we can package those profiles").
#
# Same format as the ChasePlane plugin's profile: a zip holding <PROFILE>.sdProfile/manifest.json
# (Device model with an empty UUID = any device of that model, Name, Pages, Version "3.0") and
# <PROFILE>.sdProfile/Profiles/<PAGE>/manifest.json (Controllers: Keypad and Encoder, actions keyed
# "column,row"). Fixed IDs, so a newer file replaces the profile instead of adding a copy.
# Usage: python tools/profile/make_profile.py   (from the repository root)
import json
import zipfile

MANIFEST = "com.acms.stratawx.sdPlugin/manifest.json"
OUT = "com.acms.stratawx.sdPlugin/profiles/StrataWX-PlusXL.streamDeckProfile"
PROFILE_ID = "7D41C2B8-3E6A-4F19-A0C5-5B2E9D8F1A01"
PAGE_ID = "2F8E6A14-9C3B-4D72-B1E8-6A0D5C4B3E01"
PLUS_XL_MODEL = "20GBX9901"  # the owner's + XL reports this model

plugin = json.load(open(MANIFEST, encoding="utf-8"))
PLUGIN = {"Name": plugin["Name"], "UUID": plugin["UUID"], "Version": plugin["Version"]}


def action(n, name, kind):
    # ActionIDs are fixed per position, like the IDs above.
    return {
        "ActionID": f"2F8E6A14-0000-4000-8000-{n:012d}",
        "LinkedTitle": True,
        "Name": name,
        "Plugin": PLUGIN,
        "Resources": None,
        "Settings": {},
        "State": 0,
        "States": [{}],
        "UUID": f"{PLUGIN['UUID']}.{kind}",
    }


TOP_ROW = [
    ("Altimeter", "altimeter"),
    ("Temp °C", "tempc"),
    ("Temp °F", "tempf"),
    ("Wind", "wind"),
    ("Advisories", "pireps"),  # the Advisories action keeps its first ID, "pireps"
    ("Conditions", "conditions"),
]
keys = {f"{col},0": action(col, name, kind) for col, (name, kind) in enumerate(TOP_ROW)}

root = {
    "Device": {"Model": PLUS_XL_MODEL, "UUID": ""},
    "Name": "WX Deck for StrataWX",
    "Pages": {"Current": PAGE_ID.lower(), "Default": PAGE_ID.lower(), "Pages": [PAGE_ID.lower()]},
    "Version": "3.0",
}
page = {"Controllers": [{"Actions": keys, "Type": "Keypad"}, {"Actions": {}, "Type": "Encoder"}], "Icon": "", "Name": ""}

base = f"{PROFILE_ID}.sdProfile/"
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(base, "")
    z.writestr(base + "manifest.json", json.dumps(root))
    z.writestr(base + "Profiles/", "")
    z.writestr(f"{base}Profiles/{PAGE_ID}/", "")
    z.writestr(f"{base}Profiles/{PAGE_ID}/manifest.json", json.dumps(page))
print(f"written {OUT}: {len(keys)} keys, plugin {PLUGIN['Version']}")
