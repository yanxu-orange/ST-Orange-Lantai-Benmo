/** Official Generate events can finish before MESSAGE_RECEIVED (streaming),
 * and stream errors also emit MESSAGE_RECEIVED. Both signals and stream state
 * are required; event callbacks must never await a background generation. */
export function installAutoSummaryLifecycle({
    context,
    getContext = () => context,
    onCompleted,
    onDeleted = null,
    onError = () => {},
    onObservation = () => {},
    isEnabled = () => true,
    schedule = callback => setTimeout(callback, 0),
} = {}) {
    if (typeof onCompleted !== 'function') throw new TypeError('onCompleted 必须是函数。');
    if (!context?.eventSource?.on) return null;
    let active = null;
    let epoch = 0;
    let disposed = false;
    let messageSnapshot = Array.isArray(getContext()?.chat) ? getContext().chat.slice() : null;
    const completedUsers = new WeakSet();
    const subscriptions = [];
    const identity = current => String(current?.getCurrentChatId?.() ?? current?.chatId ?? '');
    function observe(code, messageId = null) {
        try {
            const chatId = identity(getContext());
            if (chatId) onObservation({ chatId, code, messageId: Number.isInteger(messageId) ? String(messageId) : null,
                ...(code === 'checking' ? { metadata: { receivedReply: true } } : {}) });
        } catch { /* Observation must never interrupt the host or summary. */ }
    }
    function reset() { epoch += 1; active = null; }
    function refreshMessageSnapshot() {
        const current = getContext();
        messageSnapshot = Array.isArray(current?.chat) ? current.chat.slice() : null;
    }
    function report() {
        try { onError({ code: 'auto_summary_lifecycle_failed' }); } catch { /* No host disruption or raw error logging. */ }
    }
    function listen(name, callback) {
        const type = context.eventTypes?.[name];
        if (!type) return;
        const listener = (...args) => {
            if (disposed) return;
            try { callback(...args); } catch { reset(); report(); }
        };
        context.eventSource.on(type, listener);
        subscriptions.push([type, listener]);
    }
    function sameChat(run, current) {
        return run && run.epoch === epoch && run.chatId === identity(current) && run.chat === current?.chat;
    }
    function maybeComplete() {
        if (!isEnabled()) { reset(); return; }
        const run = active;
        if (!run || run.queued || !run.ended || !run.received) return;
        run.queued = true;
        schedule(() => {
            try {
                if (disposed || !sameChat(run, getContext()) || run !== active) return;
                if (run.signal?.aborted) return;
                const current = getContext();
                const user = current.chat[run.userMessageId];
                const reply = current.chat[run.messageId];
                if (!user || user !== run.user || user.is_user !== true || user.is_system
                    || reply !== run.reply || reply?.is_user !== false || reply.is_system
                    || typeof reply.mes !== 'string' || !reply.mes.trim()
                    || run.messageId !== run.userMessageId + 1 || completedUsers.has(user)) {
                    observe('invalid_round', run.messageId);
                    return;
                }
                completedUsers.add(user);
                active = null;
                observe('checking', run.messageId);
                // Fire and catch, without returning a Promise to the host event bus.
                Promise.resolve(onCompleted({ chatId: run.chatId, userMessageId: run.userMessageId, messageId: run.messageId }))
                    .catch(report);
            } catch { report(); }
        });
    }
    listen('GENERATION_STARTED', (type, options = {}, dryRun = false) => {
        // Official PromptManager previews also emit STARTED after a real reply.
        // They do not replace the real generation or its queued completion.
        if (dryRun) return;
        reset();
        if (!isEnabled()) return;
        if (type !== 'normal' || options.automatic_trigger || options.signal?.aborted) {
            observe(options.signal?.aborted ? 'stopped'
                : ({ regenerate: 'ignored_regenerate', swipe: 'ignored_swipe', continue: 'ignored_continue' }[type] ?? 'ignored_generation'));
            return;
        }
        observe('generation_started');
        const current = getContext();
        if (!Array.isArray(current?.chat) || !identity(current)) return;
        const index = current.chat.length - 1;
        const user = current.chat[index];
        active = { epoch, chatId: identity(current), chat: current.chat,
            userMessageId: user?.is_user === true ? index : null,
            user: user?.is_user === true ? user : null, signal: options.signal,
            received: false, ended: false, queued: false };
    });
    listen('MESSAGE_SENT', messageId => {
        const current = getContext();
        if (sameChat(active, current) && Number.isInteger(messageId)) {
            active.userMessageId = messageId;
            active.user = current.chat[messageId];
        }
        refreshMessageSnapshot();
    });
    listen('MESSAGE_RECEIVED', (messageId, type) => {
        const current = getContext();
        try {
            if (!sameChat(active, current) || type !== 'normal' || !Number.isInteger(messageId)) return;
            const stream = current.streamingProcessor;
            if (active.signal?.aborted || (stream && (stream.isStopped || !stream.isFinished || stream.abortController?.signal?.aborted))) {
                reset();
                observe('stopped', messageId);
                return;
            }
            active.messageId = messageId;
            active.reply = current.chat[messageId];
            active.received = true;
            observe('awaiting_completion', messageId);
            maybeComplete();
        } finally {
            refreshMessageSnapshot();
        }
    });
    listen('GENERATION_ENDED', () => {
        if (!sameChat(active, getContext())) return;
        active.ended = true;
        maybeComplete();
    });
    listen('GENERATION_STOPPED', () => { reset(); observe('stopped'); });
    listen('MESSAGE_SWIPED', messageId => { reset(); observe('ignored_swipe', messageId); refreshMessageSnapshot(); });
    for (const name of ['CHAT_CHANGED', 'CHAT_CREATED']) listen(name, () => { reset(); refreshMessageSnapshot(); });
    listen('MESSAGE_DELETED', () => {
        reset();
        const current = getContext();
        const before = messageSnapshot;
        const after = Array.isArray(current?.chat) ? current.chat.slice() : null;
        messageSnapshot = after;
        if (!isEnabled() || typeof onDeleted !== 'function') return;
        const deletionRange = findDeletedMessageRange(before, after);
        Promise.resolve(onDeleted({
            chatId: identity(current), deletionRange,
            previousLength: before?.length ?? null,
            currentLength: after?.length ?? null,
        })).catch(report);
    });
    return {
        dispose() {
            disposed = true;
            reset();
            for (const [type, listener] of subscriptions) context.eventSource.removeListener?.(type, listener);
        },
    };
}

/** Official deletion mutates the chat array but emits only its new length. */
export function findDeletedMessageRange(before, after) {
    if (!Array.isArray(before) || !Array.isArray(after) || after.length >= before.length) return null;
    const removed = before.length - after.length;
    let start = 0;
    while (start < after.length && before[start] === after[start]) start += 1;
    for (let index = start; index < after.length; index += 1) {
        if (before[index + removed] !== after[index]) return null;
    }
    return [start, start + removed - 1];
}
