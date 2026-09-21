import { isActiveMemory } from '../domain/memory.js';

function validRange(value) {
    return Array.isArray(value) && value.length === 2
        && value.every(floor => Number.isSafeInteger(floor) && floor >= 0)
        && value[1] >= value[0];
}

export function projectSummaryBatches({ chatLength = 0, summary = {}, memories = null } = {}) {
    const length = Number.isSafeInteger(chatLength) && chatLength >= 0 ? chatLength : 0;
    const resultsKnown = Array.isArray(memories);
    const allMemories = resultsKnown ? memories : [];
    return (Array.isArray(summary?.batches) ? summary.batches : []).map(batch => {
        const batchMemories = allMemories.filter(memory => memory?.source?.batchId === batch?.id);
        const activeMemories = batchMemories.filter(isActiveMemory);
        const sourceAvailable = validRange(batch?.floorRange) && batch.floorRange[1] < length;
        const mergeBlocked = batchMemories.some(memory => typeof memory?.supersededBy === 'string' && memory.supersededBy.trim());
        const completed = batch?.status === 'completed' && !batch?.invalidatedAt;
        const retired = typeof batch?.retiredAt === 'string' && Boolean(batch.retiredAt.trim());
        const resultsDeleted = resultsKnown && completed && batch?.outcome === 'memories' && activeMemories.length === 0;
        let regenerationReason = '';
        if (retired) regenerationReason = '已退出当前总结轮次';
        else if (!completed) regenerationReason = '批次已失效';
        else if (!sourceAvailable) regenerationReason = '原始楼层已不可用';
        else if (mergeBlocked) regenerationReason = '派生记忆已参与合并，不能破坏撤销关系';
        return {
            ...batch,
            originalItemCount: Number.isSafeInteger(batch?.itemCount) && batch.itemCount >= 0 ? batch.itemCount : null,
            derivedCount: activeMemories.length,
            sourceAvailable,
            retired,
            resultsDeleted,
            resultStatus: !completed ? 'invalidated' : !sourceAvailable ? 'source-missing'
                : !resultsKnown ? 'unknown' : resultsDeleted ? 'deleted' : 'present',
            mergeBlocked,
            canRegenerate: batch?.outcome === 'memories' && !regenerationReason,
            regenerationReason,
        };
    });
}
