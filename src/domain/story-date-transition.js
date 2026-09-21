import {
    extractMessageStoryTime,
    formatStoryTimeValue,
    normalizeStoryTimeExtractionRule,
    parseNumeral,
    parseStoryTimePoint,
    shiftStoryDays,
    shiftStoryMonths,
    shiftStoryYears,
} from './story-time.js';

const NUMBER = '[\\d零〇一二两三四五六七八九十]+';
const UNIT = '(天|日|周|星期|月|年)';
const RETROSPECTIVE_SPAN = new RegExp('^(?:过去|最近|近)\\s*' + NUMBER + '\\s*(?:个)?' + UNIT + '(?:里|内|以来|期间)?');
const NON_SET_DATE_CONTEXT = /(如果|假如|假设|倘若|梦里|梦中|梦见|回忆|回想|想起|记得|曾经|此前|当年|档案|资料|记录显示|计划|打算|准备在|将于|预定|预计)/;

function transitionSegments(text) {
    const prepared = String(text ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|section|header|footer|title|summary|li|h[1-6])\s*>/gi, '\n');
    return prepared
        .split(/\r?\n|(?<=[。！？!?])\s*/)
        .map(raw => raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter(segment => !RETROSPECTIVE_SPAN.test(segment));
}

function unitName(token) {
    if (token === '天' || token === '日') return 'day';
    if (token === '周' || token === '星期') return 'week';
    if (token === '月') return 'month';
    if (token === '年') return 'year';
    return null;
}

function numericAdvance(amountText, unitToken) {
    const amount = parseNumeral(amountText);
    const unit = unitName(unitToken);
    return Number.isInteger(amount) && amount > 0 && unit
        ? { kind: 'advance', amount, unit }
        : null;
}

export function parseStoryDateAdvance(segment) {
    const text = String(segment ?? '').trim();
    if (!text) return null;

    if (/^(?:次日|翌日|第二天)(?=$|\s|[，,。！？!?；;])/.test(text)) {
        return { kind: 'advance', amount: 1, unit: 'day' };
    }

    let match = text.match(new RegExp('^(' + NUMBER + ')\\s*(?:个)?' + UNIT + '\\s*(?:以后|之后)(?=$|\\s|[，,。！？!?；;])'));
    if (match) return numericAdvance(match[1], match[2]);

    match = text.match(new RegExp('^(' + NUMBER + ')\\s*(?:个)?' + UNIT + '\\s*后(?=$|\\s|[，,。！？!?；;])'));
    if (match) return numericAdvance(match[1], match[2]);

    match = text.match(new RegExp('^(?:(?:时间|剧情|故事)\\s*)?(?:又\\s*)?(?:过了|经过了?)\\s*(' + NUMBER + ')\\s*(?:个)?' + UNIT + '(?=$|\\s|[，,。！？!?；;])'));
    if (match) return numericAdvance(match[1], match[2]);

    match = text.match(new RegExp('^(?:时间|剧情|故事)\\s*(?:已经\\s*)?过去了\\s*(' + NUMBER + ')\\s*(?:个)?' + UNIT + '(?=$|\\s|[，,。！？!?；;])'));
    if (match) return numericAdvance(match[1], match[2]);

    match = text.match(new RegExp('^(' + NUMBER + ')\\s*(?:个)?' + UNIT + '\\s*过去了(?=$|\\s|[，,。！？!?；;])'));
    if (match) return numericAdvance(match[1], match[2]);

    return null;
}

function embeddedUserSetDate(text, currentPoint, fictionalCalendar) {
    for (const segment of transitionSegments(text)) {
        if (NON_SET_DATE_CONTEXT.test(segment)) continue;

        const displayCue = segment.match(/(?:当前)?(?:故事|剧情)?(?:日期|时间)\s*(?:显示(?:的是|为)?|变成(?:了)?|成为(?:了)?|是|为)\s*[：:—–\-]*\s*(.+)$/);
        if (displayCue) {
            const candidate = displayCue[1].replace(/^(?:她|他|我|我们|他们|她们)\s*(?:来到(?:了)?|到了?|进入(?:了)?)\s*/, '');
            const point = extractMessageStoryTime(`推进到${candidate}`, {
                role: 'user',
                currentStoryTime: currentPoint,
                fictionalCalendar,
            });
            if (point) return point;
        }

        for (const clause of segment.split(/[，,。！？!?；;：:—–]+/)) {
            const match = clause.trim().match(/^(?:(?:她|他|我|我们|他们|她们)\s*)?(?:来到(?:了)?|到了?|推进到|推进至|进入(?:了)?)\s*(.+)$/);
            if (!match) continue;
            const point = extractMessageStoryTime(`推进到${match[1]}`, {
                role: 'user',
                currentStoryTime: currentPoint,
                fictionalCalendar,
            });
            if (point) return point;
        }
    }
    return null;
}

function extractionScopes(text, role, extractionRule) {
    const source = String(text ?? '');
    if (role !== 'assistant' || !extractionRule?.enabled) return [source];
    const normalized = normalizeStoryTimeExtractionRule(extractionRule);
    if (normalized.mode === 'regex') {
        const match = new RegExp(normalized.pattern, normalized.flags).exec(source);
        if (!match) return [];
        return [match.groups?.time || match.slice(1).find(value => typeof value === 'string' && value.trim()) || match[0]];
    }

    const scopes = [];
    for (const marker of normalized.markers) {
        let cursor = 0;
        while (cursor < source.length) {
            const startAt = source.indexOf(marker.start, cursor);
            if (startAt < 0) break;
            const contentAt = startAt + marker.start.length;
            const endAt = source.indexOf(marker.end, contentAt);
            if (endAt < 0) break;
            scopes.push(source.slice(contentAt, endAt));
            cursor = endAt + marker.end.length;
        }
    }
    return scopes;
}

function applyAdvance(value, operation, fictionalCalendar) {
    if (!value || !operation) return null;
    if (operation.unit === 'day') return shiftStoryDays(value, operation.amount, fictionalCalendar);
    if (operation.unit === 'week') return shiftStoryDays(value, operation.amount * 7, fictionalCalendar);
    if (operation.unit === 'month') return shiftStoryMonths(value, operation.amount, fictionalCalendar);
    if (operation.unit === 'year') return shiftStoryYears(value, operation.amount, fictionalCalendar);
    return null;
}

export function extractStoryDateTransition(text, {
    role = 'assistant',
    currentStoryTime = null,
    fictionalCalendar = {},
    extractionRule = null,
} = {}) {
    const options = { fictionalCalendar };
    const currentPoint = currentStoryTime?.value
        ? currentStoryTime
        : (currentStoryTime?.raw ? parseStoryTimePoint(currentStoryTime.raw, options) : null);

    const setDate = extractMessageStoryTime(text, {
        role,
        currentStoryTime: currentPoint,
        fictionalCalendar,
        extractionRule,
    });
    if (setDate) return setDate;
    if (role === 'user') {
        const embedded = embeddedUserSetDate(text, currentPoint, fictionalCalendar);
        if (embedded) return embedded;
    }
    if (!currentPoint?.value) return null;

    for (const scope of extractionScopes(text, role, extractionRule)) {
        for (const segment of transitionSegments(scope)) {
            const operation = parseStoryDateAdvance(segment);
            if (!operation) continue;
            const shifted = applyAdvance(currentPoint.value, operation, fictionalCalendar);
            if (!shifted) continue;
            return parseStoryTimePoint(formatStoryTimeValue(shifted), options);
        }
    }
    return null;
}
