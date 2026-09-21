const ERROR_MESSAGES = {
    empty_summary: '没有可入库的总结', provider_error: '来源不可用', provider_failed: '来源不可用',
    invalid_json: '返回格式不正确', invalid_schema: '返回格式不正确',
    missing_story_time: '缺少故事时间', source_changed: '聊天来源已变化', no_provider: '尚未选择 API 来源',
};

function rangeLabel(floorRange) {
    return Array.isArray(floorRange) && floorRange.length === 2
        && floorRange.every(value => Number.isInteger(value) && value >= 0)
        && floorRange[1] >= floorRange[0] ? `（${floorRange[0]}–${floorRange[1]} 楼）` : '';
}

/** Host feedback remains visible when the plugin panel is closed. */
export function createAutoSummaryNotifier({ root = globalThis } = {}) {
    let toast = null;
    let lastBackfill = null;
    function clear() {
        if (toast) root.toastr?.clear?.(toast, { force: true });
        toast = null;
        lastBackfill = null;
    }
    return {
        clear,
        backfill({ id, status, completedBatches, totalBatches, currentRange } = {}) {
            if (!['running', 'pause-requested', 'paused', 'completed', 'failed', 'interrupted'].includes(status)) return;
            const completed = Number.isSafeInteger(completedBatches) && completedBatches >= 0 ? completedBatches : 0;
            const total = Number.isSafeInteger(totalBatches) && totalBatches >= completed ? totalBatches : completed;
            const range = rangeLabel(currentRange);
            const signature = JSON.stringify([id, status, completed, total, range]);
            if (signature === lastBackfill) return;
            clear();
            lastBackfill = signature;
            const messages = {
                running: `正在处理待总结楼层：已完成 ${completed}/${total} 批${range}`,
                'pause-requested': `将在本批完成后暂停：已完成 ${completed}/${total} 批${range}`,
                paused: `已暂停：本轮完成 ${completed}/${total} 批。可在自动总结页面继续。`,
                completed: `本轮可处理的完整批次已完成，共 ${completed} 批。`,
                failed: `处理已停止：本轮完成 ${completed}/${total} 批${range}。失败批次已保留，请进入自动总结查看。`,
                interrupted: `处理已中断：本轮完成 ${completed}/${total} 批。请进入原聊天的自动总结页面继续。`,
            };
            const method = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'info';
            const terminal = ['failed', 'paused', 'interrupted'].includes(status);
            const timeOut = status === 'completed' ? 2000 : terminal ? 5000 : status === 'pause-requested' ? 4000 : 2500;
            toast = root.toastr?.[method]?.(messages[status], '时间关键词记忆', {
                timeOut, extendedTimeOut: terminal ? 1500 : 1000,
                escapeHtml: true, closeButton: true, tapToDismiss: true,
            }) ?? null;
        },
        manual({ status, floorRange } = {}) {
            if (!['review', 'completed', 'failed', 'interrupted'].includes(status)) return;
            clear();
            const messages = {
                review: `手动总结${rangeLabel(floorRange)}已生成，请回到插件检查候选。`,
                completed: `手动总结已入库${rangeLabel(floorRange)}。`,
                failed: `手动总结${rangeLabel(floorRange)}未完成，楼层范围已保留，可返回插件重试。`,
                interrupted: `手动总结${rangeLabel(floorRange)}因切换聊天而中断。`,
            };
            const method = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'info';
            toast = root.toastr?.[method]?.(messages[status], '时间关键词记忆', {
                timeOut: status === 'completed' ? 2000 : 5000,
                extendedTimeOut: status === 'completed' ? 1000 : 1500,
                closeButton: true, tapToDismiss: true, escapeHtml: true,
            }) ?? null;
        },
        success({ floorRange } = {}) {
            clear();
            toast = root.toastr?.success?.(`自动总结已入库${rangeLabel(floorRange)}`, '时间关键词记忆', {
                timeOut: 2000, extendedTimeOut: 2000, escapeHtml: true,
            }) ?? null;
        },
        error({ code, floorRange } = {}) {
            clear();
            const reason = Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : '总结未完成';
            toast = root.toastr?.error?.(`自动总结${rangeLabel(floorRange)}：${reason}。请进入自动总结查看待处理任务。`, '时间关键词记忆', {
                timeOut: 4000, extendedTimeOut: 1000, closeButton: true, tapToDismiss: true, escapeHtml: true,
            }) ?? null;
        },
        invalidated({ deletionRange, invalidatedBatchOrdinals = [], removedMemoryCount = 0 } = {}) {
            clear();
            const batches = invalidatedBatchOrdinals.length ? `；失效批次 ${invalidatedBatchOrdinals.join('、')}` : '';
            const removed = Number.isSafeInteger(removedMemoryCount) && removedMemoryCount > 0
                ? `；移除 ${removedMemoryCount} 条总结记忆` : '';
            toast = root.toastr?.warning?.(`检测到聊天楼层删除${rangeLabel(deletionRange)}${batches}${removed}。请检查总结范围。`, '时间关键词记忆', {
                timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false, escapeHtml: true,
            }) ?? null;
        },
        deletionUnresolved() {
            clear();
            toast = root.toastr?.error?.('检测到聊天楼层被删除，但无法可靠确定原楼号。自动总结已关闭，请不要继续删除已总结楼层，并检查总结范围。', '时间关键词记忆', {
                timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false, escapeHtml: true,
            }) ?? null;
        },
    };
}
