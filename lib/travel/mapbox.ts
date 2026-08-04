import type { TravelEstimate, TravelProvider, TravelQuery } from './types';

/**
 * Mapbox Directions — live and predicted traffic.
 *
 * The `driving-traffic` profile accepts `depart_at`, and the docs are explicit
 * that the returned duration is "a prediction for travel time based on
 * historical travel data and live traffic". That is what makes "leave by" for a
 * 9pm screening a real number rather than current traffic mislabelled.
 *
 * The token ships in the client bundle, which is by design rather than an
 * oversight: Mapbox's own guidance is to restrict a public token by URL, and
 * URL restrictions only work on browser requests. Use a *new* public token —
 * an account's default one cannot take restrictions — scoped to Directions and
 * locked to the deployment's domain.
 *
 * With no token this provider reports itself unavailable and the schedule model
 * answers instead. That is a normal state, not a broken one.
 */

const ENDPOINT = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';

export class MapboxTrafficProvider implements TravelProvider {
  readonly id = 'mapbox';

  constructor(private readonly token: string | undefined) {}

  get available(): boolean {
    return Boolean(this.token);
  }

  async estimate(query: TravelQuery): Promise<TravelEstimate | null> {
    if (!this.token) return null;

    const coords = `${query.from.lng},${query.from.lat};${query.to.lng},${query.to.lat}`;
    const params = new URLSearchParams({
      access_token: this.token,
      overview: 'false',
      alternatives: 'false',
    });

    // Only send depart_at for a genuinely future trip. For a journey starting
    // now, omitting it asks for live conditions, which is both cheaper and more
    // accurate than a prediction for one minute ahead.
    const leadMinutes = (query.departAt.getTime() - Date.now()) / 60_000;
    if (leadMinutes > 15) params.set('depart_at', query.departAt.toISOString());

    let body: { routes?: Array<{ duration?: number }>; message?: string };
    try {
      const response = await fetch(`${ENDPOINT}/${coords}?${params}`);
      // A quota or token problem must degrade to the model, not surface as an
      // error to someone who only wanted to know what time to leave.
      if (!response.ok) return null;
      body = await response.json();
    } catch {
      return null;
    }

    const seconds = body.routes?.[0]?.duration;
    if (typeof seconds !== 'number') return null;

    return {
      minutes: Math.max(1, Math.round(seconds / 60)),
      source: 'traffic',
      confidence: 'high',
      label: leadMinutes > 15 ? 'predicted traffic' : 'live traffic',
    };
  }
}
