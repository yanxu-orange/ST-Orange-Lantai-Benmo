import { selectContinuousSummaryFloors } from './source-selection.js';
import { buildSummaryCoverage } from './coverage.js';

export function selectAutomaticSummaryRange(chat, summary) {
    const x = summary.auto?.batchSize ?? 15;
    const y = summary.auto?.retainedFloors ?? 6;
    let startFloor = summary.progress.lastProcessedFloor === null
        ? summary.progress.startFloor : summary.progress.lastProcessedFloor + 1;
    if (summary.auto?.uncoveredOnly) {
        const free = buildSummaryCoverage(chat, summary).summarizable.find(([a, b]) => b - Math.max(a, startFloor) + 1 >= x);
        if (!free) return null;
        startFloor = Math.max(startFloor, free[0]);
    }
    const endFloor = startFloor + x - 1;
    if (endFloor > chat.length - 1 - y) return null;
    try {
        return selectContinuousSummaryFloors(chat, { startFloor, endFloor });
    } catch {
        // Preserve the earliest nominal task even when its current source cannot be built.
        // The service records the actual selection error without skipping to a later range.
        return { requestedRange: [startFloor, endFloor], floorRange: [startFloor, endFloor] };
    }
}

export function planAutomaticSummaryBackfill(chat, summary, { targetEnd = null } = {}) {
    const batchSize = summary.auto?.batchSize ?? 15;
    const retainedFloors = summary.auto?.retainedFloors ?? 6;
    const pending = summary.pendingAuto ?? null;
    const progressStart = summary.progress.lastProcessedFloor === null
        ? summary.progress.startFloor : summary.progress.lastProcessedFloor + 1;
    const startFloor = pending?.requestedRange?.[0] ?? progressStart;
    const eligibleEnd = Math.min(
        Number.isSafeInteger(targetEnd) ? targetEnd : Number.MAX_SAFE_INTEGER,
        chat.length - 1 - retainedFloors,
    );
    const batchRanges = pending?.floorRange ? [structuredClone(pending.floorRange)] : [];
    let cursor = pending?.floorRange ? pending.floorRange[1] + 1 : startFloor;
    while (cursor + batchSize - 1 <= eligibleEnd && batchRanges.length <= chat.length) {
        const simulated = { ...summary, pendingAuto: null,
            progress: { ...summary.progress, lastProcessedFloor: cursor === summary.progress.startFloor ? null : cursor - 1 } };
        const selection = selectAutomaticSummaryRange(chat, simulated);
        if (!selection) break;
        if (selection.requestedRange[1] > eligibleEnd) break;
        batchRanges.push(structuredClone(selection.floorRange));
        const nextCursor = selection.floorRange[1] + 1;
        if (nextCursor <= cursor) break;
        cursor = nextCursor;
    }
    const visibleEnd = Math.max(eligibleEnd, pending?.floorRange?.[1] ?? -1);
    const freeRanges = summary.auto?.uncoveredOnly ? buildSummaryCoverage(chat, { ...summary, pendingAuto: null }).summarizable
        .map(([a, b]) => [Math.max(a, startFloor), Math.min(b, eligibleEnd)]).filter(([a, b]) => a <= b) : null;
    const pendingFloors = freeRanges ? freeRanges.reduce((sum, [a, b]) => sum + b - a + 1, 0) : visibleEnd >= startFloor ? visibleEnd - startFloor + 1 : 0;
    const remainder = freeRanges ? Math.max(0, pendingFloors - batchRanges.reduce((sum, [a, b]) => sum + b - a + 1, 0)) : eligibleEnd >= cursor ? eligibleEnd - cursor + 1 : 0;
    return structuredClone({ startFloor, eligibleEnd, pendingFloors, fullBatchCount: batchRanges.length,
        batchRanges, range: pendingFloors ? [startFloor, visibleEnd] : null, remainder, ...(freeRanges ? { eligibleRanges: freeRanges } : {}) });
}

export function automaticSummaryState(chat, summary) {
    const runStart = summary.progress.startFloor;
    const runEnd = summary.progress.lastProcessedFloor;
    const processedRanges = Number.isSafeInteger(runStart) && Number.isSafeInteger(runEnd) && runEnd >= runStart
        ? [[runStart, runEnd]] : [];
    const retainedFloors = summary.auto?.retainedFloors ?? 6;
    return structuredClone({ auto: { ...summary.auto, batchSize: summary.auto?.batchSize ?? 15, retainedFloors },
        progress: summary.progress, processedRanges, coveredRanges: processedRanges, gapRanges: [],
        retainedRange: chat.length && retainedFloors ? [Math.max(0, chat.length - retainedFloors), chat.length - 1] : null,
        pendingAuto: summary.pendingAuto ?? null, lastResult: summary.lastResult ?? null });
}
