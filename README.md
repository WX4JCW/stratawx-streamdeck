# WX Deck for StrataWX

From ACMS Digital Systems, makers of [Datalink Pro](https://acmsdigital.com): a Windows app that puts a virtual ACARS terminal in your MSFS 2020 or 2024 cockpit, with an automated airline dispatch office on the other end.

A Stream Deck plugin that shows the weather StrataWx is flying you through
in Microsoft Flight Simulator, on seven keys and two dials in the Panel style (the same look as
Camera Deck for ChasePlane and MSFS SimClock):

| Key | Shows |
|---|---|
| **Altimeter** | QNH, in inHg or hPa as StrataWx is set |
| **Temp °C** / **Temp °F** | outside air temperature at the aircraft, the number coloured in Apple Weather's steps (blue at 0 °C or below, light blue to 14, green 15–19, yellow 20–24, orange 25–29, red 30 and up); an ice ring and FREEZING at 0 °C or below |
| **Wind** | wind at the aircraft's height (`270/18`, or `CALM`); within 3,000 ft of the ground the number is coloured by Beaufort strength: yellow 11–21 kt, orange 22–33, red 34 and up |
| **Conditions** | an icon and word for the weather at the aircraft (CLEAR, FEW, SCATTERED, BROKEN, OVERCAST, RAIN, SNOW, T-STORM, FOG, MIST), with the ceiling (lowest broken or overcast layer above the ground) or, with no ceiling, the visibility; a red ring for a thunderstorm |
| **Freezing Level** | where the temperature crosses 0 °C, in feet above sea level (FL above 18,000 ft), from the temperature levels StrataWx sets; with more than one crossing the lowest and how many, otherwise SURFACE (all below 0 °C, ice ring) or NONE (all above) |
| **Winds Aloft** (dial) | the wind at each level StrataWx sets, from the surface up: turn to step through the levels, push or tap the strip for the surface wind again |
| **Weather** (dial) | everything the keys show, on one dial: turn through Altimeter, Temp °C, Temp °F, Wind, Conditions, Freezing Level and Advisories (the count), with the same colours and alert rings; push or tap the strip to go back to the altimeter |
| **Advisories** | how many PIREPs and SIGMETs the StrataWx app lists on its airport page (within 100 NM of the station it takes the weather from); a red ring for any SIGMET, otherwise amber for a moderate turbulence or icing PIREP, red for severe. Press to step through them, SIGMETs first, then PIREPs, nearest first |

## Ready-made profile

The plugin carries a **WX Deck for StrataWX** profile for the Stream Deck + XL: the seven keys across the top
row, Winds Aloft on the first dial and Weather on the second, everything else empty, for you to add to. Stream Deck offers it when the plugin is installed
and does not switch to it on its own. The file is
`com.acms.stratawx.sdPlugin/profiles/StrataWX-PlusXL.streamDeckProfile`, built by
`python tools/profile/make_profile.py` from the repository root.

## How it reads StrataWx

The StrataWx desktop app runs a local weather service on `127.0.0.1:19286`. The plugin asks it
every 5 seconds, while a key is on the deck, for `/api/v1/weather/current` and
`/api/v1/weather/status`, and once a minute for `/api/v1/airport/<station>` (the advisories),
and nothing else: it only reads, and never changes StrataWx settings.
With StrataWx closed the keys show `--` and `STRATAWX OFF`.

## Build

```bash
npm install
npm run pack
```

`npm run pack` writes `dist/com.acms.stratawx.streamDeckPlugin`; open it to install.
Raise `Version` in `com.acms.stratawx.sdPlugin/manifest.json` before each install, since
Stream Deck skips a version already installed.
