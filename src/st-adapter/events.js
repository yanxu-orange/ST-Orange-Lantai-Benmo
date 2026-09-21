const RECORDED_EVENT_NAMES = Object.freeze([
    'CHAT_CHANGED',
    'MESSAGE_SENT',
    'GENERATION_STARTED',
    'MESSAGE_RECEIVED',
    'GENERATION_ENDED',
    'GENERATION_STOPPED',
    'MESSAGE_SWIPED',
    'MESSAGE_EDITED',
    'MESSAGE_DELETED',
    'IMPERSONATE_READY',
]);

function readSafeEventDetail(name, args) {
    const value = name === 'GENERATION_STARTED'
        ? args[0]
        : name === 'MESSAGE_RECEIVED'
            ? args[1]
            : null;

    if (typeof value !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(value)) {
        return null;
    }
    return value;
}

export function createRuntimeEventRecorder(context, { now = () => new Date().toISOString() } = {}) {
    if (!context?.eventSource || typeof context.eventSource.on !== 'function') {
        throw new Error('SillyTavern eventSource is unavailable.');
    }
    if (!context?.eventTypes || typeof context.eventTypes !== 'object') {
        throw new Error('SillyTavern eventTypes is unavailable.');
    }

    let active = false;
    let entries = [];

    for (const name of RECORDED_EVENT_NAMES) {
        const eventType = context.eventTypes[name];
        if (!eventType) continue;
        context.eventSource.on(eventType, (...args) => {
            if (!active) return;
            entries.push({
                name,
                at: now(),
                detail: readSafeEventDetail(name, args),
            });
            if (entries.length > 80) entries = entries.slice(-80);
        });
    }

    return {
        start() {
            entries = [];
            active = true;
        },
        stop() {
            active = false;
            return entries.map(entry => ({ ...entry }));
        },
        snapshot() {
            return entries.map(entry => ({ ...entry }));
        },
        isActive() {
            return active;
        },
    };
}

export function installChatViewLifecycle(context, callback) {
    if (typeof callback !== 'function') throw new TypeError('callback 必须是函数。');
    if (!context?.eventSource || typeof context.eventSource.on !== 'function') return false;
    let installed = false;
    for (const name of ['CHAT_CHANGED', 'CHAT_CREATED']) {
        const eventType = context.eventTypes?.[name];
        if (!eventType) continue;
        context.eventSource.on(eventType, callback);
        installed = true;
    }
    return installed;
}

export function installStoryTimeObservationLifecycle({
    context,
    getContext = () => context,
    storyTimeService,
    onUpdated = () => {},
    isEnabled = () => true,
} = {}) {
    if (!context?.eventSource || typeof context.eventSource.on !== 'function') return null;
    if (!storyTimeService || typeof storyTimeService.reconcileFromChat !== 'function') {
        throw new TypeError('storyTimeService 不可用。');
    }

    async function reconcile(generationType = 'reconcile') {
        if (!isEnabled()) return null;
        if (['impersonate', 'quiet'].includes(generationType)) return null;
        const chat = getContext()?.chat;
        const result = await storyTimeService.reconcileFromChat(chat, { generationType });
        onUpdated(result.current);
        return result.current;
    }

    const sent = context.eventTypes?.MESSAGE_SENT;
    const received = context.eventTypes?.MESSAGE_RECEIVED;
    if (sent) context.eventSource.on(sent, () => reconcile('message_sent'));
    if (received) context.eventSource.on(received, (_messageId, generationType) => reconcile(generationType ?? 'message_received'));

    for (const name of ['CHAT_CHANGED', 'CHAT_CREATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED']) {
        const eventType = context.eventTypes?.[name];
        if (!eventType) continue;
        context.eventSource.on(eventType, () => reconcile(name.toLowerCase()));
    }

    return { reconcile };
}

export { RECORDED_EVENT_NAMES };
