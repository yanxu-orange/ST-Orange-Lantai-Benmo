import { normalizePromptOverrides } from './prompt-customization.js';
import { cloneJson, createStableId } from '../storage/schema-utils.js';

export function normalizePromptProfiles(value) {
    const ids = new Set();
    return (Array.isArray(value) ? value : []).flatMap(item => {
        const id = typeof item?.id === 'string' ? item.id.trim() : '';
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        if (!id || !name || ids.has(id)) return [];
        ids.add(id);
        return [{ id, name, promptOverrides: normalizePromptOverrides(item.promptOverrides) }];
    });
}

export function syncActivePromptProfile(summary) {
    const next = cloneJson(summary);
    next.promptProfiles = normalizePromptProfiles(next.promptProfiles);
    const active = next.promptProfiles.find(p => p.id === next.activePromptProfileId);
    if (active) active.promptOverrides = normalizePromptOverrides(next.promptOverrides);
    else next.activePromptProfileId = null;
    return next;
}

export function savePromptProfile(summary, name, { idFactory = () => createStableId('prompt-profile') } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('请填写方案名称。');
    const next = syncActivePromptProfile(summary);
    if (next.promptProfiles.some(p => p.name === name.trim())) throw new Error('方案名称已存在。');
    const id = idFactory();
    if (!id || next.promptProfiles.some(p => p.id === id)) throw new Error('方案标识重复。');
    next.promptProfiles.push({ id, name: name.trim(), promptOverrides: normalizePromptOverrides(next.promptOverrides) });
    next.activePromptProfileId = id;
    return next;
}

export function selectPromptProfile(summary, id) {
    const next = syncActivePromptProfile(summary);
    const profile = next.promptProfiles.find(p => p.id === id);
    if (!profile) throw new Error('找不到提示词方案。');
    next.promptOverrides = cloneJson(profile.promptOverrides);
    next.activePromptProfileId = id;
    return next;
}

export function deletePromptProfile(summary, id) {
    const next = syncActivePromptProfile(summary);
    if (!next.promptProfiles.some(p => p.id === id)) throw new Error('找不到提示词方案。');
    next.promptProfiles = next.promptProfiles.filter(p => p.id !== id);
    // Deleting a named snapshot never resets current prompts or changes generation mode.
    if (next.activePromptProfileId === id) next.activePromptProfileId = null;
    return next;
}
