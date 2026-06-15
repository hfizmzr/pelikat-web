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
    const message = await response.text();
    throw new Error(`Django API error: ${message || response.statusText}`);
  }

  return response.json();
}

export async function fetchDjangoApiMultipart(endpoint: string, formData: FormData) {
  const djangoUrl = process.env.DJANGO_URL || 'http://localhost:8000';
  const internalApiKey = process.env.INTERNAL_API_KEY || 'dummy-internal-api-key-12345';

  const response = await fetch(`${djangoUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'X-Internal-Key': internalApiKey },
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Django API error: ${message || response.statusText}`);
  }

  return response.json();
}
