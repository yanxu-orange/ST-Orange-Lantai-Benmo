export function createAutoSummaryDraft(snapshot = {}) {
    const auto = snapshot.auto ?? {};
    return {
        enabled: Boolean(auto.enabled),
        batchSize: String(auto.batchSize ?? 15),
        retainedFloors: String(auto.retainedFloors ?? 6),
        hideSummarizedFloors: auto.hideSummarizedFloors !== false,
        startFloor: String(snapshot.progress?.startFloor ?? 0),
    };
}

export function autoSummaryRanges(ranges, empty = '无') {
    return ranges?.length ? ranges.map(range => `${range[0]}–${range[1]}`).join('、') : empty;
}

export function autoSummarySkipCopy(snapshot) {
    const range = autoSummaryRanges(snapshot.pendingAuto?.floorRange ? [snapshot.pendingAuto.floorRange] : []);
    return `跳过楼层 ${range}？这批不会生成记忆，进度会向后推进，并记录为未总结空档，不再自动补做。${snapshot.auto?.hideSummarizedFloors ? '当前隐藏设置已开启，这些楼层也将不再进入正式模型上下文。' : '当前隐藏设置已关闭，这些楼层不会新增隐藏。'}`;
}

export function autoSummaryStatus(snapshot) {
    const backfill = snapshot.backfill?.chatId === snapshot.chatId ? snapshot.backfill : null;
    if (backfill?.status === 'running') return '正在补录旧楼';
    if (backfill?.status === 'pause-requested') return '完成本批后暂停';
    if (backfill?.status === 'paused') return '补录已暂停';
    if (backfill?.status === 'failed') return '补录失败';
    if (backfill?.status === 'interrupted') return '补录已中断';
    const status = snapshot.pendingAuto?.status;
    if (status === 'running') return '正在总结';
    if (status === 'keyword-failed') return '关键词生成失败';
    if (status === 'alias-failed') return '检索简称生成失败，正文和关键词已保留';
    if (status === 'failed') return '总结失败';
    if (status === 'interrupted') return '总结已中断';
    if (snapshot.pendingAuto) return '有待处理批次';
    return snapshot.auto?.enabled ? '等待下一次正常回复' : '已关闭';
}

export function autoSummaryBackfillCopy(session) {
    if (!session) return '';
    const progress = `${session.completedBatches ?? 0}/${session.totalBatches ?? 0}`;
    const range = session.currentRange ? `｜楼层 ${autoSummaryRanges([session.currentRange])}` : '';
    const copies = {
        running: `正在补录 ${progress}${range}`,
        'pause-requested': `正在补录 ${progress}${range}；当前批保存后暂停。`,
        paused: `已完成 ${progress} 批，补录已暂停。`,
        completed: `本轮补录已完成，共处理 ${session.completedBatches ?? 0} 批。`,
        failed: `补录停在 ${progress} 批；失败批次已保留。`,
        interrupted: `补录已中断；已完成 ${session.completedBatches ?? 0} 批，当前批未推进。`,
    };
    return copies[session.status] ?? '';
}

export function autoSummaryLastResult(result) {
    if (!result) return '';
    const range = autoSummaryRanges(result.floorRange ? [result.floorRange] : []);
    if (result.status === 'completed') return `最近一次：楼层 ${range} 已入库，共 ${result.itemCount ?? 0} 条记忆。`;
    if (result.status === 'skipped') return `最近一次：已跳过楼层 ${range}，未生成记忆。`;
    if (result.status === 'excluded') return `最近一次：楼层 ${range} 均已标记为不参与总结，未调用 AI。`;
    if (result.status === 'failed') return `最近一次：楼层 ${range} 总结失败。`;
    return '';
}

export function autoSummaryStage(stage) {
    return { preparing: '准备', body: '正文', keywords: '关键词', aliases: '检索简称', storing: '入库' }[stage] ?? '';
}

export function autoSummaryObservation(observation) {
    if (!observation) return '尚未观察到新的回复事件。';
    const meta = observation.metadata ?? {};
    const range = Number.isSafeInteger(meta.startFloor) && Number.isSafeInteger(meta.endFloor)
        ? `楼层 ${meta.startFloor}–${meta.endFloor}` : '当前批次';
    const stage = autoSummaryStage(meta.stage);
    const copies = {
        generation_started: '检测到一轮生成，正在等待回复完成。',
        ignored_regenerate: '最近是重新生成，本次不触发自动总结。',
        ignored_swipe: '最近是切换回复，本次不触发自动总结。',
        ignored_continue: '最近是继续生成，本次不触发自动总结。',
        ignored_generation: '最近是其他生成任务，本次不触发自动总结。',
        stopped: '最近一轮生成已停止，本次不触发自动总结。',
        awaiting_completion: '已检测到生成，尚未收到完整回复。',
        checking: meta.receivedReply ? '已收到正常回复，正在检查自动总结条件。' : '正在检查自动总结条件，尚未确认收到完整回复。',
        invalid_round: '本次没有收到可用于自动总结的完整回复。',
        disabled: meta.receivedReply ? '已收到正常回复；自动总结已关闭，本次不处理。' : '自动总结已关闭，本次不处理。',
        not_enough_floors: meta.receivedReply ? `已收到正常回复；${range} 尚未满足可总结楼层。` : `${range} 尚未满足可总结楼层。`,
        source_unavailable: '已收到正常回复；当前 AI 来源不可用，本次未开始总结。',
        busy: '已收到正常回复；当前聊天已有总结任务，本次不重复开始。',
        duplicate: '这次回复已经检查过，本次不重复开始。',
        interrupted: '自动总结已中断，待手动继续当前批次。',
        queued: stage ? `${range}正在进行${stage}阶段。` : `${range}已进入自动总结队列。`,
        succeeded: `${range}本批已完成并入库${Number.isSafeInteger(meta.itemCount) ? `，生成 ${meta.itemCount} 条记忆` : ''}。`,
        failed: `${range}处理失败，进度未推进。`,
        skipped: '本批已明确跳过，已记录为未总结空档。',
        excluded: `${range}均已标记为不参与总结；本批未调用 AI。`,
    };
    return copies[observation.code] ?? '已完成一次自动总结检查。';
}
