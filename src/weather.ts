import type { Advisory, Current, Status } from "./stratawx.js";

/**
 * Turns StrataWx answers into what each key shows. Pure functions, so the rules live in
 * one place: wind and temperature are read at the aircraft's height, PIREPs are listed
 * nearest first, and the worst moderate or severe report sets the PIREP key's alert.
 */

const FT_PER_M = 3.28084;
const PA_PER_INHG = 3386.389;

/** Below this height above ground the aircraft counts as on the surface. */
const SURFACE_AGL_M = 15;

/** Ring colours for alerts; the key itself stays the app's sky blue. */
export const ICE = "#E8F7FF";
export const AMBER = "#FFB020";
export const RED = "#FF4040";

export type Icon = "sun" | "partly" | "cloud" | "rain" | "snow" | "storm" | "fog";
export type Reading = { value: string; sub: string; accent?: string; valueColor?: string; icon?: Icon };

/**
 * Temperature number colours, in Apple Weather's steps (iPhone Life, MacRumors): blue
 * below freezing, then light blue, green, yellow, orange, red. The blue is brighter than
 * Apple's dark blue, which cannot be read on the dark key.
 */
const TEMP_STEPS: [belowC: number, color: string][] = [
    [0, "#6E8BFF"],
    [15, "#9CCBFF"],
    [20, "#4ADE80"],
    [25, "#FFE14D"],
    [30, "#FF9F1A"],
    [Infinity, "#FF4D4D"],
];

/**
 * Wind number colours by Beaufort strength, in the same yellow, orange and red as the
 * temperature scale: light (under 11 kt) stays plain, moderate to fresh (11-21) yellow,
 * strong to near gale (22-33) orange, gale (34 and up) red. Only near the ground, where
 * wind matters for takeoff and landing; 80 kt at cruise is normal and stays plain.
 */
const WIND_STEPS: [belowKt: number, color: string | undefined][] = [
    [11, undefined],
    [22, "#FFE14D"],
    [34, "#FF9F1A"],
    [Infinity, "#FF4D4D"],
];
const WIND_COLOR_AGL_M = 914.4; // 3,000 ft

export function windColor(kt: number): string | undefined {
    return WIND_STEPS.find(([below]) => kt < below)![1];
}

export function tempColor(c: number): string {
    return c <= 0 ? TEMP_STEPS[0]![1] : TEMP_STEPS.find(([below]) => c < below)![1];
}

function onSurface(status: Status): boolean {
    const a = status.aircraft;
    return !a || a.onGround || a.altAglM < SURFACE_AGL_M;
}

function heightSub(status: Status): string {
    if (onSurface(status) || !status.aircraft) return "SURFACE";
    const ft = Math.round((status.aircraft.altM * FT_PER_M) / 100) * 100;
    return `AT ${ft.toLocaleString("en-US")} FT`;
}

/** Linear interpolation over points sorted by altitude, held flat beyond either end. */
function interpolate<T>(points: { alt: number; v: T }[], alt: number, mixer: (a: T, b: T, f: number) => T): T | undefined {
    const first = points[0];
    if (!first) return undefined;
    if (alt <= first.alt) return first.v;
    for (let i = 1; i < points.length; i++) {
        const lo = points[i - 1]!;
        const hi = points[i]!;
        if (alt <= hi.alt) return mixer(lo.v, hi.v, hi.alt > lo.alt ? (alt - lo.alt) / (hi.alt - lo.alt) : 0);
    }
    return points[points.length - 1]!.v;
}

/** QNH in the units StrataWx is set to: inHg (30.04) or hPa (1017). */
export function altimeter(current: Current, status: Status): Reading {
    const unit = (status.units?.pressure ?? "inHg").toLowerCase();
    return unit === "inhg"
        ? { value: (current.qnhPa / PA_PER_INHG).toFixed(2), sub: "INHG" }
        : { value: String(Math.round(current.qnhPa / 100)), sub: "HPA" };
}

/** Outside air temperature at the aircraft: the surface value on the ground, the level profile aloft. */
export function temperatureC(current: Current, status: Status): number {
    if (onSurface(status) || !status.aircraft) return current.temperatureC;
    const ground = current.groundElevationM;
    const points = [
        { alt: ground, v: current.temperatureC },
        ...(current.hazards?.levels ?? []).filter((l) => l.altitudeM > ground).map((l) => ({ alt: l.altitudeM, v: l.temperatureC })),
    ].sort((a, b) => a.alt - b.alt);
    return interpolate(points, status.aircraft.altM, (a, b, f) => a + (b - a) * f) ?? current.temperatureC;
}

/** One temperature key, its number coloured by the steps above; at or below freezing it also gets the ice ring. */
export function temperature(current: Current, status: Status, unit: "C" | "F"): Reading {
    // Colour and ring follow the whole °C value, so a key reading 25°C is never in the 20s colour.
    const c = Math.round(temperatureC(current, status));
    const shown = unit === "C" ? c : Math.round((temperatureC(current, status) * 9) / 5 + 32);
    const valueColor = tempColor(c);
    return c <= 0
        ? { value: `${shown}°${unit}`, sub: "FREEZING", accent: ICE, valueColor }
        : { value: `${shown}°${unit}`, sub: "AT AIRCRAFT", valueColor };
}

/** Wind at the aircraft's height, as 270/18, or CALM under 3 knots. */
export function wind(current: Current, status: Status): Reading {
    const ground = current.groundElevationM;
    // Layer 0 is the surface; the rest are a fixed ladder of heights above sea level.
    const points = current.windLayers
        .map((l, i) => {
            const rad = (l.directionDeg * Math.PI) / 180;
            return { alt: i === 0 ? ground : Math.max(l.altitudeM, ground), v: { x: Math.sin(rad) * l.speedKt, y: Math.cos(rad) * l.speedKt } };
        })
        .sort((a, b) => a.alt - b.alt);
    const at = onSurface(status) || !status.aircraft ? ground : status.aircraft.altM;
    const v = interpolate(points, at, (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }));
    const sub = heightSub(status);
    if (!v) return { value: "--", sub };
    const speed = Math.round(Math.hypot(v.x, v.y));
    if (speed < 3) return { value: "CALM", sub };
    let dir = Math.round(((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360 / 10) * 10;
    if (dir === 0) dir = 360;
    const low = onSurface(status) || !status.aircraft || status.aircraft.altAglM <= WIND_COLOR_AGL_M;
    return { value: `${String(dir).padStart(3, "0")}/${String(speed).padStart(2, "0")}`, sub, valueColor: low ? windColor(speed) : undefined };
}

/** Visibility in statute miles as a pilot reads it: 10 SM at most, quarters below 1. */
function visibilitySm(m: number): string {
    const sm = m / 1609.344;
    if (sm >= 10) return "10";
    if (sm >= 1) return String(Math.round(sm));
    const q = Math.round(sm * 4);
    return q === 0 ? "0" : q === 4 ? "1" : ["", "1/4", "1/2", "3/4"][q]!;
}

/**
 * Current conditions at the aircraft, in the order a pilot cares about: thunderstorm
 * (red ring), precipitation (snow at 0 °C or below), fog or mist from visibility, then
 * the sky from the most-covered cloud layer in oktas. The bottom line is the ceiling,
 * the lowest broken or overcast layer above the ground, or the visibility with no ceiling.
 */
export function conditions(current: Current, _status: Status): Reading {
    const ground = current.groundElevationM;
    const layers = current.cloudLayers ?? [];
    const oktas = (coverage: number) => Math.round(coverage * 8);
    const ceiling = layers
        .filter((l) => oktas(l.coverage) >= 5 && l.baseM > ground)
        .map((l) => (l.baseM - ground) * FT_PER_M)
        .sort((a, b) => a - b)[0];
    const vis = current.visibilityM ?? Infinity;
    const sub =
        ceiling !== undefined
            ? `CIG ${(Math.round(ceiling / 100) * 100).toLocaleString("en-US")} FT`
            : `VIS ${visibilitySm(vis)} SM`;

    if ((current.thunderstorm ?? 0) > 0) return { value: "T-STORM", sub, accent: RED, icon: "storm" };
    if ((current.precipitationMmHr ?? 0) > 0.1) {
        return current.temperatureC <= 0 ? { value: "SNOW", sub, icon: "snow" } : { value: "RAIN", sub, icon: "rain" };
    }
    if (vis < 1000) return { value: "FOG", sub, icon: "fog" };
    if (vis < 5000) return { value: "MIST", sub, icon: "fog" };
    const most = Math.max(0, ...layers.map((l) => oktas(l.coverage)));
    if (most === 0) return { value: "CLEAR", sub, icon: "sun" };
    if (most <= 2) return { value: "FEW", sub, icon: "partly" };
    if (most <= 4) return { value: "SCATTERED", sub, icon: "partly" };
    if (most <= 7) return { value: "BROKEN", sub, icon: "cloud" };
    return { value: "OVERCAST", sub, icon: "cloud" };
}

/** A PIREP field such as "/TB MOD" or "/IC LGT RIME", up to the next field. */
function field(text: string, name: string): string | undefined {
    return new RegExp(`/${name}\\s+([^/]+)`).exec(text)?.[1]?.trim();
}

/** 0 smooth or none, 1 light, 2 moderate (light-moderate counts), 3 severe or extreme. */
function level(intensity: string | undefined): number {
    const s = (intensity ?? "").toUpperCase();
    if (/SEV|EXT/.test(s)) return 3;
    if (/MOD/.test(s)) return 2;
    if (/LGT|LIGHT/.test(s)) return 1;
    return 0;
}

/** One advisory read for the key: a PIREP's turbulence and icing, or a SIGMET's hazard. */
export type Item = { kind: "PIREP" | "SIGMET"; turb?: string; ice?: string; advisory: Advisory };

function readItem(a: Advisory): Item {
    if (a.kind === "SIGMET") return { kind: "SIGMET", advisory: a };
    const turb = a.turbIntensity ?? field(a.text, "TB")?.split(/\s/)[0];
    const ice = field(a.text, "IC")?.split(/\s/)[0];
    return { kind: "PIREP", turb, ice, advisory: a };
}

/** The StrataWx airport page's advisories: SIGMETs first, as the real hazard warnings, then PIREPs, each nearest first. */
export function advisories(list: Advisory[]): Item[] {
    return list
        .filter((a) => a.kind === "PIREP" || a.kind === "SIGMET")
        .sort((a, b) => (a.kind === b.kind ? a.distanceNm - b.distanceNm : a.kind === "SIGMET" ? -1 : 1))
        .map(readItem);
}

/** The key at rest: the total, any SIGMET as the red alert, else the worst moderate or severe PIREP. */
export function advisoryCount(items: Item[], rangeNm: number): Reading {
    if (items.length === 0) return { value: "NONE", sub: `WITHIN ${rangeNm} NM` };
    const sigmets = items.filter((i) => i.kind === "SIGMET").length;
    if (sigmets > 0) return { value: String(items.length), sub: `${sigmets} SIGMET`, accent: RED };
    let worst = { lvl: 1, label: "" };
    for (const p of items) {
        for (const [kind, intensity] of [["TURB", p.turb], ["ICE", p.ice]] as const) {
            const lvl = level(intensity);
            if (lvl > worst.lvl) worst = { lvl, label: `${lvl === 3 ? "SEV" : "MOD"} ${kind}` };
        }
    }
    if (worst.lvl >= 2) return { value: String(items.length), sub: worst.label, accent: worst.lvl === 3 ? RED : AMBER };
    return { value: String(items.length), sub: `${items.length} PIREP · 0 SIGMET` };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** "40 NM NW", or just the distance when StrataWx gives no bearing. */
function where(a: Advisory): string {
    const nm = `${Math.round(a.distanceNm)} NM`;
    return typeof a.bearingDeg === "number" ? `${nm} ${COMPASS[Math.round(a.bearingDeg / 45) % 8]}` : nm;
}

const fl = (ft: number) => `${String(Math.round(ft / 100)).padStart(3, "0")}`;

/** SIGMET hazards as short words that fit a key. */
const SIGMET_HAZARD: Record<string, string> = {
    CONVECTIVE: "T-STORMS",
    TURB: "TURB",
    ICE: "ICE",
    IFR: "IFR",
    "MTN OBSCN": "MTN OBSC",
};

/** One advisory after a press. A PIREP: condition, height, who and where. A SIGMET: hazard, levels, where, with the red ring. */
export function advisoryDetail(item: Item): Reading {
    const a = item.advisory;
    if (item.kind === "SIGMET") {
        const hazard = SIGMET_HAZARD[a.hazard] ?? "SIGMET";
        const sev = a.severity ? `${a.severity.split(/[\s-]/)[0]} ` : "";
        const lo = a.altLowFt;
        const hi = a.altHiFt;
        const levels =
            lo !== undefined && hi !== undefined ? `${lo > 0 ? `FL${fl(lo)}` : "SFC"}-${fl(hi)}` : hi !== undefined ? `TO FL${fl(hi)}` : "";
        return { value: levels ? `${sev}${hazard}|${levels}` : `${sev}${hazard}`, sub: where(a), accent: RED };
    }
    let condition: string;
    if (item.ice && level(item.ice) > 0) condition = `${item.ice} ICE`;
    else if (item.turb) condition = level(item.turb) === 0 ? "SMOOTH" : `${item.turb} TURB`;
    else condition = "REPORT";
    const ft = a.altLowFt || a.altHiFt;
    const height = ft && ft > 0 ? `FL${fl(ft)}` : "";
    const lvl = Math.max(level(item.turb), level(item.ice));
    return {
        value: height ? `${condition}|${height}` : condition,
        sub: `${a.reporterType ?? "PIREP"} · ${where(a)}`,
        accent: lvl === 3 ? RED : lvl === 2 ? AMBER : undefined,
    };
}

/** Feet above sea level as a pilot reads it: 14,300, or FL180 and up as a flight level. */
function feetLabel(m: number): string {
    const ft = Math.round((m * FT_PER_M) / 100) * 100;
    return ft >= 18000 ? `FL${String(ft / 100).padStart(3, "0")}` : ft.toLocaleString("en-US");
}

/**
 * The freezing level: where the temperature profile StrataWx returns (the surface, then
 * `hazards.levels` above it) crosses 0 °C, in feet above sea level. More than one crossing
 * shows the lowest and says how many; no crossing says whether it is all above or all below.
 */
export function freezingLevel(current: Current, _status: Status): Reading {
    const ground = current.groundElevationM;
    const points = [
        { alt: ground, t: current.temperatureC },
        ...(current.hazards?.levels ?? []).filter((l) => l.altitudeM > ground).map((l) => ({ alt: l.altitudeM, t: l.temperatureC })),
    ].sort((a, b) => a.alt - b.alt);
    if (points.length < 2) return { value: "--", sub: "NO PROFILE" };
    const crossings: number[] = [];
    for (let i = 1; i < points.length; i++) {
        const lo = points[i - 1]!;
        const hi = points[i]!;
        if (lo.t > 0 !== hi.t > 0) crossings.push(lo.alt + ((hi.alt - lo.alt) * lo.t) / (lo.t - hi.t));
    }
    if (crossings.length === 0) {
        return points[0]!.t <= 0
            ? { value: "SURFACE", sub: "ALL BELOW 0°C", accent: ICE }
            : { value: "NONE", sub: "ALL ABOVE 0°C" };
    }
    const value = feetLabel(crossings[0]!);
    const ft = !value.startsWith("FL");
    return crossings.length === 1
        ? { value, sub: ft ? "FT MSL" : "MSL" }
        : { value, sub: `LOWEST OF ${crossings.length}` };
}

/** The wind layers StrataWx returns, surface first, as the dial steps through them. */
export function windLayerCount(current: Current): number {
    return current.windLayers.length;
}

/** One wind layer for the dial: its height (SURFACE, 3,000 FT, FL240), and direction/speed coloured like the Wind key near the ground. */
export function windLayer(current: Current, index: number): Reading {
    const layers = [...current.windLayers].sort((a, b) => a.altitudeM - b.altitudeM);
    const l = layers[Math.max(0, Math.min(index, layers.length - 1))];
    if (!l) return { value: "--", sub: "NO WIND DATA" };
    const ground = current.groundElevationM;
    const surface = index <= 0;
    const at = surface ? ground : Math.max(l.altitudeM, ground);
    const height = surface ? "SURFACE" : feetLabel(at);
    const sub = surface ? "SURFACE" : height.startsWith("FL") ? height : `${height} FT`;
    const speed = Math.round(l.speedKt);
    if (speed < 3) return { value: "CALM", sub };
    let dir = Math.round(l.directionDeg / 10) * 10 % 360;
    if (dir === 0) dir = 360;
    const low = at - ground <= WIND_COLOR_AGL_M;
    return { value: `${String(dir).padStart(3, "0")}/${String(speed).padStart(2, "0")}`, sub, valueColor: low ? windColor(speed) : undefined };
}
