import { createStableId } from '../storage/schema-utils.js';
import { normalizeCalendarDefinition } from './calendar.js';
import { listCalendarEventsForDate, normalizeCalendarEvent } from './calendar-event.js';
import { holidayTemplate, holidayTemplates } from './holiday-templates.js';

export class CalendarService {
    constructor({ chatDataService, now = () => new Date().toISOString(), idFactory = () => createStableId('calendar'), eventIdFactory = () => createStableId('calendar-event') } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        this.chatDataService = chatDataService;
        this.now = now;
        this.idFactory = idFactory;
        this.eventIdFactory = eventIdFactory;
    }

    read() {
        return this.chatDataService.readCurrent().calendar;
    }

    list() {
        return this.read().definitions ?? [];
    }

    active() {
        const data = this.read();
        return data.definitions.find(item => item.id === data.activeCalendarId) ?? null;
    }

    events(calendarId = null) {
        const id = String(calendarId ?? this.read().activeCalendarId ?? '').trim();
        return (this.read().events ?? []).filter(item => item.calendarId === id);
    }

    eventsOn(date) {
        const calendar = this.list().find(item => item.id === date?.calendarId);
        return listCalendarEventsForDate(this.events(date?.calendarId), date, { calendar });
    }

    async bind(input) {
        const definition = normalizeCalendarDefinition(input, { idFactory: this.idFactory, now: this.now });
        await this.chatDataService.updateCurrent(root => {
            if (root.calendar.definitions.some(item => item.id === definition.id)) throw new Error('历法 ID 已存在。');
            root.calendar.definitions.push(definition);
            root.calendar.activeCalendarId = definition.id;
        });
        return definition;
    }

    async switchTo(id) {
        const targetId = String(id ?? '').trim();
        let active;
        await this.chatDataService.updateCurrent(root => {
            active = root.calendar.definitions.find(item => item.id === targetId);
            if (!active) throw new Error('找不到要切换的历法。');
            root.calendar.activeCalendarId = targetId;
        });
        return active;
    }

    async update(id, patch) {
        let updated;
        await this.chatDataService.updateCurrent(root => {
            const index = root.calendar.definitions.findIndex(item => item.id === id);
            if (index < 0) throw new Error('找不到要修改的历法。');
            updated = normalizeCalendarDefinition({
                ...root.calendar.definitions[index],
                ...patch,
                config: { ...root.calendar.definitions[index].config, ...patch?.config },
                id,
            }, { idFactory: this.idFactory, now: this.now });
            root.calendar.definitions[index] = updated;
        });
        return updated;
    }

    async remove(id) {
        const targetId = String(id ?? '').trim();
        let removed = null;
        let removedEvents = [];
        let nextActiveId = null;
        await this.chatDataService.updateCurrent(root => {
            const index = root.calendar.definitions.findIndex(item => item.id === targetId);
            if (index < 0) throw new Error('找不到要删除的历法。');
            if (root.calendar.definitions[index].type === 'modern') throw new Error('现代日历不能删除。');
            [removed] = root.calendar.definitions.splice(index, 1);
            removedEvents = root.calendar.events.filter(item => item.calendarId === targetId);
            root.calendar.events = root.calendar.events.filter(item => item.calendarId !== targetId);
            if (root.calendar.activeCalendarId === targetId) {
                nextActiveId = root.calendar.definitions.find(item => item.type === 'modern')?.id
                    ?? root.calendar.definitions[0]?.id
                    ?? null;
                root.calendar.activeCalendarId = nextActiveId;
            } else {
                nextActiveId = root.calendar.activeCalendarId;
            }
        });
        return {
            calendar: removed,
            events: removedEvents,
            scheduleCount: removedEvents.filter(item => item.kind === 'schedule').length,
            holidayCount: removedEvents.filter(item => item.kind === 'holiday').length,
            nextActiveId,
        };
    }

    async createEvent(input) {
        const calendar = this.list().find(item => item.id === String(input?.calendarId ?? this.read().activeCalendarId ?? ''));
        if (!calendar) throw new Error('事件所属历法不存在。');
        const event = normalizeCalendarEvent(calendar, input, { idFactory: this.eventIdFactory, now: this.now });
        await this.chatDataService.updateCurrent(root => {
            if (root.calendar.events.some(item => item.id === event.id)) throw new Error('日历事件 ID 已存在。');
            root.calendar.events.push(event);
        });
        return event;
    }

    async updateEvent(id, patch) {
        let updated;
        await this.chatDataService.updateCurrent(root => {
            const index = root.calendar.events.findIndex(item => item.id === id);
            if (index < 0) throw new Error('找不到要修改的日历事件。');
            const current = root.calendar.events[index];
            const calendar = root.calendar.definitions.find(item => item.id === current.calendarId);
            if (!calendar) throw new Error('事件所属历法不存在。');
            updated = normalizeCalendarEvent(calendar, { ...current, ...patch, id, calendarId: current.calendarId }, { idFactory: this.eventIdFactory, now: this.now });
            root.calendar.events[index] = updated;
        });
        return updated;
    }

    async removeEvent(id) {
        let removed = null;
        await this.chatDataService.updateCurrent(root => {
            const index = root.calendar.events.findIndex(item => item.id === id);
            if (index < 0) throw new Error('找不到要删除的日历事件。');
            [removed] = root.calendar.events.splice(index, 1);
        });
        return removed;
    }

    async importHolidayTemplates(packId, templateIds = [], overrides = {}, calendarId = null) {
        const calendar = calendarId
            ? this.list().find(item => item.id === String(calendarId))
            : this.active();
        if (!calendar) throw new Error('请先绑定历法。');
        const available = new Map(holidayTemplates(packId, calendar.type).map(item => [item.id, item]));
        const requested = [...new Set((Array.isArray(templateIds) ? templateIds : []).map(String))];
        const result = { imported: [], skipped: [], failures: [] };
        for (const templateId of requested) {
            const sourceTemplate = available.get(templateId);
            if (!sourceTemplate) { result.failures.push({ templateId, reason: '模板不属于当前历法或资料包。' }); continue; }
            const pending = overrides?.[templateId];
            const template = pending ? {
                ...sourceTemplate,
                name: String(pending.name ?? sourceTemplate.name),
                fact: String(pending.fact ?? sourceTemplate.fact),
                rule: structuredClone(pending.rule ?? sourceTemplate.rule),
            } : sourceTemplate;
            if (this.events(calendar.id).some(item => item.kind === 'holiday' && item.templateId === templateId)) {
                result.skipped.push(templateId); continue;
            }
            try {
                const fixed = template.rule.type === 'fixed';
                const event = await this.createEvent({
                    calendarId: calendar.id,
                    kind: 'holiday',
                    name: template.name,
                    date: fixed ? { year: 1, month: template.rule.month, day: template.rule.day } : null,
                    dateRule: template.rule,
                    fact: template.fact,
                    status: 'enabled',
                    templateId: template.id,
                    templatePack: template.packId,
                });
                result.imported.push(event);
            } catch (error) {
                result.failures.push({ templateId, reason: error?.message || '导入失败。' });
            }
        }
        return result;
    }

    async resetHolidayTemplate(id) {
        const event = this.read().events.find(item => item.id === id);
        if (!event?.templateId) throw new Error('该节日不是内置模板。');
        const template = holidayTemplate(event.templateId);
        if (!template) throw new Error('找不到原始节日模板。');
        return this.updateEvent(id, {
            name: template.name,
            date: template.rule.type === 'fixed' ? { year: 1, month: template.rule.month, day: template.rule.day } : null,
            dateRule: template.rule,
            fact: template.fact,
            templateId: template.id,
            templatePack: template.packId,
        });
    }
}
