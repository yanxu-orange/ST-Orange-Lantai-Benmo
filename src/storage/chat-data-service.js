import {
    CHAT_BINDING_STATUS,
    createBranchedChatData,
    getContextChatId,
    inspectChatDataBinding,
    migrateChatData,
    readChatData,
} from './chat-data.js';
import { ChatSaveQueue } from './chat-save-queue.js';
import { cloneJson } from './schema-utils.js';
import { EXTENSION_KEY } from '../constants.js';

export class ChatDataService {
    constructor({ getContext, now } = {}) {
        if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
        this.getContext = getContext;
        this.now = now;
        this.queue = new ChatSaveQueue({ getContext, now });
        this.lastError = null;
    }

    readCurrent() {
        return cloneJson(readChatData(this.getContext(), { now: this.now }).data);
    }

    inspectCurrent() {
        try {
            const context = this.getContext();
            const binding = inspectChatDataBinding(context);
            if (binding.status === CHAT_BINDING_STATUS.branchPending) return cloneJson(binding);
            return { status: CHAT_BINDING_STATUS.ready, chatId: binding.chatId };
        } catch (error) {
            return { status: 'unavailable', message: error?.message || '当前聊天不可用。' };
        }
    }

    async resolveCurrentBranch(choice) {
        if (!['import', 'empty'].includes(choice)) throw new Error('未知的分支记忆处理方式。');
        const context = this.getContext();
        const binding = inspectChatDataBinding(context);
        if (binding.status !== CHAT_BINDING_STATUS.branchPending) {
            throw new Error('当前聊天没有等待处理的分支记忆。');
        }
        const source = context.chatMetadata[EXTENSION_KEY];
        const next = choice === 'import'
            ? createBranchedChatData(source, binding.chatId, binding.branchPoint, { now: this.now })
            : migrateChatData(null, binding.chatId, { now: this.now }).data;
        try {
            const saved = await this.queue.replace(binding.chatId, next);
            this.lastError = null;
            return saved;
        } catch (error) {
            this.lastError = error;
            throw error;
        }
    }

    async initializeCurrent() {
        const context = this.getContext();
        const chatId = getContextChatId(context);
        const result = readChatData(context, { now: this.now });
        if (!result.migrated) return cloneJson(result.data);
        try {
            const saved = await this.queue.enqueue(chatId, () => {});
            this.lastError = null;
            return saved;
        } catch (error) {
            this.lastError = error;
            throw error;
        }
    }

    async updateCurrent(mutate) {
        const chatId = getContextChatId(this.getContext());
        try {
            const saved = await this.queue.enqueue(chatId, mutate);
            this.lastError = null;
            return saved;
        } catch (error) {
            this.lastError = error;
            throw error;
        }
    }

    installLifecycle(context = this.getContext()) {
        if (!context?.eventSource || typeof context.eventSource.on !== 'function') return false;
        for (const name of ['CHAT_CHANGED', 'CHAT_CREATED']) {
            const eventType = context.eventTypes?.[name];
            if (!eventType) continue;
            context.eventSource.on(eventType, () => {
                this.initializeCurrent().catch(() => {});
            });
        }
        return true;
    }
}
