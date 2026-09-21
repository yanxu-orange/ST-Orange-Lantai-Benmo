import {
    parseStoryTimeValue, parseNumeral, compareTimeValues, timePrecisionRank,
    formatStoryTimeValue, shiftStoryYears, shiftStoryDays,
} from '../domain/story-time.js';
import { buildRecallQueryFragments } from './structured-witness.js';

export const STORY_TIME_EVIDENCE_VERSION = 'story-time-evidence-v1';
const NON_FACTUAL = /如果|假如|假设|倘若|要是|梦里|梦中|梦见|计划|打算|预计|预定|将于/;
const NUMERAL = '[\\d零〇元一二两三四五六七八九十]+';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Shape adapters only. Domain remains the sole calendar parser/validator.
function parseRaw(raw, fictionalCalendar) {
    const text = typeof raw === 'string' ? raw.trim() : '';
    // Reject incomplete token consumption by Domain's intentionally unanchored
    // parser; malformed exact dates must not fall back to a valid year/month.
    if (/^\d{3,4}[-/.]/.test(text) && !/^\d{3,4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?$/.test(text)) return null;
    if (/^(?:公元\s*)?\d{3,4}\s*年/.test(text)
        && !/^(?:公元\s*)?\d{3,4}\s*年(?:\s*\d{1,2}月(?:\s*\d{1,2}日?)?)?$/.test(text)) return null;
    const iso = text.match(/^(\d{3,4})(?:[-/.](\d{1,2}))?$/);
    return parseStoryTimeValue(iso ? `${iso[1]}年${iso[2] ? `${iso[2]}月` : ''}` : text, { fictionalCalendar });
}

function pointValue(point, fictionalCalendar) {
    if (!point || (point.status && point.status !== 'parsed')) return null;
    if (point.value) return structuredClone(point.value);
    return parseRaw(point.raw, fictionalCalendar);
}

function project(value, precision) {
    const rank = timePrecisionRank({ precision });
    return { ...value, precision, month: rank >= 2 ? value.month : null,
        day: rank >= 3 ? value.day : null, hour: null, minute: null, shichen: null,
        isLeapMonth: rank >= 2 ? Boolean(value.isLeapMonth) : false };
}

function calendarIdentity(value, explicitId = null) {
    return { calendar: value?.calendar ?? null, era: value?.era ?? null, calendarId: explicitId ?? value?.calendar ?? null };
}

export function extractStoryTimeTargetsFromFragments({ fragments, currentStoryTime = null, fictionalCalendar = {} }) {
    const current = pointValue(currentStoryTime, fictionalCalendar);
    const eraNames = (fictionalCalendar.eras ?? []).map(era => era.name).filter(name => typeof name === 'string' && name);
    // Locate complete tokens, then ask Domain to parse them. No date arithmetic
    // or validity rules are duplicated here. Unconfigured eras require a token boundary.
    const era = eraNames.length ? `(?:${eraNames.sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})`
        : '(?<![\\p{L}\\p{N}])[^\\s\\d，,。：:;；!?！？<>]{1,12}?';
    const patterns = [
        { kind: 'absolute', expectedCalendar: 'era', regex: new RegExp(`${era}\\s*${eraNames.length ? NUMERAL : '(?:\\d{1,2}|[零〇元一二两三四五六七八九十]+)'}年(?!前)(?:\\s*(?:闰)?(?:正|冬|腊|${NUMERAL})月(?:\\s*(?:初|廿)?${NUMERAL}[日号]?)?)?`, 'gu') },
        { kind: 'absolute', regex: /(?<![\p{Script=Latin}\p{N}_./+\-])(?:公元\s*)?\d{3,4}\s*(?:年(?!前)(?:\s*\d+月(?:\s*\d+日?)?)?|[-/.]\d+(?:[-/.]\d+)?)(?!\d)/gu },
        { kind: 'absolute', regex: /(?<!\S)\d{3,4}(?!\S)/gu },
        { kind: 'relative-year', regex: new RegExp(`去年|前年|(?<![\\p{N}])${NUMERAL}年前`, 'gu') },
        { kind: 'relative-day', regex: /昨天|前天|明天/gu },
        { kind: 'month-day', regex: /(?<![\d年])\d{1,2}月\s*\d{1,2}[日号]/gu },
    ];
    const targets = [];
    for (const fragment of fragments) {
        // Sentence ranges preserve cleaned-fragment UTF-16 offsets. Commas do
        // not terminate a hypothetical condition's scope; decimal points survive.
        for (const sentence of fragment.cleanedText.matchAll(/[^。！？!?；;\r\n]+/g)) {
            if (NON_FACTUAL.test(sentence[0])) continue;
            const matches = patterns.flatMap(({ kind, regex, expectedCalendar }, priority) => [...sentence[0].matchAll(regex)]
                .map(match => ({ kind, priority, expectedCalendar, raw: match[0], start: sentence.index + match.index, end: sentence.index + match.index + match[0].length })));
            matches.sort((a, b) => a.start - b.start || b.end - a.end || a.priority - b.priority);
            let occupiedEnd = -1;
            for (const match of matches) {
                if (match.start < occupiedEnd) continue;
                occupiedEnd = match.end;
                let value = null;
                let anchor = null;
                if (match.kind === 'absolute') {
                    value = parseRaw(match.raw, fictionalCalendar);
                    if (match.expectedCalendar && value?.calendar !== match.expectedCalendar) value = null;
                }
                else {
                    anchor = current ? { value: structuredClone(current), raw: currentStoryTime.raw ?? '', calendarId: currentStoryTime.calendarId ?? current.calendar } : null;
                    if (current && match.kind === 'relative-year') {
                        const amount = match.raw === '去年' ? 1 : match.raw === '前年' ? 2 : parseNumeral(match.raw.slice(0, -2));
                        if (Number.isSafeInteger(amount) && amount > 0) value = shiftStoryYears(project(current, 'year'), -amount, fictionalCalendar);
                    } else if (current?.calendar === 'gregorian' && match.kind === 'relative-day' && timePrecisionRank(current) >= 3) {
                        value = shiftStoryDays(project(current, 'day'), { 昨天: -1, 前天: -2, 明天: 1 }[match.raw], fictionalCalendar);
                    } else if (current && match.kind === 'month-day') {
                        value = parseRaw(`${formatStoryTimeValue(project(current, 'year'))}${match.raw.replace(/号$/, '日')}`, fictionalCalendar);
                    }
                }
                targets.push({ id: `${fragment.id}:time:${match.start}-${match.end}`, fragmentId: fragment.id,
                    sourceKind: fragment.sourceKind, rawPosition: fragment.rawPosition, distanceFromCurrent: fragment.distanceFromCurrent,
                    raw: match.raw, matchedText: match.raw, range: [match.start, match.end], coordinateSystem: 'cleaned-fragment-utf16',
                    kind: match.kind, status: value ? 'resolved' : 'unresolved', value,
                    precision: value?.precision ?? null, calendarIdentity: calendarIdentity(value, anchor?.calendarId), anchor });
            }
        }
    }
    return targets;
}

export function evaluateMemoryStoryTimeEvidence(memory, targets, { fictionalCalendar = {} } = {}) {
    const start = pointValue(memory.time?.start, fictionalCalendar);
    const end = pointValue(memory.time?.end, fictionalCalendar);
    const evaluations = targets.map(target => {
        const result = { memoryId: memory.id, targetId: target.id, target: structuredClone(target),
            memoryTime: { start: structuredClone(memory.time?.start ?? null), end: structuredClone(memory.time?.end ?? null) },
            comparison: { start: structuredClone(start), end: structuredClone(end), target: structuredClone(target.value) },
            domain: { memory: calendarIdentity(start, memory.time?.calendarId), target: target.calendarIdentity, comparable: false },
            precisionRelation: 'unknown', relation: 'neutral', reason: 'memory-time-unparsed' };
        if (!target.value || target.status !== 'resolved') return { ...result, reason: 'unresolved-target' };
        if (!start || !end) return result;
        const explicitMemoryId = memory.time?.calendarId;
        const targetId = target.calendarIdentity.calendarId;
        const incompatible = (explicitMemoryId && targetId && explicitMemoryId !== targetId)
            || compareTimeValues(start, target.value, fictionalCalendar) === null
            || compareTimeValues(end, target.value, fictionalCalendar) === null;
        if (incompatible) return { ...result, precisionRelation: 'incomparable', reason: 'incomparable-calendar' };
        result.domain.comparable = true;
        const targetRank = timePrecisionRank(target.value);
        const memoryRank = Math.min(timePrecisionRank(start), timePrecisionRank(end));
        if (!targetRank || !memoryRank || targetRank > 3) return { ...result, reason: 'unsupported-precision' };
        if (memoryRank < targetRank) return { ...result, precisionRelation: 'memory-coarser-than-target', reason: 'insufficient-memory-precision' };
        result.precisionRelation = memoryRank > targetRank ? 'target-coarser-than-memory' : 'exact';
        // Project ALL three values to the query's requested precision. Null
        // components are symmetric here, never invented missing month/day facts.
        const a = project(start, target.value.precision);
        const b = project(end, target.value.precision);
        const t = project(target.value, target.value.precision);
        result.comparison.projected = { start: a, end: b, target: t };
        // Check definite reversal at the finest precision both endpoints possess.
        const commonPrecision = memoryRank >= 3 ? 'day' : memoryRank === 2 ? 'month' : 'year';
        if (compareTimeValues(project(start, commonPrecision), project(end, commonPrecision), fictionalCalendar) > 0) {
            return { ...result, reason: 'invalid-memory-range' };
        }
        const after = compareTimeValues(t, a, fictionalCalendar);
        const before = compareTimeValues(t, b, fictionalCalendar);
        const single = compareTimeValues(a, b, fictionalCalendar) === 0;
        if (after >= 0 && before <= 0) return { ...result, relation: 'support',
            reason: result.precisionRelation === 'target-coarser-than-memory' ? 'coarse-target-contains-memory'
                : single ? 'exact-support' : 'target-within-memory-range' };
        return { ...result, relation: 'conflict', reason: single ? 'exact-date-conflict' : 'disjoint-range-conflict' };
    });
    return { memoryId: memory.id, evaluations, diagnostics: targets.length ? [] : [{ relation: 'neutral', reason: 'no-time-target' }] };
}

export function collectStoryTimeRecallEvidence({ memories, currentInput, recentHistory = [], currentStoryTime = null, fictionalCalendar = {} }) {
    if (!Array.isArray(memories)) throw new TypeError('memories must be an array');
    const fragments = buildRecallQueryFragments({ currentInput, recentHistory });
    const targets = extractStoryTimeTargetsFromFragments({ fragments, currentStoryTime, fictionalCalendar });
    const evaluated = [];
    for (const [libraryIndex, memory] of memories.entries()) {
        if (memory.mode !== 'trigger') continue;
        evaluated.push({ libraryIndex, ...evaluateMemoryStoryTimeEvidence(memory, targets, { fictionalCalendar }) });
    }
    return { version: STORY_TIME_EVIDENCE_VERSION, fragments, targets, evaluated,
        supportedCandidates: evaluated.filter(item => item.evaluations.some(e => e.relation === 'support')),
        conflictedCandidates: evaluated.filter(item => item.evaluations.some(e => e.relation === 'conflict')) };
}
