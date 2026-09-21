function assertAtomicTextList(value) {
    if (!Array.isArray(value)) {
        throw new TypeError('normalizeAtomicTextList 的输入必须是数组。');
    }
    value.forEach((item, index) => {
        if (typeof item !== 'string') {
            throw new TypeError(`normalizeAtomicTextList 的第 ${index} 项必须是字符串。`);
        }
    });
}

/**
 * Cleans a structured list without applying matcher equivalence or inferring
 * boundaries inside any item.
 */
export function normalizeAtomicTextList(value) {
    assertAtomicTextList(value);
    const seen = new Set();
    const result = [];
    for (const item of value) {
        const text = item.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result;
}

function normalizeDelimiterPolicy(policy) {
    if (policy === undefined) return [];
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
        throw new TypeError('parseDelimitedTextList 的 policy 必须是对象。');
    }
    if (!Object.hasOwn(policy, 'delimiters')) return [];
    if (!Array.isArray(policy.delimiters)
        || policy.delimiters.some(delimiter => typeof delimiter !== 'string' || !delimiter)) {
        throw new TypeError('parseDelimitedTextList 的 delimiters 必须是非空字符串数组。');
    }
    return [...new Set(policy.delimiters)].sort((left, right) => right.length - left.length);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses an explicitly delimited UI/import text value. A missing delimiter
 * policy means that the whole input remains one atomic item.
 */
export function parseDelimitedTextList(text, policy) {
    if (typeof text !== 'string') {
        throw new TypeError('parseDelimitedTextList 的输入必须是字符串。');
    }
    const delimiters = normalizeDelimiterPolicy(policy);
    const values = delimiters.length
        ? text.split(new RegExp(`(?:${delimiters.map(escapeRegExp).join('|')})+`, 'u'))
        : [text];
    return normalizeAtomicTextList(values);
}
