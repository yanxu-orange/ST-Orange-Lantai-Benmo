import {
    comparableYear,
    parseStoryTimeValue,
    shiftStoryYears,
    timePrecisionRank,
} from '../domain/story-time.js';

export const SPECIAL_DATE_EVIDENCE_VERSION = 'special-date-evidence-v1';

function pointValue(point, fictionalCalendar) {
    if (!point || (point.status && point.status !== 'parsed')) return null;
    if (point.value && typeof point.value === 'object') return structuredClone(point.value);
    if (typeof point.raw !== 'string' || !point.raw.trim()) return null;
    return parseStoryTimeValue(point.raw, { fictionalCalendar });
}

function validMonthDay(month, day) {
    return Number.isInteger(month) && month >= 1 && month <= 12
        && Number.isInteger(day) && day >= 1 && day <= 31;
}

function validDateForCalendar(value) {
    if (!value || !validMonthDay(value.month, value.day)) return false;
    if (value.calendar !== 'gregorian') return true;
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
    return date.getUTCFullYear() === value.year && date.getUTCMonth() + 1 === value.month && date.getUTCDate() === value.day;
}

function targetOccurrenceValue(current, month, day, fictionalCalendar) {
    const crossesYear = month < current.month || (month === current.month && day < current.day);
    const yearPoint = crossesYear ? shiftStoryYears(current, 1, fictionalCalendar) : current;
    const target = yearPoint ? {
        ...structuredClone(yearPoint), month, day, precision: 'day',
        hour: null, minute: null, shichen: null,
    } : null;
    return validDateForCalendar(target) ? target : null;
}

function calendarIdentity(value, calendarId = null) {
    return { calendar: value?.calendar ?? null, era: value?.era ?? null, calendarId };
}

function yearDistance(reference, past, fictionalCalendar) {
    if (!reference || !past || reference.calendar !== past.calendar) return null;
    const referenceYear = comparableYear(reference, fictionalCalendar);
    const pastYear = comparableYear(past, fictionalCalendar);
    if (referenceYear !== null && pastYear !== null) return referenceYear - pastYear;
    if (reference.calendar === 'era' && reference.era === past.era) return reference.year - past.year;
    return null;
}

function sameYear(left, right, fictionalCalendar) {
    const distance = yearDistance(left, right, fictionalCalendar);
    return distance === 0;
}

function occurrenceSnapshot(occurrence) {
    const anniversary = occurrence?.anniversary ?? {};
    return {
        occurrenceKind: occurrence?.kind ?? null,
        daysUntil: occurrence?.daysUntil ?? null,
        anniversary: {
            id: anniversary.id,
            status: anniversary.status ?? null,
            month: anniversary.month,
            day: anniversary.day,
            names: (anniversary.names ?? []).map((name, nameIndex) => ({
                nameIndex,
                id: typeof name.id === 'string' && name.id ? name.id : null,
                name: typeof name.name === 'string' ? name.name : '',
                startYearRaw: typeof name.startYearRaw === 'string' ? name.startYearRaw : '',
                startYear: name.startYear && typeof name.startYear === 'object' ? structuredClone(name.startYear) : null,
            })),
        },
    };
}

/**
 * Builds date identities only. Active occurrences remain reminder facts; they
 * never become memory candidates or quota entries in this layer.
 */
export function buildSpecialDateEligibilityTargets({
    occurrences = [], currentStoryTime = null, automaticSameDayEnabled = true, fictionalCalendar = {},
} = {}) {
    if (!Array.isArray(occurrences)) throw new TypeError('occurrences must be an array');
    const current = pointValue(currentStoryTime, fictionalCalendar);
    const diagnostics = [];
    const targets = [];
    if (!current || timePrecisionRank(current) < 3 || !validMonthDay(current.month, current.day)) {
        diagnostics.push({ code: 'current-story-time-insufficient' });
    } else {
        for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
            const anniversary = occurrence?.anniversary;
            if (!anniversary || anniversary.status !== 'enabled'
                || !['day', 'advance'].includes(occurrence.kind)
                || !validMonthDay(anniversary.month, anniversary.day)) {
                diagnostics.push({ code: 'invalid-or-inactive-occurrence', occurrenceIndex });
                continue;
            }
            const value = targetOccurrenceValue(current, anniversary.month, anniversary.day, fictionalCalendar);
            if (!value) {
                diagnostics.push({ code: 'unresolved-occurrence-target', occurrenceIndex, anniversaryId: anniversary.id ?? null });
                continue;
            }
            targets.push({
                id: JSON.stringify(['named', occurrenceIndex, anniversary.id ?? null, anniversary.month, anniversary.day]),
                kind: 'named', targetDate: value, calendarIdentity: calendarIdentity(value, currentStoryTime?.calendarId ?? null),
                occurrence: occurrenceSnapshot(occurrence),
            });
        }
        if (automaticSameDayEnabled !== false) {
            targets.push({
                id: JSON.stringify(['automatic', current.calendar, current.era ?? null, current.year, current.month, current.day]),
                kind: 'automatic', targetDate: { ...structuredClone(current), precision: 'day', hour: null, minute: null, shichen: null },
                calendarIdentity: calendarIdentity(current, currentStoryTime?.calendarId ?? null), occurrence: null,
            });
        }
    }
    return {
        version: SPECIAL_DATE_EVIDENCE_VERSION,
        automaticSameDayEnabled: automaticSameDayEnabled !== false,
        currentStoryTime: current,
        occurrences: occurrences.map(occurrenceSnapshot),
        targets,
        diagnostics,
    };
}

export function evaluateMemorySpecialDateEvidence(memory, targetResult, { fictionalCalendar = {} } = {}) {
    if (!memory || typeof memory !== 'object' || typeof memory.id !== 'string') throw new TypeError('memory must have a string id');
    if (!['resident', 'trigger'].includes(memory.mode)) throw new TypeError('memory mode is invalid');
    if (!targetResult || !Array.isArray(targetResult.targets)) throw new TypeError('targetResult is invalid');
    // Compatibility boundary: legacy special recall uses the authoritative end
    // point. Range overlap/start-point semantics are deliberately not introduced.
    const memoryEnd = pointValue(memory.time?.end, fictionalCalendar);
    const evidence = [];
    const diagnostics = [];
    if (!memoryEnd) diagnostics.push({ code: 'memory-end-unparsed' });
    else if (timePrecisionRank(memoryEnd) < 3 || !validMonthDay(memoryEnd.month, memoryEnd.day)) {
        diagnostics.push({ code: 'memory-end-precision-insufficient', precision: memoryEnd.precision ?? null });
    } else {
        for (const target of targetResult.targets) {
            const memoryCalendar = calendarIdentity(memoryEnd, memory.time?.calendarId ?? null);
            const explicitCalendarConflict = target.calendarIdentity.calendarId && memoryCalendar.calendarId
                && target.calendarIdentity.calendarId !== memoryCalendar.calendarId;
            const yearsAgo = explicitCalendarConflict ? null : yearDistance(target.targetDate, memoryEnd, fictionalCalendar);
            const basis = {
                targetId: target.id,
                targetDate: structuredClone(target.targetDate),
                memoryEnd: structuredClone(memoryEnd),
                calendarIdentity: { target: target.calendarIdentity, memory: memoryCalendar },
                comparable: yearsAgo !== null,
                yearsAgo,
            };
            if (yearsAgo === null) {
                diagnostics.push({ code: 'incomparable-calendar', ...basis });
                continue;
            }
            if (memoryEnd.month !== target.targetDate.month || memoryEnd.day !== target.targetDate.day) {
                diagnostics.push({ code: 'month-day-mismatch', ...basis });
                continue;
            }
            if (yearsAgo < 1) {
                diagnostics.push({ code: yearsAgo === 0 ? 'same-year-not-past' : 'future-memory-not-past', ...basis });
                continue;
            }
            if (target.kind === 'automatic') {
                evidence.push({ kind: 'automatic-same-day', ...basis });
                continue;
            }
            evidence.push({
                kind: 'named-same-day', ...basis,
                anniversaryId: target.occurrence.anniversary.id ?? null,
                occurrenceKind: target.occurrence.occurrenceKind,
                names: structuredClone(target.occurrence.anniversary.names),
            });
            for (const name of target.occurrence.anniversary.names) {
                if (!name.startYear || !sameYear(memoryEnd, name.startYear, fictionalCalendar)) continue;
                if (yearDistance(target.targetDate, name.startYear, fictionalCalendar) < 1) continue;
                evidence.push({
                    kind: 'named-origin', ...basis,
                    anniversaryId: target.occurrence.anniversary.id ?? null,
                    occurrenceKind: target.occurrence.occurrenceKind,
                    name: structuredClone(name),
                    startYear: structuredClone(name.startYear),
                });
            }
        }
    }
    return {
        memoryId: memory.id,
        mode: memory.mode,
        memoryEnd: memoryEnd ? structuredClone(memoryEnd) : null,
        eligible: evidence.length > 0,
        evidence,
        diagnostics,
    };
}

export function collectSpecialDateRecallEvidence({
    memories = [], occurrences = [], currentStoryTime = null,
    automaticSameDayEnabled = true, fictionalCalendar = {},
} = {}) {
    if (!Array.isArray(memories)) throw new TypeError('memories must be an array');
    const ids = new Set();
    const targetResult = buildSpecialDateEligibilityTargets({
        occurrences, currentStoryTime, automaticSameDayEnabled, fictionalCalendar,
    });
    const evaluated = memories.map((memory, libraryIndex) => {
        if (ids.has(memory?.id)) throw new TypeError('memory ids must be unique');
        ids.add(memory?.id);
        return { libraryIndex, ...evaluateMemorySpecialDateEvidence(memory, targetResult, { fictionalCalendar }) };
    });
    const candidates = evaluated.filter(item => item.eligible);
    return {
        version: SPECIAL_DATE_EVIDENCE_VERSION,
        targetResult,
        occurrences: targetResult.occurrences,
        evaluated,
        candidates,
        candidateIds: candidates.map(item => item.memoryId),
    };
}
