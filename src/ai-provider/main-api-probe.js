import { captureMainConnectionIdentity } from './secondary-api-config.js';

export const MAIN_API_PROBE_MARKER = 'TKM_MAIN_BACKGROUND_OK';

function captureChatIdentity(context) {
    const chat = context?.chat;
    return {
        chat,
        chatId: context?.chatId ?? null,
        length: Array.isArray(chat) ? chat.length : null,
        lastMessage: Array.isArray(chat) ? chat.at(-1) : null,
    };
}

function sameMainConnection(before, after) {
    return before.mainApi === after.mainApi
        && before.onlineStatus === after.onlineStatus
        && before.chatCompletionSource === after.chatCompletionSource;
}

function sameChat(before, after) {
    return before.chat === after.chat
        && before.chatId === after.chatId
        && before.length === after.length
        && before.lastMessage === after.lastMessage;
}

export async function runMainApiBackgroundProbe(context) {
    if (typeof context?.generateRaw !== 'function') {
        throw new Error('SillyTavern generateRaw() 不可用。');
    }

    const connectionBefore = captureMainConnectionIdentity(context);
    const chatBefore = captureChatIdentity(context);
    const output = await context.generateRaw({
        systemPrompt: 'You are running an isolated extension background probe. Do not add explanation.',
        prompt: `Return this exact marker and nothing else: ${MAIN_API_PROBE_MARKER}`,
        responseLength: 32,
        trimNames: false,
    });
    const connectionAfter = captureMainConnectionIdentity(context);
    const chatAfter = captureChatIdentity(context);

    if (!sameMainConnection(connectionBefore, connectionAfter)) {
        throw new Error('后台探针前后主连接标识发生变化。');
    }
    if (!sameChat(chatBefore, chatAfter)) {
        throw new Error('后台探针意外改变了当前聊天。');
    }
    if (typeof output !== 'string' || !output.includes(MAIN_API_PROBE_MARKER)) {
        throw new Error('主 API 已返回内容，但固定标记校验失败。');
    }

    return {
        ok: true,
        marker: MAIN_API_PROBE_MARKER,
        chatUnchanged: true,
        mainConnectionUnchanged: true,
    };
}

export { captureChatIdentity };
