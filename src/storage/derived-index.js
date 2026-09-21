import { cloneJson } from './schema-utils.js';

export const DERIVED_INDEX_VERSION = 3;

function addToIndex(index, term, memoryId) {
    if (typeof term !== 'string' || !term.trim()) return;
    const normalized = term.trim().toLocaleLowerCase();
    const current = index[normalized] ?? [];
    if (!current.includes(memoryId)) current.push(memoryId);
    index[normalized] = current;
}

export function buildDerivedIndex(chatData) {
    const memories = Array.isArray(chatData?.memories) ? chatData.memories : [];
    const memoryById = {};
    const batchToMemoryIds = {};
    const structuredTermToMemoryIds = {};
    const eventTermToMemoryIds = {};
    const detailTermToMemoryIds = {};
    const coreTermToMemoryIds = {};
    const auxiliaryTermToMemoryIds = {};

    for (const memory of memories) {
        if (!memory || typeof memory.id !== 'string' || !memory.id) continue;
        memoryById[memory.id] = cloneJson(memory);
        const batchId = memory.source?.batchId;
        if (typeof batchId === 'string' && batchId) {
            batchToMemoryIds[batchId] = batchToMemoryIds[batchId] ?? [];
            batchToMemoryIds[batchId].push(memory.id);
        }
        addToIndex(structuredTermToMemoryIds, memory.title, memory.id);
        addToIndex(coreTermToMemoryIds, memory.title, memory.id);
        for (const term of memory.keywords?.primary ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(coreTermToMemoryIds, term, memory.id);
        }
        for (const term of memory.keywords?.event ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(eventTermToMemoryIds, term, memory.id);
        }
        for (const term of memory.keywords?.detail ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(detailTermToMemoryIds, term, memory.id);
        }
        for (const term of memory.people ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(auxiliaryTermToMemoryIds, term, memory.id);
        }
        for (const term of memory.locations ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(auxiliaryTermToMemoryIds, term, memory.id);
        }
        for (const term of memory.keywords?.auxiliary ?? []) {
            addToIndex(structuredTermToMemoryIds, term, memory.id);
            addToIndex(auxiliaryTermToMemoryIds, term, memory.id);
        }
    }

    return {
        version: DERIVED_INDEX_VERSION,
        chatRootId: chatData?.rootId ?? null,
        sourceUpdatedAt: chatData?.updatedAt ?? null,
        memoryById,
        batchToMemoryIds,
        structuredTermToMemoryIds,
        eventTermToMemoryIds,
        detailTermToMemoryIds,
        coreTermToMemoryIds,
        auxiliaryTermToMemoryIds,
    };
}

export function isDerivedIndexFresh(index, chatData) {
    return index?.version === DERIVED_INDEX_VERSION
        && index?.chatRootId === chatData?.rootId
        && index?.sourceUpdatedAt === chatData?.updatedAt;
}

export class DerivedIndexCache {
    constructor({ adapter } = {}) {
        if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
            throw new TypeError('派生缓存 adapter 必须提供 get() 与 set()。');
        }
        this.adapter = adapter;
    }

    keyFor(chatData) {
        return `tkm-derived-v${DERIVED_INDEX_VERSION}:${chatData.rootId}`;
    }

    async getOrRebuild(chatData) {
        const key = this.keyFor(chatData);
        const cached = await this.adapter.get(key);
        if (isDerivedIndexFresh(cached, chatData)) return { index: cached, rebuilt: false };
        const index = buildDerivedIndex(chatData);
        await this.adapter.set(key, index);
        return { index, rebuilt: true };
    }

    async remove(chatData) {
        if (typeof this.adapter.delete !== 'function') return false;
        await this.adapter.delete(this.keyFor(chatData));
        return true;
    }
}

export function createMemoryCacheAdapter() {
    const values = new Map();
    return {
        async get(key) { return cloneJson(values.get(key) ?? null); },
        async set(key, value) { values.set(key, cloneJson(value)); },
        async delete(key) { values.delete(key); },
    };
}
