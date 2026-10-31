/**
 * Reads the StrataWx desktop app's local weather service. Read only: the plugin calls
 * nothing but these three addresses, because several other StrataWx addresses change its
 * settings even though they are plain GETs (arm, clear, freeze, refresh and others).
 * `status` is asked for with no query string; `?workerId=` would claim the in-sim panel's lease.
 */
const BASE = "http://127.0.0.1:19286/api/v1";
const TIMEOUT_MS = 3000;
const POLL_MS = 5000;
/** The airport picture is built on request and changes slowly, so it is asked for once a minute. */
const AIRPORT_MS = 60000;
const AIRPORT_TIMEOUT_MS = 15000;

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
    /** The station StrataWx takes the surface weather from. */
    metar?: { station?: string };
};

/** A PIREP or SIGMET, as StrataWx lists them. */
export type Advisory = {
    kind: string;
    hazard: string;
    text: string;
    distanceNm: number;
    bearingDeg?: number;
    severity?: string | null;
    altLowFt?: number;
    altHiFt?: number;
    turbIntensity?: string;
    reporterType?: string;
};

/** The parts of GET /weather/status the keys use. */
export type Status = {
    aircraft?: { altM: number; altAglM: number; onGround: boolean };
    units?: { pressure?: string };
};

/** The advisories the StrataWx app shows on its airport page: everything within `rangeNm` of the station. */
export type Advisories = { station: string; rangeNm: number; items: Advisory[] };

/** What the keys draw from: both answers, or why there are none. */
export type Snapshot =
    | { state: "ok"; current: Current; status: Status; advisories?: Advisories }
    | { state: "waiting" }
    | { state: "off" };

async function get<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<{ code: number; body?: T }> {
    const res = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
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
    private advisories: Advisories | undefined;
    private airportAt = 0;
    private airportBusy = false;

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
            const [current, status] = await Promise.all([get<Current>("weather/current"), get<Status>("weather/status")]);
            // 503 means the app is up but has not produced its first weather yet.
            if (current.body && status.body) {
                const station = current.body.metar?.station;
                if (this.advisories && this.advisories.station !== station) this.advisories = undefined;
                this.snapshot = { state: "ok", current: current.body, status: status.body, advisories: this.advisories };
                if (station) this.pollAirport(station);
            } else {
                this.snapshot = { state: current.code === 503 ? "waiting" : "off" };
            }
        } catch {
            this.snapshot = { state: "off" };
        }
        this.onChange();
    }

    /** Fetches the station's advisories in the background, at most once a minute or when the station changes. */
    private pollAirport(station: string): void {
        const due = !this.advisories || this.advisories.station !== station || Date.now() - this.airportAt >= AIRPORT_MS;
        if (!due || this.airportBusy) return;
        this.airportBusy = true;
        this.airportAt = Date.now();
        get<{ pending?: string[]; advisories?: { state?: string; rangeNm?: number; items?: Advisory[] } }>(
            `airport/${encodeURIComponent(station)}`,
            AIRPORT_TIMEOUT_MS,
        )
            .then(({ body }) => {
                // While StrataWx is still fetching them, the list comes back empty and marked pending:
                // keep the last list and ask again on the next poll rather than showing NONE.
                if (body?.pending?.includes("advisories")) {
                    this.airportAt = 0;
                    return;
                }
                const a = body?.advisories;
                // "none" is a real empty list; anything else unreadable keeps the last list.
                if (a && (a.state === "available" || a.state === "none")) {
                    this.advisories = { station, rangeNm: a.rangeNm ?? 100, items: a.items ?? [] };
                    if (this.snapshot.state === "ok") this.snapshot = { ...this.snapshot, advisories: this.advisories };
                    this.onChange();
                }
            })
            .catch(() => {})
            .finally(() => {
                this.airportBusy = false;
            });
    }
}

export const strataWx = new StrataWxFeed();
