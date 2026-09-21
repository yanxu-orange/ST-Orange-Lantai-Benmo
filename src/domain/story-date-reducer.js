import {
    compareTimeValues,
    formatStoryTimeValue,
    parseStoryTimePoint,
} from './story-time.js';
import { extractStoryDateTransition } from './story-date-transition.js';

function normalizeSendDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
    }
    const text = String(value);
    const time = Date.parse(text);
    return Number.isNaN(time) ? text : new Date(time).toISOString();
}

function sendDateTime(value) {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}

export function storyDatePoint(point, fictionalCalendar = {}) {
    const resolved = point?.value
        ? point
        : (point?.raw ? parseStoryTimePoint(point.raw, { fictionalCalendar }) : point);
    if (!resolved?.value) return resolved ?? null;
    const value = {
        ...resolved.value,
        hour: null,
        minute: null,
        shichen: null,
        precision: resolved.value.day !== null
            ? 'day'
            : (resolved.value.month !== null ? 'month' : 'year'),
    };
    return parseStoryTimePoint(formatStoryTimeValue(value), { fictionalCalendar });
}

export function storyDateMessages(chat = []) {
    const source = Array.isArray(chat) ? chat : [];
    const messages = [];
    for (let position = 0; position < source.length; position += 1) {
        const message = source[position];
        if (message?.is_system || typeof message?.mes !== 'string' || !message.mes.trim()) continue;
        const role = message?.is_user === true || message?.role === 'user'
            ? 'user'
            : (message?.is_user === false || message?.role === 'assistant' ? 'assistant' : null);
        if (!role) continue;
        messages.push({
            text: message.mes,
            role,
            messageId: Number.isInteger(Number(message.index)) ? Number(message.index) : position,
            position,
            sendDate: normalizeSendDate(message.send_date),
        });
    }
    return messages;
}

export function createStoryDateManualAnchor(raw, chat = [], {
    fictionalCalendar = {},
    setAt,
} = {}) {
    const point = storyDatePoint(parseStoryTimePoint(raw, { fictionalCalendar }), fictionalCalendar);
    if (!point?.raw) throw new Error('请填写当前故事日期。');
    const messages = storyDateMessages(chat);
    const last = messages.at(-1) ?? null;
    return {
        ...point,
        setAt: String(setAt ?? new Date().toISOString()),
        afterMessage: last ? {
            sendDate: last.sendDate,
            messageId: last.messageId,
            position: last.position,
        } : null,
    };
}

function messageStartIndex(messages, manualAnchor) {
    if (!manualAnchor) return 0;
    const after = manualAnchor.afterMessage;
    if (after?.sendDate) {
        const exact = messages.findLastIndex(message => message.sendDate === after.sendDate);
        if (exact >= 0) return exact + 1;
    }
    const anchorTime = sendDateTime(normalizeSendDate(manualAnchor.setAt));
    if (anchorTime !== null) {
        const firstNew = messages.findIndex(message => {
            const time = sendDateTime(message.sendDate);
            return time !== null && time > anchorTime;
        });
        if (firstNew >= 0) return firstNew;
        if (messages.every(message => message.sendDate && sendDateTime(message.sendDate) !== null)) return messages.length;
    }
    if (Number.isSafeInteger(after?.messageId)) {
        const exact = messages.findLastIndex(message => message.messageId === after.messageId);
        if (exact >= 0) return exact + 1;
    }
    if (Number.isSafeInteger(after?.position)) {
        return Math.min(messages.length, after.position + 1);
    }
    return messages.length;
}

export function reduceStoryDate(chat = [], {
    fictionalCalendar = {},
    extractionRule = null,
    manualAnchor = null,
} = {}) {
    const messages = storyDateMessages(chat);
    let anchor = storyDatePoint(manualAnchor, fictionalCalendar);
    let latest = anchor ? {
        point: anchor,
        source: 'manual',
        role: null,
        messageId: null,
        position: null,
        sendDate: null,
    } : null;
    let matchedCount = 0;
    const start = messageStartIndex(messages, manualAnchor);

    for (let index = start; index < messages.length; index += 1) {
        const message = messages[index];
        const point = storyDatePoint(extractStoryDateTransition(message.text, {
            role: message.role,
            currentStoryTime: anchor,
            fictionalCalendar,
            extractionRule,
        }), fictionalCalendar);
        if (!point?.value) continue;

        if (message.role === 'assistant'
            && !extractionRule?.enabled
            && anchor?.value) {
            const direction = compareTimeValues(point.value, anchor.value, fictionalCalendar);
            if (direction !== null && direction < 0) continue;
        }

        anchor = point;
        matchedCount += 1;
        latest = {
            point,
            source: message.role === 'user' ? 'user_message' : 'assistant_message',
            role: message.role,
            messageId: message.messageId,
            position: message.position,
            sendDate: message.sendDate,
        };
    }

    return {
        current: latest ? { ...latest.point, source: latest.source } : null,
        provenance: latest ? {
            role: latest.role,
            messageId: latest.messageId,
            position: latest.position,
            sendDate: latest.sendDate,
            source: latest.source,
        } : null,
        messageCount: messages.length,
        matchedCount,
        usedManualAnchor: Boolean(manualAnchor),
    };
}
