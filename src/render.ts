/**
 * The Panel key style shared with Camera Deck for ChasePlane and MSFS SimClock: a plain charcoal
 * key, a solid caption band on top in the app's colour with white caption text, the value in the
 * middle, a status line at the bottom, and a ring for an alert. WX Deck has one colour, sky blue.
 * Only flat shapes and text, which Stream Deck draws reliably.
 */
const HUE = 205;
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

/** WCAG contrast of white text on `background`. */
function whiteContrast(background: string): number {
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => lin(parseInt(background.slice(i, i + 2), 16) / 255));
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/**
 * The band is the colour at 42% lightness, darkened a point at a time (down to 24%) while white
 * caption text would read under 3:1. The key body is plain charcoal, the same for every app.
 */
function bandColor(): string {
    let l = 42;
    while (l > 24 && whiteContrast(hsl(HUE, SAT, l)) < 3) l--;
    return hsl(HUE, SAT, l);
}

const COLORS = { deep: "#141416", band: bandColor(), text: hsl(HUE, SAT, 78) };
const CAPTION_INK = "#FFFFFF";

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

/** Weather icons, flat shapes drawn in the space between the caption band and the word (y 36..96). */
const SUN = "#FFD23F";
const ICONS = {
    sun:
        `<circle cx="72" cy="64" r="13" fill="${SUN}"/><g stroke="${SUN}" stroke-width="4" stroke-linecap="round">` +
        `<line x1="72" y1="40" x2="72" y2="45"/><line x1="72" y1="83" x2="72" y2="88"/><line x1="48" y1="64" x2="53" y2="64"/>` +
        `<line x1="91" y1="64" x2="96" y2="64"/><line x1="55" y1="47" x2="59" y2="51"/><line x1="85" y1="77" x2="89" y2="81"/>` +
        `<line x1="89" y1="47" x2="85" y2="51"/><line x1="59" y1="77" x2="55" y2="81"/></g>`,
    partly:
        `<circle cx="62" cy="57" r="12" fill="${SUN}"/><g fill="#E6EEF2"><circle cx="70" cy="72" r="11"/>` +
        `<circle cx="84" cy="66" r="13"/><circle cx="96" cy="74" r="9"/><rect x="60" y="72" width="44" height="11" rx="5.5"/></g>`,
    cloud:
        `<g fill="#C9D4DA"><circle cx="58" cy="68" r="13"/><circle cx="76" cy="58" r="17"/><circle cx="92" cy="70" r="11"/>` +
        `<rect x="45" y="68" width="58" height="14" rx="7"/></g>`,
    rain:
        `<g fill="#AEB9C0"><circle cx="58" cy="58" r="12"/><circle cx="76" cy="49" r="15"/><circle cx="92" cy="60" r="10"/>` +
        `<rect x="46" y="58" width="56" height="12" rx="6"/></g><g stroke="#5DA9FF" stroke-width="4" stroke-linecap="round">` +
        `<line x1="58" y1="76" x2="54" y2="86"/><line x1="72" y1="76" x2="68" y2="86"/><line x1="86" y1="76" x2="82" y2="86"/></g>`,
    snow:
        `<g fill="#AEB9C0"><circle cx="58" cy="58" r="12"/><circle cx="76" cy="49" r="15"/><circle cx="92" cy="60" r="10"/>` +
        `<rect x="46" y="58" width="56" height="12" rx="6"/></g><g fill="#FFFFFF"><circle cx="57" cy="80" r="3.5"/>` +
        `<circle cx="72" cy="85" r="3.5"/><circle cx="87" cy="80" r="3.5"/></g>`,
    storm:
        `<g fill="#8E99A1"><circle cx="58" cy="56" r="12"/><circle cx="76" cy="47" r="15"/><circle cx="92" cy="58" r="10"/>` +
        `<rect x="46" y="56" width="56" height="12" rx="6"/></g><polygon points="76,68 64,84 73,84 68,96 84,78 75,78 80,68" fill="${SUN}"/>`,
    fog:
        `<g stroke="#C9D4DA" stroke-width="5" stroke-linecap="round"><line x1="46" y1="52" x2="98" y2="52"/>` +
        `<line x1="40" y1="64" x2="104" y2="64"/><line x1="46" y1="76" x2="98" y2="76"/><line x1="54" y1="88" x2="90" y2="88"/></g>`,
};

export type Look = {
    caption: string;
    /** Main text; a "|" breaks it into two lines. */
    value: string;
    sub?: string;
    /** Ring and status line colour for an alert (freezing, a moderate or severe PIREP). */
    accent?: string;
    /** Colour for the main text, such as the temperature scale; otherwise white on an alert, the app's light blue at rest. */
    valueColor?: string;
    /** A weather icon; the value then becomes a smaller word under it. */
    icon?: keyof typeof ICONS;
};

export function keyImage(look: Look): string {
    const c = COLORS;
    const valueFill = look.valueColor ?? (look.accent ? "#FFFFFF" : c.text);
    const lines = look.value.split("|");
    const bottom = look.sub ? 26 : 0;
    const mid = 30 + (144 - 30 - bottom) / 2;
    const value = look.icon
        ? ICONS[look.icon] + line(110, look.value, valueFill, 128, 18, 12)
        : lines.length === 1
            ? line(Math.round(mid + 36 * 0.36), lines[0]!, valueFill, 128, 36, 12)
            : line(Math.round(mid - 4), lines[0]!, valueFill, 128, 22, 12) + line(Math.round(mid + 23), lines[1]!, valueFill, 128, 22, 12);
    const body =
        `<rect width="144" height="144" fill="#000000"/>` +
        `<rect width="144" height="144" rx="18" fill="${c.deep}"/>` +
        `<rect width="144" height="30" rx="18" fill="${c.band}"/><rect y="16" width="144" height="14" fill="${c.band}"/>` +
        line(21, look.caption, CAPTION_INK, 124, 15, 10) +
        (look.accent ? `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${look.accent}" stroke-width="5"/>` : "") +
        value +
        (look.sub ? line(130, look.sub, look.accent ?? c.text, 124, 16, 10) : "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">${body}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * One dial's section of the touch strip (200 x 100) in the same Panel look: caption band, value,
 * status line. With a weather icon, the icon sits on the left and the word and status line beside it.
 */
export function stripImage(look: Look): string {
    const c = COLORS;
    const valueFill = look.valueColor ?? (look.accent ? "#FFFFFF" : c.text);
    const text = (x: number, y: number, raw: string, fill: string, width: number, max: number, min: number) => {
        let value = raw.toUpperCase();
        let size = Math.min(max, Math.floor(width / (Math.max(1, value.length) * CAPS_GLYPH)));
        if (size < min) {
            size = min;
            value = `${value.slice(0, Math.floor(width / (size * CAPS_GLYPH)) - 1)}…`;
        }
        return (
            `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" ` +
            `font-weight="bold" fill="${fill}">${xml(value)}</text>`
        );
    };
    const middle = look.icon
        ? // The key icons are drawn around (72, 68); scaled to 0.7 they sit at the strip's left.
          `<g transform="translate(-5 14) scale(0.7)">${ICONS[look.icon]}</g>` +
          text(128, 64, look.value, valueFill, 128, 22, 12) +
          (look.sub ? text(128, 88, look.sub, look.accent ?? c.text, 128, 13, 9) : "")
        : text(100, 66, look.value, valueFill, 180, 32, 14) + (look.sub ? text(100, 91, look.sub, look.accent ?? c.text, 180, 15, 10) : "");
    const body =
        `<rect width="200" height="100" fill="#000000"/>` +
        `<rect x="2" y="2" width="196" height="96" rx="14" fill="${c.deep}"/>` +
        `<rect x="2" y="2" width="196" height="24" rx="14" fill="${c.band}"/><rect x="2" y="14" width="196" height="12" fill="${c.band}"/>` +
        text(100, 19, look.caption, CAPTION_INK, 180, 14, 10) +
        (look.accent ? `<rect x="4" y="4" width="192" height="92" rx="12" fill="none" stroke="${look.accent}" stroke-width="3"/>` : "") +
        middle;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">${body}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
