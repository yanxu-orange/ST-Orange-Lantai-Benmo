import { evaluateOrdinaryRecallWithAliases } from './detail-alias-relevance.js';
import { evaluateAnniversaryOccurrences } from './anniversary-recall.js';
import { collectSpecialDateRecallEvidence } from './special-date-evidence.js';
import { routeRecallPoolsV2 } from './special-date-selection.js';
import { orderMemoriesForNarrative } from './narrative-ordering.js';
import { applyRecallBudget } from './structured-keyword-recall.js';
import { applyGlobalRegexRules } from '../preprocess/global-regex.js';
import { holidayPromptContext } from './holiday-prompt.js';
import { storyTimePromptContext } from './story-time-prompt.js';
import { buildMemoryDetailAliasBindings } from '../domain/detail-aliases.js';
import { excludeTermsFromRecallMemories, normalizeRecallExcludedTerms } from './excluded-terms.js';
import { isActiveMemory } from '../domain/memory.js';

function messageText(message) {
    return String(message?.mes ?? message?.content ?? '').trim();
}

export function extractRecallInputs(chat, recentFloorCount = 6) {
    const messages = Array.isArray(chat) ? chat : [];
    let currentIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.is_user === true && messageText(messages[index])) { currentIndex = index; break; }
    }
    if (currentIndex < 0) currentIndex = messages.findLastIndex(message => messageText(message));
    const input = currentIndex >= 0 ? messageText(messages[currentIndex]) : '';
    const count = Number.isInteger(Number(recentFloorCount)) ? Math.max(0, Number(recentFloorCount)) : 6;
    const recentTexts = messages.slice(0, Math.max(0, currentIndex)).reverse()
        .map(messageText).filter(Boolean).slice(0, count);
    return { input, recentTexts, currentIndex };
}

function extractRecallHistory(chat, currentIndex, recentFloorCount, regexRules) {
    const messages = Array.isArray(chat) ? chat : [];
    const count = Number.isInteger(Number(recentFloorCount)) ? Math.max(0, Number(recentFloorCount)) : 6;
    return messages.slice(0, Math.max(0, currentIndex)).map((message, rawPosition) => ({
        rawPosition,
        originalText: messageText(message),
    })).filter(item => item.originalText).reverse().slice(0, count).map((item, index) => {
        const cleaned = applyGlobalRegexRules(item.originalText, regexRules);
        return {
            ...item,
            distanceFromCurrent: index + 1,
            cleanedText: cleaned.text,
            cleaning: cleaned.results,
        };
    });
}

function memoryLabel(memory) {
    const time = memory.time?.start?.raw || memory.time?.end?.raw || '时间未标注';
    const title = memory.title || '无标题记忆';
    return `【${time}｜${title}】\n${memory.body}`;
}

function memoryPrompt(memories) {
    if (!memories.length) return '';
    return [
        '<time_keyword_memory>',
        '以下内容是过去已经发生的记忆，可能与最近的讨论有关。请将其作为事实与经历参考，自然保持连续性；不要机械复述，也不要声称看见了记忆条目。',
        ...memories.map(memoryLabel),
        '</time_keyword_memory>',
    ].join('\n\n');
}

function specialDatePrompt(result) {
    if (!result.occurrences.length) return '';
    const reminders = result.occurrences.map(item => item.prompt).filter(Boolean);
    const personal = result.occurrences.flatMap(item => item.personalPrompts ?? []);
    return [
        '<time_keyword_special_date>',
        ...(result.generalPrompt ? [result.generalPrompt] : []),
        ...reminders,
        ...(personal.length ? ['<user>再次强调了以下内容：', ...personal.map(item => `${item.name}：${item.text}`)] : []),
        '</time_keyword_special_date>',
    ].join('\n\n');
}

function snapshotItem(item, pool, extra = {}) {
    return {
        id: item.memory.id,
        title: item.memory.title || '',
        time: item.memory.time?.start?.raw || item.memory.time?.end?.raw || '',
        body: item.memory.body || '',
        pool,
        reason: item.reason || '',
        score: item.score ?? null,
        relevance: item.relevance ?? item.structuredRelevance ?? null,
        tokens: item.tokens ?? null,
        ...extra,
    };
}

const ALIAS_REASON_COPY = Object.freeze({
    'ordinary-memory-not-qualified': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，但未通过现有召回资格规则`,
    'ordinary-parent-witness-already-present': ({ matchedAlias, parentDetail }) => `已完整命中“${parentDetail}”，不再重复使用通称“${matchedAlias}”`,
    'explicit-current-time-conflict': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，但与当前明确时间冲突`,
    'same-fragment-time-conflict': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，但所在历史片段时间冲突`,
    'better-alias-support-already-consumed': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，同条记忆已采用更合适的通称参考`,
    'alias-did-not-qualify': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，但自身未通过现有召回资格规则`,
    'alias-query-surface-not-consumed': ({ matchedAlias, parentDetail }) => `通称“${matchedAlias}”命中“${parentDetail}”，但同一事实已有更优表述`,
});

function aliasPresentation(candidate) {
    if (!candidate) return null;
    if (candidate.rankingEligible) return {
        matchedAlias: candidate.matchedAlias,
        parentDetail: candidate.parentDetail,
        status: candidate.qualificationEligible ? 'qualified' : 'ranking-support',
        reasonCode: candidate.qualificationEligible ? 'alias-qualified' : 'alias-ranking-support',
        reason: candidate.qualificationEligible
            ? `通称“${candidate.matchedAlias}”按“${candidate.parentDetail}”的查询表述通过普通召回资格`
            : `通称“${candidate.matchedAlias}”命中“${candidate.parentDetail}”，作为普通召回排序参考`,
    };
    const reasonCode = candidate.suppressionReasons?.[0] ?? 'ordinary-memory-not-qualified';
    return {
        matchedAlias: candidate.matchedAlias,
        parentDetail: candidate.parentDetail,
        status: reasonCode === 'ordinary-memory-not-qualified' ? 'candidate-only' : 'suppressed',
        reasonCode,
        reason: (ALIAS_REASON_COPY[reasonCode] ?? ALIAS_REASON_COPY['ordinary-memory-not-qualified'])(candidate),
    };
}

function readableAliasDiagnostics(diagnostics = []) {
    return diagnostics.map(item => ({
        code: item.code,
        memoryId: typeof item.memoryId === 'string' ? item.memoryId : null,
        parentDetail: typeof item.parentDetail === 'string' ? item.parentDetail : null,
        message: '这条通称关系无效，已忽略；记忆正文和原关键词保持不变',
    }));
}

export async function buildFormalRecall({
    chat, data, globalSettings = {}, countTokens = async text => String(text ?? '').length,
} = {}) {
    const recallSettings = globalSettings.recall ?? data.recall ?? {};
    const raw = extractRecallInputs(chat, recallSettings.recentFloorCount);
    const regexRules = globalSettings.regexRules ?? [];
    const inputResult = applyGlobalRegexRules(raw.input, regexRules);
    const input = inputResult.text;
    const currentIndex = raw.currentIndex;
    const recentHistory = extractRecallHistory(chat, currentIndex, recallSettings.recentFloorCount, regexRules);
    const recentTexts = recentHistory.map(item => item.cleanedText).filter(Boolean);
    const fictionalCalendar = data.storyTime?.fictionalCalendar ?? {};
    const occurrences = evaluateAnniversaryOccurrences({
        anniversaries: data.anniversaries,
        currentStoryTime: data.storyTime?.current,
        fictionalCalendar,
        defaultAdvanceDays: globalSettings.defaults?.anniversaryAdvanceDays ?? 3,
    });
    const activeMemories = (data.memories ?? []).filter(isActiveMemory);
    const specialEvidence = collectSpecialDateRecallEvidence({
        memories: activeMemories,
        occurrences,
        currentStoryTime: data.storyTime?.current,
        automaticSameDayEnabled: recallSettings.automaticSameDayEnabled !== false,
        fictionalCalendar,
    });
    const holiday = holidayPromptContext(data, {
        userInstruction: globalSettings.templates?.holidayInstruction,
        advanceDays: globalSettings.defaults?.holidayAdvanceDays,
    });
    const storyTime = storyTimePromptContext(data, {
        enabled: recallSettings.storyTimeReminderEnabled === true,
        template: globalSettings.templates?.storyTimeInstruction,
    });
    const excludedTerms = normalizeRecallExcludedTerms(recallSettings.excludedTerms);
    const recallMemories = excludeTermsFromRecallMemories(activeMemories, excludedTerms);
    const aliasEvaluation = evaluateOrdinaryRecallWithAliases({
        memories: recallMemories,
        currentInput: input,
        recentHistory,
        bindings: buildMemoryDetailAliasBindings(recallMemories),
        currentStoryTime: data.storyTime?.current,
        fictionalCalendar,
    });
    const ordinaryEvidence = aliasEvaluation.base ?? aliasEvaluation;
    const aliasResult = aliasEvaluation.aliasResult ?? null;
    const aliasByMemory = new Map();
    for (const candidate of aliasResult?.candidates ?? []) {
        const previous = aliasByMemory.get(candidate.memoryId);
        if (!previous || candidate.rankingEligible || (!previous.rankingEligible
            && (candidate.distanceFromCurrent ?? Infinity) < (previous.distanceFromCurrent ?? Infinity))) {
            aliasByMemory.set(candidate.memoryId, candidate);
        }
    }
    const limits = recallSettings.triggerLimits ?? {};
    const specialLimit = Object.hasOwn(recallSettings, 'anniversaryPoolLimit')
        ? recallSettings.anniversaryPoolLimit : 2;
    const routing = routeRecallPoolsV2({
        memories: activeMemories,
        ordinaryResult: ordinaryEvidence,
        specialResult: specialEvidence,
        specialLimit,
        ordinaryLimit: limits.countEnabled === false ? null : (limits.maxCount ?? 5),
        ordinaryRankedReference: aliasResult?.rankedReference ?? null,
        fictionalCalendar,
    });
    const anniversary = {
        occurrences,
        generalPrompt: globalSettings.templates?.specialDateReminder ?? '',
        selected: routing.specialPool.selected,
    };
    const budget = await applyRecallBudget({
        result: { passed: routing.ordinary.selected },
        countEnabled: true,
        maxCount: routing.ordinary.selected.length,
        tokenEnabled: Boolean(limits.tokenEnabled),
        maxTokens: limits.maxTokens,
        countTokens,
    });
    const finalItems = [
        ...routing.resident.selected,
        ...budget.selected,
        ...routing.specialPool.selected,
    ];
    const ordering = orderMemoriesForNarrative({ items: finalItems, fictionalCalendar });
    const ordinaryItems = [
        ...routing.resident.selected.map(item => snapshotItem({ ...item, reason: '常驻记忆' }, 'resident', {
            outcome: 'selected', provenance: routing.provenanceById[item.memoryId] ?? ['resident'],
        })),
        ...budget.selected.map(item => snapshotItem(item, 'trigger', {
            outcome: 'selected', provenance: routing.provenanceById[item.memory.id] ?? [],
            ...(aliasByMemory.has(item.memory.id) ? { alias: aliasPresentation(aliasByMemory.get(item.memory.id)) } : {}),
        })),
    ];
    const anniversaryItems = anniversary.selected.map(item => snapshotItem(item, 'anniversary', {
        outcome: 'selected',
        provenance: routing.provenanceById[item.memoryId] ?? [],
        highestTier: item.highestTier,
    }));
    const selectedIds = new Set(budget.selected.map(item => item.memory.id));
    const specialIds = new Set(routing.specialPool.selectedIds);
    const countLimited = new Map(routing.ordinary.notSelected.map(item => [item.memoryId, '超过条数上限']));
    const tokenLimited = new Map(budget.excluded.map(item => [item.memory.id, item.excludedReason]));
    const memoryById = new Map(activeMemories.map(memory => [memory.id, memory]));
    const candidates = ordinaryEvidence.evaluated.filter(item => item.structuredCandidate || aliasByMemory.has(item.memoryId)
        || item.ordinaryQualified || item.timeEvaluations.some(evaluation => evaluation.relation !== 'neutral'))
        .map(item => snapshotItem({
            ...item,
            memory: memoryById.get(item.memoryId),
            reason: item.qualificationPaths.map(path => path.reason?.code ?? path.channel).join('；'),
        }, 'trigger', {
            outcome: specialIds.has(item.memoryId) ? 'selected-special'
                : selectedIds.has(item.memoryId) ? 'selected'
                    : (countLimited.has(item.memoryId) || tokenLimited.has(item.memoryId)) ? 'limited' : 'below-threshold',
            excludedReason: countLimited.get(item.memoryId) ?? tokenLimited.get(item.memoryId) ?? null,
            minimumScore: null,
            provenance: routing.provenanceById[item.memoryId] ?? [],
            ...(aliasByMemory.has(item.memoryId) ? { alias: aliasPresentation(aliasByMemory.get(item.memoryId)) } : {}),
        }));
    const routingExcluded = routing.ordinary.notSelected.map(item => snapshotItem(item, 'trigger', {
        outcome: 'limited',
        excludedReason: '超过普通召回条数上限',
        provenance: routing.provenanceById[item.memoryId] ?? [],
        ...(aliasByMemory.has(item.memoryId) ? { alias: aliasPresentation(aliasByMemory.get(item.memoryId)) } : {}),
    }));
    const tokenExcluded = budget.excluded.map(item => snapshotItem(item, 'trigger', {
        outcome: 'limited',
        excludedReason: item.excludedReason ?? '超过普通召回 token 上限',
        provenance: routing.provenanceById[item.memory.id] ?? [],
        ...(aliasByMemory.has(item.memory.id) ? { alias: aliasPresentation(aliasByMemory.get(item.memory.id)) } : {}),
    }));
    const specialExcluded = routing.specialPool.notSelected.map(item => snapshotItem({
        ...item,
        memory: memoryById.get(item.memoryId),
    }, 'anniversary', {
        outcome: 'limited',
        excludedReason: routing.special.limit > 0 ? '超过特殊记忆召回上限' : '特殊记忆召回名额未启用',
        provenance: routing.provenanceById[item.memoryId] ?? [],
        highestTier: item.highestTier,
    }));
    return {
        prompts: {
            storyTime: storyTime.prompt,
            memory: memoryPrompt(ordering.orderedMemories),
            specialDate: specialDatePrompt(anniversary),
            holiday: holiday.prompt,
        },
        matching: {
            input, recentTexts, currentIndex, storyTime: data.storyTime?.current?.raw ?? null,
            cleaning: { input: inputResult.results, recent: recentHistory.map(item => item.cleaning) },
            recentHistory: recentHistory.map(({ cleaning, ...item }) => item),
            ...(aliasResult ? { aliasDiagnostics: readableAliasDiagnostics(aliasResult.diagnostics) } : {}),
            excludedTerms,
            routing: { version: routing.version, provenanceById: routing.provenanceById, diagnostics: routing.diagnostics },
            ordering: {
                version: ordering.version,
                orderedIds: ordering.orderedIds,
                strongEdges: ordering.strongEdges,
                retainedOrdinalEdges: ordering.retainedOrdinalEdges,
                suppressedOrdinalEdges: ordering.suppressedOrdinalEdges,
                diagnostics: ordering.diagnostics,
                orderMeaning: ordering.orderMeaning,
            },
        },
        estimated: {
            storyTime: storyTime.item,
            ordinary: ordinaryItems,
            candidates,
            anniversary: anniversaryItems,
            anniversaryReminders: anniversary.occurrences.map(item => ({ kind: item.kind, names: item.names, daysUntil: item.daysUntil })),
            holidayReminders: holiday.items.map(item => ({ name: item.name, source: item.source })),
            excluded: [...routingExcluded, ...tokenExcluded, ...specialExcluded],
        },
    };
}

/**
 * Evaluates one explicit monitor query through the same formal recall entry.
 * The preview has one current fragment and intentionally has no fabricated
 * history witnesses.
 */
export async function buildRecallMonitorPreview({
    input, data, globalSettings = {}, countTokens = async text => String(text ?? '').length,
} = {}) {
    if (typeof input !== 'string') throw new TypeError('monitor input must be a string');
    const chat = input.trim() ? [{ is_user: true, mes: input }] : [];
    return buildFormalRecall({ chat, data, globalSettings, countTokens });
}
