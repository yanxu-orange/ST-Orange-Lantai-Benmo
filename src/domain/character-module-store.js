import { isRecord } from '../storage/schema-utils.js';
import { normalizeModuleResults } from './module-results.js';
import { normalizePromptModules } from './prompt-module.js';

export function normalizeCharacterModuleStore(value) {
    if (!isRecord(value) || typeof value.characterKey !== 'string' || !value.characterKey.trim()) return null;
    return {
        characterKey: value.characterKey.trim(),
        characterName: typeof value.characterName === 'string' ? value.characterName.trim() : '',
        modules: normalizePromptModules(value.modules, 'character'),
        moduleResults: normalizeModuleResults(value.moduleResults),
    };
}

export function normalizeCharacterModuleStores(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const stores = [];
    for (const value of values) {
        const store = normalizeCharacterModuleStore(value);
        if (!store || seen.has(store.characterKey)) continue;
        seen.add(store.characterKey);
        stores.push(store);
    }
    return stores;
}
