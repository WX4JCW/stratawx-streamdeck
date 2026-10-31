/**
 * The Panel key style shared with the ChasePlane and Sim Clock plugins: key tinted a deep
 * shade of the app's colour, a solid caption band on top, the value in the middle, a
 * status line at the bottom, and a ring for an alert. StrataWX has one colour, sky cyan.
 * Only flat shapes and text, which Stream Deck draws reliably.
 */
const HUE = 190;
const SAT = 85;
const FONT = "Segoe UI, Arial, sans-serif";

function hsl(h: number, s: number, l: number): string {
    const sat = s / 100;
    const light = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const COLORS = { deep: hsl(HUE, SAT * 0.8, 11), band: hsl(HUE, SAT, 52), text: hsl(HUE, SAT, 78) };

/** Black or white, whichever reads better on `background` (WCAG contrast). */
function ink(background: string): string {
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => lin(parseInt(background.slice(i, i + 2), 16) / 255));
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#0A0A0A" : "#FFFFFF";
}

function xml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Capitals measured at 0.72 of the font size per character, shrunk from `max` down to
 * `min` to fit `width`, and cut with an ellipsis only below that.
 */
const CAPS_GLYPH = 0.72;
function line(y: number, raw: string, fill: string, width: number, max: number, min: number): string {
    let value = raw.toUpperCase();
    let size = Math.min(max, Math.floor(width / (Math.max(1, value.length) * CAPS_GLYPH)));
    if (size < min) {
        size = min;
        value = `${value.slice(0, Math.floor(width / (size * CAPS_GLYPH)) - 1)}…`;
    }
    return (
        `<text x="72" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" ` +
        `font-weight="bold" fill="${fill}">${xml(value)}</text>`
    );
}

export type Look = {
    caption: string;
    /** Main text; a "|" breaks it into two lines. */
    value: string;
    sub?: string;
    /** Ring and status line colour for an alert (freezing, a moderate or severe PIREP). */
    accent?: string;
    /** Colour for the main text, such as the temperature scale; otherwise white on an alert, the app's light cyan at rest. */
    valueColor?: string;
};

export function keyImage(look: Look): string {
    const c = COLORS;
    const valueFill = look.valueColor ?? (look.accent ? "#FFFFFF" : c.text);
    const lines = look.value.split("|");
    const bottom = look.sub ? 26 : 0;
    const mid = 30 + (144 - 30 - bottom) / 2;
    const value =
        lines.length === 1
            ? line(Math.round(mid + 36 * 0.36), lines[0]!, valueFill, 128, 36, 12)
            : line(Math.round(mid - 4), lines[0]!, valueFill, 128, 22, 12) + line(Math.round(mid + 23), lines[1]!, valueFill, 128, 22, 12);
    const body =
        `<rect width="144" height="144" fill="#000000"/>` +
        `<rect width="144" height="144" rx="18" fill="${c.deep}"/>` +
        `<rect width="144" height="30" rx="18" fill="${c.band}"/><rect y="16" width="144" height="14" fill="${c.band}"/>` +
        line(21, look.caption, ink(c.band), 124, 15, 10) +
        (look.accent ? `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${look.accent}" stroke-width="5"/>` : "") +
        value +
        (look.sub ? line(130, look.sub, look.accent ?? c.text, 124, 16, 10) : "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${body}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
