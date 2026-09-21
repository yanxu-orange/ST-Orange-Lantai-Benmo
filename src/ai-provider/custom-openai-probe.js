import { API_ROUTES } from '../constants.js';
import { HttpError, postJson } from '../st-adapter/http.js';

export const SECONDARY_API_PROBE_MARKER = 'TKM_SECONDARY_API_OK';

export function normalizeEndpoint(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError('插件 API URL 不能为空。');
    }

    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError('插件 API URL 必须使用 HTTP 或 HTTPS。');
    }
    return url.toString().replace(/\/$/, '');
}

export function classifyConnectionError(error) {
    if (error instanceof HttpError) {
        if ([401, 403].includes(error.status)) return 'authentication';
        if (error.status === 404) return 'endpoint_or_model';
        if (error.status === 429) return 'rate_limit';
        if (error.status >= 500) return 'provider_unavailable';
        return 'http_error';
    }
    if (error?.name === 'AbortError') return 'timeout';
    if (error instanceof TypeError) return 'configuration';
    return 'network_or_unknown';
}

export async function probeCustomOpenAIConnection({
    endpoint,
    secretId,
    headers,
    fetchImpl,
    signal,
}) {
    if (!secretId || typeof secretId !== 'string') {
        throw new TypeError('插件 API Key 尚未安全保存。');
    }

    const customUrl = normalizeEndpoint(endpoint);
    const response = await postJson(API_ROUTES.customChatStatus, {
        chat_completion_source: 'custom',
        custom_url: customUrl,
        secret_id: secretId,
    }, { headers, fetchImpl, signal });

    if (response?.error === true) {
        throw new Error('SillyTavern reported a custom API connection error.');
    }

    const models = Array.isArray(response?.data)
        ? response.data.map(item => item?.id).filter(Boolean)
        : [];
    return { ok: true, endpoint: customUrl, models };
}

function readAssistantText(response) {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
        return content
            .map(item => typeof item === 'string' ? item : item?.text)
            .filter(value => typeof value === 'string')
            .join('')
            .trim();
    }
    return '';
}

function parseProbeJson(text) {
    const unfenced = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    let value;
    try {
        value = JSON.parse(unfenced);
    } catch {
        throw new Error('插件 API 已返回内容，但测试结果无法解析。');
    }
    if (
        !value
        || typeof value !== 'object'
        || Array.isArray(value)
        || value.probe !== SECONDARY_API_PROBE_MARKER
    ) {
        throw new Error('插件 API 已返回内容，但测试字段校验失败。');
    }
    return value;
}

export async function probeCustomOpenAIGeneration({
    endpoint,
    model,
    secretId,
    headers,
    fetchImpl,
    signal,
}) {
    if (!secretId || typeof secretId !== 'string') {
        throw new TypeError('插件 API Key 尚未安全保存。');
    }
    if (typeof model !== 'string' || !model.trim()) {
        throw new TypeError('插件 API 模型名不能为空。');
    }

    const customUrl = normalizeEndpoint(endpoint);
    const response = await postJson(API_ROUTES.customChatGenerate, {
        chat_completion_source: 'custom',
        custom_url: customUrl,
        secret_id: secretId,
        model: model.trim(),
        messages: [
            {
                role: 'system',
                content: 'You are running an isolated connection probe. Return only valid JSON without explanation.',
            },
            {
                role: 'user',
                content: `Reply with exactly this JSON object: {"probe":"${SECONDARY_API_PROBE_MARKER}"}`,
            },
        ],
        stream: false,
        max_tokens: 64,
        n: 1,
    }, { headers, fetchImpl, signal });

    if (response?.error) {
        const message = typeof response.error?.message === 'string'
            ? response.error.message
            : '插件 API 返回了错误。';
        throw new Error(message);
    }

    const text = readAssistantText(response);
    const parsed = parseProbeJson(text);

    return {
        ok: true,
        endpoint: customUrl,
        model: model.trim(),
        marker: parsed.probe,
    };
}

export { parseProbeJson, readAssistantText };
