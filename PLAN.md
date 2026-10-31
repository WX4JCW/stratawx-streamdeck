# StrataWX Stream Deck plugin: plan

Owner's ask, 2026-10-31: buttons on the main sim deck page showing
1. altimeter, 2. temperature (one key in C, one in F), 3. winds, 4. any PIREPs.
Style: the current ChasePlane and Sim Clock Panel style.

## Where the weather comes from

The StrataWx app (installed at `C:\Users\wx4jc\AppData\Local\StrataWx`) runs a
local service at `http://127.0.0.1:19286`. The plugin only reads from it,
every few seconds, and never changes StrataWx:

- `GET /api/v1/weather/current`: pressure (`qnhPa`), temperature, wind layers.
- `GET /api/v1/weather/status`: aircraft height and on-ground, `standby`, nearby PIREPs (`advisories`).

The plugin never calls any other address (some of them change StrataWx settings).

## Keys (Panel style, one color for the app: sky cyan, hue 190)

| Key | Caption | Value | Status line |
|---|---|---|---|
| Altimeter | ALTIMETER | 30.04 | INHG |
| Temp C | TEMP °C | 26°C | AT AIRCRAFT |
| Temp F | TEMP °F | 79°F | AT AIRCRAFT |
| Wind | WIND | 270/18 (CALM under 3 kt) | SURFACE, or AT 9,000 FT once airborne (wind at the aircraft's height) |
| PIREPs | PIREPS | count nearby (or NONE) | NEAREST 5 NM |

- Press the PIREPs key to step through them: PIREP 1/5, SMOOTH / FL100, A319 · 5 NM. A last press goes back to the count.
- Alert colors (owner, 2026-10-31: "Yes, add them"). The key stays sky cyan; only the ring and status line change:
  - Temp C and Temp F at 0°C or below: ice-white ring, status FREEZING.
  - PIREPs: amber ring for any moderate turbulence or icing report nearby, red ring for severe;
    status names the worst one (MOD TURB, MOD ICE, SEV TURB, SEV ICE).
  - Altimeter and wind: no alert colors.
- StrataWx not running: every key shows its caption, "--" and STRATAWX OFF.
- Altimeter shows inHg, as StrataWx is set (`units.pressure`).

## Build

- New folder `C:\Dev\StrataWX`, new public repo `WX4JCW/stratawx-streamdeck` (working repo),
  README with the Datalink Pro line from the SimClock README at the top.
- Same tooling as Sim Clock (Stream Deck SDK, TypeScript, same Panel drawing code).
- Five actions: Altimeter, Temp C, Temp F, Wind, PIREPs.
- Install: raise the manifest version, install, then place the five keys on the main page.
  Before writing the profile: back it up and quit Stream Deck.
