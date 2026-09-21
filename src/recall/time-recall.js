import { comparableYear, compareTimeValues, parseNumeral, parseStoryTimeValue, shiftStoryYears } from '../domain/story-time.js';
import { normalizeForMatch } from './structured-keyword-recall.js';

const UNSAFE_CONTEXT = /(如果|假如|假设|要是|梦里|梦中|本来会|将会|计划|打算|档案|资料)/;

function shiftGregorianDays(value, amount) {
    if (value?.calendar !== 'gregorian' || !value.month || !value.day) return null;
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day + amount));
    return {
        ...value,
        year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
        hour: null, minute: null, shichen: null, precision: 'day',
    };
}

function segmentText(text) {
    return String(text ?? '').split(/[\n！？。；;]+/).map(item => item.trim()).filter(Boolean);
}

function addTarget(targets, target) {
    const key = `${target.kind}:${target.raw}:${JSON.stringify(target.value ?? null)}`;
    if (!targets.some(item => item.key === key)) targets.push({ ...target, key });
}

export function extractTimeTargets(text, { currentStoryTime = null, fictionalCalendar = {}, source = '当前输入', sourceWeight = 1 } = {}) {
    const targets = [];
    for (const segment of segmentText(text)) {
        if (UNSAFE_CONTEXT.test(segment)) continue;
        const absolute = parseStoryTimeValue(segment, { fictionalCalendar });
        if (absolute) addTarget(targets, { kind: 'absolute', raw: segment, value: absolute, confidence: 1, source, sourceWeight });
        const current = currentStoryTime?.value;
        if (current) {
            const yearsAgo = segment.match(/([\d零〇一二两三四五六七八九十]+)年前/);
            const relativeYears = yearsAgo ? parseNumeral(yearsAgo[1]) : (segment.includes('前年') ? 2 : (segment.includes('去年') ? 1 : null));
            if (Number.isInteger(relativeYears) && relativeYears > 0) {
                const shifted = shiftStoryYears(current, -relativeYears, fictionalCalendar);
                if (shifted) addTarget(targets, { kind: 'relative-year', raw: yearsAgo?.[0] ?? (relativeYears === 1 ? '去年' : '前年'), value: shifted, confidence: 0.82, source, sourceWeight });
            }
            const dayShift = segment.includes('前天') ? -2 : (segment.includes('昨天') ? -1 : (segment.includes('明天') ? 1 : null));
            if (dayShift !== null) {
                const shifted = shiftGregorianDays(current, dayShift);
                if (shifted) addTarget(targets, { kind: 'relative-day', raw: dayShift === -2 ? '前天' : (dayShift === -1 ? '昨天' : '明天'), value: shifted, confidence: 0.9, source, sourceWeight });
            }
            const monthDay = segment.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
            if (!absolute && monthDay) {
                addTarget(targets, { kind: 'month-day', raw: monthDay[0], value: { ...current, month: Number(monthDay[1]), day: Number(monthDay[2]), hour: null, minute: null, shichen: null, precision: 'day' }, confidence: 0.85, source, sourceWeight });
            }
        }
        const ages = [...segment.matchAll(/(\d{1,3})\s*岁/g)];
        for (const age of ages) addTarget(targets, { kind: 'age', raw: age[0], value: null, confidence: 0.58, source, sourceWeight });
    }
    return targets;
}

function sameDate(left, right, fictionalCalendar) {
    if (left?.calendar !== right?.calendar) return false;
    const leftYear = comparableYear(left, fictionalCalendar);
    const rightYear = comparableYear(right, fictionalCalendar);
    const sameYear = leftYear !== null && rightYear !== null
        ? leftYear === rightYear
        : left?.era === right?.era && left?.year === right?.year;
    if (!sameYear) return false;
    return left.month === right.month && left.day === right.day;
}

function pointWithinRange(target, start, end, fictionalCalendar) {
    const afterStart = compareTimeValues(target, start, fictionalCalendar);
    const beforeEnd = compareTimeValues(target, end, fictionalCalendar);
    return afterStart !== null && beforeEnd !== null && afterStart >= 0 && beforeEnd <= 0;
}

function scoreParsedTarget(memory, target, fictionalCalendar) {
    const start = memory.time?.start?.value;
    const end = memory.time?.end?.value;
    if (!start || !end || !target.value) return null;
    const value = target.value;
    let base = 0;
    if (value.day && pointWithinRange(value, start, end, fictionalCalendar)) base = value.hour !== null ? 100 : 94;
    else if (value.day && (sameDate(value, start, fictionalCalendar) || sameDate(value, end, fictionalCalendar))) base = 90;
    else {
        if (value.calendar !== start.calendar || value.calendar !== end.calendar) return null;
        let targetYear = comparableYear(value, fictionalCalendar);
        let startYear = comparableYear(start, fictionalCalendar);
        let endYear = comparableYear(end, fictionalCalendar);
        if (targetYear === null || startYear === null || endYear === null) {
            if (value.calendar !== 'era' || value.era !== start.era || value.era !== end.era) return null;
            targetYear = value.year; startYear = start.year; endYear = end.year;
        }
        if (value.month && start.month === value.month && targetYear >= startYear && targetYear <= endYear) base = 72;
        else if (targetYear >= startYear && targetYear <= endYear) base = 58;
    }
    if (!base) return null;
    return Math.round(base * target.confidence * target.sourceWeight);
}

function scoreRawTarget(memory, target) {
    const raw = `${memory.time?.start?.raw ?? ''} ${memory.time?.end?.raw ?? ''}`;
    return normalizeForMatch(raw).includes(normalizeForMatch(target.raw))
        ? Math.round(55 * target.confidence * target.sourceWeight)
        : null;
}

export function scoreMemoryTime(memory, targets, { fictionalCalendar = {} } = {}) {
    let best = null;
    for (const target of targets) {
        const score = target.value
            ? scoreParsedTarget(memory, target, fictionalCalendar)
            : scoreRawTarget(memory, target);
        if (!score || (best && score <= best.score)) continue;
        best = {
            score,
            target,
            reason: `${target.source}的时间线索“${target.raw}”与记忆时间${memory.time?.start?.raw === memory.time?.end?.raw ? '吻合' : '范围吻合'}`,
        };
    }
    return best;
}

export function recallByStoryTime({ memories = [], input = '', recentTexts = [], currentStoryTime = null, fictionalCalendar = {} } = {}) {
    const targets = extractTimeTargets(input, { currentStoryTime, fictionalCalendar });
    recentTexts.forEach((text, index) => targets.push(...extractTimeTargets(text, {
        currentStoryTime, fictionalCalendar,
        source: `最近第 ${index + 1} 楼`,
        sourceWeight: 0.65 * (0.85 ** index),
    })));
    const candidates = memories.filter(memory => memory?.mode === 'trigger').map(memory => {
        const evidence = scoreMemoryTime(memory, targets, { fictionalCalendar });
        return evidence ? { memory, timeScore: evidence.score, evidence, reason: `时间证据：${evidence.reason}` } : null;
    }).filter(Boolean).sort((a, b) => b.timeScore - a.timeScore || String(a.memory.id).localeCompare(String(b.memory.id)));
    return { targets, candidates };
}
