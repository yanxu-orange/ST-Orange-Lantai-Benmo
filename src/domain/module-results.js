import { isRecord, isoNow } from '../storage/schema-utils.js';
import { normalizePromptModules } from './prompt-module.js';

function validSource(value) {
    if (!isRecord(value)) return null;
    const messageId = Number(value.messageId);
    const swipeId = value.swipeId === null || value.swipeId === undefined ? null : Number(value.swipeId);
    if (!Number.isSafeInteger(messageId) || messageId < 0) return null;
    if (swipeId !== null && (!Number.isSafeInteger(swipeId) || swipeId < 0)) return null;
    const chatId = value.chatId === null || value.chatId === undefined || value.chatId === ''
        ? null
        : String(value.chatId);
    const characterKey = value.characterKey === null || value.characterKey === undefined || value.characterKey === ''
        ? null
        : String(value.characterKey);
    return { messageId, swipeId, ...(chatId ? { chatId } : {}), ...(characterKey ? { characterKey } : {}) };
}

export function normalizeModuleResult(value) {
    if (!isRecord(value) || typeof value.moduleId !== 'string' || !value.moduleId) return null;
    if (!['collect', 'sync'].includes(value.lifecycle)) return null;
    if (typeof value.captureTag !== 'string' || !/^[gch][1-9][0-9]*$/.test(value.captureTag)) return null;
    if (typeof value.value !== 'string' || !value.value.trim()) return null;
    const source = validSource(value.source);
    if (!source) return null;
    const capturedAt = typeof value.capturedAt === 'string' && !Number.isNaN(Date.parse(value.capturedAt))
        ? value.capturedAt
        : null;
    if (!capturedAt) return null;
    return {
        moduleId: value.moduleId,
        lifecycle: value.lifecycle,
        captureTag: value.captureTag,
        value: value.value.trim(),
        charCount: value.value.trim().length,
        source,
        capturedAt,
    };
}

export function normalizeModuleResults(values) {
    if (!Array.isArray(values)) return [];
    return values.map(normalizeModuleResult).filter(Boolean);
}

export function extractModuleResults(text, captureTag) {
    if (typeof text !== 'string' || typeof captureTag !== 'string' || !captureTag) return null;
    if (!/^[gch][1-9][0-9]*$/.test(captureTag)) return [];
    const matcher = /<tkm_result module="([gch][1-9][0-9]*)">([\s\S]*?)<\/tkm_result>/g;
    let match;
    const values = [];
    while ((match = matcher.exec(text))) {
        if (match[1] !== captureTag) continue;
        const value = match[2].trim();
        if (!value || /<\/?tkm_result\b/i.test(value)) continue;
        values.push(value);
    }
    return values;
}

export function extractModuleResult(text, captureTag) {
    const values = extractModuleResults(text, captureTag);
    return values?.at(-1) ?? null;
}

function messageVariants(message) {
    if (!message || message.is_system || message.is_user !== false) return [];
    const variants = [];
    if (Array.isArray(message.swipes)) {
        message.swipes.forEach((text, swipeId) => {
            if (typeof text === 'string') variants.push({ text, swipeId });
        });
    }
    const activeSwipe = Number.isSafeInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : null;
    if (typeof message.mes === 'string' && !variants.some(item => item.swipeId === activeSwipe && item.text === message.mes)) {
        variants.push({ text: message.mes, swipeId: activeSwipe });
    }
    return variants;
}

export function collectModuleResultsFromChat({ modules, chat, previous = [], now, chatId = null, characterKey = null } = {}) {
    const definitions = [
        ...normalizePromptModules(modules?.global, 'global'),
        ...normalizePromptModules(modules?.character, 'character'),
        ...normalizePromptModules(modules?.chat, 'chat'),
    ].filter(module => module.lifecycle !== 'prompt');
    const previousByIdentity = new Map(normalizeModuleResults(previous).map(item => [
        `${item.moduleId}:${item.source.characterKey ?? 'none'}:${item.source.chatId ?? 'current'}:${item.source.messageId}:${item.source.swipeId ?? 'none'}:${item.value}`,
        item,
    ]));
    const capturedAt = isoNow(now);
    const results = [];
    if (!Array.isArray(chat)) return results;
    chat.forEach((message, messageId) => {
        for (const variant of messageVariants(message)) {
            for (const module of definitions) {
                const values = extractModuleResults(variant.text, module.captureTag);
                for (const value of module.lifecycle === 'sync' ? values.slice(-1) : values) {
                    const identity = `${module.id}:${characterKey ?? 'none'}:${chatId ?? 'current'}:${messageId}:${variant.swipeId ?? 'none'}:${value}`;
                    const prior = previousByIdentity.get(identity);
                    results.push({
                        moduleId: module.id,
                        lifecycle: module.lifecycle,
                        captureTag: module.captureTag,
                        value,
                        charCount: value.length,
                        source: { messageId, swipeId: variant.swipeId, ...(chatId ? { chatId: String(chatId) } : {}), ...(characterKey ? { characterKey: String(characterKey) } : {}) },
                        capturedAt: prior?.capturedAt ?? capturedAt,
                    });
                }
            }
        }
    });
    return results;
}

export function resolveActiveModuleResults(results, chat, currentChatId = null, currentCharacterKey = null) {
    const active = new Map();
    for (const result of normalizeModuleResults(results)) {
        const belongsToOtherChat = currentChatId !== null && (
            result.source.chatId !== String(currentChatId)
            || (result.source.characterKey ?? null) !== (currentCharacterKey ?? null)
        );
        if (belongsToOtherChat) {
            const previous = active.get(result.moduleId);
            if (!previous || Date.parse(result.capturedAt) >= Date.parse(previous.capturedAt)) active.set(result.moduleId, result);
            continue;
        }
        const message = Array.isArray(chat) ? chat[result.source.messageId] : null;
        if (!message || message.is_system || message.is_user !== false || typeof message.mes !== 'string') continue;
        const swipeId = Number.isSafeInteger(Number(message.swipe_id)) ? Number(message.swipe_id) : null;
        if (result.source.swipeId !== swipeId) continue;
        if (extractModuleResult(message.mes, result.captureTag) !== result.value) continue;
        const previous = active.get(result.moduleId);
        if (!previous || Date.parse(result.capturedAt) >= Date.parse(previous.capturedAt)) {
            active.set(result.moduleId, result);
        }
    }
    return [...active.values()];
}

export function moduleCaptureInstruction(module, result = null) {
    if (!module || module.lifecycle === 'prompt') return module?.content ?? '';
    const opening = `<tkm_result module="${module.captureTag}">`;
    const closing = '</tkm_result>';
    const validResult = result?.moduleId === module.id
        && result?.lifecycle === module.lifecycle
        && result?.captureTag === module.captureTag
        ? result
        : null;
    const previous = module.lifecycle === 'sync' && validResult?.value
        ? `\n\n【上一份完整结果（待更新数据）】\n${validResult.value}\n【上一份完整结果结束】`
        : '';
    const resultKind = module.lifecycle === 'sync' ? '完整更新结果' : '收集结果';
    return `额外输出一个「${module.name}」模块的${resultKind}。\n输出格式：\n${opening}\n在这里输出「${module.name}」的实际结果，不要输出本行说明\n${closing}\n\n生成需求具体要求：\n${module.content}${previous}\n\n这个 <tkm_result> 块只能包含「${module.name}」自己的结果。不得把其他模块的结果合并、嵌套或收纳进本块；每个模块必须各自输出独立块，并严格使用它自己的 module 编号。模块要求的内部标签、JSON 或其他格式必须原样保留。普通回复、<scene>...</scene> 状态栏和其他模块块都放在本块之外。`;
}
