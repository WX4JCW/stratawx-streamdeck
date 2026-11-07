import {
    action,
    SingletonAction,
    type DialAction,
    type DialDownEvent,
    type DialRotateEvent,
    type KeyAction,
    type KeyDownEvent,
    type TouchTapEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";

import { keyImage, stripImage, type Look } from "./render.js";
import { strataWx, type Current, type Snapshot, type Status } from "./stratawx.js";
import {
    advisories,
    advisoryCount,
    advisoryDetail,
    altimeter,
    conditions,
    freezingLevel,
    temperature,
    wind,
    windLayer,
    windLayerCount,
    type Reading,
} from "./weather.js";

/** Every action with a placed key or dial, so the feed can redraw them all and stop polling when none are left. */
const live = new Set<{ redraw(): void }>();

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

@action({ UUID: "com.acms.stratawx.freezing" })
export class FreezingLevelAction extends WeatherAction {
    protected caption() { return "FREEZING LVL"; }
    protected read(current: Current, status: Status) { return freezingLevel(current, status); }
}

/**
 * Winds aloft on a Stream Deck + dial. Turning steps through the wind layers StrataWx
 * returns, surface first; pushing the dial or tapping the strip goes back to the surface.
 * Each dial keeps its own layer.
 */
@action({ UUID: "com.acms.stratawx.windsaloft" })
export class WindsAloftAction extends SingletonAction {
    private dials = new Map<string, { dial: DialAction; layer: number; drawn: string }>();

    override onWillAppear(ev: WillAppearEvent): void {
        if (!ev.action.isDial()) return;
        this.dials.set(ev.action.id, { dial: ev.action, layer: 0, drawn: "" });
        live.add(this);
        strataWx.start();
        this.redraw();
    }

    override onWillDisappear(ev: WillDisappearEvent): void {
        this.dials.delete(ev.action.id);
        if (this.dials.size === 0) live.delete(this);
        if (live.size === 0) strataWx.stop();
    }

    override onDialRotate(ev: DialRotateEvent): void {
        const entry = this.dials.get(ev.action.id);
        const snap = strataWx.snapshot;
        if (!entry || snap.state !== "ok") return;
        const last = windLayerCount(snap.current) - 1;
        entry.layer = Math.max(0, Math.min(last, entry.layer + ev.payload.ticks));
        this.redraw();
    }

    override onDialDown(ev: DialDownEvent): void {
        this.toSurface(ev.action.id);
    }

    override onTouchTap(ev: TouchTapEvent): void {
        this.toSurface(ev.action.id);
    }

    private toSurface(id: string): void {
        const entry = this.dials.get(id);
        if (!entry) return;
        entry.layer = 0;
        this.redraw();
    }

    redraw(): void {
        const snap = strataWx.snapshot;
        for (const entry of this.dials.values()) {
            const look: Look =
                snap.state === "ok"
                    ? { caption: "WINDS ALOFT", ...windLayer(snap.current, entry.layer) }
                    : { caption: "WINDS ALOFT", value: "--", sub: snap.state === "waiting" ? "WAITING" : "STRATAWX OFF" };
            const image = stripImage(look);
            if (entry.drawn === image) continue;
            entry.drawn = image;
            void entry.dial.setFeedback({ canvas: image });
        }
    }
}

@action({ UUID: "com.acms.stratawx.conditions" })
export class ConditionsAction extends WeatherAction {
    protected caption() { return "CONDITIONS"; }
    protected read(current: Current, status: Status) { return conditions(current, status); }
}

/**
 * The advisories the StrataWx app shows on its airport page (PIREPs and SIGMETs near the
 * station it takes the weather from). At rest the key shows the count; each press steps to
 * the next one, SIGMETs first, then PIREPs, nearest first; a press after the last goes back
 * to the count. The UUID stays "pireps" so keys placed before the rename keep working.
 */
@action({ UUID: "com.acms.stratawx.pireps" })
export class AdvisoriesAction extends WeatherAction {
    /** -1 is the count; 0.. is an advisory in the list. */
    private index = -1;

    protected caption() { return "ADVISORIES"; }
    protected read(): Reading { return { value: "--", sub: "WAITING" }; }

    protected override look(snap: Snapshot): Look {
        if (snap.state !== "ok") return super.look(snap);
        if (!snap.advisories) return { caption: this.caption(), value: "--", sub: "WAITING" };
        const items = advisories(snap.advisories.items);
        const item = this.index >= 0 ? items[this.index] : undefined;
        if (!item) {
            this.index = -1;
            return { caption: this.caption(), ...advisoryCount(items, snap.advisories.rangeNm) };
        }
        const ofKind = items.filter((i) => i.kind === item.kind);
        return { caption: `${item.kind} ${ofKind.indexOf(item) + 1}/${ofKind.length}`, ...advisoryDetail(item) };
    }

    override onKeyDown(_ev: KeyDownEvent): void {
        const snap = strataWx.snapshot;
        const count = snap.state === "ok" && snap.advisories ? advisories(snap.advisories.items).length : 0;
        this.index = this.index + 1 < count ? this.index + 1 : -1;
        this.redraw();
    }
}
