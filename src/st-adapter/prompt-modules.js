import { normalizePromptModules } from '../domain/prompt-module.js';
import { moduleCaptureInstruction, normalizeModuleResults } from '../domain/module-results.js';

export const PROMPT_MODULE_KEY_PREFIX = 'tkm_prompt_module';

const IN_CHAT = 1;
const ROLE_CODES = Object.freeze({ system: 0, user: 1, assistant: 2 });

function requirePromptApi(context) {
    if (typeof context?.setExtensionPrompt !== 'function') {
        throw new Error('SillyTavern setExtensionPrompt() is unavailable.');
    }
}

function promptKey(role, depth) {
    return `${PROMPT_MODULE_KEY_PREFIX}_${role}_${depth}`;
}

export function groupPromptModules({ global = [], character = [], chat = [], results = [] } = {}) {
    const resultByModule = new Map(normalizeModuleResults(results).map(result => [result.moduleId, result]));
    const ordered = [
        ...normalizePromptModules(global, 'global'),
        ...normalizePromptModules(character, 'character'),
        ...normalizePromptModules(chat, 'chat'),
    ].filter(module => module.enabled);
    const groups = new Map();
    for (const module of ordered) {
        const key = promptKey(module.role, module.depth);
        const group = groups.get(key) ?? {
            key,
            role: module.role,
            roleCode: ROLE_CODES[module.role],
            depth: module.depth,
            modules: [],
        };
        group.modules.push(module);
        groups.set(key, group);
    }
    return [...groups.values()].map(group => ({
        ...group,
        value: group.modules.map(module => moduleCaptureInstruction(module, resultByModule.get(module.id))).join('\n\n'),
        capturedLengths: group.modules.map(module => resultByModule.get(module.id)?.charCount ?? 0),
    }));
}

export class PromptModuleInjectionAdapter {
    constructor({ getContext, now = () => new Date() } = {}) {
        if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
        this.getContext = getContext;
        this.now = now;
        this.active = [];
        this.snapshot = { status: 'idle', moduleCount: 0, groups: [] };
    }

    apply(modules, context = this.getContext()) {
        requirePromptApi(context);
        this.clear(context, 'before-apply');
        const groups = groupPromptModules(modules);
        const written = [];
        try {
            for (const group of groups) {
                context.setExtensionPrompt(group.key, group.value, IN_CHAT, group.depth, false, group.roleCode);
                written.push({ key: group.key, depth: group.depth, roleCode: group.roleCode });
            }
        } catch (error) {
            for (const entry of written) {
                try { context.setExtensionPrompt(entry.key, '', IN_CHAT, entry.depth, false, entry.roleCode); } catch { /* Best-effort rollback. */ }
            }
            this.active = [];
            this.snapshot = { status: 'failed', moduleCount: 0, groups: [], errorCode: 'module_prompt_write_failed' };
            throw error;
        }
        this.active = written;
        this.snapshot = {
            status: groups.length ? 'applied' : 'empty',
            moduleCount: groups.reduce((total, group) => total + group.modules.length, 0),
            appliedAt: this.now().toISOString(),
            groups: groups.map(group => ({
                key: group.key,
                role: group.role,
                depth: group.depth,
                moduleIds: group.modules.map(module => module.id),
                moduleNames: group.modules.map(module => module.name),
                capturedLengths: group.capturedLengths,
            })),
        };
        return this.getSnapshot();
    }

    clear(context = this.getContext(), reason = 'manual') {
        if (!this.active.length) return false;
        requirePromptApi(context);
        const clearing = this.active;
        this.active = [];
        let firstError = null;
        for (const entry of clearing) {
            try {
                context.setExtensionPrompt(entry.key, '', IN_CHAT, entry.depth, false, entry.roleCode);
            } catch (error) {
                firstError ??= error;
            }
        }
        this.snapshot = { status: 'cleared', moduleCount: 0, groups: [], clearReason: reason };
        if (firstError) throw firstError;
        return true;
    }

    getSnapshot() {
        return structuredClone(this.snapshot);
    }

    installLifecycle(context = this.getContext()) {
        if (!context?.eventSource?.on) return null;
        const subscriptions = [];
        for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'CHAT_CREATED']) {
            const type = context.eventTypes?.[name];
            if (!type) continue;
            const listener = () => {
                try { this.clear(context, name); } catch { /* The next generation clears again. */ }
            };
            context.eventSource.on(type, listener);
            subscriptions.push([type, listener]);
        }
        return {
            dispose: () => {
                for (const [type, listener] of subscriptions) context.eventSource.removeListener?.(type, listener);
                try { this.clear(this.getContext(), 'dispose'); } catch { /* Host may already be gone. */ }
            },
        };
    }
}
