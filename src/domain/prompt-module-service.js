import {
    createPromptModule,
    normalizePromptModules,
    reorderPromptModules,
    updatePromptModule,
} from './prompt-module.js';
import { cloneJson } from '../storage/schema-utils.js';
import { normalizeCharacterModuleStores } from './character-module-store.js';
import { getActiveCharacterIdentity } from '../st-adapter/character-context.js';

function findModule(modules, id) {
    const index = modules.findIndex(module => module.id === id);
    if (index < 0) throw new Error('没有找到要操作的模块。');
    return index;
}

export class PromptModuleService {
    constructor({ chatDataService, getGlobalSettings, saveGlobalSettings, getContext = () => null, now, idFactory } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (typeof getGlobalSettings !== 'function') throw new TypeError('getGlobalSettings 不可用。');
        if (typeof saveGlobalSettings !== 'function') throw new TypeError('saveGlobalSettings 不可用。');
        this.chatDataService = chatDataService;
        this.getGlobalSettings = getGlobalSettings;
        this.saveGlobalSettings = saveGlobalSettings;
        this.getContext = getContext;
        this.now = now;
        this.idFactory = idFactory;
    }

    read() {
        const settings = this.getGlobalSettings();
        const chat = this.chatDataService.readCurrent();
        const character = getActiveCharacterIdentity(this.getContext());
        const characterStore = character
            ? normalizeCharacterModuleStores(settings.characterModuleStores).find(store => store.characterKey === character.key)
            : null;
        return {
            global: normalizePromptModules(settings.modules, 'global'),
            character: characterStore?.modules ?? [],
            chat: normalizePromptModules(chat.modules, 'chat'),
            characterIdentity: character,
        };
    }

    async create(input) {
        const scope = input?.scope;
        let module;
        await this.#mutateScope(scope, (modules, allocateCaptureToken) => {
            module = createPromptModule({
                ...input,
                captureTag: (input?.lifecycle ?? 'prompt') === 'prompt' ? null : allocateCaptureToken(),
            }, { now: this.now, idFactory: this.idFactory });
            if (modules.some(current => current.id === module.id)) throw new Error('模块 ID 已存在。');
            return [...modules, module];
        });
        return cloneJson(module);
    }

    async update(scope, id, patch) {
        let updated;
        await this.#mutateScope(scope, modules => {
            const index = findModule(modules, id);
            updated = updatePromptModule(modules[index], patch, { now: this.now });
            const next = [...modules];
            next[index] = updated;
            return next;
        });
        return cloneJson(updated);
    }

    async setEnabled(scope, id, enabled) {
        return this.update(scope, id, { enabled });
    }

    async remove(scope, id) {
        let removed;
        await this.#mutateScope(scope, modules => {
            const index = findModule(modules, id);
            removed = modules[index];
            return modules.filter((_, itemIndex) => itemIndex !== index);
        });
        return cloneJson(removed);
    }

    async reorder(scope, orderedIds) {
        let reordered;
        await this.#mutateScope(scope, modules => {
            reordered = reorderPromptModules(modules, orderedIds, scope);
            return reordered;
        });
        return cloneJson(reordered);
    }

    async #mutateScope(scope, mutate) {
        if (scope === 'chat') {
            return this.chatDataService.updateCurrent(root => {
                const allocate = () => {
                    const next = Math.max(0, Number(root.moduleCaptureCounter) || 0) + 1;
                    root.moduleCaptureCounter = next;
                    return `h${next}`;
                };
                root.modules = mutate(normalizePromptModules(root.modules, 'chat'), allocate);
            });
        }
        const settings = this.getGlobalSettings();
        if (scope === 'character') {
            const character = getActiveCharacterIdentity(this.getContext());
            if (!character) throw new Error('当前没有可用的单角色角色卡。');
            const previous = cloneJson(settings.characterModuleStores ?? []);
            const previousCounters = cloneJson(settings.moduleCaptureCounters ?? {});
            const stores = normalizeCharacterModuleStores(settings.characterModuleStores);
            const index = stores.findIndex(store => store.characterKey === character.key);
            const store = index >= 0 ? stores[index] : {
                characterKey: character.key,
                characterName: character.name,
                modules: [],
                moduleResults: [],
            };
            const allocate = () => {
                const counters = settings.moduleCaptureCounters ?? {};
                const next = Math.max(0, Number(counters.character) || 0) + 1;
                settings.moduleCaptureCounters = { ...counters, character: next };
                return `c${next}`;
            };
            const nextStore = {
                ...store,
                characterName: character.name,
                modules: mutate(normalizePromptModules(store.modules, 'character'), allocate),
            };
            settings.characterModuleStores = index >= 0
                ? stores.map((item, itemIndex) => itemIndex === index ? nextStore : item)
                : [...stores, nextStore];
            try {
                await this.saveGlobalSettings();
            } catch (error) {
                settings.characterModuleStores = previous;
                settings.moduleCaptureCounters = previousCounters;
                throw error;
            }
            return cloneJson(nextStore.modules);
        }
        if (scope !== 'global') throw new Error('模块作用范围不可用。');
        const previous = cloneJson(settings.modules ?? []);
        const allocate = () => {
            const counters = settings.moduleCaptureCounters ?? {};
            const next = Math.max(0, Number(counters.global) || 0) + 1;
            settings.moduleCaptureCounters = { ...counters, global: next };
            return `g${next}`;
        };
        const oldCounters = cloneJson(settings.moduleCaptureCounters ?? {});
        settings.modules = mutate(normalizePromptModules(settings.modules, 'global'), allocate);
        try {
            await this.saveGlobalSettings();
        } catch (error) {
            settings.modules = previous;
            settings.moduleCaptureCounters = oldCounters;
            throw error;
        }
        return cloneJson(settings.modules);
    }
}
