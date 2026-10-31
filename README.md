# StrataWX

From ACMS Digital Systems, makers of [Datalink Pro](https://acmsdigital.com): a Windows app that puts a virtual ACARS terminal in your MSFS 2020 or 2024 cockpit, with an automated airline dispatch office on the other end.

A Stream Deck plugin that shows the weather StrataWx is flying you through
in Microsoft Flight Simulator, on five keys in the Panel style (the same look as the
ChasePlane and Sim Clock plugins):

| Key | Shows |
|---|---|
| **Altimeter** | QNH, in inHg or hPa as StrataWx is set |
| **Temp °C** / **Temp °F** | outside air temperature at the aircraft; an ice ring and FREEZING at 0 °C or below |
| **Wind** | wind at the aircraft's height (`270/18`, or `CALM`) |
| **PIREPs** | how many PIREPs StrataWx reports nearby; an amber ring for a moderate turbulence or icing report, red for severe. Press to step through them, nearest first |

## How it reads StrataWx

The StrataWx desktop app runs a local weather service on `127.0.0.1:19286`. The plugin asks it
every 5 seconds, while a key is on the deck, for `/api/v1/weather/current` and
`/api/v1/weather/status`, and nothing else: it only reads, and never changes StrataWx settings.
With StrataWx closed the keys show `--` and `STRATAWX OFF`.

## Build

```bash
npm install
npm run pack
```

`npm run pack` writes `dist/com.acms.stratawx.streamDeckPlugin`; open it to install.
Raise `Version` in `com.acms.stratawx.sdPlugin/manifest.json` before each install, since
Stream Deck skips a version already installed.
