export class HttpError extends Error {
    constructor(message, { status, body } = {}) {
        super(message);
        this.name = 'HttpError';
        this.status = status ?? null;
        this.body = body ?? null;
    }
}

async function readResponseBody(response) {
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function postJson(route, body, {
    fetchImpl = globalThis.fetch,
    headers = { 'Content-Type': 'application/json' },
    signal,
} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch() is unavailable.');
    }

    const response = await fetchImpl(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    });
    const responseBody = await readResponseBody(response);

    if (!response.ok) {
        throw new HttpError(`Request failed with HTTP ${response.status}.`, {
            status: response.status,
            body: responseBody,
        });
    }

    return responseBody;
}

