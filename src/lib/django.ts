export class DjangoApiError extends Error {
  /** Field errors from Django's {message, errors} JSON envelope, if any. */
  readonly errors: unknown
  constructor(message: string, errors?: unknown) {
    super(message)
    this.name = 'DjangoApiError'
    this.errors = errors
  }
}

export async function fetchDjangoApi(endpoint: string, options: RequestInit = {}) {
  const djangoUrl = process.env.DJANGO_URL || 'http://localhost:8000';
  const internalApiKey = process.env.INTERNAL_API_KEY || 'dummy-internal-api-key-12345';
  
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
        errors = parsed.errors
      }
    } catch {
      // not JSON — keep the raw body as the message
    }
    throw new DjangoApiError(`Django API error: ${message}`, errors)
  }

  return response.json();
}
