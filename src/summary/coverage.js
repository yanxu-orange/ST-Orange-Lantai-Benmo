import {
    activeExcludedFloors,
    sameSummaryExclusionPolicy,
    summaryExclusionPolicy,
} from './exclusions.js';
import { projectSummaryBatches } from './batch-projection.js';

function validRange(value) {
    return Array.isArray(value) && value.length === 2
        && value.every(floor => Number.isSafeInteger(floor) && floor >= 0)
        && value[1] >= value[0];
}

function clampRange(value, chatLength) {
    if (!validRange(value) || chatLength <= 0 || value[0] >= chatLength) return null;
    return [value[0], Math.min(value[1], chatLength - 1)];
}

function compressFloors(floors) {
    const ordered = [...new Set(floors)].sort((left, right) => left - right);
    const ranges = [];
    for (const floor of ordered) {
        const last = ranges.at(-1);
        if (last && floor === last[1] + 1) last[1] = floor;
        else ranges.push([floor, floor]);
    }
    return ranges;
}

function floorsForRanges(ranges, chatLength) {
    const floors = [];
    for (const value of ranges) {
        const range = clampRange(value, chatLength);
        if (!range) continue;
        for (let floor = range[0]; floor <= range[1]; floor += 1) floors.push(floor);
    }
    return floors;
}

function safeRecord(type, value, range) {
    return {
        type,
        id: typeof value?.id === 'string' ? value.id : (typeof value?.taskId === 'string' ? value.taskId : null),
        status: typeof value?.status === 'string' ? value.status : null,
        floorRange: validRange(range) ? [...range] : null,
    };
}

function pendingStatus(value) {
    return ['failed', 'keyword-failed', 'alias-failed', 'interrupted'].includes(value?.status)
        ? 'failed' : 'processing';
}

function activeBatch(batch) {
    return batch?.status === 'completed' && !batch?.invalidatedAt;
}

export function buildSummaryCoverage(chatOrLength, summary = {}, memories = null) {
    const chatLength = Array.isArray(chatOrLength)
        ? chatOrLength.length
        : (Number.isSafeInteger(chatOrLength) && chatOrLength >= 0 ? chatOrLength : 0);
    const batches = Array.isArray(summary?.batches) ? summary.batches : [];
    const batchResults = projectSummaryBatches({ chatLength, summary, memories });
    const batchResultById = new Map(batchResults.map(batch => [batch.id, batch]));
    const exclusions = activeExcludedFloors(summary);
    const summarizedRanges = [];
    const skippedRanges = [];
    const invalidated = [];
    const sourceMissing = [];

    for (const batch of batches) {
        const range = batch?.floorRange;
        if (batch?.status === 'invalidated' || batch?.invalidatedAt) {
            if (!batch?.retiredAt) invalidated.push(safeRecord('batch', batch, range));
            continue;
        }
        if (!activeBatch(batch) || !validRange(range)) continue;
        if (!batch?.retiredAt && range[1] >= chatLength) sourceMissing.push(safeRecord('batch', batch, range));
        if (batch.outcome === 'skipped') {
            if (!batch?.retiredAt) skippedRanges.push(range);
        } else if (batch.outcome !== 'excluded') {
            const projected = batchResultById.get(batch.id);
            if (batch.outcome !== 'memories' || !Array.isArray(memories) || projected?.derivedCount > 0) summarizedRanges.push(range);
        }
    }

    const pending = [summary?.pendingManualReview, summary?.pendingAuto].filter(Boolean);
    const processingRanges = [];
    const failedRanges = [];
    for (const task of pending) {
        const range = task?.floorRange ?? task?.requestedRange;
        if (!validRange(range)) continue;
        if (range[1] >= chatLength) sourceMissing.push(safeRecord('task', task, range));
        (pendingStatus(task) === 'failed' ? failedRanges : processingRanges).push(range);
    }
    for (const record of exclusions) {
        if (record.floor >= chatLength) sourceMissing.push(safeRecord('exclusion', record, [record.floor, record.floor]));
    }

    const retainedFloors = Number.isSafeInteger(summary?.auto?.retainedFloors)
        && summary.auto.retainedFloors >= 0 ? summary.auto.retainedFloors : 6;
    const retainedRanges = chatLength > 0 && retainedFloors > 0
        ? [[Math.max(0, chatLength - retainedFloors), chatLength - 1]] : [];
    const raw = {
        summarized: compressFloors(floorsForRanges(summarizedRanges, chatLength)),
        processing: compressFloors(floorsForRanges(processingRanges, chatLength)),
        failed: compressFloors(floorsForRanges(failedRanges, chatLength)),
        skipped: compressFloors(floorsForRanges(skippedRanges, chatLength)),
        excluded: compressFloors(exclusions.filter(item => item.floor < chatLength).map(item => item.floor)),
        retained: compressFloors(floorsForRanges(retainedRanges, chatLength)),
    };

    const occupied = new Set(Object.values(raw).flatMap(ranges => floorsForRanges(ranges, chatLength)));
    raw.summarizable = compressFloors(Array.from({ length: chatLength }, (_, floor) => floor)
        .filter(floor => !occupied.has(floor)));

    const priority = ['failed', 'processing', 'excluded', 'summarized', 'skipped', 'retained', 'summarizable'];
    const resolved = new Array(chatLength).fill(null);
    for (const status of [...priority].reverse()) {
        for (const floor of floorsForRanges(raw[status], chatLength)) resolved[floor] = status;
    }
    const segments = [];
    for (let floor = 0; floor < resolved.length; floor += 1) {
        const status = resolved[floor];
        const last = segments.at(-1);
        if (last?.status === status && last.range[1] + 1 === floor) last.range[1] = floor;
        else segments.push({ status, range: [floor, floor] });
    }
    const current = Object.fromEntries(priority.map(status => [
        status,
        segments.filter(segment => segment.status === status).map(segment => [...segment.range]),
    ]));

    const sourcePolicyChanged = batches.filter(batch => activeBatch(batch) && !batch?.retiredAt).flatMap(batch => {
        if (!validRange(batch.floorRange) || batch.outcome === 'skipped') return [];
        const touched = exclusions.filter(record => record.floor >= batch.floorRange[0] && record.floor <= batch.floorRange[1]);
        const currentPolicy = summaryExclusionPolicy(summary, batch.floorRange);
        const changed = Object.hasOwn(batch, 'exclusionPolicy')
            ? !sameSummaryExclusionPolicy(currentPolicy, batch.exclusionPolicy)
            : touched.length > 0;
        return changed ? [{ batchId: typeof batch.id === 'string' ? batch.id : null,
            floorRange: [...batch.floorRange], excludedFloors: touched.map(record => record.floor) }] : [];
    });

    return structuredClone({ chatLength, ...current, segments, batchResults,
        history: {
            invalidated,
            sourceMissing,
            sourcePolicyChanged,
            resultsDeleted: Array.isArray(memories)
                ? batchResults.filter(batch => batch.resultsDeleted && !batch.retired).map(batch => ({
                    batchId: batch.id ?? null,
                    ordinal: batch.ordinal ?? null,
                    floorRange: validRange(batch.floorRange) ? [...batch.floorRange] : null,
                }))
                : [],
        } });
}
