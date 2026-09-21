import {
    collectModuleResultsFromChat,
    normalizeModuleResults,
    resolveActiveModuleResults,
} from './module-results.js';
import { normalizeCharacterModuleStores } from './character-module-store.js';
import { getActiveCharacterIdentity } from '../st-adapter/character-context.js';
import { getContextChatId } from '../storage/chat-data.js';
import { cloneJson } from '../storage/schema-utils.js';

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function currentChatResults({ modules, chat, previous, chatId, characterKey, now, shouldCapture = () => true }) {
    const definitions = [...(modules.global ?? []), ...(modules.character ?? []), ...(modules.chat ?? [])];
    const byId = new Map(definitions.map(module => [module.id, module]));
    const normalized = normalizeModuleResults(previous).filter(item => {
        const module = byId.get(item.moduleId);
        return module && module.lifecycle === item.lifecycle && module.captureTag === item.captureTag;
    });
    const identity = item => `${item.moduleId}:${item.source.characterKey ?? 'none'}:${item.source.chatId ?? 'current'}:${item.source.messageId}:${item.source.swipeId ?? 'none'}:${item.value}`;
    const previousOrder = new Map(normalized.map((item, index) => [identity(item), index]));
    const retained = normalized.filter(item => {
        const sameChat = chatId === null
            ? item.source.chatId === undefined
            : item.source.chatId === String(chatId);
        const sameCharacter = (item.source.characterKey ?? null) === (characterKey ?? null);
        return !sameChat || !sameCharacter || !shouldCapture(byId.get(item.moduleId));
    });
    const rebuilt = collectModuleResultsFromChat({ modules, chat, previous, chatId, characterKey, now })
        .filter(item => shouldCapture(byId.get(item.moduleId)));
    return [...retained, ...rebuilt].sort((left, right) => {
        const time = Date.parse(left.capturedAt) - Date.parse(right.capturedAt);
        if (time) return time;
        return (previousOrder.get(identity(left)) ?? Number.MAX_SAFE_INTEGER)
            - (previousOrder.get(identity(right)) ?? Number.MAX_SAFE_INTEGER);
    });
}

export class ModuleResultService {
    constructor({ chatDataService, promptModuleService, getContext, getGlobalSettings = () => ({}), saveGlobalSettings = () => {}, isLifecycleEnabled = () => true, now } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (!promptModuleService) throw new TypeError('promptModuleService 不可用。');
        if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
        this.chatDataService = chatDataService;
        this.promptModuleService = promptModuleService;
        this.getContext = getContext;
        this.getGlobalSettings = getGlobalSettings;
        this.saveGlobalSettings = saveGlobalSettings;
        this.isLifecycleEnabled = isLifecycleEnabled;
        this.now = now;
    }

    read(context = this.getContext()) {
        const settings = this.getGlobalSettings();
        const identity = getActiveCharacterIdentity(context);
        const store = identity
            ? normalizeCharacterModuleStores(settings.characterModuleStores).find(item => item.characterKey === identity.key)
            : null;
        return {
            global: normalizeModuleResults(settings.moduleResults),
            character: normalizeModuleResults(store?.moduleResults),
            chat: normalizeModuleResults(this.chatDataService.readCurrent().moduleResults),
        };
    }

    readActive(context = this.getContext()) {
        const modules = this.promptModuleService.read();
        const results = this.read(context);
        const chatId = getContextChatId(context);
        const identity = getActiveCharacterIdentity(context);
        const conversationKey = identity?.key ?? (context?.groupId ? `group:${context.groupId}` : null);
        const filter = (items, definitions) => {
            const byId = new Map((definitions ?? []).filter(module => this.isLifecycleEnabled(module.lifecycle)).map(module => [module.id, module]));
            return items.filter(result => {
                const module = byId.get(result.moduleId);
                return module && module.lifecycle === result.lifecycle && module.captureTag === result.captureTag;
            });
        };
        return [
            ...resolveActiveModuleResults(filter(results.global, modules.global), context?.chat, chatId, conversationKey),
            ...resolveActiveModuleResults(filter(results.character, modules.character ?? []), context?.chat, chatId, identity?.key ?? null),
            ...resolveActiveModuleResults(filter(results.chat, modules.chat ?? []), context?.chat),
        ];
    }

    async reconcile(context = this.getContext()) {
        const modules = this.promptModuleService.read();
        const previous = this.read(context);
        const settings = this.getGlobalSettings();
        const identity = getActiveCharacterIdentity(context);
        const chatId = getContextChatId(context);
        const conversationKey = identity?.key ?? (context?.groupId ? `group:${context.groupId}` : null);
        const shouldCapture = module => Boolean(module && this.isLifecycleEnabled(module.lifecycle));
        const global = currentChatResults({ modules: { global: modules.global }, chat: context?.chat, previous: previous.global, chatId, characterKey: conversationKey, now: this.now, shouldCapture });
        const character = identity
            ? currentChatResults({ modules: { character: modules.character }, chat: context?.chat, previous: previous.character, chatId, characterKey: identity.key, now: this.now, shouldCapture })
            : [];
        const chat = currentChatResults({ modules: { chat: modules.chat }, chat: context?.chat, previous: previous.chat, chatId: null, characterKey: null, now: this.now, shouldCapture });
        if (same(previous.global, global) && same(previous.character, character) && same(previous.chat, chat)) return this.readActive(context);

        const oldGlobalResults = cloneJson(settings.moduleResults ?? []);
        const oldStores = cloneJson(settings.characterModuleStores ?? []);
        let globalSaved = false;
        try {
            settings.moduleResults = global;
            if (identity) {
                const stores = normalizeCharacterModuleStores(settings.characterModuleStores);
                const index = stores.findIndex(item => item.characterKey === identity.key);
                const store = index >= 0 ? stores[index] : { characterKey: identity.key, characterName: identity.name, modules: [], moduleResults: [] };
                const nextStore = { ...store, characterName: identity.name, moduleResults: character };
                settings.characterModuleStores = index >= 0
                    ? stores.map((item, itemIndex) => itemIndex === index ? nextStore : item)
                    : [...stores, nextStore];
            }
            if (!same(previous.global, global) || !same(previous.character, character)) {
                await this.saveGlobalSettings();
                globalSaved = true;
            }
            if (!same(previous.chat, chat)) await this.chatDataService.updateCurrent(root => { root.moduleResults = chat; });
        } catch (error) {
            settings.moduleResults = oldGlobalResults;
            settings.characterModuleStores = oldStores;
            if (globalSaved) {
                try { await this.saveGlobalSettings(); } catch { /* In-memory authority is still restored. */ }
            }
            throw error;
        }
        return this.readActive(context);
    }

    installLifecycle(context = this.getContext(), onUpdated = () => {}, isEnabled = () => true) {
        if (!context?.eventSource?.on) return null;
        const subscriptions = [];
        for (const name of ['MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHAT_CHANGED', 'CHAT_CREATED']) {
            const type = context.eventTypes?.[name];
            if (!type) continue;
            const listener = () => {
                if (!isEnabled()) return;
                this.reconcile(this.getContext()).then(onUpdated).catch(() => {});
            };
            context.eventSource.on(type, listener);
            subscriptions.push([type, listener]);
        }
        return {
            dispose: () => {
                for (const [type, listener] of subscriptions) context.eventSource.removeListener?.(type, listener);
            },
        };
    }
}
