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
    throw new Error(`Django API error: ${response.statusText}`);
  }

  return response.json();
}
