import { normalizeStoryTimeExtractionRule, parseStoryTimePoint } from './story-time.js';
import { parseAnniversaryStartYear } from './anniversary.js';
import {
    createStoryDateManualAnchor,
    reduceStoryDate,
    storyDatePoint,
} from './story-date-reducer.js';

function sameCurrent(left, right) {
    return String(left?.raw ?? '') === String(right?.raw ?? '')
        && (left?.source ?? null) === (right?.source ?? null);
}

function sameProvenance(lastObservation, provenance) {
    if (!provenance || provenance.source === 'manual') return !lastObservation;
    return lastObservation?.role === provenance.role
        && lastObservation?.messageId === provenance.messageId
        && (lastObservation?.sendDate ?? null) === (provenance.sendDate ?? null);
}

export class StoryTimeService {
    constructor({
        chatDataService,
        getChat = () => null,
        now = () => new Date().toISOString(),
    } = {}) {
        if (!chatDataService) throw new TypeError('chatDataService 不可用。');
        if (typeof getChat !== 'function') throw new TypeError('getChat 必须是函数。');
        this.chatDataService = chatDataService;
        this.getChat = getChat;
        this.now = now;
    }

    read() {
        const storyTime = this.chatDataService.readCurrent().storyTime;
        const current = storyDatePoint(storyTime.current, storyTime.fictionalCalendar);
        const manualAnchor = storyDatePoint(storyTime.manualAnchor, storyTime.fictionalCalendar);
        return {
            ...storyTime,
            current: current ? { ...storyTime.current, ...current } : storyTime.current,
            manualAnchor: manualAnchor ? { ...storyTime.manualAnchor, ...manualAnchor } : storyTime.manualAnchor,
        };
    }

    chat(fallback = []) {
        const live = this.getChat();
        return Array.isArray(live) ? live : (Array.isArray(fallback) ? fallback : []);
    }

    async setManualAnchor(raw) {
        const data = this.chatDataService.readCurrent();
        const at = this.now();
        const manualAnchor = createStoryDateManualAnchor(raw, this.chat(), {
            fictionalCalendar: data.storyTime.fictionalCalendar,
            setAt: at,
        });
        const saved = await this.chatDataService.updateCurrent(root => {
            root.storyTime.manualAnchor = manualAnchor;
            root.storyTime.current = {
                ...storyDatePoint(manualAnchor, root.storyTime.fictionalCalendar),
                source: 'manual',
                updatedAt: at,
            };
            root.storyTime.lastObservation = null;
        });
        return saved.storyTime.current;
    }

    calculate(chat = this.chat(), { ignoreManualAnchor = false } = {}) {
        const data = this.chatDataService.readCurrent();
        return reduceStoryDate(chat, {
            fictionalCalendar: data.storyTime.fictionalCalendar,
            extractionRule: data.storyTime.extractionRule,
            manualAnchor: ignoreManualAnchor ? null : data.storyTime.manualAnchor,
        });
    }

    async reconcileFromChat(chat = this.chat(), { generationType = 'reconcile' } = {}) {
        const data = this.chatDataService.readCurrent();
        const result = reduceStoryDate(chat, {
            fictionalCalendar: data.storyTime.fictionalCalendar,
            extractionRule: data.storyTime.extractionRule,
            manualAnchor: data.storyTime.manualAnchor,
        });
        const nextCurrent = result.current ? {
            ...result.current,
            updatedAt: this.now(),
        } : null;
        if (sameCurrent(data.storyTime.current, nextCurrent)
            && sameProvenance(data.storyTime.lastObservation, result.provenance)) {
            return { ...result, current: data.storyTime.current, changed: false };
        }

        const at = this.now();
        const saved = await this.chatDataService.updateCurrent(root => {
            root.storyTime.current = result.current ? {
                ...result.current,
                updatedAt: at,
            } : null;
            root.storyTime.lastObservation = result.provenance && result.provenance.source !== 'manual'
                ? {
                    role: result.provenance.role,
                    messageId: result.provenance.messageId,
                    sendDate: result.provenance.sendDate,
                    generationType,
                    at,
                    outcome: 'reconciled',
                }
                : null;
        });
        return { ...result, current: saved.storyTime.current, changed: true };
    }

    async reidentifyFromChat(chat = this.chat()) {
        const data = this.chatDataService.readCurrent();
        const source = Array.isArray(chat) ? chat : [];
        const result = reduceStoryDate(source, {
            fictionalCalendar: data.storyTime.fictionalCalendar,
            extractionRule: data.storyTime.extractionRule,
            manualAnchor: null,
        });
        if (!result.current) {
            return { current: null, candidateCount: result.messageCount, changed: false };
        }

        const at = this.now();
        const saved = await this.chatDataService.updateCurrent(root => {
            root.storyTime.manualAnchor = null;
            root.storyTime.current = { ...result.current, updatedAt: at };
            root.storyTime.lastObservation = result.provenance
                ? {
                    role: result.provenance.role,
                    messageId: result.provenance.messageId,
                    sendDate: result.provenance.sendDate,
                    generationType: 'manual_reidentify',
                    at,
                    outcome: 'reconciled',
                }
                : null;
        });
        return {
            current: saved.storyTime.current,
            candidateCount: result.messageCount,
            changed: true,
        };
    }

    async synchronizeGenerationInput(chat, { generationType = null } = {}) {
        const source = this.chat(chat);
        const result = await this.reconcileFromChat(source, {
            generationType: generationType ?? 'generation',
        });
        return result.current ?? null;
    }

    async setExtractionRule(input) {
        const rule = normalizeStoryTimeExtractionRule(input);
        const saved = await this.chatDataService.updateCurrent(root => {
            root.storyTime.extractionRule = rule;
        });
        return saved.storyTime.extractionRule;
    }

    normalizeFictionalCalendar({ enabled, eras }) {
        const normalized = (eras ?? []).map(item => ({
            name: String(item?.name ?? '').trim(),
            endYear: item?.endYear === null || item?.endYear === '' ? null : Number(item.endYear),
        })).filter(item => item.name);
        if (enabled && normalized.length === 0) throw new Error('请至少填写一个年号。');
        if (new Set(normalized.map(item => item.name.toLocaleLowerCase())).size !== normalized.length) {
            throw new Error('年号名称不能重复。');
        }
        if (enabled && normalized.slice(0, -1).some(item => !Number.isInteger(item.endYear) || item.endYear < 1)) {
            throw new Error('已结束年号需要填写最后一年。');
        }
        if (normalized.length) normalized.at(-1).endYear = null;
        return { enabled: Boolean(enabled), eras: normalized };
    }

    async setFictionalCalendar(input) {
        const calendar = this.normalizeFictionalCalendar(input);
        const saved = await this.chatDataService.updateCurrent(root => {
            root.storyTime.fictionalCalendar = calendar;
            root.memories = root.memories.map(memory => ({
                ...memory,
                time: {
                    start: parseStoryTimePoint(memory.time?.start?.raw, { fictionalCalendar: calendar }),
                    end: parseStoryTimePoint(memory.time?.end?.raw, { fictionalCalendar: calendar }),
                },
            }));
            root.anniversaries = (root.anniversaries ?? []).map(anniversary => ({
                ...anniversary,
                names: anniversary.names.map(name => ({
                    ...name,
                    startYear: parseAnniversaryStartYear(name.startYearRaw, { fictionalCalendar: calendar }),
                })),
            }));
            if (root.storyTime.manualAnchor?.raw) {
                root.storyTime.manualAnchor = {
                    ...root.storyTime.manualAnchor,
                    ...storyDatePoint(root.storyTime.manualAnchor, calendar),
                };
            }
            if (root.storyTime.current?.raw) {
                root.storyTime.current = {
                    ...root.storyTime.current,
                    ...storyDatePoint(root.storyTime.current, calendar),
                };
            }
        });
        await this.reconcileFromChat(this.chat(), { generationType: 'calendar_changed' });
        return saved.storyTime.fictionalCalendar;
    }
}
