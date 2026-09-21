import { SummaryDomainError } from './errors.js';

// Split only within each free interval: never bridge a covered or excluded floor.
export function planUncoveredRanges(coverage, batchCount) {
    const ranges = (coverage.summarizable ?? []).map(range => [...range]);
    const total = ranges.reduce((sum, [a, b]) => sum + b - a + 1, 0);
    const count = Number(batchCount ?? ranges.length);
    if (!Number.isSafeInteger(count) || count < ranges.length || count > total || !total) {
        throw new SummaryDomainError('invalid_batch_count', `请填写 ${ranges.length}–${total} 之间的批次数。`);
    }
    while (ranges.length < count) {
        let longest = 0;
        for (let i = 1; i < ranges.length; i++) if (ranges[i][1] - ranges[i][0] > ranges[longest][1] - ranges[longest][0]) longest = i;
        const [a, b] = ranges[longest];
        const midpoint = Math.floor((a + b) / 2);
        ranges.splice(longest, 1, [a, midpoint], [midpoint + 1, b]);
    }
    return ranges;
}
