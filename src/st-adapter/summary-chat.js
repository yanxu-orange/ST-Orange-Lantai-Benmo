import { getContextChatId } from '../storage/chat-data.js';

export function createSummaryChatAdapter({ getContext } = {}) {
    if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
    const currentChatIdOrNull = () => {
        try { return getContextChatId(getContext()); }
        catch { return null; }
    };
    return {
        currentChatId() { return getContextChatId(getContext()); },
        currentChatIdOrNull,
        readCurrent() {
            const context = getContext();
            const chat = structuredClone(context?.chat ?? []);
            // Official chats.js hideChatMessageRange uses is_system for ordinary
            // hidden turns too. Official system-messages.js assigns extra.type to
            // actual system messages. Restore only ordinary turns in this private
            // summary input copy; never alter the host chat or its visibility.
            for (const message of chat) {
                if (message?.is_system === true && typeof message.is_user === 'boolean'
                    && typeof message.mes === 'string' && message.role !== 'system'
                    && !(typeof message.extra?.type === 'string' && message.extra.type.trim())
                    && !Array.isArray(message.extra?.tool_invocations)) message.is_system = false;
            }
            return { chatId: getContextChatId(context), chat };
        },
        onChatChanged(handler) {
            const context = getContext();
            const eventType = context?.eventTypes?.CHAT_CHANGED;
            if (!eventType || typeof context?.eventSource?.on !== 'function') return false;
            const listener = () => handler(currentChatIdOrNull());
            context.eventSource.on(eventType, listener);
            return () => context.eventSource?.off?.(eventType, listener);
        },
    };
}
