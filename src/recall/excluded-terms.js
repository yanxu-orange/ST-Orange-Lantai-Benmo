import { normalizeAtomicTextList } from '../domain/text-list.js';

export function normalizeRecallExcludedTerms(value) {
    return normalizeAtomicTextList(Array.isArray(value) ? value : []);
}

function withoutExcluded(values, excluded) {
    return (Array.isArray(values) ? values : []).filter(value => !excluded.has(value));
}

/**
 * Produces an ephemeral recall-only view. Stored memories and their body text
 * remain untouched; only complete structured atoms can be removed.
 */
export function excludeTermsFromRecallMemories(memories, excludedTerms) {
    if (!Array.isArray(memories)) throw new TypeError('memories must be an array');
    const excluded = new Set(normalizeRecallExcludedTerms(excludedTerms));
    if (!excluded.size) return memories;
    return memories.map(memory => {
        const details = withoutExcluded(memory?.keywords?.detail, excluded);
        const detailSet = new Set(details);
        const detailAliases = (Array.isArray(memory?.keywords?.detailAliases) ? memory.keywords.detailAliases : [])
            .filter(relation => detailSet.has(relation?.parentDetail))
            .map(relation => ({
                ...relation,
                aliases: withoutExcluded(relation.aliases, excluded),
            }))
            .filter(relation => relation.aliases.length);
        return {
            ...memory,
            title: excluded.has(memory?.title) ? '' : memory?.title,
            people: withoutExcluded(memory?.people, excluded),
            locations: withoutExcluded(memory?.locations, excluded),
            keywords: {
                ...(memory?.keywords ?? {}),
                event: withoutExcluded(memory?.keywords?.event, excluded),
                detail: details,
                detailAliases,
                primary: withoutExcluded(memory?.keywords?.primary, excluded),
                auxiliary: withoutExcluded(memory?.keywords?.auxiliary, excluded),
            },
        };
    });
}
