// Self-hosted on homelab-broker: the API is served from the same origin
// as this static file (one container, see ../../server/index.js), so
// this is just a relative path -- no separate API Gateway domain.
export const API_BASE_URL = '';

// Default period length in days, used to shade the calendar and estimate
// the end of a predicted period. Adjust if it doesn't match reality.
export const PERIOD_LENGTH_DAYS = 5;
