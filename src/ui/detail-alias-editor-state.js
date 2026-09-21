import { normalizeMemoryDetailAliases, isEligibleDetailAliasParent } from '../domain/detail-aliases.js';

function detailList(value) {
    return Array.isArray(value) ? value.map(item => String(item ?? '').trim()).filter(Boolean) : [];
}

export function canEditDetailAliases(parentDetail) {
    return isEligibleDetailAliasParent(parentDetail);
}

export function detailAliasesForEditor(value, details) {
    return normalizeMemoryDetailAliases(value, detailList(details));
}

export function aliasesForDetail(value, details, parentDetail) {
    return detailAliasesForEditor(value, details)
        .find(binding => binding.parentDetail === parentDetail)?.aliases ?? [];
}

export function appendDetailAlias(value, details, parentDetail, alias) {
    const bindings = detailAliasesForEditor(value, details);
    const current = bindings.find(binding => binding.parentDetail === parentDetail);
    const next = current
        ? bindings.map(binding => binding.parentDetail === parentDetail
            ? { ...binding, aliases: [...binding.aliases, alias] }
            : binding)
        : [...bindings, { parentDetail, aliases: [alias] }];
    return detailAliasesForEditor(next, details);
}

export function removeDetailAlias(value, details, parentDetail, aliasIndex) {
    const bindings = detailAliasesForEditor(value, details);
    const next = bindings.map(binding => {
        if (binding.parentDetail !== parentDetail) return binding;
        const aliases = [...binding.aliases];
        if (Number.isSafeInteger(aliasIndex) && aliasIndex >= 0 && aliasIndex < aliases.length) aliases.splice(aliasIndex, 1);
        return { ...binding, aliases };
    });
    return detailAliasesForEditor(next, details);
}

export function reconcileDetailAliases(value, details) {
    return detailAliasesForEditor(value, details);
}
