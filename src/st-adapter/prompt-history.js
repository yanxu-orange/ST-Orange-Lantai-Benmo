function integerOrNull(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function activeRanges(data) {
    return (Array.isArray(data.summary?.hiddenSegments) ? data.summary.hiddenSegments : [])
        .filter(segment => segment?.status === 'active' && Array.isArray(segment.floorRange)
            && segment.floorRange.length === 2
            && segment.floorRange.every(floor => integerOrNull(floor) !== null)
            && segment.floorRange[1] >= segment.floorRange[0])
        .map(segment => segment.floorRange);
}

function createFloorResolver(originalChat) {
    if (!Array.isArray(originalChat)) return message => integerOrNull(message?.index);
    // Official script.js filters system/hidden messages BEFORE assigning index.
    // Tool support changes that filter. Resolve both official variants, accepting
    // only a unique match; never use this mutable prompt array's position.
    const indexed = originalChat.map((item, floor) => ({ item, floor }));
    const variants = [false, true].map(includeTools => indexed
        .filter(({ item }) => !item?.is_system || (includeTools && Array.isArray(item?.extra?.tool_invocations))));
    const hasHidden = originalChat.some(item => item?.is_system);
    return message => {
        const index = integerOrNull(message?.index);
        if (index === null) return null;
        const matches = new Set();
        for (const candidates of variants) {
            const candidate = candidates[index];
            if (!candidate) continue;
            const source = candidate.item;
            const sameIdentity = source === message || (source?.extra && source.extra === message.extra)
                || (source?.send_date != null && source.send_date === message.send_date
                    && source.is_user === message.is_user && source.name === message.name);
            if (sameIdentity || (!hasHidden && source?.is_user === message?.is_user && source?.name === message?.name)) matches.add(candidate.floor);
        }
        return matches.size === 1 ? [...matches][0] : null;
    };
}

/**
 * Removes already summarized floors from SillyTavern's per-generation prompt
 * copy. A supplied originalChat resolves the official host's filtered coreChat
 * indices to original floors. Without it, callers supply original floor indices.
 */
export function excludeSummarizedPromptHistory(chat, data = {}, { originalChat } = {}) {
    const messages = Array.isArray(chat) ? chat : [];
    const ranges = activeRanges(data);
    const startFloor = ranges.length ? Math.min(...ranges.map(range => range[0])) : null;
    const hiddenThroughFloor = ranges.length ? Math.max(...ranges.map(range => range[1])) : null;
    if (!ranges.length || messages === originalChat) {
        return { enabled: false, startFloor, hiddenThroughFloor, removedCount: 0, removedIndices: [] };
    }

    const removedIndices = [];
    const originalFloor = createFloorResolver(originalChat);
    for (let position = messages.length - 1; position >= 0; position -= 1) {
        const originalIndex = originalFloor(messages[position]);
        if (originalIndex === null || !ranges.some(([start, end]) => originalIndex >= start && originalIndex <= end)) continue;
        removedIndices.push(originalIndex);
        messages.splice(position, 1);
    }
    removedIndices.sort((a, b) => a - b);
    return { enabled: true, startFloor, hiddenThroughFloor, removedCount: removedIndices.length, removedIndices };
}
