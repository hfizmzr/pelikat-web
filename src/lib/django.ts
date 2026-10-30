export class DjangoApiError extends Error {
  /** Field errors from Django's {message, errors} JSON envelope, if any. */
  readonly errors: unknown
  /** HTTP status Django answered with (0/unknown when absent). */
  readonly status: number
  constructor(message: string, errors?: unknown, status?: number) {
    super(message)
    this.name = 'DjangoApiError'
    this.errors = errors
    this.status = status ?? 0
  }
}

// Env values are resolved at REQUEST time, not module load: `next build`
// evaluates imported modules while collecting page data and the Docker
// builder stage runs without DJANGO_URL / INTERNAL_API_KEY (runtime-only
// env_file). There are still no fallback keys anywhere — a missing config
// fails the individual request (and any real fetch) loudly instead of
// breaking `pnpm run build`.
function requireEnv(name: 'DJANGO_URL' | 'INTERNAL_API_KEY'): string {
  const value = process.env[name]
  if (!value) throw new Error('INTERNAL_API_KEY / DJANGO_URL not configured')
  return value
}

export function getDjangoConfig() {
  return {
    djangoUrl: requireEnv('DJANGO_URL'),
    internalApiKey: requireEnv('INTERNAL_API_KEY'),
  }
}

export async function fetchDjangoApi(endpoint: string, options: RequestInit = {}) {

  const { djangoUrl, internalApiKey } = getDjangoConfig();
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Key': internalApiKey,
    ...options.headers,
  };

  const response = await fetch(`${djangoUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Django returns {message, errors} JSON envelopes; surface the mapped
    // message (and field errors via DjangoApiError.errors) instead of the
    // raw body. Throw-on-!ok semantics unchanged.
    const text = await response.text()
    let message = text || response.statusText
    let errors: unknown = undefined
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (typeof parsed.message === 'string') message = parsed.message
        // /ai/* views answer {error: "..."} instead
        else if (typeof parsed.error === 'string') message = parsed.error
        errors = parsed.errors
      }
    } catch {
      // not JSON — keep the raw body as the message
    }
    throw new DjangoApiError(`Django API error: ${message}`, errors, response.status)
  }

  return response.json();
}
