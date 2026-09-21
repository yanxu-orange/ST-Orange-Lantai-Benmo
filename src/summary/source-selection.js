import { SummaryDomainError } from './errors.js';

function safeFloorNumber(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : null;
}

function normalizeChatFloor(message, position) {
    if (message?.is_system === true || typeof message?.mes !== 'string') return null;
    if (message?.is_user !== true && message?.is_user !== false) return null;
    return {
        index: position,
        role: message.is_user ? 'user' : 'assistant',
        text: message.mes,
    };
}

export function selectContinuousSummaryFloors(chat, { startFloor, endFloor } = {}) {
    const start = safeFloorNumber(startFloor);
    const end = safeFloorNumber(endFloor);
    if (start === null || end === null || end < start) {
        throw new SummaryDomainError('invalid_floor_range', '请填写有效的连续开始与结束楼层。');
    }
    const messages = Array.isArray(chat) ? chat : [];
    if (start >= messages.length || end >= messages.length) {
        throw new SummaryDomainError('floor_range_not_found', '所选楼层范围已不存在。');
    }
    const normalized = messages.map(normalizeChatFloor).filter(Boolean);
    const endpoint = normalized.find(floor => floor.index === end);
    if (!endpoint) {
        throw new SummaryDomainError('floor_range_not_found', '所选结束楼层不是可用的聊天消息。');
    }
    let actualEnd = end;
    if (endpoint.role === 'user') {
        const previousAssistant = normalized
            .filter(floor => floor.index >= start && floor.index < end && floor.role === 'assistant')
            .at(-1);
        if (!previousAssistant) {
            throw new SummaryDomainError('incomplete_summary_round', '所选范围还没有可用的 AI 回复。');
        }
        actualEnd = previousAssistant.index;
    }
    const floors = normalized.filter(floor => floor.index >= start && floor.index <= actualEnd);
    if (!floors.length || !floors.some(floor => floor.role === 'assistant')) {
        throw new SummaryDomainError('incomplete_summary_round', '所选范围还没有可用的 AI 回复。');
    }
    return {
        requestedRange: [start, end],
        floorRange: [start, actualEnd],
        endAdjusted: actualEnd !== end,
        floors,
    };
}
