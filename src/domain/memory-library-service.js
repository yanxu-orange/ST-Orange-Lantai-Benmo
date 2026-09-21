import {
    compareMemoriesByEndTime,
    createMemory,
    memorySearchText,
    isActiveMemory,
    MEMORY_MODES,
    updateMemory,
} from './memory.js';

function hasUsableKeyword(memory, family) {
    return (memory?.keywords?.[family] ?? []).some(value => String(value ?? '').trim());
}

export class MemoryLibraryService {
    constructor({ chatDataService, now, idFactory } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        this.chatDataService = chatDataService;
        this.now = now;
        this.idFactory = idFactory;
    }

    read() {
        return this.chatDataService.readCurrent().memories.filter(isActiveMemory);
    }

    list({ query = '', mode = 'all', fieldState = 'all' } = {}) {
        const needle = String(query).trim().toLocaleLowerCase();
        return this.read()
            .filter(memory => mode === 'all' || memory.mode === mode)
            .filter(memory => {
                if (fieldState === 'missing-event') return !hasUsableKeyword(memory, 'event');
                if (fieldState === 'missing-detail') return !hasUsableKeyword(memory, 'detail');
                if (fieldState === 'no-new-keywords') {
                    return !hasUsableKeyword(memory, 'event') && !hasUsableKeyword(memory, 'detail');
                }
                return true;
            })
            .filter(memory => !needle || memorySearchText(memory).includes(needle))
            .sort(compareMemoriesByEndTime);
    }

    get(id) {
        return this.read().find(memory => memory.id === id) ?? null;
    }

    async create(input) {
        const fictionalCalendar = this.chatDataService.readCurrent().storyTime?.fictionalCalendar ?? {};
        const memory = createMemory(input, { now: this.now, idFactory: this.idFactory, fictionalCalendar });
        await this.chatDataService.updateCurrent(data => {
            data.memories.push(memory);
        });
        return memory;
    }

    async update(id, patch) {
        let saved = null;
        await this.chatDataService.updateCurrent(data => {
            const index = data.memories.findIndex(memory => memory.id === id);
            if (index < 0) throw new Error('找不到要编辑的记忆。');
            saved = updateMemory(data.memories[index], patch, { now: this.now, fictionalCalendar: data.storyTime?.fictionalCalendar ?? {} });
            data.memories[index] = saved;
        });
        return saved;
    }

    async remove(id) {
        await this.removeMany([id]);
        return true;
    }

    async removeMany(ids) {
        const selected = new Set(ids);
        if (!selected.size) return 0;
        let removed = 0;
        await this.chatDataService.updateCurrent(data => {
            const before = data.memories.length;
            const affectedBatchIds = new Set(data.memories.filter(memory => selected.has(memory.id)).map(memory => memory.source?.batchId).filter(Boolean));
            data.memories = data.memories.filter(memory => !selected.has(memory.id));
            removed = before - data.memories.length;
            const released = new Set();
            for (const batch of data.summary?.batches ?? []) {
                if (!affectedBatchIds.has(batch.id) || batch.status !== 'completed' || batch.outcome !== 'memories') continue;
                // The batch remains a historical summary fact. Only its prompt-history hiding is released.
                if (data.memories.some(memory => memory.source?.batchId === batch.id && isActiveMemory(memory))) continue;
                released.add(batch.id);
            }
            for (const segment of data.summary?.hiddenSegments ?? []) {
                if (segment.status === 'active' && released.has(segment.batchId)) {
                    segment.status = 'invalidated';
                    segment.invalidationReason = 'results_deleted';
                }
            }
        });
        return removed;
    }

    async setModeMany(ids, mode) {
        if (!MEMORY_MODES.includes(mode)) throw new Error('未知的记忆模式。');
        const selected = new Set(ids);
        let changed = 0;
        await this.chatDataService.updateCurrent(data => {
            data.memories = data.memories.map(memory => {
                if (!selected.has(memory.id) || memory.mode === mode) return memory;
                changed += 1;
                return updateMemory(memory, { mode }, { now: this.now, fictionalCalendar: data.storyTime?.fictionalCalendar ?? {} });
            });
        });
        return changed;
    }
}
