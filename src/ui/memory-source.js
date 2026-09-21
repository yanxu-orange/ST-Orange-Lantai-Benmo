function validFloor(value) {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function rangeLabel(range) {
    if (!Array.isArray(range) || range.length < 2 || !validFloor(range[0]) || !validFloor(range[1])) return null;
    const start = Number(range[0]);
    const end = Number(range[1]);
    return start === end ? `#${start}` : `#${start}–${end}`;
}

/**
 * Formats existing source metadata without collapsing discontinuous ranges.
 * A single [start, end] pair is the current schema; nested pairs are accepted
 * so a future merge operation can preserve each real interval.
 */
export function formatMemoryFloorRanges(source) {
    const value = source?.floorRange;
    const ranges = Array.isArray(value?.[0]) ? value : [value];
    return ranges.map(rangeLabel).filter(Boolean).join(' · ');
}
