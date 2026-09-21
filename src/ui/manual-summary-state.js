import { normalizeAtomicTextList } from '../domain/text-list.js';
import {
    appendDetailAlias,
    detailAliasesForEditor,
    removeDetailAlias,
} from './detail-alias-editor-state.js';

function text(value) {
    return String(value ?? '');
}

export const SUMMARY_CANDIDATE_LIST_FIELDS = Object.freeze([
    'people',
    'locations',
    'eventKeywords',
    'detailKeywords',
    'primaryKeywords',
    'auxiliaryKeywords',
]);

function summaryCandidateList(value) {
    return normalizeAtomicTextList(value ?? []);
}

function createSummaryCandidateEntries() {
    return Object.fromEntries(SUMMARY_CANDIDATE_LIST_FIELDS.map(field => [field, '']));
}

function assertSummaryCandidateListField(field) {
    if (!SUMMARY_CANDIDATE_LIST_FIELDS.includes(field)) {
        throw new TypeError(`未知的 Summary candidate 列表字段：${String(field)}`);
    }
}

export function createManualSummaryDraft() {
    return {
        startFloor: '0',
        endFloor: '',
        includeUserMessages: true,
    };
}

export function discardManualSummaryTransientState(state) {
    state.manualSummaryDraft = createManualSummaryDraft();
    state.manualSummaryPreview = null;
    state.manualSummaryPreviewOpen = false;
    state.manualSummaryMessage = '';
    state.manualSummaryMessageType = '';
    state.manualSummaryDuplicateConfirmed = false;
    return state;
}

export function splitSummaryList(value) {
    const seen = new Set();
    return text(value).split(/[,，、;；\n]+/)
        .map(item => item.trim())
        .filter(item => {
            const key = item.toLocaleLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export function createSummaryReviewDraft(pending) {
    return {
        taskId: text(pending?.taskId),
        uncoveredOnly: pending?.uncoveredOnly === true,
        requestedRange: structuredClone(pending?.requestedRange ?? []),
        floorRange: structuredClone(pending?.floorRange ?? []),
        keywordState: text(pending?.keywordState) || 'fresh',
        keywordError: structuredClone(pending?.keywordError ?? null),
        generationMode: text(pending?.generationMode) || 'quality',
        aliasState: text(pending?.aliasState) || 'fresh',
        aliasError: structuredClone(pending?.aliasError ?? null),
        candidates: (pending?.candidates ?? []).map((candidate, index) => ({
            // Fast-mode results from older pending data may not have received a
            // draft id yet.  Give every review item a stable local identity so
            // folding, scroll anchoring and keyword-only rebuilds never depend
            // on its mutable array index.
            draftId: text(candidate?.draftId) || `summary-review-draft-${index + 1}`,
            title: text(candidate?.title),
            storyTime: {
                start: text(candidate?.storyTime?.start),
                end: text(candidate?.storyTime?.end),
            },
            body: text(candidate?.body),
            people: summaryCandidateList(candidate?.people),
            locations: summaryCandidateList(candidate?.locations),
            eventKeywords: summaryCandidateList(candidate?.eventKeywords),
            detailKeywords: summaryCandidateList(candidate?.detailKeywords),
            detailAliases: detailAliasesForEditor(candidate?.detailAliases, summaryCandidateList(candidate?.detailKeywords)),
            primaryKeywords: summaryCandidateList(candidate?.primaryKeywords),
            auxiliaryKeywords: summaryCandidateList(candidate?.auxiliaryKeywords),
            eventOrdinal: Number.isSafeInteger(candidate?.eventOrdinal) && candidate.eventOrdinal > 0
                ? candidate.eventOrdinal
                : null,
            classificationTags: [...(candidate?.classificationTags ?? [])].map(text),
            specialDateCandidates: structuredClone(candidate?.specialDateCandidates ?? []),
        })),
    };
}

export function summaryReviewCandidateStatus(candidate) {
    const hasTime = Boolean(text(candidate?.storyTime?.start).trim());
    const hasBody = Boolean(text(candidate?.body).trim());
    const valid = hasTime && hasBody;
    return {
        valid,
        label: valid ? '可入库' : '需要修正',
        missing: {
            storyTime: !hasTime,
            body: !hasBody,
        },
    };
}

export function createSummaryCandidateEdit(candidate, { wasCollapsed = false } = {}) {
    if (!candidate?.draftId) return null;
    return {
        draftId: candidate.draftId,
        original: structuredClone(candidate),
        candidate: structuredClone(candidate),
        entries: createSummaryCandidateEntries(),
        aliasEntries: {},
        aliasErrors: {},
        wasCollapsed: Boolean(wasCollapsed),
    };
}

export function updateSummaryCandidateEdit(edit, field, value) {
    if (!edit?.candidate) return false;
    if (SUMMARY_CANDIDATE_LIST_FIELDS.includes(field)) {
        edit.candidate[field] = summaryCandidateList(value);
        if (field === 'detailKeywords') {
            edit.candidate.detailAliases = detailAliasesForEditor(edit.candidate.detailAliases, edit.candidate.detailKeywords);
        }
        return true;
    }
    return updateSummaryReviewField({ keywordState: 'fresh', candidates: [edit.candidate] }, 0, field, value);
}

export function updateSummaryCandidateEntry(edit, field, value) {
    if (!edit?.candidate || !edit.entries) return false;
    assertSummaryCandidateListField(field);
    if (typeof value !== 'string') throw new TypeError('Summary candidate pending entry 必须是字符串。');
    edit.entries[field] = value;
    return true;
}

export function appendSummaryCandidateEntry(edit, field) {
    if (!edit?.candidate || !edit.entries) return false;
    assertSummaryCandidateListField(field);
    const incoming = normalizeAtomicTextList([edit.entries[field]]);
    if (!incoming.length) return false;
    edit.candidate[field] = normalizeAtomicTextList([
        ...summaryCandidateList(edit.candidate[field]),
        ...incoming,
    ]);
    if (field === 'detailKeywords') {
        edit.candidate.detailAliases = detailAliasesForEditor(edit.candidate.detailAliases, edit.candidate.detailKeywords);
    }
    edit.entries[field] = '';
    return true;
}

export function removeSummaryCandidateEntry(edit, field, index) {
    if (!edit?.candidate) return false;
    assertSummaryCandidateListField(field);
    const values = summaryCandidateList(edit.candidate[field]);
    if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) return false;
    values.splice(index, 1);
    edit.candidate[field] = values;
    if (field === 'detailKeywords') {
        edit.candidate.detailAliases = detailAliasesForEditor(edit.candidate.detailAliases, values);
    }
    return true;
}

export function updateSummaryDetailAliasEntry(edit, parentDetail, value) {
    if (!edit?.candidate || !edit.aliasEntries || !edit.candidate.detailKeywords.includes(parentDetail)) return false;
    edit.aliasEntries[parentDetail] = text(value);
    delete edit.aliasErrors?.[parentDetail];
    return true;
}

export function appendSummaryDetailAlias(edit, parentDetail) {
    const pending = edit?.aliasEntries?.[parentDetail] ?? '';
    if (!pending.trim()) return false;
    const next = appendDetailAlias(edit.candidate.detailAliases, edit.candidate.detailKeywords, parentDetail, pending);
    const accepted = (next.find(binding => binding.parentDetail === parentDetail)?.aliases ?? [])
        .some(alias => alias.toLocaleLowerCase() === pending.trim().toLocaleLowerCase());
    if (!accepted) {
        edit.aliasErrors[parentDetail] = '请填写父词中连续出现、且不同于完整父词的汉字检索简称。';
        return false;
    }
    edit.candidate.detailAliases = next;
    edit.aliasEntries[parentDetail] = '';
    delete edit.aliasErrors[parentDetail];
    return true;
}

export function removeSummaryDetailAlias(edit, parentDetail, aliasIndex) {
    if (!edit?.candidate) return false;
    edit.candidate.detailAliases = removeDetailAlias(
        edit.candidate.detailAliases,
        edit.candidate.detailKeywords,
        parentDetail,
        aliasIndex,
    );
    delete edit.aliasErrors?.[parentDetail];
    return true;
}

export function commitSummaryCandidateEntries(edit) {
    if (!edit?.candidate || !edit.entries) return false;
    for (const field of SUMMARY_CANDIDATE_LIST_FIELDS) appendSummaryCandidateEntry(edit, field);
    let valid = true;
    for (const parentDetail of Object.keys(edit.aliasEntries ?? {})) {
        if (edit.aliasEntries[parentDetail].trim() && !appendSummaryDetailAlias(edit, parentDetail)) valid = false;
    }
    return valid;
}

export function summaryCandidateEditChanged(edit) {
    if (!edit?.candidate) return false;
    return JSON.stringify(edit.candidate) !== JSON.stringify(edit.original)
        || SUMMARY_CANDIDATE_LIST_FIELDS.some(field => edit.entries?.[field]?.trim())
        || Object.values(edit.aliasEntries ?? {}).some(value => value.trim());
}

export function commitSummaryCandidateEdit(draft, edit) {
    if (!draft || !edit?.candidate) return false;
    const index = draft.candidates.findIndex(candidate => candidate.draftId === edit.draftId);
    if (index < 0) return false;
    if (!commitSummaryCandidateEntries(edit)) return false;
    const previous = draft.candidates[index];
    const next = structuredClone(edit.candidate);
    const indexSourceChanged = previous.title !== next.title
        || previous.body !== next.body
        || JSON.stringify(previous.people) !== JSON.stringify(next.people)
        || JSON.stringify(previous.locations) !== JSON.stringify(next.locations)
        || JSON.stringify(previous.storyTime) !== JSON.stringify(next.storyTime);
    draft.candidates[index] = next;
    if (indexSourceChanged && draft.keywordState === 'fresh') draft.keywordState = 'stale';
    return true;
}

export function updateSummaryReviewField(draft, index, field, value) {
    const candidate = draft?.candidates?.[index];
    if (!candidate) return false;
    if (field === 'storyTime.start' || field === 'storyTime.end') {
        candidate.storyTime[field.endsWith('start') ? 'start' : 'end'] = text(value);
        if (draft.keywordState === 'fresh') draft.keywordState = 'stale';
        return true;
    }
    if (['people', 'locations', 'eventKeywords', 'detailKeywords', 'primaryKeywords', 'auxiliaryKeywords'].includes(field)) {
        candidate[field] = summaryCandidateList(value);
        if (field === 'detailKeywords') candidate.detailAliases = detailAliasesForEditor(candidate.detailAliases, candidate.detailKeywords);
        if (['people', 'locations'].includes(field) && draft.keywordState === 'fresh') draft.keywordState = 'stale';
        return true;
    }
    if (['title', 'body'].includes(field)) {
        candidate[field] = text(value);
        if (draft.keywordState === 'fresh') draft.keywordState = 'stale';
        return true;
    }
    return false;
}

export function summaryProviderCopy(provider) {
    const source = provider?.source;
    if (source === 'plugin') return provider.available ? '插件 API 已就绪' : '插件 API 尚未配置完整';
    if (source === 'sillytavern') return provider.available ? 'SillyTavern 当前 API 已就绪' : 'SillyTavern 当前 API 不可用';
    return '还没有选择可用的 AI 来源';
}
