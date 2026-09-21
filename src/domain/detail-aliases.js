function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function diagnostic(code, relationIndex, extra = {}) {
    return { code, relationIndex, ...extra };
}

function normalizeAliasText(value) {
    return cleanText(value).normalize('NFKC').toLocaleLowerCase();
}

const FILE_NAME_EXTENSION = /\.(?:pdf|txt|md|docx?|epub)$/iu;
const PAIRED_NAME_WRAPPERS = Object.freeze([
    ['《', '》'], ['〈', '〉'], ['「', '」'], ['『', '』'],
]);

export function detailAliasParentText(value) {
    let text = cleanText(value).normalize('NFKC');
    let explicitlyWrapped = false;
    const wrapper = PAIRED_NAME_WRAPPERS.find(([open, close]) => text.startsWith(open) && text.endsWith(close));
    if (wrapper) {
        text = text.slice(wrapper[0].length, -wrapper[1].length).trim();
        explicitlyWrapped = true;
    }
    if (FILE_NAME_EXTENSION.test(text)) {
        text = text.replace(FILE_NAME_EXTENSION, '').trim();
        explicitlyWrapped = true;
    }
    return { text: normalizeAliasText(text), explicitlyWrapped };
}

export function isEligibleDetailAliasParent(value) {
    const parent = detailAliasParentText(value);
    return /\p{Script=Han}/u.test(parent.text);
}

/**
 * Normalizes the persisted, index-free alias contract against the current
 * ordered detail snapshot. Relations survive detail reordering, while a
 * deleted or renamed parent is deliberately discarded.
 */
export function inspectMemoryDetailAliases(value, details) {
    const detailList = Array.isArray(details) ? details : [];
    const parentCounts = new Map();
    for (const item of detailList) {
        if (typeof item === 'string') parentCounts.set(item, (parentCounts.get(item) ?? 0) + 1);
    }
    const diagnostics = [];
    if (value === undefined || value === null) return { value: [], diagnostics };
    if (!Array.isArray(value)) {
        return { value: [], diagnostics: [diagnostic('detail-aliases-not-array', null)] };
    }

    const merged = new Map();
    value.forEach((relation, relationIndex) => {
        if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
            diagnostics.push(diagnostic('detail-alias-relation-not-object', relationIndex));
            return;
        }
        const parentDetail = cleanText(relation.parentDetail);
        if (!parentDetail || !parentCounts.has(parentDetail)) {
            diagnostics.push(diagnostic('detail-alias-parent-not-found', relationIndex, { parentDetail: parentDetail || null }));
            return;
        }
        if (parentCounts.get(parentDetail) !== 1) {
            diagnostics.push(diagnostic('detail-alias-parent-ambiguous', relationIndex, { parentDetail }));
            return;
        }
        const normalizedParent = detailAliasParentText(parentDetail).text;
        if (!isEligibleDetailAliasParent(parentDetail)) {
            diagnostics.push(diagnostic('detail-alias-parent-ineligible', relationIndex, { parentDetail }));
            return;
        }
        if (!Array.isArray(relation.aliases)) {
            diagnostics.push(diagnostic('detail-alias-list-not-array', relationIndex, { parentDetail }));
            return;
        }

        const aliases = merged.get(parentDetail) ?? [];
        const seen = new Set(aliases.map(normalizeAliasText));
        relation.aliases.forEach((alias, aliasIndex) => {
            const text = cleanText(alias);
            const normalized = normalizeAliasText(text);
            const base = { parentDetail, aliasIndex };
            if (!text) {
                diagnostics.push(diagnostic('detail-alias-empty', relationIndex, base));
                return;
            }
            if (!/^\p{Script=Han}+$/u.test(normalized)
                || normalized === normalizeAliasText(parentDetail) || !normalizedParent.includes(normalized)) {
                diagnostics.push(diagnostic('detail-alias-invalid', relationIndex, { ...base, alias: text }));
                return;
            }
            if (seen.has(normalized)) {
                diagnostics.push(diagnostic('detail-alias-duplicate', relationIndex, { ...base, alias: text }));
                return;
            }
            seen.add(normalized);
            aliases.push(text);
        });
        if (aliases.length) merged.set(parentDetail, aliases);
    });

    return {
        value: [...merged].map(([parentDetail, aliases]) => ({ parentDetail, aliases })),
        diagnostics,
    };
}

export function normalizeMemoryDetailAliases(value, details) {
    return inspectMemoryDetailAliases(value, details).value;
}

export function buildMemoryDetailAliasBindings(memories = []) {
    if (!Array.isArray(memories)) throw new TypeError('memories must be an array');
    return memories.flatMap(memory => {
        if (!memory || typeof memory.id !== 'string') return [];
        const details = Array.isArray(memory.keywords?.detail) ? memory.keywords.detail : [];
        return normalizeMemoryDetailAliases(memory.keywords?.detailAliases, details).flatMap(relation => {
            const detailIndex = details.indexOf(relation.parentDetail);
            return detailIndex < 0 ? [] : [{
                memoryId: memory.id,
                detailIndex,
                parentDetail: relation.parentDetail,
                aliases: [...relation.aliases],
            }];
        });
    });
}
