export const PROMPT_MODULE_SCOPE_LABELS = Object.freeze({
    global: '全局',
    character: '角色卡',
    chat: '当前聊天',
});

export const PROMPT_MODULE_ROLE_LABELS = Object.freeze({
    system: 'system',
    user: 'user',
    assistant: 'assistant',
});

export const PROMPT_MODULE_LIFECYCLE_LABELS = Object.freeze({
    prompt: '提示词注入',
    collect: '内容收集',
    sync: '长期追踪',
});

export function createPromptModuleDraft(module = null, scope = 'global', lifecycle = 'prompt') {
    return module ? {
        id: module.id,
        name: module.name,
        enabled: module.enabled,
        content: module.content,
        scope: module.scope,
        role: module.role,
        depth: String(module.depth),
        lifecycle: module.lifecycle ?? 'prompt',
    } : {
        id: null,
        name: '',
        enabled: true,
        content: '',
        scope,
        role: 'system',
        depth: '0',
        lifecycle,
    };
}

export function promptModulePayload(draft) {
    return {
        name: draft?.name ?? '',
        enabled: draft?.enabled !== false,
        content: draft?.content ?? '',
        scope: draft?.scope,
        role: draft?.role,
        depth: draft?.depth,
        lifecycle: draft?.lifecycle ?? 'prompt',
    };
}
