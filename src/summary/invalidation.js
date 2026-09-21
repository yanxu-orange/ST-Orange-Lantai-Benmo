import { rebaseSummaryExclusions } from './exclusions.js';

function isFloor(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function normalizeDeletionRange(value) {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isFloor) || value[1] < value[0]) {
        throw new TypeError('删除楼层范围不可用。');
    }
    return [value[0], value[1]];
}

function ranges(value) {
    const source = Array.isArray(value?.[0]) ? value : [value];
    if (!source.length) return null;
    const result = [];
    for (const range of source) {
        if (!Array.isArray(range) || range.length !== 2 || !range.every(isFloor) || range[1] < range[0]) return null;
        result.push([range[0], range[1]]);
    }
    return result.length ? result : null;
}

function restoreShape(original, next) {
    if (!next.length) return null;
    return Array.isArray(original?.[0]) ? next : next[0];
}

export function rangeIntersectsDeletion(value, deletionRange) {
    const deletion = normalizeDeletionRange(deletionRange);
    return Boolean(ranges(value)?.some(([start, end]) => start <= deletion[1] && end >= deletion[0]));
}

/** Rebase surviving source coordinates after deleting an old-coordinate interval. */
export function rebaseFloorRanges(value, deletionRange) {
    const source = ranges(value);
    if (!source) return value ?? null;
    const [deletedStart, deletedEnd] = normalizeDeletionRange(deletionRange);
    const removed = deletedEnd - deletedStart + 1;
    const next = [];
    for (const [start, end] of source) {
        if (end < deletedStart) next.push([start, end]);
        else if (start > deletedEnd) next.push([start - removed, end - removed]);
        else {
            const keptStart = start < deletedStart ? start : deletedStart;
            const keptEnd = end > deletedEnd ? end - removed : deletedStart - 1;
            if (keptEnd >= keptStart) next.push([keptStart, keptEnd]);
        }
    }
    return restoreShape(value, next);
}

function completedBatch(batch) {
    return batch?.status === 'completed' && !batch?.invalidatedAt;
}

function taskAffected(task, deletionRange) {
    const taskRanges = ranges(task?.floorRange ?? task?.requestedRange);
    return Boolean(taskRanges?.some(([, end]) => end >= deletionRange[0]));
}

function rebaseSource(record, deletionRange) {
    if (!record?.source || !Object.hasOwn(record.source, 'floorRange')) return record;
    return { ...record, source: { ...record.source, floorRange: rebaseFloorRanges(record.source.floorRange, deletionRange) } };
}

function lastCompletedFloor(summary) {
    const ends = (summary?.batches ?? [])
        .filter(completedBatch)
        .flatMap(batch => ranges(batch.floorRange)?.map(([, end]) => end) ?? []);
    return ends.length ? Math.max(...ends) : null;
}

/** Mutates one transaction draft and returns a body-free result summary. */
export function invalidateSummaryDeletion(root, { deletionRange, at } = {}) {
    if (!root?.summary || !Array.isArray(root.memories) || !Array.isArray(root.anniversaries)) {
        throw new TypeError('聊天总结数据不可用。');
    }
    const normalizedDeletion = normalizeDeletionRange(deletionRange);
    const invalidated = (root.summary.batches ?? []).filter(batch => completedBatch(batch)
        && rangeIntersectsDeletion(batch.floorRange, normalizedDeletion));
    const invalidatedIds = new Set(invalidated.map(batch => batch.id).filter(Boolean));
    const invalidatedAt = typeof at === 'string' && at ? at : new Date().toISOString();
    let shiftedBatchCount = 0;
    const exclusionChanges = rebaseSummaryExclusions(root.summary, normalizedDeletion);

    root.summary.batches = (root.summary.batches ?? []).map(batch => {
        if (invalidatedIds.has(batch.id)) {
            return { ...batch, status: 'invalidated', invalidatedAt, invalidationReason: 'source_deleted' };
        }
        if (!completedBatch(batch) || !ranges(batch.floorRange)) return batch;
        const floorRange = rebaseFloorRanges(batch.floorRange, normalizedDeletion);
        const requestedRange = rebaseFloorRanges(batch.requestedRange, normalizedDeletion);
        if (JSON.stringify(floorRange) !== JSON.stringify(batch.floorRange)) shiftedBatchCount += 1;
        return { ...batch, floorRange, ...(requestedRange ? { requestedRange } : {}) };
    });

    const memoryCountBefore = root.memories.length;
    root.memories = root.memories
        .filter(memory => !invalidatedIds.has(memory?.source?.batchId))
        .map(memory => rebaseSource(memory, normalizedDeletion));
    const anniversaryCountBefore = root.anniversaries.length;
    root.anniversaries = root.anniversaries
        .filter(item => !invalidatedIds.has(item?.source?.batchId))
        .map(item => rebaseSource(item, normalizedDeletion));

    let invalidatedLegacyHiddenCount = 0;
    root.summary.hiddenSegments = (root.summary.hiddenSegments ?? []).map(segment => {
        if (invalidatedIds.has(segment?.batchId)
            || (segment?.status === 'active' && !segment?.batchId && rangeIntersectsDeletion(segment.floorRange, normalizedDeletion))) {
            if (!segment?.batchId) invalidatedLegacyHiddenCount += 1;
            return { ...segment, status: 'invalidated', invalidatedAt, invalidationReason: 'source_deleted' };
        }
        if (segment?.status !== 'active') return segment;
        return { ...segment, floorRange: rebaseFloorRanges(segment.floorRange, normalizedDeletion) };
    });

    const cancelledManualReview = taskAffected(root.summary.pendingManualReview, normalizedDeletion);
    const cancelledAuto = taskAffected(root.summary.pendingAuto, normalizedDeletion);
    const cancelledLastSuccessfulInput = taskAffected(root.summary.lastSuccessfulInput, normalizedDeletion);
    if (cancelledManualReview) root.summary.pendingManualReview = null;
    if (cancelledAuto) root.summary.pendingAuto = null;
    if (cancelledLastSuccessfulInput) root.summary.lastSuccessfulInput = null;
    if (root.summary.progress) {
        const start = root.summary.progress.startFloor ?? 0;
        root.summary.progress.startFloor = rebaseFloorRanges([start, start], normalizedDeletion)?.[0] ?? 0;
        root.summary.progress.lastProcessedFloor = lastCompletedFloor(root.summary);
    }
    if (root.summary.auto) root.summary.auto.lastCheckpointId = null;

    const affected = Boolean(invalidatedIds.size || shiftedBatchCount || invalidatedLegacyHiddenCount
        || cancelledManualReview || cancelledAuto || cancelledLastSuccessfulInput);
    const result = {
        status: affected ? 'invalidated' : 'unaffected', deletionRange: normalizedDeletion,
        invalidatedBatchIds: [...invalidatedIds],
        invalidatedBatchOrdinals: invalidated.map(batch => batch.ordinal).filter(value => Number.isSafeInteger(value)),
        invalidatedFloorRanges: invalidated.map(batch => batch.floorRange),
        removedMemoryCount: memoryCountBefore - root.memories.length,
        removedAnniversaryCount: anniversaryCountBefore - root.anniversaries.length,
        shiftedBatchCount,
        removedExcludedFloorCount: exclusionChanges.removedCount,
        shiftedExcludedFloorCount: exclusionChanges.shiftedCount,
        cancelledManualReview, cancelledAuto, at: invalidatedAt,
    };
    if (affected) root.summary.lastResult = result;
    return result;
}

/** Fail closed when the host deletion event cannot be mapped to an old floor. */
export function blockUnresolvedSummaryDeletion(root, { previousLength, currentLength, at } = {}) {
    if (!root?.summary) throw new TypeError('聊天总结数据不可用。');
    const invalidatedAt = typeof at === 'string' && at ? at : new Date().toISOString();
    const cancelledManualReview = Boolean(root.summary.pendingManualReview);
    const cancelledAuto = Boolean(root.summary.pendingAuto);
    root.summary.pendingManualReview = null;
    root.summary.pendingAuto = null;
    root.summary.lastSuccessfulInput = null;
    if (root.summary.auto) {
        root.summary.auto.enabled = false;
        root.summary.auto.lastCheckpointId = null;
    }
    const result = {
        status: 'deletion-unresolved',
        previousLength: isFloor(previousLength) ? previousLength : null,
        currentLength: isFloor(currentLength) ? currentLength : null,
        cancelledManualReview, cancelledAuto, at: invalidatedAt,
    };
    root.summary.lastResult = result;
    return result;
}
