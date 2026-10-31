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

/** Ring colours for alerts; the key itself stays the app's sky cyan. */
export const ICE = "#E8F7FF";
export const AMBER = "#FFB020";
export const RED = "#FF4040";

export type Reading = { value: string; sub: string; accent?: string; valueColor?: string };

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
    return { value: `${String(dir).padStart(3, "0")}/${speed}`, sub };
}

/** A PIREP field such as "/TB MOD" or "/IC LGT RIME", up to the next field. */
function field(text: string, name: string): string | undefined {
    return new RegExp(`/${name}\\s+([^/]+)`).exec(text)?.[1]?.trim();
}

/** 0 smooth or none, 1 light, 2 moderate (light-moderate counts), 3 severe or extreme. */
function level(intensity: string | undefined): number {
    const s = (intensity ?? "").toUpperCase();
    if (/SEV|EXTR/.test(s)) return 3;
    if (/MOD/.test(s)) return 2;
    if (/LGT|LIGHT/.test(s)) return 1;
    return 0;
}

type Pirep = { turb?: string; ice?: string; advisory: Advisory };

function readPirep(a: Advisory): Pirep {
    const turb = a.turbIntensity ?? field(a.text, "TB")?.split(/\s/)[0];
    const ice = field(a.text, "IC")?.split(/\s/)[0];
    return { turb, ice, advisory: a };
}

/** PIREPs StrataWx reports nearby, nearest first. */
export function pireps(status: Status): Pirep[] {
    return (status.advisories ?? [])
        .filter((a) => a.kind === "PIREP")
        .sort((a, b) => a.distanceNm - b.distanceNm)
        .map(readPirep);
}

/** The PIREP key at rest: how many, and the worst moderate or severe report as the alert. */
export function pirepCount(list: Pirep[]): Reading {
    if (list.length === 0) return { value: "NONE", sub: "NEARBY" };
    let worst = { lvl: 1, label: "" };
    for (const p of list) {
        for (const [kind, intensity] of [["TURB", p.turb], ["ICE", p.ice]] as const) {
            const lvl = level(intensity);
            if (lvl > worst.lvl) worst = { lvl, label: `${lvl === 3 ? "SEV" : "MOD"} ${kind}` };
        }
    }
    if (worst.lvl >= 2) return { value: String(list.length), sub: worst.label, accent: worst.lvl === 3 ? RED : AMBER };
    return { value: String(list.length), sub: `NEAREST ${Math.round(list[0]!.advisory.distanceNm)} NM` };
}

/** One PIREP after a press: condition, height, and who reported it how far away. */
export function pirepDetail(p: Pirep): Reading {
    const a = p.advisory;
    let condition: string;
    if (p.ice && level(p.ice) > 0) condition = `${p.ice} ICE`;
    else if (p.turb) condition = level(p.turb) === 0 ? "SMOOTH" : `${p.turb} TURB`;
    else condition = "REPORT";
    const ft = a.altLowFt || a.altHiFt;
    const height = ft && ft > 0 ? `FL${String(Math.round(ft / 100)).padStart(3, "0")}` : "";
    const lvl = Math.max(level(p.turb), level(p.ice));
    return {
        value: height ? `${condition}|${height}` : condition,
        sub: `${a.reporterType ?? "PIREP"} · ${Math.round(a.distanceNm)} NM`,
        accent: lvl === 3 ? RED : lvl === 2 ? AMBER : undefined,
    };
}
