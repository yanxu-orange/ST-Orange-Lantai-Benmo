import { API_ROUTES, SECRET_KEY_CUSTOM } from '../constants.js';
import { postJson } from './http.js';

function assertSecretValue(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError('API Key cannot be empty.');
    }
}

export async function writeCustomSecret({
    value,
    label = '兰台：插件 API',
    headers,
    fetchImpl,
}) {
    assertSecretValue(value);
    const response = await postJson(API_ROUTES.writeSecret, {
        key: SECRET_KEY_CUSTOM,
        value,
        label,
    }, { headers, fetchImpl });

    if (!response?.id || typeof response.id !== 'string') {
        throw new Error('SillyTavern did not return a secret ID.');
    }
    return response.id;
}

export async function deleteCustomSecret({ id, headers, fetchImpl }) {
    if (!id || typeof id !== 'string') {
        return;
    }
    await postJson(API_ROUTES.deleteSecret, {
        key: SECRET_KEY_CUSTOM,
        id,
    }, { headers, fetchImpl });
}

export async function replaceCustomSecret({
    currentId,
    value,
    label,
    headers,
    fetchImpl,
}) {
    const newId = await writeCustomSecret({ value, label, headers, fetchImpl });
    let staleSecretDeleteFailed = false;

    if (currentId && currentId !== newId) {
        try {
            await deleteCustomSecret({ id: currentId, headers, fetchImpl });
        } catch {
            // The newly written secret remains valid. Never delete it merely
            // because cleanup of the old ID failed.
            staleSecretDeleteFailed = true;
        }
    }

    return { secretId: newId, staleSecretDeleteFailed };
}

