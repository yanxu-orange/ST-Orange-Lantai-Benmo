import { API_ROUTES } from '../constants.js';
import { ensureGlobalSettings, getRequestHeaders } from '../st-adapter/context.js';
import { HttpError, postJson } from '../st-adapter/http.js';
import { readAssistantText } from './custom-openai-probe.js';
import { getSecondaryApiPresetState } from './secondary-api-config.js';
import { TkmError } from '../domain/errors.js';

const CHAT_COMPLETION_MODEL_FIELDS = Object.freeze({
    claude: 'claude_model',
    openai: 'openai_model',
    makersuite: 'google_model',
    vertexai: 'vertexai_model',
    openrouter: 'openrouter_model',
    ai21: 'ai21_model',
    mistralai: 'mistralai_model',
    custom: 'custom_model',
    cohere: 'cohere_model',
    perplexity: 'perplexity_model',
    groq: 'groq_model',
    siliconflow: 'siliconflow_model',
    minimax: 'minimax_model',
    electronhub: 'electronhub_model',
    chutes: 'chutes_model',
    nanogpt: 'nanogpt_model',
    deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model',
    xai: 'xai_model',
    pollinations: 'pollinations_model',
    cometapi: 'cometapi_model',
    moonshot: 'moonshot_model',
    fireworks: 'fireworks_model',
    azure_openai: 'azure_openai_model',
    zai: 'zai_model',
    workers_ai: 'workers_ai_model',
});

function activeMainModel(context) {
    const settings = context?.chatCompletionSettings;
    const field = CHAT_COMPLETION_MODEL_FIELDS[settings?.chat_completion_source];
    return (field ? settings?.[field] : settings?.openai_model) ?? context?.mainApi ?? null;
}

export class AiProviderError extends TkmError {
    constructor(message, { code = 'unknown', source = null, retryable = false, cause } = {}) {
        super(message, { code, scope: source ?? 'ai-provider', retryable, cause });
        this.name = 'AiProviderError';
        this.source = source;
    }
}

function classifyProviderError(error, source) {
    if (error instanceof AiProviderError) return error;
    if (error?.name === 'AbortError') {
        return new AiProviderError('AI 请求已超时或取消。', {
            code: 'timeout', source, retryable: true, cause: error,
        });
    }
    if (error instanceof HttpError) {
        const code = [401, 403].includes(error.status)
            ? 'authentication'
            : error.status === 404
                ? 'endpoint_or_model'
                : error.status === 429
                    ? 'rate_limit'
                    : error.status >= 500
                        ? 'provider_unavailable'
                        : 'http_error';
        return new AiProviderError(`AI Provider 请求失败（HTTP ${error.status}）。`, {
            code,
            source,
            retryable: error.status === 429 || error.status >= 500,
            cause: error,
        });
    }
    return new AiProviderError(error?.message ?? 'AI Provider 请求失败。', {
        code: 'network_or_unknown', source, retryable: true, cause: error,
    });
}

function parseJsonText(text) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new AiProviderError('AI Provider 返回了空内容。', { code: 'empty_output' });
    }
    const normalized = text.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    try {
        return JSON.parse(normalized);
    } catch (cause) {
        throw new AiProviderError('AI Provider 返回内容无法解析为 JSON。', {
            code: 'invalid_json', cause,
        });
    }
}

function nextNonWhitespaceIndex(text, start) {
    for (let index = start; index < text.length; index += 1) {
        if (!/\s/u.test(text[index])) return index;
    }
    return -1;
}

function isJsonValueStart(character) {
    return character === '"' || character === '{' || character === '[' || character === '-'
        || character === 't' || character === 'f' || character === 'n' || /\d/u.test(character ?? '');
}

// Some OpenAI-compatible relays advertise strict json_schema support but still
// return otherwise complete JSON with dialogue quotes left unescaped. Repair
// only quote boundaries that can be decided from the surrounding JSON grammar;
// schema and business validation still run after this syntax-only pass.
function repairStrictJsonSyntax(text) {
    const output = [];
    const stack = [];
    let inString = false;
    let stringRole = 'value';

    const completeValue = () => {
        const parent = stack.at(-1);
        if (parent) parent.expect = 'commaOrEnd';
    };
    const quoteCanClose = index => {
        const nextIndex = nextNonWhitespaceIndex(text, index + 1);
        const next = nextIndex === -1 ? null : text[nextIndex];
        if (stringRole === 'key') return next === ':';
        const parent = stack.at(-1);
        if (!parent) return next === null;
        if (parent.type === 'object') {
            if (next === '}') return true;
            if (next !== ',') return false;
            const afterComma = nextNonWhitespaceIndex(text, nextIndex + 1);
            return afterComma !== -1 && text[afterComma] === '"';
        }
        if (next === ']') return true;
        if (next !== ',') return false;
        const afterComma = nextNonWhitespaceIndex(text, nextIndex + 1);
        return afterComma !== -1 && isJsonValueStart(text[afterComma]);
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
            if (character === '\\') {
                output.push(character);
                if (index + 1 < text.length) output.push(text[index += 1]);
                continue;
            }
            if (character === '"') {
                if (!quoteCanClose(index)) {
                    output.push('\\"');
                    continue;
                }
                inString = false;
                const parent = stack.at(-1);
                if (stringRole === 'key') {
                    if (parent) parent.expect = 'colon';
                } else completeValue();
            }
            output.push(character);
            continue;
        }

        if (character === '"') {
            const parent = stack.at(-1);
            stringRole = parent?.type === 'object' && parent.expect === 'keyOrEnd' ? 'key' : 'value';
            inString = true;
            output.push(character);
            continue;
        }
        if (character === '{') stack.push({ type: 'object', expect: 'keyOrEnd' });
        else if (character === '[') stack.push({ type: 'array', expect: 'valueOrEnd' });
        else if (character === ':' && stack.at(-1)?.type === 'object') stack.at(-1).expect = 'value';
        else if (character === ',') {
            const parent = stack.at(-1);
            const nextIndex = nextNonWhitespaceIndex(text, index + 1);
            if (parent && nextIndex !== -1 && ((parent.type === 'object' && text[nextIndex] === '}') || (parent.type === 'array' && text[nextIndex] === ']'))) {
                continue;
            }
            if (parent) parent.expect = parent.type === 'object' ? 'keyOrEnd' : 'valueOrEnd';
        } else if (character === '}' || character === ']') {
            stack.pop();
            completeValue();
        }
        output.push(character);
    }
    return output.join('');
}

function parseStrictJsonText(text) {
    if (typeof text !== 'string' || !text.trim()) {
        throw new AiProviderError('AI Provider 返回了空内容。', { code: 'empty_output' });
    }
    const normalized = text.trim().replace(/^\uFEFF/, '').trim();
    // Accept only a whole-response fence. Never search prose for a JSON fragment.
    const fence = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```[\t ]*$/i.exec(normalized);
    const jsonText = fence ? fence[1].trim() : normalized;
    try {
        return JSON.parse(jsonText);
    } catch {
        const repaired = repairStrictJsonSyntax(jsonText);
        try {
            return JSON.parse(repaired);
        } catch (cause) {
            throw new AiProviderError('AI Provider 返回内容不是合法 JSON，且无法安全修复。', {
                code: 'invalid_json', cause,
            });
        }
    }
}

function parseStrictJsonObject(text) {
    const value = parseStrictJsonText(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AiProviderError('AI Provider 返回内容必须是一个 JSON 对象。', {
            code: 'invalid_json',
        });
    }
    return value;
}

function validationErrorMessage(cause) {
    switch (cause?.code) {
        case 'invalid_summary_schema':
            return 'AI 返回的字段结构不符合插件固定格式，请重试或更换模型／接口。';
        case 'invalid_keyword_mapping':
            return 'AI 返回的关键词索引与当前记忆草稿不匹配，请重试或更换模型／接口。';
        case 'empty_summary':
            return 'AI 没有返回可入库的记忆，请重试或调整提示词。';
        default:
            return 'AI Provider 返回内容未通过结构校验。';
    }
}

function validateOutput(data, validate) {
    if (typeof validate !== 'function') return data;
    try {
        const result = validate(data);
        if (result === false) throw new Error('validator returned false');
        return data;
    } catch (cause) {
        throw new AiProviderError(validationErrorMessage(cause), {
            code: typeof cause?.code === 'string' ? cause.code : 'schema_validation', cause,
        });
    }
}

function taskMessages(task, messages) {
    const marker = `[TKM_BACKGROUND_TASK:${task}]`;
    return [
        { role: 'system', content: `${marker}\nThis is an isolated extension background task. Return only the requested result.` },
        ...messages.map(message => ({ role: message.role, content: message.content })),
    ];
}

function activeSecondary(context) {
    const state = getSecondaryApiPresetState(context);
    const preset = state.activePreset;
    return preset?.endpoint && preset?.model && preset?.secretId ? preset : null;
}

async function generateWithSecondary({ context, preset, task, messages, jsonSchema, fetchImpl, signal, transportPrepared }) {
    const response = await postJson(API_ROUTES.customChatGenerate, {
        chat_completion_source: 'custom',
        custom_url: preset.endpoint,
        secret_id: preset.secretId,
        model: preset.model,
        messages: transportPrepared ? messages : taskMessages(task, messages),
        json_schema: jsonSchema ?? undefined,
        stream: false,
        n: 1,
    }, {
        headers: getRequestHeaders(context),
        fetchImpl,
        signal,
    });
    if (response?.error) {
        throw new AiProviderError('插件 API 返回了错误。', { code: 'provider_error', source: 'secondary' });
    }
    return readAssistantText(response);
}

async function generateWithMain({ context, task, messages, jsonSchema, responseLength, preparedPrompt, transportPrepared }) {
    if (typeof context?.generateRaw !== 'function') {
        throw new AiProviderError('SillyTavern 当前 API 生成接口不可用。', {
            code: 'main_unavailable', source: 'main',
        });
    }
    return context.generateRaw({
        prompt: preparedPrompt?.mode === 'text'
            ? preparedPrompt.prompt
            : (transportPrepared ? messages : taskMessages(task, messages)),
        jsonSchema: jsonSchema ?? null,
        responseLength: responseLength ?? null,
        trimNames: false,
    });
}

export async function generateProviderJson({
    context,
    task,
    messages,
    jsonSchema = null,
    validate,
    forceMain = false,
    allowMainFallback = false,
    fetchImpl = globalThis.fetch,
    signal,
    responseLength = null,
    strictJson = false,
    preparedPrompt = null,
    transportPrepared = false,
    now = () => new Date(),
}) {
    if (typeof task !== 'string' || !task.trim()) throw new TypeError('AI 任务名不能为空。');
    if (!Array.isArray(messages) || messages.length === 0) throw new TypeError('AI messages 不能为空。');

    const settings = ensureGlobalSettings(context);
    const configuredPlugin = activeSecondary(context);
    const selectedSource = forceMain
        ? 'sillytavern'
        : (settings.aiProvider.source ?? (configuredPlugin ? 'plugin' : null));
    if (!selectedSource) {
        throw new AiProviderError('请先在 API 设置中选择插件 API 或 SillyTavern 当前 API。', {
            code: 'provider_not_selected', source: 'configuration',
        });
    }
    if (selectedSource === 'plugin' && !configuredPlugin) {
        throw new AiProviderError('插件 API 尚未完成配置。', {
            code: 'plugin_api_not_configured', source: 'configuration',
        });
    }
    const secondary = selectedSource === 'plugin' ? configuredPlugin : null;
    const startedAt = now().toISOString();
    let source = secondary ? 'secondary' : 'main';
    let model = secondary?.model ?? activeMainModel(context);
    const fellBack = false;
    let text;

    if (secondary) {
        try {
            text = await generateWithSecondary({
                context, preset: secondary, task, messages, jsonSchema, fetchImpl, signal, transportPrepared,
            });
        } catch (error) {
            throw classifyProviderError(error, 'secondary');
        }
    } else {
        try {
            text = await generateWithMain({
                context, task, messages, jsonSchema, responseLength, preparedPrompt, transportPrepared,
            });
        } catch (error) {
            throw classifyProviderError(error, 'main');
        }
    }

    let data;
    try {
        data = validateOutput(strictJson ? parseStrictJsonObject(text) : parseJsonText(text), validate);
    } catch (error) {
        const classified = classifyProviderError(error, source);
        classified.source = source;
        throw classified;
    }

    return {
        data,
        rawText: text,
        provider: {
            source,
            model,
            fellBack,
            startedAt,
            finishedAt: now().toISOString(),
        },
    };
}

export { classifyProviderError, parseJsonText, parseStrictJsonText, taskMessages };
