import { EXTENSION_KEY } from '../constants.js';
import { getContextChatId, readChatData } from './chat-data.js';
import { cloneJson, isoNow } from './schema-utils.js';

function requireMetadataWriteApi(context) {
    if (typeof context?.updateChatMetadata !== 'function') {
        throw new Error('SillyTavern updateChatMetadata() 不可用。');
    }
    if (typeof context?.saveMetadata !== 'function') {
        throw new Error('SillyTavern saveMetadata() 不可用。');
    }
}

export class ChatSaveQueue {
    #tail = Promise.resolve();

    constructor({ getContext, now } = {}) {
        if (typeof getContext !== 'function') throw new TypeError('getContext 必须是函数。');
        this.getContext = getContext;
        this.now = now;
    }

    enqueue(expectedChatId, mutate) {
        if (typeof mutate !== 'function') throw new TypeError('mutate 必须是函数。');
        const operation = this.#tail.then(() => this.#commit(String(expectedChatId), mutate));
        this.#tail = operation.catch(() => undefined);
        return operation;
    }

    replace(expectedChatId, nextData) {
        const operation = this.#tail.then(() => this.#replace(String(expectedChatId), nextData));
        this.#tail = operation.catch(() => undefined);
        return operation;
    }

    async #commit(expectedChatId, mutate) {
        const context = this.getContext();
        requireMetadataWriteApi(context);
        const actualChatId = getContextChatId(context);
        if (actualChatId !== expectedChatId) {
            throw new Error(`聊天已切换，已取消对 ${expectedChatId} 的写入。`);
        }

        const previousNamespace = cloneJson(context.chatMetadata[EXTENSION_KEY] ?? null);
        const { data } = readChatData(context, { now: this.now });
        const draft = cloneJson(data);
        await mutate(draft);
        const next = draft;
        next.updatedAt = isoNow(this.now);

        const freshContext = this.getContext();
        requireMetadataWriteApi(freshContext);
        if (getContextChatId(freshContext) !== expectedChatId) {
            throw new Error(`聊天已切换，已取消对 ${expectedChatId} 的写入。`);
        }

        freshContext.updateChatMetadata({ [EXTENSION_KEY]: cloneJson(next) }, false);
        try {
            await freshContext.saveMetadata();
        } catch (error) {
            const rollbackContext = this.getContext();
            if (getContextChatId(rollbackContext) === expectedChatId) {
                rollbackContext.updateChatMetadata({ [EXTENSION_KEY]: previousNamespace }, false);
            }
            throw error;
        }

        if (getContextChatId(this.getContext()) !== expectedChatId) {
            throw new Error(`聊天在保存期间发生切换；写入结果未作为当前聊天状态返回。`);
        }
        return cloneJson(next);
    }

    async #replace(expectedChatId, nextData) {
        const context = this.getContext();
        requireMetadataWriteApi(context);
        if (getContextChatId(context) !== expectedChatId) {
            throw new Error(`聊天已切换，已取消对 ${expectedChatId} 的写入。`);
        }
        const previousNamespace = cloneJson(context.chatMetadata[EXTENSION_KEY] ?? null);
        const next = cloneJson(nextData);
        next.updatedAt = isoNow(this.now);
        context.updateChatMetadata({ [EXTENSION_KEY]: cloneJson(next) }, false);
        try {
            await context.saveMetadata();
        } catch (error) {
            const rollbackContext = this.getContext();
            if (getContextChatId(rollbackContext) === expectedChatId) {
                rollbackContext.updateChatMetadata({ [EXTENSION_KEY]: previousNamespace }, false);
            }
            throw error;
        }
        if (getContextChatId(this.getContext()) !== expectedChatId) {
            throw new Error(`聊天在保存期间发生切换；写入结果未作为当前聊天状态返回。`);
        }
        return cloneJson(next);
    }
}
