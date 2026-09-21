function safeFloor(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeText(value, maxLength = 128) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text && text.length <= maxLength ? text : null;
}

function safeIdentity(value) {
    const identity = {};
    if (value?.role === 'user' || value?.role === 'assistant') identity.role = value.role;
    if (typeof value?.sendDate === 'string') {
        const sendDate = safeText(value.sendDate);
        if (sendDate) identity.sendDate = sendDate;
    } else if (Number.isSafeInteger(value?.sendDate) && value.sendDate >= 0) {
        identity.sendDate = value.sendDate;
    }
    return identity;
}

export function normalizeExcludedFloorRecord(value) {
    const id = safeText(value?.id);
    const floor = safeFloor(value?.floor);
    const markedAt = safeText(value?.markedAt);
    if (!id || floor === null || !markedAt) return null;
    return { id, floor, markedAt, identity: safeIdentity(value?.identity) };
}

export function activeExcludedFloors(summary) {
    const byFloor = new Map();
    for (const value of Array.isArray(summary?.excludedFloors) ? summary.excludedFloors : []) {
        const record = normalizeExcludedFloorRecord(value);
        if (record && !byFloor.has(record.floor)) byFloor.set(record.floor, record);
    }
    return [...byFloor.values()].sort((left, right) => left.floor - right.floor);
}

export function summaryExclusionPolicy(summary, floorRange) {
    if (!rangeContainsFloor(floorRange, floorRange?.[0])) throw new TypeError('总结楼层范围不可用。');
    return {
        excludedFloors: activeExcludedFloors(summary)
            .filter(record => record.floor >= floorRange[0] && record.floor <= floorRange[1])
            .map(record => record.floor),
    };
}

export function sameSummaryExclusionPolicy(left, right) {
    const leftFloors = Array.isArray(left?.excludedFloors) ? left.excludedFloors : [];
    const rightFloors = Array.isArray(right?.excludedFloors) ? right.excludedFloors : [];
    return leftFloors.length === rightFloors.length
        && leftFloors.every((floor, index) => floor === rightFloors[index]);
}

export function filterExcludedSummaryFloors(floors, policy) {
    const excluded = new Set(Array.isArray(policy?.excludedFloors) ? policy.excludedFloors : []);
    return (Array.isArray(floors) ? floors : []).filter(floor => !excluded.has(floor?.index));
}

function activeCompletedBatch(batch) {
    return batch?.status === 'completed' && !batch?.invalidatedAt
        && batch?.outcome !== 'skipped' && batch?.outcome !== 'excluded';
}

function rangeContainsFloor(range, floor) {
    return Array.isArray(range) && range.length === 2
        && range.every(value => Number.isSafeInteger(value) && value >= 0)
        && range[0] <= floor && floor <= range[1];
}

export function affectedCompletedBatchIds(summary, floor) {
    const normalizedFloor = safeFloor(floor);
    if (normalizedFloor === null) return [];
    return (Array.isArray(summary?.batches) ? summary.batches : [])
        .filter(activeCompletedBatch)
        .filter(batch => rangeContainsFloor(batch.floorRange, normalizedFloor))
        .map(batch => batch.id)
        .filter(id => typeof id === 'string' && id);
}

/** Mutates one chat-summary draft. Repeating the same floor is idempotent. */
export function markSummaryFloorExcluded(summary, value) {
    if (!summary || typeof summary !== 'object') throw new TypeError('聊天总结数据不可用。');
    const record = normalizeExcludedFloorRecord(value);
    if (!record) throw new TypeError('排除楼层记录不可用。');
    const records = activeExcludedFloors(summary);
    const existing = records.find(item => item.floor === record.floor) ?? null;
    summary.excludedFloors = existing ? records : [...records, record].sort((left, right) => left.floor - right.floor);
    return {
        created: !existing,
        record: structuredClone(existing ?? record),
        affectedBatchIds: affectedCompletedBatchIds(summary, record.floor),
    };
}

/** Mutates one chat-summary draft and removes at most one active floor marker. */
export function unmarkSummaryFloorExcluded(summary, floor) {
    if (!summary || typeof summary !== 'object') throw new TypeError('聊天总结数据不可用。');
    const normalizedFloor = safeFloor(floor);
    if (normalizedFloor === null) throw new TypeError('排除楼层不可用。');
    const records = activeExcludedFloors(summary);
    const removed = records.find(item => item.floor === normalizedFloor) ?? null;
    summary.excludedFloors = records.filter(item => item.floor !== normalizedFloor);
    return { removed: Boolean(removed), record: removed ? structuredClone(removed) : null,
        affectedBatchIds: affectedCompletedBatchIds(summary, normalizedFloor) };
}

/** Removes deleted markers and rebases later markers in old floor coordinates. */
export function rebaseSummaryExclusions(summary, deletionRange) {
    if (!summary || typeof summary !== 'object') throw new TypeError('聊天总结数据不可用。');
    if (!Array.isArray(deletionRange) || deletionRange.length !== 2
        || deletionRange.some(value => safeFloor(value) === null) || deletionRange[1] < deletionRange[0]) {
        throw new TypeError('删除楼层范围不可用。');
    }
    const [start, end] = deletionRange;
    const removedFloorCount = end - start + 1;
    let removedCount = 0;
    let shiftedCount = 0;
    summary.excludedFloors = activeExcludedFloors(summary).flatMap(record => {
        if (record.floor >= start && record.floor <= end) {
            removedCount += 1;
            return [];
        }
        if (record.floor > end) {
            shiftedCount += 1;
            return [{ ...record, floor: record.floor - removedFloorCount }];
        }
        return [record];
    });
    return { removedCount, shiftedCount };
}

export function inheritSummaryExclusions(summary, branchPoint) {
    if (!Number.isSafeInteger(branchPoint) || branchPoint < -1) throw new TypeError('分支楼层不可用。');
    return activeExcludedFloors(summary)
        .filter(record => record.floor <= branchPoint)
        .map(record => structuredClone(record));
}
