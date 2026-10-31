import { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { keyImage, type Look } from "./render.js";
import { strataWx, type Current, type Snapshot, type Status } from "./stratawx.js";
import { altimeter, pirepCount, pirepDetail, pireps, temperature, wind, type Reading } from "./weather.js";

/** Every placed key, so the feed can redraw them all and stop polling when none are left. */
const live = new Set<WeatherAction>();

export function redrawAll(): void {
    for (const a of live) a.redraw();
}

/**
 * One weather key. Each subclass names its caption and how it reads the weather;
 * this base handles appearing, the shared feed, and skipping redraws that would not change.
 */
abstract class WeatherAction extends SingletonAction {
    private keys = new Map<string, { key: KeyAction; drawn: string }>();

    protected abstract caption(): string;
    protected abstract read(current: Current, status: Status): Reading;

    /** What to draw for the latest snapshot. */
    protected look(snap: Snapshot): Look {
        if (snap.state === "ok") return { caption: this.caption(), ...this.read(snap.current, snap.status) };
        return { caption: this.caption(), value: "--", sub: snap.state === "waiting" ? "WAITING" : "STRATAWX OFF" };
    }

    override onWillAppear(ev: WillAppearEvent): void {
        if (!ev.action.isKey()) return;
        this.keys.set(ev.action.id, { key: ev.action, drawn: "" });
        live.add(this);
        strataWx.start();
        this.redraw();
    }

    override onWillDisappear(ev: WillDisappearEvent): void {
        this.keys.delete(ev.action.id);
        if (this.keys.size === 0) live.delete(this);
        if (live.size === 0) strataWx.stop();
    }

    redraw(): void {
        const image = keyImage(this.look(strataWx.snapshot));
        for (const entry of this.keys.values()) {
            if (entry.drawn === image) continue;
            entry.drawn = image;
            void entry.key.setImage(image);
        }
    }
}

@action({ UUID: "com.acms.stratawx.altimeter" })
export class AltimeterAction extends WeatherAction {
    protected caption() { return "ALTIMETER"; }
    protected read(current: Current, status: Status) { return altimeter(current, status); }
}

@action({ UUID: "com.acms.stratawx.tempc" })
export class TempCAction extends WeatherAction {
    protected caption() { return "TEMP °C"; }
    protected read(current: Current, status: Status) { return temperature(current, status, "C"); }
}

@action({ UUID: "com.acms.stratawx.tempf" })
export class TempFAction extends WeatherAction {
    protected caption() { return "TEMP °F"; }
    protected read(current: Current, status: Status) { return temperature(current, status, "F"); }
}

@action({ UUID: "com.acms.stratawx.wind" })
export class WindAction extends WeatherAction {
    protected caption() { return "WIND"; }
    protected read(current: Current, status: Status) { return wind(current, status); }
}

/**
 * The count of nearby PIREPs. Each press steps to the next one, nearest first; a press
 * after the last goes back to the count. All PIREP keys on the deck step together.
 */
@action({ UUID: "com.acms.stratawx.pireps" })
export class PirepsAction extends WeatherAction {
    /** -1 is the count; 0.. is a PIREP in the list. */
    private index = -1;

    protected caption() { return "PIREPS"; }
    protected read(_current: Current, status: Status) { return pirepCount(pireps(status)); }

    protected override look(snap: Snapshot): Look {
        if (snap.state !== "ok" || this.index < 0) return super.look(snap);
        const list = pireps(snap.status);
        const p = list[this.index];
        if (!p) {
            this.index = -1;
            return super.look(snap);
        }
        return { caption: `PIREP ${this.index + 1}/${list.length}`, ...pirepDetail(p) };
    }

    override onKeyDown(_ev: KeyDownEvent): void {
        const snap = strataWx.snapshot;
        const count = snap.state === "ok" ? pireps(snap.status).length : 0;
        this.index = this.index + 1 < count ? this.index + 1 : -1;
        this.redraw();
    }
}
