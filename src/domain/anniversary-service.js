import { createAnniversary, updateAnniversary } from './anniversary.js';

export class AnniversaryService {
    constructor({ chatDataService, now, idFactory } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        this.chatDataService = chatDataService;
        this.now = now;
        this.idFactory = idFactory;
    }

    read() { return this.chatDataService.readCurrent().anniversaries ?? []; }

    list(status = 'enabled') {
        return this.read().filter(item => item.status === status)
            .sort((a, b) => a.month - b.month || a.day - b.day || String(a.id).localeCompare(String(b.id)));
    }

    get(id) { return this.read().find(item => item.id === id) ?? null; }

    async create(input) {
        const data = this.chatDataService.readCurrent();
        const anniversary = createAnniversary(input, {
            now: this.now, idFactory: this.idFactory,
            fictionalCalendar: data.storyTime?.fictionalCalendar ?? {},
        });
        await this.chatDataService.updateCurrent(root => { root.anniversaries.push(anniversary); });
        return anniversary;
    }

    async update(id, patch) {
        let saved;
        await this.chatDataService.updateCurrent(root => {
            const index = root.anniversaries.findIndex(item => item.id === id);
            if (index < 0) throw new Error('找不到要编辑的纪念日。');
            saved = updateAnniversary(root.anniversaries[index], patch, {
                now: this.now, fictionalCalendar: root.storyTime?.fictionalCalendar ?? {},
            });
            root.anniversaries[index] = saved;
        });
        return saved;
    }

    async setStatus(id, status) { return this.update(id, { status }); }

    async remove(id) {
        await this.chatDataService.updateCurrent(root => {
            root.anniversaries = root.anniversaries.filter(item => item.id !== id);
        });
        return true;
    }

    async setPoolLimit(value) {
        const limit = value === '' || value === null ? null : Number(value);
        if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error('纪念池 K 必须留空或填写正整数。');
        const saved = await this.chatDataService.updateCurrent(root => { root.recall.anniversaryPoolLimit = limit; });
        return saved.recall.anniversaryPoolLimit;
    }

    getSameDaySettings() {
        const recall = this.chatDataService.readCurrent().recall ?? {};
        return {
            automaticSameDayEnabled: recall.automaticSameDayEnabled !== false,
            anniversaryPoolLimit: recall.anniversaryPoolLimit ?? null,
        };
    }

    async setAutomaticSameDayEnabled(value) {
        const enabled = Boolean(value);
        const saved = await this.chatDataService.updateCurrent(root => {
            root.recall.automaticSameDayEnabled = enabled;
        });
        return saved.recall.automaticSameDayEnabled;
    }
}
