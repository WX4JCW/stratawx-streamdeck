/**
 * Reads the StrataWx desktop app's local weather service. Read only: the plugin calls
 * nothing but these two addresses, because several other StrataWx addresses change its
 * settings even though they are plain GETs (arm, clear, freeze, refresh and others).
 * `status` is asked for with no query string; `?workerId=` would claim the in-sim panel's lease.
 */
const BASE = "http://127.0.0.1:19286/api/v1/weather";
const TIMEOUT_MS = 3000;
const POLL_MS = 5000;

export type WindLayer = { altitudeM: number; directionDeg: number; speedKt: number };
export type HazardLevel = { altitudeM: number; temperatureC: number };

/** The parts of GET /weather/current the keys use. */
export type Current = {
    groundElevationM: number;
    qnhPa: number;
    temperatureC: number;
    windLayers: WindLayer[];
    /** Bases and tops above sea level; coverage 0..1. */
    cloudLayers?: { baseM: number; topM: number; coverage: number }[];
    visibilityM?: number;
    precipitationMmHr?: number;
    thunderstorm?: number;
    hazards?: { levels?: HazardLevel[] };
    aircraftAltitudeM?: number;
};

export type Advisory = {
    kind: string;
    hazard: string;
    text: string;
    distanceNm: number;
    altLowFt?: number;
    altHiFt?: number;
    turbIntensity?: string;
    reporterType?: string;
};

/** The parts of GET /weather/status the keys use. */
export type Status = {
    aircraft?: { altM: number; altAglM: number; onGround: boolean };
    units?: { pressure?: string };
    advisories?: Advisory[];
};

/** What the keys draw from: both answers, or why there are none. */
export type Snapshot =
    | { state: "ok"; current: Current; status: Status }
    | { state: "waiting" }
    | { state: "off" };

async function get<T>(path: string): Promise<{ code: number; body?: T }> {
    const res = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? { code: res.status, body: (await res.json()) as T } : { code: res.status };
}

/**
 * Polls while at least one key is on the deck. Every answer goes to `onChange`;
 * the actions skip a redraw when the picture would not change.
 */
class StrataWxFeed {
    snapshot: Snapshot = { state: "off" };
    onChange: () => void = () => {};
    private timer: NodeJS.Timeout | undefined;

    start(): void {
        if (this.timer) return;
        void this.poll();
        this.timer = setInterval(() => void this.poll(), POLL_MS);
    }

    stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private async poll(): Promise<void> {
        try {
            const [current, status] = await Promise.all([get<Current>("current"), get<Status>("status")]);
            // 503 means the app is up but has not produced its first weather yet.
            this.snapshot =
                current.body && status.body
                    ? { state: "ok", current: current.body, status: status.body }
                    : { state: current.code === 503 ? "waiting" : "off" };
        } catch {
            this.snapshot = { state: "off" };
        }
        this.onChange();
    }
}

export const strataWx = new StrataWxFeed();
