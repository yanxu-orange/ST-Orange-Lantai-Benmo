import { comparableYear } from '../domain/story-time.js';
import { normalizeMonitorSnapshot } from '../recall/monitor-snapshot.js';
import { inspectGlobalRegexRule } from '../preprocess/global-regex.js';
import { createRouter, DOMAIN_NAVIGATION, getRoute, TIME_WORKFACE_NAVIGATION } from '../ui/routes.js';
import { createPromptModuleDraft, PROMPT_MODULE_LIFECYCLE_LABELS, PROMPT_MODULE_ROLE_LABELS, PROMPT_MODULE_SCOPE_LABELS, promptModulePayload } from '../ui/prompt-module-state.js';
import { createDirtyState } from '../ui/dirty-state.js';
import { createAutoSummaryDraft, autoSummaryBackfillCopy, autoSummaryRanges, autoSummarySkipCopy, autoSummaryStatus, autoSummaryLastResult, autoSummaryStage, autoSummaryObservation } from '../ui/auto-summary-state.js';
import { getScrollControlState } from '../ui/scroll-controls.js';
import { summaryPromptStructure } from '../ui/summary-prompt-structure.js';
import { countActiveMemoryFilters, normalizeMemoryFilterDraft, toggleMemoryMultiState, toggleMemorySelection } from '../ui/memory-library-state.js';
import { formatMemoryFloorRanges } from '../ui/memory-source.js';
import { createConfirmationGate } from '../ui/confirmation-gate.js';
import { captureApiSettingsPosition, restoreApiSettingsPosition } from '../ui/api-settings-position.js';
import { PRODUCT_DESCRIPTION, PRODUCT_DISPLAY_VERSION, PRODUCT_FULL_NAME, PRODUCT_NAME, productBrandMark } from './product-brand.js';
import {
    appendMemoryEditorEntry,
    createBlankMemoryEditorLists,
    createBlankMemoryEntryDrafts,
    memoryEditorListPayload,
    memoryEditorListsFromMemory,
    removeMemoryEditorEntry,
} from '../ui/memory-editor-state.js';
import { timelineMemoryMetadata } from '../ui/timeline-metadata.js';
import {
    appendSummaryDetailAlias,
    appendSummaryCandidateEntry,
    createManualSummaryDraft,
    commitSummaryCandidateEdit,
    createSummaryCandidateEdit,
    createSummaryReviewDraft,
    discardManualSummaryTransientState,
    removeSummaryCandidateEntry,
    removeSummaryDetailAlias,
    summaryCandidateEditChanged,
    summaryProviderCopy,
    summaryReviewCandidateStatus,
    updateSummaryCandidateEntry,
    updateSummaryCandidateEdit,
    updateSummaryDetailAliasEntry,
} from '../ui/manual-summary-state.js';
import {
    aliasesForDetail,
    appendDetailAlias,
    canEditDetailAliases,
    reconcileDetailAliases,
    removeDetailAlias,
} from '../ui/detail-alias-editor-state.js';
import {
    applySummaryGenerationMode,
    applyEventLibrarySelection,
    applySummaryCustomPromptDraft,
    applySummaryEventLibraryDraft,
    applySummaryPromptTextDraft,
    createSummaryCleaningDraft,
    createSummaryCustomPromptDraft,
    createSummaryEventLibraryDraft,
    createSummaryPromptTextDraft,
    deleteSummaryCustomPrompt,
    persistSummarySettings,
    restoreSummaryEventLibraryDraft,
    restoreSummaryPromptTextDraft,
    requiresFastModeConfirmation,
    validateSummaryCleaningDraft,
} from '../ui/summary-settings-state.js';
import { PROMPT_TEXT_DEFINITIONS, normalizePromptOverrides } from '../prompts/prompt-customization.js';
import { eventLibraryStatus } from '../prompts/event-library.js';
import { savePromptProfile, selectPromptProfile, deletePromptProfile, syncActivePromptProfile } from '../prompts/prompt-profiles.js';
import { calendarDayDistance, createTraditionalFictionalMonths, daysInCalendarMonth, monthsInCalendarYear, resolveFictionalYearScheme } from '../domain/calendar.js';
import { importRealLunarYearRange } from '../domain/fictional-calendar-import.js';
import { calendarEventMatchesDate } from '../domain/calendar-event.js';
import { modernCalendarOverlay } from '../domain/modern-calendar-overlay.js';
import { HOLIDAY_DATA_NOTICE, holidayTemplatePacks, holidayTemplates, traditionalHolidayTemplateIds } from '../domain/holiday-templates.js';
import { holidayTemplateChanged } from '../ui/holiday-template-state.js';
import { DEFAULT_GLOBAL_SETTINGS } from '../constants.js';
import {
    createFeatureSnapshot,
    FEATURE_DEFINITIONS,
    isDomainEnabled,
    isModuleLifecycleEnabled,
    isRouteEnabled,
} from '../domain/feature-policy.js';

import { DEFAULT_HOLIDAY_INSTRUCTION } from '../recall/holiday-prompt.js';
import { runMainApiBackgroundProbe } from '../ai-provider/main-api-probe.js';
import {
    deleteSecondaryApiPreset,
    fetchSecondaryApiPresetModels,
    getSecondaryApiPresetState,
    runSecondaryApiGenerationProbe,
    saveSecondaryApiScheme,
    selectSecondaryApiPreset,
} from '../ai-provider/secondary-api-config.js';

const SHELL_ID = 'tkm-plugin-shell';
const UI_THEME_IDS = Object.freeze(['rose-paper', 'mist']);
const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg>';
const FILTER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7v5.2l-3.6 1.8v-7z"/></svg>';
const MULTI_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="6" height="6" rx="1"/><path d="m5 7.3 1.2 1.2L8.3 6"/><rect x="3.5" y="13.5" width="6" height="6" rx="1"/><path d="M12.5 7.5H21M12.5 16.5H21"/></svg>';
const BUILTIN_REGEX_SHORTCUTS = Object.freeze([
    { label: 'HTML 注释', action: 'exclude', pattern: '<!--[\\s\\S]*?-->', flags: 'su', replacement: '' },
    { label: '<think>', action: 'exclude', pattern: '<think(?:\\s[^>]*)?>[\\s\\S]*?</think\\s*>', flags: 'sui', replacement: '' },
    { label: '<thinking>', action: 'exclude', pattern: '<thinking(?:\\s[^>]*)?>[\\s\\S]*?</thinking\\s*>', flags: 'sui', replacement: '' },
    { label: '<details>', action: 'exclude', pattern: '<details(?:\\s[^>]*)?>[\\s\\S]*?</details\\s*>', flags: 'sui', replacement: '' },
    { label: '<content>', action: 'extract', pattern: '(?<=<content>)[\\s\\S]*?(?=</content>)', flags: 'su', replacement: '' },
]);
const TRADITIONAL_DAY_NAMES = Object.freeze([
    '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]);

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function currentChatLabel(context) {
    const value = typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : context?.chatId;
    return value ? String(value) : null;
}

function blankDraft() {
    return {
        mode: '', title: '', startTime: '', endTime: '', body: '',
        ...createBlankMemoryEditorLists(),
        detailAliases: [],
        source: { type: 'manual', batchId: null, floorRange: null, externalId: null },
        sourceFloorRanges: [{ start: '', end: '' }],
    };
}

function floorRangeDraft(source) {
    const value = source?.floorRange;
    const ranges = Array.isArray(value?.[0]) ? value : [value];
    const result = ranges
        .filter(range => Array.isArray(range))
        .map(range => ({ start: String(range[0] ?? ''), end: String(range[1] ?? range[0] ?? '') }));
    return result.length ? result : [{ start: '', end: '' }];
}

function draftFromMemory(memory) {
    return {
        mode: memory.mode,
        title: memory.title ?? '',
        startTime: memory.time?.start?.raw ?? '',
        endTime: memory.time?.end?.raw ?? '',
        body: memory.body ?? '',
        ...memoryEditorListsFromMemory(memory),
        source: structuredClone(memory.source ?? null),
        sourceFloorRanges: floorRangeDraft(memory.source),
    };
}

function blankAnniversaryDraft(defaultAdvanceDays = 3) {
    return {
        status: 'enabled', month: '', day: '',
        names: [{ id: '', name: '', startYearRaw: '', personalPrompt: '' }],
        advance: { mode: 'override', days: String(defaultAdvanceDays) }, templates: { day: '', advance: '' },
    };
}

function blankGlobalRegexDraft() {
    return { id: '', action: 'exclude', pattern: '', flags: 'su', replacement: '' };
}

function blankCalendarEventDraft(active, date) {
    return {
        kind: 'schedule',
        name: '',
        year: String(date.year),
        month: String(date.month),
        day: String(date.day),
        repeat: 'once',
        advanceDays: '0',
        durationDays: '1',
        fact: '',
        status: 'enabled',
        calendarId: active.id,
    };
}

function calendarEventDraftFrom(event) {
    return {
        kind: 'schedule',
        name: event.name,
        year: String(event.date.year),
        month: String(event.date.month),
        day: String(event.date.day),
        repeat: event.repeat,
        advanceDays: String(event.advanceDays ?? 0),
        durationDays: String(event.durationDays ?? 1),
        fact: event.fact ?? '',
        status: event.status,
        calendarId: event.calendarId,
    };
}

function holidayDraftFrom(event, active, date) {
    const rule = event?.dateRule ?? { type: 'fixed', month: event?.date?.month ?? date.month, day: event?.date?.day ?? date.day };
    return {
        kind: 'holiday', calendarId: active.id, name: event?.name ?? '', fact: event?.fact ?? '',
        status: event?.status ?? 'enabled', ruleType: rule.type,
        month: String(rule.month ?? date.month), day: String(rule.day ?? date.day),
        termName: rule.name ?? '', templateId: event?.templateId ?? '', templatePack: event?.templatePack ?? '',
    };
}

function globalRegexDraftFrom(rule) {
    return {
        id: String(rule?.id ?? ''), action: rule?.action ?? 'exclude',
        pattern: String(rule?.pattern ?? ''), flags: String(rule?.flags ?? 'su'),
        replacement: String(rule?.replacement ?? ''),
    };
}

function draftFromAnniversary(item, defaultAdvanceDays = 3) {
    return {
        status: item.status === 'paused' ? 'paused' : 'enabled', month: String(item.month), day: String(item.day),
        names: item.names.map(name => ({ id: name.id, name: name.name, startYearRaw: name.startYearRaw ?? '', personalPrompt: name.personalPrompt ?? '' })),
        advance: { mode: 'override', days: String(item.advance?.mode === 'override' ? item.advance.days : defaultAdvanceDays) },
        templates: { day: item.templates?.day ?? '', advance: item.templates?.advance ?? '' },
    };
}

function anniversaryForm(state) {
    const draft = state.anniversaryDraft;
    const errors = state.anniversaryErrors ?? {};
    const names = draft.names.map((name, index) => {
        return `<div class="tkm-special-name"><label class="tkm-special-event-field"><span>事件名称：</span><input type="text" data-anniversary-name-field="name" data-index="${index}" value="${escapeHtml(name.name)}" placeholder="支持 Emoji，例如 ❤️结婚"></label><div class="tkm-special-year-row"><label><span>发生年份：</span><input type="text" data-anniversary-name-field="startYearRaw" data-index="${index}" value="${escapeHtml(name.startYearRaw)}" placeholder="用于计算发生在几年前"></label><button type="button" class="tkm-icon-action danger" data-action="remove-anniversary-name" data-index="${index}" aria-label="删除事件" ${draft.names.length === 1 ? 'disabled' : ''}>${TRASH_ICON}</button></div><label class="tkm-personal-prompt"><span>自定义提醒提示词</span><textarea rows="3" data-anniversary-name-field="personalPrompt" data-index="${index}" placeholder="可选">${escapeHtml(name.personalPrompt)}</textarea></label></div>`;
    }).join('');
    return `<form class="tkm-calendar-form tkm-special-date-form" data-tkm-form="anniversary">${state.anniversaryMessage ? `<p class="tkm-inline-error">${escapeHtml(state.anniversaryMessage)}</p>` : ''}<div class="tkm-special-date-heading"><label><span>日期</span><span class="tkm-special-date-fields"><input type="number" inputmode="numeric" min="1" max="12" data-anniversary-field="month" value="${escapeHtml(draft.month)}" aria-label="月"><i>月</i><input type="number" inputmode="numeric" min="1" max="31" data-anniversary-field="day" value="${escapeHtml(draft.day)}" aria-label="日"><i>日</i></span></label><label><span>提前提醒</span><span class="tkm-special-advance-fields"><input type="number" inputmode="numeric" min="0" data-anniversary-field="advance.days" value="${escapeHtml(draft.advance.days)}" aria-label="提前提醒天数"><i>天</i></span></label></div>${errors.month ? `<small class="tkm-inline-error">${escapeHtml(errors.month)}</small>` : ''}${errors.day ? `<small class="tkm-inline-error">${escapeHtml(errors.day)}</small>` : ''}${errors.advance ? `<small class="tkm-inline-error">${escapeHtml(errors.advance)}</small>` : ''}<div class="tkm-special-names">${names}${errors.names ? `<small class="tkm-inline-error">${escapeHtml(errors.names)}</small>` : ''}<button type="button" class="tkm-text-action" data-action="add-anniversary-name">＋ 增加事件</button></div><fieldset class="tkm-special-status"><legend id="tkm-anniversary-status-title">状态</legend><div role="radiogroup" aria-labelledby="tkm-anniversary-status-title"><button type="button" data-action="set-anniversary-draft-status" data-status="enabled" role="radio" aria-checked="${draft.status === 'enabled'}" class="${draft.status === 'enabled' ? 'is-selected' : ''}"><i class="tkm-choice-indicator" aria-hidden="true"></i>启用</button><button type="button" data-action="set-anniversary-draft-status" data-status="paused" role="radio" aria-checked="${draft.status === 'paused'}" class="${draft.status === 'paused' ? 'is-selected' : ''}"><i class="tkm-choice-indicator" aria-hidden="true"></i>暂停</button></div></fieldset><div class="tkm-inline-form-actions"><button type="button" data-action="cancel-anniversary-form">取消</button><button type="submit">保存纪念日</button></div></form>`;
}

function anniversaryCard(item, editor = '') {
    const names = item.names.map(name => `<span class="tkm-special-date-item__name">${escapeHtml(name.name)}</span>`).join('');
    const nextStatus = item.status === 'paused' ? 'enabled' : 'paused';
    const statusLabel = { enabled: '已启用', paused: '已暂停', pending: '待确认' }[item.status] ?? '待确认';
    return `<div class="tkm-special-date-record" data-anniversary-record-id="${escapeHtml(item.id)}"><article class="tkm-special-date-item" data-status="${escapeHtml(item.status)}"><i aria-hidden="true"></i><div class="tkm-special-date-item__content"><div><time>${item.month}月${item.day}日</time></div><small>${statusLabel}</small><div class="tkm-special-date-item__events">${names}</div></div><div class="tkm-special-date-item__actions">${item.status === 'pending' ? `<button type="button" data-action="set-anniversary-status" data-id="${escapeHtml(item.id)}" data-status="enabled" class="tkm-icon-action" aria-label="启用纪念日"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg></button>` : `<button type="button" data-action="set-anniversary-status" data-id="${escapeHtml(item.id)}" data-status="${nextStatus}" class="tkm-icon-action" aria-label="${item.status === 'paused' ? '恢复纪念日' : '暂停纪念日'}"><svg viewBox="0 0 24 24" aria-hidden="true">${item.status === 'paused' ? '<path d="m8 5 11 7-11 7z"/>' : '<path d="M8 5v14M16 5v14"/>'}</svg></button>`}<button type="button" data-action="edit-anniversary" data-id="${escapeHtml(item.id)}" class="tkm-icon-action" aria-label="编辑纪念日"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12 4 4L8 20H4zm10-10 4 4"/></svg></button><button type="button" class="danger tkm-icon-action" data-action="delete-anniversary" data-id="${escapeHtml(item.id)}" aria-label="删除纪念日">${TRASH_ICON}</button></div></article>${editor}</div>`;
}

function plainInput({ field, value, placeholder = '', className = '' }) {
    return `<input type="text" class="${className}" data-draft-field="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
}

function detailAliasBindingMarkup({ parentDetail, aliases, pending = '', error = '', open = false, scope, index, draftId = '' }) {
    const summary = scope === 'summary';
    const actionPrefix = summary ? 'summary-candidate-' : 'memory-';
    const draftAttribute = summary ? ` data-draft-id="${escapeHtml(draftId)}"` : '';
    const inputAttribute = summary ? 'data-summary-detail-alias-entry' : 'data-memory-detail-alias-entry';
    const aliasTags = aliases.map((alias, aliasIndex) => `<span class="tkm-memory-editor-tag tkm-detail-alias-tag">${escapeHtml(alias)}<button type="button" data-action="remove-${actionPrefix}detail-alias" data-parent-detail="${escapeHtml(parentDetail)}" data-alias-index="${aliasIndex}"${draftAttribute} aria-label="删除${escapeHtml(parentDetail)}的检索简称${escapeHtml(alias)}">×</button></span>`).join('');
    return `<div class="tkm-detail-alias-binding" data-detail-alias-parent="${escapeHtml(parentDetail)}">
        <div class="tkm-detail-alias-binding__parent"><span class="tkm-memory-editor-tag">${escapeHtml(parentDetail)}<button type="button" data-action="remove-${summary ? 'summary-candidate' : 'memory'}-tag" data-field="detailKeywords" data-index="${index}"${draftAttribute} aria-label="删除细节关键词 ${escapeHtml(parentDetail)}">×</button></span><button type="button" class="tkm-detail-alias-toggle" data-action="toggle-${actionPrefix}detail-alias" data-parent-detail="${escapeHtml(parentDetail)}"${draftAttribute} aria-expanded="${open}">${aliases.length ? `检索简称 ${aliases.length}` : '添加检索简称'}<i aria-hidden="true"></i></button></div>
        ${open ? `<div class="tkm-detail-alias-editor" data-detail-alias-editor>${aliasTags ? `<div class="tkm-memory-editor-tags">${aliasTags}</div>` : ''}<div class="tkm-memory-tag-entry"><input type="text" ${inputAttribute} data-parent-detail="${escapeHtml(parentDetail)}"${draftAttribute} value="${escapeHtml(pending)}" placeholder="输入${escapeHtml(parentDetail)}的检索简称" aria-label="添加${escapeHtml(parentDetail)}的检索简称"><button type="button" data-action="commit-${actionPrefix}detail-alias" data-parent-detail="${escapeHtml(parentDetail)}"${draftAttribute} ${pending.trim() ? '' : 'hidden'}>添加</button></div>${error ? `<small class="tkm-inline-error" role="alert">${escapeHtml(error)}</small>` : ''}</div>` : ''}
    </div>`;
}

function memoryTagEditor(state, { field, label, placeholder, required = false, confirm = false, error = '' }) {
    const items = Array.isArray(state.draft[field]) ? state.draft[field] : [];
    const pending = state.memoryEntryDrafts[field] ?? '';
    const tags = field === 'detailKeywords'
        ? items.map((item, index) => canEditDetailAliases(item) ? detailAliasBindingMarkup({
            parentDetail: item,
            aliases: aliasesForDetail(state.draft.detailAliases, items, item),
            pending: state.memoryDetailAliasEntries[item] ?? '',
            error: state.memoryDetailAliasErrors[item] ?? '',
            open: state.memoryDetailAliasOpenParents.has(item),
            scope: 'memory',
            index,
        }) : `<span class="tkm-memory-editor-tag">${escapeHtml(item)}<button type="button" data-action="remove-memory-tag" data-field="${field}" data-index="${index}" aria-label="删除${escapeHtml(label)} ${escapeHtml(item)}">×</button></span>`).join('')
        : items.map((item, index) => `<span class="tkm-memory-editor-tag">${escapeHtml(item)}<button type="button" data-action="remove-memory-tag" data-field="${field}" data-index="${index}" aria-label="删除${escapeHtml(label)} ${escapeHtml(item)}">×</button></span>`).join('');
    return `<div class="tkm-memory-tag-editor ${error ? 'tkm-field-error' : ''}"><div class="tkm-memory-field-label"><span>${escapeHtml(label)}${required ? ' <b aria-hidden="true">*</b>' : ''}</span></div>${tags ? `<div class="tkm-memory-editor-tags">${tags}</div>` : ''}<div class="tkm-memory-tag-entry"><input type="text" data-memory-entry-field="${field}" value="${escapeHtml(pending)}" placeholder="${escapeHtml(placeholder)}" aria-label="添加${escapeHtml(label)}"><button type="button" data-action="commit-memory-tag" data-field="${field}" ${pending.trim() ? '' : 'hidden'} aria-label="确认添加${escapeHtml(label)}">${confirm ? '✓' : '添加'}</button></div>${error ? `<small class="tkm-inline-error">${escapeHtml(error)}</small>` : ''}</div>`;
}

function memoryDirtySnapshot(state) {
    return { draft: state.draft, entries: state.memoryEntryDrafts, aliasEntries: state.memoryDetailAliasEntries };
}

function sourceRangeEditor(draft, errors) {
    const rows = draft.sourceFloorRanges.map((range, index) => `<div class="tkm-compact-range-row tkm-source-range-row"><span class="tkm-compact-range-row__label">${index === 0 ? '来源楼层 <b aria-hidden="true">*</b>' : ''}</span><label><span class="tkm-visually-hidden">开始楼层</span><input type="text" inputmode="numeric" data-floor-field="start" data-index="${index}" value="${escapeHtml(range.start)}" placeholder="起点" aria-label="来源楼层起点"></label><i aria-hidden="true">—</i><label><span class="tkm-visually-hidden">结束楼层</span><input type="text" inputmode="numeric" data-floor-field="end" data-index="${index}" value="${escapeHtml(range.end)}" placeholder="终点" aria-label="来源楼层终点"></label>${draft.sourceFloorRanges.length > 1 ? `<button type="button" class="tkm-icon-action danger" data-action="remove-memory-floor" data-index="${index}" aria-label="删除来源楼层区间">${TRASH_ICON}</button>` : '<span class="tkm-compact-range-row__action" aria-hidden="true"></span>'}</div>`).join('');
    return `<div class="tkm-source-ranges ${errors.sourceFloorRanges ? 'tkm-field-error' : ''}">${rows}</div>${errors.sourceFloorRanges ? `<small class="tkm-inline-error">${escapeHtml(errors.sourceFloorRanges)}</small>` : ''}<button type="button" class="tkm-text-action tkm-add-source-range" data-action="add-memory-floor">＋ 增加区间</button>`;
}

function memoryForm(state, editing) {
    const draft = state.draft;
    const errors = state.formErrors ?? {};
    return `<form id="tkm-memory-record-form" class="tkm-memory-form tkm-memory-editor" data-tkm-form="memory" novalidate>
        ${state.formMessage && state.formMessage !== '已保存。' ? `<p class="tkm-memory-form-message tkm-inline-error" role="alert">${escapeHtml(state.formMessage)}</p>` : ''}
        <section class="tkm-memory-editor-section" aria-labelledby="tkm-memory-basic-title"><h2 id="tkm-memory-basic-title">基本信息</h2><fieldset class="tkm-memory-mode ${errors.mode ? 'tkm-field-error' : ''}"><legend id="tkm-memory-mode-title">召回方式 <b aria-hidden="true">*</b></legend><div role="radiogroup" aria-labelledby="tkm-memory-mode-title"><button type="button" class="tkm-memory-mode__choice ${draft.mode === 'resident' ? 'is-selected' : ''}" data-action="select-memory-mode" data-mode="resident" role="radio" aria-checked="${draft.mode === 'resident'}"><i class="tkm-choice-indicator" aria-hidden="true"></i><span>常驻</span></button><button type="button" class="tkm-memory-mode__choice ${draft.mode === 'trigger' ? 'is-selected' : ''}" data-action="select-memory-mode" data-mode="trigger" role="radio" aria-checked="${draft.mode === 'trigger'}"><i class="tkm-choice-indicator" aria-hidden="true"></i><span>触发</span></button></div>${errors.mode ? `<small class="tkm-inline-error">${escapeHtml(errors.mode)}</small>` : ''}</fieldset><label class="tkm-memory-editor-field"><span>标题 <small>可选</small></span>${plainInput({ field: 'title', value: draft.title, placeholder: '给这条记忆一个容易辨认的名字', className: 'tkm-title-input' })}</label></section>
        <section class="tkm-memory-editor-section" aria-labelledby="tkm-memory-time-title"><h2 id="tkm-memory-time-title">时间与来源</h2><div class="tkm-compact-range-row tkm-memory-time-range"><span class="tkm-compact-range-row__label">故事时间 <b aria-hidden="true">*</b></span><label class="${errors.startTime ? 'tkm-field-error' : ''}"><span class="tkm-visually-hidden">故事时间起点</span>${plainInput({ field: 'startTime', value: draft.startTime, placeholder: '起点' })}</label><i aria-hidden="true">—</i><label><span class="tkm-visually-hidden">故事时间终点</span>${plainInput({ field: 'endTime', value: draft.endTime, placeholder: '终点' })}</label></div>${errors.startTime ? `<small class="tkm-inline-error">${escapeHtml(errors.startTime)}</small>` : ''}${sourceRangeEditor(draft, errors)}</section>
        <section class="tkm-memory-editor-section" aria-labelledby="tkm-memory-keyword-title"><h2 id="tkm-memory-keyword-title">关键词</h2>${memoryTagEditor(state, { field: 'eventKeywords', label: '事件关键词', placeholder: '输入关键词，可用逗号分隔', confirm: true })}${memoryTagEditor(state, { field: 'detailKeywords', label: '细节关键词', placeholder: '输入关键词，可用逗号分隔', confirm: true })}${editing ? `<button type="button" class="tkm-text-action tkm-keyword-rebuild-entry" data-action="rebuild-memory-keywords" ${state.keywordRebuildBusy ? 'disabled' : ''}>${state.keywordRebuildBusy ? '正在生成…' : '重建关键词与检索简称'}</button>` : ''}</section>
        <section class="tkm-memory-editor-section" aria-labelledby="tkm-memory-meta-title"><h2 id="tkm-memory-meta-title">人物与地点</h2>${memoryTagEditor(state, { field: 'people', label: '人物', placeholder: '输入人物，可用逗号分隔' })}${memoryTagEditor(state, { field: 'locations', label: '地点', placeholder: '输入地点，可用逗号分隔' })}</section>
        <section class="tkm-memory-editor-section tkm-memory-body-field ${errors.body ? 'tkm-field-error' : ''}" aria-labelledby="tkm-memory-body-title"><h2 id="tkm-memory-body-title">正文 <b aria-hidden="true">*</b></h2><label class="tkm-visually-hidden" for="tkm-memory-body">记忆正文</label><textarea id="tkm-memory-body" rows="12" data-draft-field="body" placeholder="记录这段记忆真正需要保留的内容">${escapeHtml(draft.body)}</textarea>${errors.body ? `<small class="tkm-inline-error">${escapeHtml(errors.body)}</small>` : ''}</section>
        ${editing ? '<div class="tkm-memory-end-actions"><button type="button" class="tkm-memory-delete-action" data-action="delete-memory">删除这条记忆</button></div>' : ''}
    </form>`;
}

function memoryCard(memory, selected, multi) {
    const title = memory.title || memory.body.slice(0, 28) || '无标题记忆';
    const end = memory.time?.end?.raw;
    const start = memory.time?.start?.raw;
    const floors = formatMemoryFloorRanges(memory.source);
    const timeAndSource = [
        `${escapeHtml(start)}${end && end !== start ? ` — ${escapeHtml(end)}` : ''}`,
        floors ? escapeHtml(floors) : '',
    ].filter(Boolean).join(' · ');
    const mode = memory.mode === 'resident' ? '常驻' : '触发';
    const content = `<div class="tkm-memory-card__meta"><span class="tkm-mode-badge tkm-mode-badge--${memory.mode}"><i aria-hidden="true"></i>${mode}</span>${timeAndSource ? `<time>${timeAndSource}</time>` : ''}</div><h2 class="tkm-memory-card__title">${escapeHtml(title)}</h2><p>${escapeHtml(memory.body.slice(0, 110))}${memory.body.length > 110 ? '…' : ''}</p><div class="tkm-card-tags">${(memory.keywords?.event ?? []).slice(0, 3).map(item => `<i class="tkm-card-tag--primary">${escapeHtml(item)}</i>`).join('')}${(memory.keywords?.detail ?? []).slice(0, 2).map(item => `<i class="tkm-card-tag--auxiliary">${escapeHtml(item)}</i>`).join('')}</div>`;
    if (multi) return `<article class="tkm-memory-card tkm-memory-card--library tkm-memory-card--selectable ${selected ? 'tkm-memory-card--selected' : ''}"><span class="tkm-card-checkbox" aria-hidden="true">${selected ? '✓' : ''}</span>${content}<button type="button" class="tkm-memory-card__hit" data-action="toggle-select" data-id="${escapeHtml(memory.id)}" aria-label="${selected ? '取消选择' : '选择'}记忆：${escapeHtml(title)}" aria-pressed="${selected}"></button></article>`;
    return `<article class="tkm-memory-card tkm-memory-card--library">${content}<button type="button" class="tkm-memory-card__hit" data-action="open-memory" data-id="${escapeHtml(memory.id)}" aria-label="打开记忆：${escapeHtml(title)}"></button><button type="button" class="tkm-memory-card__delete" data-action="delete-library-memory" data-id="${escapeHtml(memory.id)}" aria-label="删除记忆：${escapeHtml(title)}">${TRASH_ICON}</button></article>`;
}

function timelineMarkup(memories) {
    const groups = new Map();
    for (const memory of memories) {
        const value = memory.time?.end?.value;
        if (!value?.year || !value?.month || !value?.day) continue;
        const yearLabel = value.calendar === 'era' ? `${value.era}${value.year}年` : `${value.year}年`;
        const dateLabel = `${value.month}月${value.day}日`;
        const year = groups.get(yearLabel) ?? new Map();
        const date = year.get(dateLabel) ?? [];
        date.push(memory);
        year.set(dateLabel, date);
        groups.set(yearLabel, year);
    }
    if (!groups.size) return '<section class="tkm-empty-state tkm-empty-state--compact"><h2>暂无可排入时间线的记忆</h2><p>时间原文仍已保存；等它能被结构化后会自动出现。</p></section>';
    return `<section class="tkm-timeline">${[...groups].map(([yearLabel, dates]) => `<section class="tkm-timeline-year"><h3>${escapeHtml(yearLabel)}</h3><div class="tkm-timeline-stream">${[...dates].map(([dateLabel, items]) => `<section class="tkm-timeline-date"><h4>${escapeHtml(dateLabel)}</h4><div>${items.map(memory => { const metadata = timelineMemoryMetadata(memory); const floors = formatMemoryFloorRanges(memory.source); const title = memory.title || memory.body.slice(0, 28) || '无标题记忆'; return `<article class="tkm-timeline-entry"><small>${escapeHtml([metadata, floors, memory.mode === 'resident' ? '常驻' : '触发'].filter(Boolean).join(' · '))}</small><strong class="tkm-timeline-entry__title">${escapeHtml(title)}</strong><p>${escapeHtml(memory.body.slice(0, 110))}${memory.body.length > 110 ? '…' : ''}</p><span class="tkm-card-tags">${(memory.keywords?.event ?? []).slice(0, 3).map(item => `<i class="tkm-card-tag--primary">${escapeHtml(item)}</i>`).join('')}${(memory.keywords?.detail ?? []).slice(0, 2).map(item => `<i class="tkm-card-tag--auxiliary">${escapeHtml(item)}</i>`).join('')}</span><button type="button" class="tkm-timeline-entry__hit" data-action="open-memory" data-id="${escapeHtml(memory.id)}" aria-label="打开记忆：${escapeHtml(title)}"></button></article>`; }).join('')}</div></section>`).join('')}</div></section>`).join('')}</section>`;
}

function fitStoryTimeTextarea(area) {
    area.style.height = 'auto';
    area.style.height = `${Math.max(96, area.scrollHeight + 2)}px`;
}
function storyTimeForm(state, storyTime) {
    const current = storyTime?.current;
    const observation = storyTime?.lastObservation;
    const floor = observation?.messageId;
    const sourceLabel = current?.source === 'manual'
        ? '手动修改'
        : (floor !== null && floor !== undefined && floor !== ''
            ? `第 ${floor} 楼${current?.source === 'status_bar' ? '状态栏' : '自动识别'}`
            : (current?.source === 'status_bar' ? '剧情状态栏' : '正文自动识别'));
    return `<div class="tkm-time-primary"><header class="tkm-time-section-heading"><div><h2>故事日期</h2><p>插件会以这里的日期判断同日记忆、纪念日与节日。</p></div></header>${state.storyTimeMessage ? `<p class="tkm-inline-error">${escapeHtml(state.storyTimeMessage)}</p>` : ''}<label class="tkm-time-current-field"><span>当前故事日期</span><input type="text" data-field="story-time-draft" value="${escapeHtml(state.storyTimeDraft)}" placeholder="例：永定八年九月二十日" aria-label="当前故事日期"></label><div class="tkm-time-source-row"><span>日期来源</span><div class="tkm-time-source-actions"><output>${escapeHtml(current ? sourceLabel : '尚未设置')}</output><button type="button" class="tkm-time-source-action" data-action="reidentify-story-time" ${state.storyTimeRecognizeBusy ? 'disabled' : ''}>↻ 重新识别</button></div></div></div>`;
}

function extractionRuleDraftFrom(storyTime) {
    const rule = storyTime?.extractionRule ?? {};
    return {
        enabled: Boolean(rule.enabled),
        mode: rule.mode === 'regex' ? 'regex' : 'markers',
        markers: structuredClone(rule.markers ?? []),
        pattern: rule.pattern ?? '',
        flags: rule.flags || 'su',
    };
}

function storyTimeExtractionForm(state) {
    const draft = state.extractionRuleDraft;
    const markerRows = draft.markers.map((marker, index) => `<div class="tkm-time-marker-row"><span>${index + 1}</span><input type="text" data-time-marker-field="start" data-index="${index}" value="${escapeHtml(marker.start)}" placeholder="开始标签" aria-label="时间区域 ${index + 1} 开始标签"><em>时间内容</em><input type="text" data-time-marker-field="end" data-index="${index}" value="${escapeHtml(marker.end)}" placeholder="结束标签" aria-label="时间区域 ${index + 1} 结束标签"><button type="button" class="tkm-icon-action danger" data-action="remove-time-marker" data-index="${index}" aria-label="删除标签">${TRASH_ICON}</button></div>`).join('');
    const markerEditor = `<div class="tkm-basic-method"><div class="tkm-time-marker-list">${markerRows || '<p class="tkm-form-note">还没有标签规则。</p>'}</div></div>`;
    const regexEditor = `<div class="tkm-advanced-fields"><label>正则表达式<textarea rows="4" data-field="time-regex-pattern">${escapeHtml(draft.pattern)}</textarea></label><label>正则标志<input type="text" data-field="time-regex-flags" value="${escapeHtml(draft.flags)}" placeholder="su"></label></div>`;
    const methods = `<div class="tkm-time-method-picker" role="group" aria-label="时间识别限定方式"><button type="button" data-action="set-time-extraction-mode" data-mode="markers" class="${draft.mode === 'markers' ? 'is-selected' : ''}" aria-pressed="${draft.mode === 'markers'}">基本方式</button><button type="button" data-action="set-time-extraction-mode" data-mode="regex" class="${draft.mode === 'regex' ? 'is-selected' : ''}" aria-pressed="${draft.mode === 'regex'}">高级方式</button></div>`;
    const messageClass = state.extractionRuleMessageType === 'success' ? 'tkm-inline-success' : 'tkm-inline-error';
    return `<section class="tkm-recognition-section"><header class="tkm-time-setting-heading"><div><h3>自动识别范围 <button type="button" class="tkm-inline-info" data-action="open-story-date-info" aria-label="查看日期识别说明">ⓘ</button></h3><p>限定后只读取指定区域，避免正文中的其他日期干扰。</p></div><label class="tkm-switch-control" aria-label="限定自动识别范围"><input type="checkbox" data-field="time-regex-enabled" ${draft.enabled ? 'checked' : ''}><b>${draft.enabled ? '开' : '关'}</b></label></header>${state.extractionRuleMessage ? `<p class="${messageClass}" role="status">${escapeHtml(state.extractionRuleMessage)}</p>` : ''}${draft.enabled ? `<div class="tkm-time-method-body">${draft.mode === 'markers' ? markerEditor : ''}<details class="tkm-time-advanced" ${draft.mode === 'regex' ? 'open' : ''}><summary>高级方式</summary>${methods}${draft.mode === 'regex' ? regexEditor : ''}</details></div>${draft.mode === 'markers' ? '<footer class="tkm-recognition-actions"><button type="button" class="tkm-text-action" data-action="add-time-marker">＋ 添加标签</button></footer>' : ''}` : ''}</section>`;
}

function calendarDraftFrom(storyTime) {
    const calendar = storyTime?.fictionalCalendar ?? {};
    return { enabled: Boolean(calendar.enabled), eras: structuredClone(calendar.eras ?? []) };
}

function fictionalCalendarForm(state) {
    const draft = state.calendarDraft;
    const rows = draft.eras.map((era, index) => {
        const current = index === draft.eras.length - 1;
        return `<div class="tkm-era-compact"><span class="tkm-era-order">${index + 1}</span><label class="tkm-era-name"><span>年号</span><input type="text" data-era-field="name" data-era-index="${index}" value="${escapeHtml(era.name)}" placeholder="输入年号"></label>${current ? '<span class="tkm-era-current">当前年号</span>' : `<label class="tkm-era-end"><span>末年</span><input type="number" inputmode="numeric" min="1" step="1" data-era-field="endYear" data-era-index="${index}" value="${escapeHtml(era.endYear ?? '')}" placeholder="8"></label>`}<div class="tkm-era-compact__actions"><button type="button" data-action="move-era-up" data-index="${index}" aria-label="上移年号" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-era-down" data-index="${index}" aria-label="下移年号" ${current ? 'disabled' : ''}>↓</button><button type="button" class="danger tkm-icon-action" data-action="remove-era" data-index="${index}" aria-label="删除年号">${TRASH_ICON}</button></div></div>`;
    }).join('');
    return `<section class="tkm-time-surface tkm-calendar-section"><header class="tkm-time-section-heading"><div><h2>架空纪年</h2><p>按旧到新排列，用于计算跨年号的 X 年前。</p></div><button type="button" class="tkm-time-heading-action" data-action="add-era">＋ 年号</button></header>${state.calendarMessage ? `<p class="tkm-inline-error">${escapeHtml(state.calendarMessage)}</p>` : ''}<div class="tkm-era-flow">${rows || '<p class="tkm-settings-empty">没有架空年号时，插件仍可识别普通日期。</p>'}</div></section>`;
}

export function mountPluginShell({ documentRef = document, getContext, memoryLibraryService, memoryKeywordRebuildService, memoryMergeService, storyTimeService, anniversaryService, calendarService, recallSettingsService, promptModuleService, moduleResultService = null, manualSummaryService, summaryNotifier = null, getGlobalSettings = () => ({}), saveGlobalSettings = () => {}, confirmAction } = {}) {
    const existing = documentRef.getElementById(SHELL_ID);
    if (existing) return existing._tkmController;
    if (!memoryLibraryService) throw new TypeError('memoryLibraryService 不可用。');
    if (!storyTimeService) throw new TypeError('storyTimeService 不可用。');
    if (!anniversaryService) throw new TypeError('anniversaryService 不可用。');
    if (!calendarService) throw new TypeError('calendarService 不可用。');
    if (!recallSettingsService) throw new TypeError('recallSettingsService 不可用。');
    if (!promptModuleService) throw new TypeError('promptModuleService 不可用。');
    if (!manualSummaryService) throw new TypeError('manualSummaryService 不可用。');
    const chatDataService = memoryLibraryService.chatDataService;
    if (!chatDataService) throw new TypeError('chatDataService 不可用。');
    memoryKeywordRebuildService ??= {
        providerState: () => ({ available: false }), currentReview: () => null,
        start: async () => { throw new Error('关键词与检索简称重建不可用。'); },
        confirm: async () => { throw new Error('关键词与检索简称重建不可用。'); }, cancel: () => true,
    };
    memoryMergeService ??= {
        providerState: () => ({ available: false }), currentReview: () => null,
        inspectSelection: ids => ({ canMerge: false, reason: ids?.length >= 2 ? '记忆合并服务不可用。' : '请至少选择两条记忆。', originalAvailable: false, originalReason: '记忆合并服务不可用。' }),
        start: async () => { throw new Error('记忆合并服务不可用。'); },
        confirmBody: async () => { throw new Error('记忆合并服务不可用。'); },
        confirm: async () => { throw new Error('记忆合并服务不可用。'); },
        undo: async () => { throw new Error('记忆合并服务不可用。'); }, cancel: () => {},
    };
    const ask = confirmAction ?? (message => documentRef.defaultView?.confirm?.(message) ?? true);
    const shell = documentRef.createElement('section');
    shell.id = SHELL_ID;
    shell.className = 'tkm-shell';
    shell.dataset.tkmTheme = 'rose-paper';
    shell.hidden = true;
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', `${PRODUCT_NAME}面板`);
    const router = createRouter();
    const dirty = createDirtyState();
    const discardGate = createConfirmationGate();
    const fastModeWarningGate = createConfirmationGate();
    const summaryReviewCancelGate = createConfirmationGate();
    const autoSummarySkipGate = createConfirmationGate();
    const coverageRegenerationGate = createConfirmationGate();
    const state = { libraryView: 'list', query: '', mode: 'all', fieldState: 'all', filterOpen: false, filterMenu: null, filterDraft: normalizeMemoryFilterDraft(), multi: false, selected: new Set(), activeId: null, draft: null, memoryEntryDrafts: createBlankMemoryEntryDrafts(), memoryDeletePending: false, formErrors: {}, formMessage: '', notice: '', noticeType: '', storyTimeDraft: '', storyTimeMessage: '', storyTimeRecognizeBusy: false, extractionRuleDraft: { enabled: false, mode: 'markers', markers: [], pattern: '', flags: 'su' }, extractionRuleMessage: '', extractionRuleMessageType: '', calendarDraft: { enabled: false, eras: [] }, calendarMessage: '', calendarMessageType: '', calendarCursorId: null, calendarYear: null, calendarMonth: null, calendarDay: null, calendarSelectorOpen: false, calendarManagementOpen: false, calendarEventDraft: null, calendarEventEditingId: null, calendarEventMessage: '', calendarEventSaving: false, holidayPresetCalendarId: null, holidayPackOpen: null, holidaySelections: {}, holidayDraft: null, holidayEditingId: null, holidayMessage: '', fictionalCalendarDraft: null, fictionalCalendarEditingId: null, fictionalCalendarSetupStep: null, fictionalSchemeOpenId: null, fictionalTermFocusName: '', fictionalCalendarMessage: '', fictionalCalendarImportOpen: false, fictionalCalendarImportDraft: { startYear: '2024', endYear: '2025', includeSolarTerms: true, includeTraditionalHolidays: false }, fictionalCalendarImportTraditionalPending: false, fictionalCalendarImportQingmingPending: false, customCalendarDraft: null, customCalendarEditingId: null, customCalendarMessage: '', listScrollTop: 0, anniversaryTab: 'all', anniversaryDraft: null, anniversaryEditingId: null, anniversaryErrors: {}, anniversaryMessage: '', specialPromptOpen: false, specialPromptDraft: { general: '', defaultDays: 3, storyTimeInstruction: '', holidayInstruction: '', holidayAdvanceDays: 0 }, specialPromptErrors: { general: '', defaultDays: '', storyTimeInstruction: '', holidayInstruction: '', holidayAdvanceDays: '' }, specialPromptMessage: '', settingsSection: null, apiDraft: null, apiModels: [], apiMessage: '', apiMessageType: '', apiBusy: false, apiDialog: null, apiDialogName: '', regexDraft: null, regexDraftKind: 'rule', regexEditingIndex: null, regexQuickOpen: false, regexMessage: '', regexReorderFeedback: null, recallSettingsDraft: null, recallSettingsMessage: '', recallSettingsMessageType: '', branchDecisionBusy: false, branchDecisionMessage: '', manualSummaryChatId: null, manualSummaryDraft: createManualSummaryDraft(), manualSummaryPreview: null, manualSummaryPreviewOpen: false, manualSummaryMessage: '', manualSummaryMessageType: '', manualSummaryBusy: false, manualSummaryDuplicateConfirmed: false, summaryReviewDraft: null, summaryReviewMessage: '', summaryReviewBusy: false, summaryReviewRemovingLast: false, summaryReviewTaskId: null, summaryReviewCollapsedIds: new Set(), summaryReviewEditing: null, summaryCleaningDraft: null, summaryCleaningRuleDraft: null, summaryCleaningEditingIndex: null, summarySettingsMessage: '', summarySettingsMessageType: '', summaryReorderFeedback: null, createMemoryNotice: '' };
    state.storyDateInfoOpen = false;
    state.memorySearchOpen = false;
    state.memoryDetailAliasEntries = {};
    state.keywordRebuildBusy = false;
    state.keywordRebuildMessage = '';
    state.keywordRebuildReturnTo = 'memory.library';
    state.memoryMergeIds = [];
    state.memoryMergeBusy = false;
    state.memoryMergeBusyStage = '';
    state.memoryMergeMessage = '';
    state.memoryMergeBodyDraft = null;
    state.memoryDetailAliasErrors = {};
    state.memoryDetailAliasOpenParents = new Set();
    state.summaryDetailAliasOpenParents = new Set();
    state.apiDialogReturnPosition = null;
    state.autoSummaryDraft = null;
    state.autoSummaryChatId = null;
    state.autoSummaryBusy = false;
    state.autoSummaryMessage = '';
    state.autoSummaryBacklog = false;
    state.coverageFloorDraft = '';
    state.coverageMessage = '';
    state.coverageMessageType = '';
    state.coverageSaveBusy = false;
    state.coverageRegeneratingBatchId = null;
    state.promptModuleDraft = null;
    state.promptModuleMessage = '';
    state.promptModuleListMessage = '';
    state.promptModuleNotice = '';
    state.promptModuleBusy = false;
    state.promptModuleLifecycle = 'prompt';
    state.promptModuleResultTarget = null;
    state.recallExcludedTermDraft = '';
    let promptModuleNoticeTimer = null;
    let autoSummaryMessageTimer = null;
    let coverageMessageTimer = null;
    state.summaryPromptTextDraft = null;
    state.summaryCustomPromptDraft = null;
    state.summaryEventLibraryDraft = null;
    state.eventLibraryReorderFeedback = null;
    state.fictionalTermOpenSchemeIds = new Set();
    const windowRef = documentRef.defaultView;
    let focusScrollTimer = null;
    let reorderFeedbackTimer = null;
    let regexMessageTimer = null;
    let summaryMessageTimer = null;
    let eventLibraryReorderTimer = null;
    let memoryFormMessageTimer = null;

    function keepFocusedFieldVisible() {
        const target = documentRef.activeElement;
        if (!target || !shell.contains(target) || !target.matches?.('input:not([type="radio"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]')) return;
        const body = target.closest?.('.tkm-shell__body');
        if (!body) return;
        const viewport = windowRef?.visualViewport;
        const bodyRect = body.getBoundingClientRect?.();
        const fieldRect = target.getBoundingClientRect?.();
        if (!bodyRect || !fieldRect) return;
        const visibleTop = Math.max(bodyRect.top, viewport?.offsetTop ?? 0) + 12;
        const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? windowRef?.innerHeight ?? bodyRect.bottom);
        const visibleBottom = Math.min(bodyRect.bottom, viewportBottom) - 20;
        let delta = 0;
        // A tall editor cannot fit as a whole. Do not fight the user's scroll.
        if (fieldRect.height > visibleBottom - visibleTop) {
            if (fieldRect.bottom <= visibleTop) delta = fieldRect.bottom - visibleTop - 44;
            else if (fieldRect.top >= visibleBottom) delta = fieldRect.top - visibleBottom + 44;
        } else if (fieldRect.bottom > visibleBottom) delta = fieldRect.bottom - visibleBottom;
        else if (fieldRect.top < visibleTop) delta = fieldRect.top - visibleTop;
        if (!delta) return;
        if (typeof body.scrollBy === 'function') body.scrollBy({ top: delta, behavior: 'auto' });
        else body.scrollTop += delta;
    }

    function queueFocusedFieldVisibility(delay = 0) {
        if (focusScrollTimer) windowRef?.clearTimeout?.(focusScrollTimer);
        focusScrollTimer = windowRef?.setTimeout?.(() => {
            focusScrollTimer = null;
            windowRef?.requestAnimationFrame?.(keepFocusedFieldVisible) ?? keepFocusedFieldVisible();
        }, delay);
    }

    const icon = direction => direction === 'up'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>';
    const header = (pageTitle, { back = true, rootTitle = false, leading = '', actions = '' } = {}) => {
        const secondary = Boolean(router.current().returnTo);
        if (secondary && !leading && !actions) {
            return `<div class="tkm-shell__top"><header class="tkm-compact-child-header">${back ? '<button type="button" data-action="route-back" aria-label="返回上一页">‹</button>' : '<span aria-hidden="true"></span>'}<h1>${escapeHtml(pageTitle)}</h1><button type="button" class="tkm-shell__close" data-action="close" aria-label="关闭插件">${CLOSE_ICON}</button></header></div><aside class="tkm-scroll-controls" data-scroll-controls hidden aria-label="页面快捷滚动"><button type="button" data-action="scroll-top" aria-label="滚动到顶部">${icon('up')}</button><button type="button" data-action="scroll-bottom" aria-label="滚动到底部">${icon('down')}</button></aside>`;
        }
        const heading = leading || `<strong>${escapeHtml(pageTitle)}</strong>`;
        const close = `<button type="button" class="tkm-shell__close" data-action="close" aria-label="关闭插件">${CLOSE_ICON}</button>`;
        const trailing = actions ? `<div class="tkm-shell__header-actions">${actions}${close}</div>` : close;
        return `<div class="tkm-shell__top"><header class="tkm-shell__header">${heading}${trailing}</header></div><aside class="tkm-scroll-controls" data-scroll-controls hidden aria-label="页面快捷滚动"><button type="button" data-action="scroll-top" aria-label="滚动到顶部">${icon('up')}</button><button type="button" data-action="scroll-bottom" aria-label="滚动到底部">${icon('down')}</button></aside>`;
    };
    const focusedHeader = (pageTitle, formId, backLabel = '返回上一页', commitLabel = '保存', commitDisabled = false) => `<div class="tkm-shell__top tkm-focused-top"><header class="tkm-focused-header"><button type="button" data-action="route-back" aria-label="${escapeHtml(backLabel)}">‹</button><h1>${escapeHtml(pageTitle)}</h1>${formId ? `<button type="submit" form="${formId}" class="tkm-focused-save" ${commitDisabled ? 'disabled' : ''}>${escapeHtml(commitLabel)}</button>` : '<span aria-hidden="true"></span>'}</header></div><aside class="tkm-scroll-controls" data-scroll-controls hidden aria-label="页面快捷滚动"><button type="button" data-action="scroll-top" aria-label="滚动到顶部">${icon('up')}</button><button type="button" data-action="scroll-bottom" aria-label="滚动到底部">${icon('down')}</button></aside>`;
    const compactChildHeader = pageTitle => `<div class="tkm-shell__top"><header class="tkm-compact-child-header"><button type="button" data-action="route-back" aria-label="返回上一页">‹</button><h1>${escapeHtml(pageTitle)}</h1><button type="button" class="tkm-shell__close" data-action="close" aria-label="关闭插件">${CLOSE_ICON}</button></header></div><aside class="tkm-scroll-controls" data-scroll-controls hidden aria-label="页面快捷滚动"><button type="button" data-action="scroll-top" aria-label="滚动到顶部">${icon('up')}</button><button type="button" data-action="scroll-bottom" aria-label="滚动到底部">${icon('down')}</button></aside>`;
    const featureSnapshot = () => {
        let chatData = null;
        try {
            if (chatDataService.inspectCurrent().status === 'ready') chatData = chatDataService.readCurrent();
        } catch { /* Settings remain available outside a resolved chat. */ }
        return createFeatureSnapshot(getGlobalSettings(), chatData);
    };
    const nav = () => {
        const route = getRoute(router.current().routeId);
        if (route.fullScreen) return '';
        const items = DOMAIN_NAVIGATION.filter(item => isDomainEnabled(featureSnapshot(), item.id));
        return `<nav class="tkm-shell__nav" aria-label="${PRODUCT_NAME}主导航" style="--tkm-nav-item-count:${items.length}">${items.map(item => `<button type="button" data-action="nav-domain" data-domain="${item.id}" class="${route.domain === item.id ? 'active' : ''}" ${route.domain === item.id ? 'aria-current="page"' : ''}>${item.label}</button>`).join('')}</nav>`;
    };
    const workfaceSwitch = activeRoute => TIME_WORKFACE_NAVIGATION.length <= 1 ? '' : `<nav class="tkm-workface-switch" aria-label="时间页面" style="--tkm-workface-count:${TIME_WORKFACE_NAVIGATION.length}">${TIME_WORKFACE_NAVIGATION.map(item => `<button type="button" data-action="time-workface" data-route="${item.routeId}" class="${activeRoute === item.routeId ? 'active' : ''}" ${activeRoute === item.routeId ? 'aria-current="page"' : ''}>${item.label}</button>`).join('')}</nav>`;
    const discardConfirm = () => `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="keep-editing" aria-label="继续编辑"></button><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-discard-title" aria-describedby="tkm-discard-copy"><h2 id="tkm-discard-title">放弃未保存的修改？</h2><p id="tkm-discard-copy">离开后，本次尚未保存的内容不会保留。</p><footer><button type="button" data-action="keep-editing">继续编辑</button><button type="button" class="danger" data-action="confirm-discard">放弃修改</button></footer></section></div>`;
    const fastModeWarningConfirm = () => `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="cancel-fast-mode" aria-label="取消切换"></button><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-fast-mode-title" aria-describedby="tkm-fast-mode-copy"><h2 id="tkm-fast-mode-title">切换到一次生成？</h2><p id="tkm-fast-mode-copy">一次生成只调用一次，调用次数和等待步骤更少；相比两次生成，更容易遗漏内容、产生关键词越界，或出现时间、地点等字段误差。</p><footer><button type="button" data-action="cancel-fast-mode">取消</button><button type="button" data-action="confirm-fast-mode">确认使用一次生成</button></footer></section></div>`;
    const summaryReviewCancelConfirm = () => {
        const last = state.summaryReviewRemovingLast;
        const keepLabel = last ? '保留最后一条' : '继续检查';
        return `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="keep-summary-review-candidates" aria-label="${keepLabel}"></button><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-summary-review-cancel-title" aria-describedby="tkm-summary-review-cancel-copy"><h2 id="tkm-summary-review-cancel-title">${last ? '移除最后一条并取消总结？' : '取消本次总结？'}</h2><p id="tkm-summary-review-cancel-copy">${last ? '取消后返回楼层选择，本次候选不会入库。' : '这批候选将被清除，不会写入记忆库。'}</p><footer><button type="button" data-action="keep-summary-review-candidates">${keepLabel}</button><button type="button" class="danger" data-action="confirm-summary-review-cancel">取消总结</button></footer></section></div>`;
    };
    const coverageRegenerationConfirm = () => {
        const batch = state.coverageRegenerationConfirm ?? {};
        const ordinal = escapeHtml(batch.ordinal ?? '—');
        const start = escapeHtml(batch.floorRange?.[0] ?? '—');
        const end = escapeHtml(batch.floorRange?.[1] ?? '—');
        return `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="cancel-coverage-regeneration" aria-label="取消重新生成"></button><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-coverage-regeneration-title" aria-describedby="tkm-coverage-regeneration-copy"><h2 id="tkm-coverage-regeneration-title">重新生成第 ${ordinal} 批？</h2><p id="tkm-coverage-regeneration-copy">将使用当前选择的 AI 来源重新总结楼层 ${start}–${end}。生成后会先进入检查；在你确认候选前，不会替换旧结果。</p><footer><button type="button" data-action="cancel-coverage-regeneration">取消</button><button type="button" data-action="confirm-coverage-regeneration">确认重新生成</button></footer></section></div>`;
    };
    const memoryDeleteConfirm = () => `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="cancel-memory-delete" aria-label="取消删除"></button><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-memory-delete-title" aria-describedby="tkm-memory-delete-copy"><h2 id="tkm-memory-delete-title">删除这条记忆？</h2><p id="tkm-memory-delete-copy">删除后会从当前聊天的记忆库移除，且无法撤销。</p><footer><button type="button" data-action="cancel-memory-delete">取消</button><button type="button" class="danger" data-action="confirm-memory-delete">删除</button></footer></section></div>`;

    const inlineFilter = () => {
        if (!state.filterOpen) return '';
        const choices = (key, label, value, options) => `<div class="tkm-filter-choice-row"><span>${label}</span><div role="radiogroup" aria-label="${label}">${options.map(option => `<button type="button" data-action="set-filter" data-key="${key}" data-value="${option.value}" class="${value === option.value ? 'active' : ''}" role="radio" aria-checked="${value === option.value}">${option.label}</button>`).join('')}</div></div>`;
        return `<section class="tkm-inline-filter" aria-label="筛选记忆">${choices('mode', '召回方式', state.mode, [{ value: 'all', label: '全部' }, { value: 'resident', label: '常驻' }, { value: 'trigger', label: '触发' }])}${choices('fieldState', '关键词', state.fieldState, [{ value: 'all', label: '全部' }, { value: 'missing-event', label: '缺事件词' }, { value: 'missing-detail', label: '缺细节词' }, { value: 'no-new-keywords', label: '无新词' }])}</section>`;
    };

    function renderUnavailable(message = '') {
        const domain = getRoute(router.current().routeId).domain;
        const isMemoryDomain = domain === 'memory';
        const keepDomainNavigation = isMemoryDomain || domain === 'time';
        const memoryEntries = isMemoryDomain
            ? eventMemoryRecallDirectory({ includeMonitor: false })
            : '';
        shell.innerHTML = `${header('当前聊天不可用')}<main class="tkm-shell__body"><section class="tkm-empty-state"><h2>${message ? '无法读取当前聊天' : '请先打开一个聊天'}</h2><p>${escapeHtml(message || '记忆与日历属于当前聊天；聊天外不会建立临时数据。')}</p><button type="button" class="menu_button" data-action="close">返回 SillyTavern</button></section>${memoryEntries}</main>${keepDomainNavigation ? nav() : ''}`;
    }

    function renderBranchDecision(binding) {
        const skipped = Number(binding.skippedManualWithoutSourceCount) || 0;
        const sourceName = binding.sourceChatId || '原聊天';
        shell.innerHTML = `${header('处理分支记忆')}<main class="tkm-shell__body tkm-branch-decision" data-tkm-scroll><section class="tkm-branch-decision__surface" aria-labelledby="tkm-branch-decision-title"><div class="tkm-context-heading"><h1 id="tkm-branch-decision-title">检测到分支聊天</h1><p>这个聊天从「${escapeHtml(sourceName)}」分出。</p></div>${state.branchDecisionMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.branchDecisionMessage)}</p>` : ''}<p>是否把分支点以前的正式记忆复制到这个分支？完成后会建立独立记忆库，两个聊天不再同步。</p><dl class="tkm-branch-decision__summary"><div><dt>可导入记忆</dt><dd>${Number(binding.inheritedMemoryCount) || 0} 条</dd></div><div><dt>成功总结批次</dt><dd>${Number(binding.inheritedBatchCount) || 0} 批</dd></div></dl>${skipped ? `<p class="tkm-settings-note">另有 ${skipped} 条没有来源楼层的手动记忆未导入，避免把分支点以后的信息带进来。</p>` : ''}<div class="tkm-branch-decision__choices"><button type="button" class="tkm-branch-choice tkm-branch-choice--recommended" data-action="resolve-branch-import" ${state.branchDecisionBusy ? 'disabled' : ''}><span><strong>导入原聊天记忆</strong><small>建议 · 只复制分支点以前完整有效的内容</small></span><i aria-hidden="true">✓</i></button><button type="button" class="tkm-branch-choice" data-action="resolve-branch-empty" ${state.branchDecisionBusy ? 'disabled' : ''}><span><strong>建立空记忆库</strong><small>不带入原聊天的记忆和总结进度</small></span></button></div><button type="button" class="tkm-text-action tkm-branch-decision__later" data-action="defer-branch-decision" ${state.branchDecisionBusy ? 'disabled' : ''}>暂不处理</button></section></main>`;
    }

    async function renderLibrary() {
        const memories = memoryLibraryService.list({ query: state.query, mode: state.mode, fieldState: state.fieldState });
        const allMemories = memoryLibraryService.read();
        const emptyLibrary = allMemories.length === 0;
        const noResults = !emptyLibrary && memories.length === 0;
        const filterCount = countActiveMemoryFilters(state);
        const mergeSelection = memoryMergeService.inspectSelection([...state.selected]);
        const selectionActions = `<section class="tkm-selection-panel" aria-label="记忆批量操作"><div class="tkm-selection-panel__heading"><strong>已选 ${state.selected.size} 条记忆</strong><button type="button" data-action="clear-memory-selection" ${state.selected.size ? '' : 'disabled'}>清空选择</button><button type="button" data-action="toggle-multi">退出</button></div>${state.selected.size >= 2 && !mergeSelection.canMerge ? `<p class="tkm-inline-error" role="status">${escapeHtml(mergeSelection.reason)}</p>` : ''}</section>`;
        const selectionNav = `<nav class="tkm-shell__nav tkm-memory-batch-nav" aria-label="批量处理所选记忆"><button type="button" data-action="bulk-resident" ${state.selected.size ? '' : 'disabled'}>设为常驻</button><button type="button" data-action="bulk-trigger" ${state.selected.size ? '' : 'disabled'}>设为触发</button><button type="button" data-action="bulk-merge-memories" ${mergeSelection.canMerge && !state.memoryMergeBusy ? '' : 'disabled'}>合并</button><details><summary>其它操作</summary><div><button type="button" data-action="bulk-rebuild-keywords" ${state.selected.size && !state.keywordRebuildBusy ? '' : 'disabled'}>${state.keywordRebuildBusy ? '正在生成…' : '重建关键词与检索简称'}</button><button type="button" data-action="bulk-delete" class="danger" ${state.selected.size ? '' : 'disabled'}>删除所选记忆</button></div></details></nav>`;
        const searchOpen = state.memorySearchOpen || Boolean(state.query);
        const memoryTitle = '<strong class="tkm-memory-header-title">记忆</strong>';
        const search = `<form class="tkm-memory-header-search" data-tkm-form="memory-search"><input type="search" data-field="search" value="${escapeHtml(state.query)}" placeholder="搜索事件记忆" aria-label="搜索事件记忆" autofocus><button type="button" data-action="close-memory-search" aria-label="退出搜索">×</button><button type="submit" class="tkm-visually-hidden">搜索</button></form>`;
        const searchAction = `<button type="button" class="tkm-shell__header-action" data-action="open-memory-search" aria-label="搜索事件记忆">${SEARCH_ICON}</button>`;
        const controls = `<div class="tkm-memory-toolbar ${emptyLibrary ? 'tkm-memory-toolbar--empty' : ''}"><div class="tkm-view-toggle" aria-label="记忆视图"><button type="button" data-action="view-list" class="${state.libraryView === 'list' ? 'active' : ''}" ${state.libraryView === 'list' ? 'aria-pressed="true"' : 'aria-pressed="false"'}>列表</button><button type="button" data-action="view-timeline" class="${state.libraryView === 'timeline' ? 'active' : ''}" ${state.libraryView === 'timeline' ? 'aria-pressed="true"' : 'aria-pressed="false"'}>时间线</button></div><span class="tkm-memory-toolbar__spacer" aria-hidden="true"></span><div class="tkm-memory-toolbar__actions"><button type="button" data-action="open-filter" class="tkm-filter-toggle tkm-memory-icon-action ${state.filterOpen ? 'active' : ''}" aria-label="${filterCount ? `筛选记忆，已启用 ${filterCount} 项` : '筛选记忆'}" ${emptyLibrary ? 'disabled' : ''}>${FILTER_ICON}${filterCount ? `<span>${filterCount}</span>` : ''}</button><button type="button" class="tkm-memory-icon-action" data-action="toggle-multi" aria-label="多选记忆" ${emptyLibrary ? 'disabled' : ''}>${MULTI_ICON}</button><button type="button" class="tkm-memory-new" data-action="open-add-memory">添加记忆</button></div></div>`;
        shell.innerHTML = `${header('记忆', { rootTitle: true, leading: searchOpen ? search : memoryTitle, actions: searchOpen ? '' : searchAction })}<main class="tkm-shell__body tkm-memory-library" data-tkm-scroll>${state.notice ? `<p class="${state.noticeType === 'success' ? 'tkm-inline-success' : 'tkm-inline-error'}" role="${state.noticeType === 'success' ? 'status' : 'alert'}">${escapeHtml(state.notice)}</p>` : ''}<section class="tkm-memory-overview">${state.multi ? selectionActions : `${controls}${eventMemoryRecallDirectory()}${inlineFilter()}`}</section>
            ${emptyLibrary ? `<section class="tkm-empty-state tkm-memory-empty"><h2>还没有记忆</h2><p>使用上方“添加记忆”为当前聊天建立第一条记忆。</p></section>` : ''}${noResults ? `<section class="tkm-empty-state tkm-empty-state--compact"><h2>没有符合条件的记忆</h2><button type="button" class="menu_button" data-action="clear-filters">清除搜索与筛选</button></section>` : ''}${memories.length ? (state.libraryView === 'timeline' ? timelineMarkup(memories) : `<section class="tkm-memory-list">${memories.map(memory => memoryCard(memory, state.selected.has(memory.id), state.multi)).join('')}</section>`) : ''}
            </main>${state.multi ? selectionNav : nav()}${state.memoryDeletePending ? memoryDeleteConfirm() : ''}`;
        shell.querySelector('[data-tkm-scroll]').scrollTop = state.listScrollTop;
    }

    function renderCreateMemory() {
        shell.innerHTML = `${compactChildHeader('添加记忆')}<main class="tkm-shell__body tkm-memory-create" data-tkm-scroll>
            ${state.createMemoryNotice ? `<p class="tkm-inline-success" role="status">${escapeHtml(state.createMemoryNotice)}</p>` : ''}
            <p class="tkm-memory-create__context">当前聊天</p>
            <section class="tkm-memory-create__section" aria-labelledby="tkm-memory-create-methods"><h2 id="tkm-memory-create-methods">建立方式</h2><div class="tkm-memory-create__group">
                <button type="button" data-action="manual-add-memory"><span><strong>手动添加</strong><small>自己填写一条完整记忆</small></span><i aria-hidden="true">›</i></button>
                <button type="button" data-action="open-manual-summary"><span><strong>手动总结</strong><small>选择一段连续楼层，交给 AI 整理</small></span><i aria-hidden="true">›</i></button>
                <button type="button" data-action="open-auto-summary"><span><strong>自动总结</strong><small>管理当前聊天的自动总结与进度</small></span><i aria-hidden="true">›</i></button>
             </div></section>
             <section class="tkm-memory-create__section" aria-labelledby="tkm-summary-management-title">
                 <h2 id="tkm-summary-management-title">总结管理</h2>
                 <div class="tkm-memory-create__group"><button type="button" data-action="open-summary-coverage"><span><strong>总结范围</strong><small>查看当前记忆、已删除批次和未总结楼层</small></span><i aria-hidden="true">›</i></button></div>
             </section>
         </main>${nav()}`;
    }

    function renderSummaryCoverage() {
        const coverage = manualSummaryService.coverage();
        const ranges = value => escapeHtml(autoSummaryRanges(value));
        const excludedFloors = (coverage.excluded ?? []).flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, index) => start + index));
        const history = coverage.history ?? {};
        const invalidatedCount = history.invalidated?.length ?? 0;
        const missingCount = history.sourceMissing?.length ?? 0;
        const changedCount = history.sourcePolicyChanged?.length ?? 0;
        const regenerationDiagnostics = manualSummaryService.regenerationBatchOptions();
        const regenerationOptions = regenerationDiagnostics.filter(batch => batch.canRegenerate);
        const mergeBlockedCount = regenerationDiagnostics.filter(batch => !batch.canRegenerate && /合并|撤销/u.test(batch.regenerationReason ?? '')).length;
        const issueCount = invalidatedCount + missingCount + mergeBlockedCount;
        const regenerationBusy = Boolean(state.coverageRegeneratingBatchId);
        const coverageActionsBusy = state.coverageSaveBusy || regenerationBusy || state.coverageGapBusy;
        shell.innerHTML = `${focusedHeader('总结范围', null)}<main class="tkm-shell__body tkm-summary-coverage" data-tkm-scroll>
            ${state.coverageMessage ? (state.coverageMessageType === 'error'
                ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.coverageMessage)}</p>`
                : `<aside class="tkm-summary-feedback-toast tkm-summary-feedback-toast--${state.coverageMessageType === 'warning' ? 'warning' : 'success'}" role="status" aria-live="polite"><span>${escapeHtml(state.coverageMessage)}</span><button type="button" data-action="dismiss-coverage-message" aria-label="关闭提示">×</button></aside>`) : ''}
            <section class="tkm-summary-surface tkm-summary-coverage__exclude"><h2>不参与总结</h2><form data-tkm-form="summary-exclusion"><label><span>楼层</span><input type="number" min="0" step="1" inputmode="numeric" data-coverage-floor value="${escapeHtml(state.coverageFloorDraft)}" placeholder="例如 26" ${coverageActionsBusy ? 'disabled' : ''}></label><button type="submit" ${coverageActionsBusy ? 'disabled' : ''}>${state.coverageSaveBusy ? '保存中…' : '标记不参与'}</button></form>${excludedFloors.length ? `<div class="tkm-summary-coverage__excluded-list" aria-label="已标记楼层">${excludedFloors.map(floor => `<button type="button" data-action="include-summary-floor" data-floor="${floor}" ${coverageActionsBusy ? 'disabled' : ''}><span>第 ${floor} 楼</span><small>撤销</small></button>`).join('')}</div>` : '<small>还没有标记楼层。</small>'}</section>
            <section class="tkm-summary-surface tkm-summary-coverage__current"><h2>总结情况</h2><dl>
                <div><dt>已有总结</dt><dd>${ranges(coverage.summarized)}</dd></div>
                <div><dt>尚未总结</dt><dd>${ranges(coverage.summarizable)}</dd></div>
                ${coverage.retained?.length ? `<div><dt>最近保留</dt><dd>${ranges(coverage.retained)}</dd></div>` : ''}
                ${coverage.excluded?.length ? `<div><dt>不参与总结</dt><dd>${ranges(coverage.excluded)}</dd></div>` : ''}
                ${coverage.processing?.length ? `<div><dt>处理中</dt><dd>${ranges(coverage.processing)}</dd></div>` : ''}${coverage.failed?.length ? `<div><dt>处理失败</dt><dd>${ranges(coverage.failed)}</dd></div>` : ''}${coverage.skipped?.length ? `<div><dt>已跳过</dt><dd>${ranges(coverage.skipped)}</dd></div>` : ''}
            </dl></section>
            ${changedCount ? `<section class="tkm-summary-warning" role="status"><strong>来源规则已变化</strong><p>${escapeHtml(changedCount)} 个当前批次包含后来标记为“不参与总结”的楼层。可在下方重新生成；确认替换前，旧结果仍然保留。</p></section>` : ''}
            ${issueCount ? `<details class="tkm-summary-surface tkm-summary-coverage__history"><summary>批次问题 · ${escapeHtml(issueCount)} 项</summary><p>${invalidatedCount ? `已失效批次 ${escapeHtml(invalidatedCount)} 个。` : ''}${missingCount ? `另有 ${escapeHtml(missingCount)} 项来源已不在当前聊天中。` : ''}${mergeBlockedCount ? `另有 ${escapeHtml(mergeBlockedCount)} 个批次已参与记忆合并，为保护撤销关系不能在这里重做。` : ''}</p><small>这些当前批次需要单独处理。</small></details>` : ''}
            ${regenerationOptions.length ? `<section class="tkm-summary-surface tkm-summary-coverage__batches"><h2>重新生成当前批次</h2><small>重设起点后只显示新一轮批次；确认候选前不会替换旧结果。</small><div>${regenerationOptions.map(batch => `<div class="tkm-summary-batch-row" ${state.coverageRegeneratingBatchId === batch.id ? 'aria-busy="true"' : ''}><span><strong>第 ${escapeHtml(batch.ordinal ?? '—')} 批</strong><small>楼层 ${escapeHtml(batch.floorRange?.[0] ?? '—')}–${escapeHtml(batch.floorRange?.[1] ?? '—')}${batch.resultsDeleted ? ' · 记忆已删除' : ''}</small></span><button type="button" data-action="regenerate-summary-batch" data-batch-id="${escapeHtml(batch.id)}" ${coverageActionsBusy ? 'disabled' : ''}>${state.coverageRegeneratingBatchId === batch.id ? '正在生成…' : '重新生成'}</button></div>`).join('')}</div></section>` : ''}
            <div class="tkm-summary-coverage__actions"><button type="button" data-action="open-manual-summary" ${coverageActionsBusy ? 'disabled' : ''}>前往手动总结</button><button type="button" data-action="coverage-auto-settings" ${coverageActionsBusy ? 'disabled' : ''}>前往自动总结</button></div>
        </main>`;
    }

    async function runUncoveredPlan({ start = false } = {}) {
        if (state.coverageGapBusy) return;
        ensureManualSummaryChatState();
        const chatId = currentChatLabel(getContext());
        try {
            if (start) state.summaryGapPlan = { chatId, ranges: manualSummaryService.uncoveredPlan(state.summaryGapCount), index: 0 };
            const plan = state.summaryGapPlan;
            if (!plan || plan.chatId !== chatId) { state.summaryGapPlan = null; return; }
            state.coverageGapBusy = true; state.manualSummaryBusy = true;
            state.coverageMessage = '';
            await renderKeepingCalendarPosition();
            while (plan.index < plan.ranges.length) {
                if (chatId !== currentChatLabel(getContext())) { state.summaryGapPlan = null; return; }
                const [startFloor, endFloor] = plan.ranges[plan.index];
                const result = await manualSummaryService.start({ startFloor, endFloor, uncoveredOnly: true });
                if (chatId !== currentChatLabel(getContext())) { state.summaryGapPlan = null; return; }
                if (result.pending) {
                    plan.taskId = result.pending.taskId;
                    state.summaryReviewDraft = createSummaryReviewDraft(result.pending);
                    state.summaryReviewMessage = `分批总结：第 ${plan.index + 1}/${plan.ranges.length} 批`;
                    dirty.setBaseline('summary-review', state.summaryReviewDraft);
                    router.go('memory.summary.review', { returnTo: 'memory.summary.coverage' });
                    return;
                }
                if (result.status !== 'completed') throw new Error('本批未入库，后续批次未执行。');
                plan.index++;
            }
            state.summaryGapPlan = null; router.reset('memory.summary.coverage');
            state.coverageMessage = '本轮分批总结已完成。'; state.coverageMessageType = 'success';
            if (coverageMessageTimer) windowRef?.clearTimeout?.(coverageMessageTimer);
            coverageMessageTimer = windowRef?.setTimeout?.(() => { state.coverageMessage = ''; if (router.current().routeId === 'memory.summary.coverage') renderKeepingCalendarPosition(); }, 2000);
        } catch (error) {
            state.summaryGapPlan = null;
            if (chatId === currentChatLabel(getContext())) { router.reset('memory.summary.coverage'); state.coverageMessage = error?.message || '本批失败，已入库结果保留，后续批次未执行。'; state.coverageMessageType = 'error'; }
        } finally {
            state.coverageGapBusy = false; state.manualSummaryBusy = false;
            await renderKeepingCalendarPosition();
        }
    }

    async function updateSummaryExclusion(action, floor) {
        if (state.coverageSaveBusy || state.coverageRegeneratingBatchId) return;
        const floorText = String(floor ?? '').trim();
        const floorNumber = /^\d+$/.test(floorText) ? Number(floorText) : null;
        if (!Number.isSafeInteger(floorNumber)) {
            state.coverageMessage = '请填写有效楼层号。';
            state.coverageMessageType = 'error';
            await renderKeepingCalendarPosition();
            return;
        }
        if (coverageMessageTimer) windowRef?.clearTimeout?.(coverageMessageTimer);
        coverageMessageTimer = null;
        state.coverageSaveBusy = true;
        state.coverageMessage = '';
        await renderKeepingCalendarPosition();
        try {
            const result = action === 'exclude'
                ? await manualSummaryService.excludeFloor(floorNumber)
                : await manualSummaryService.includeFloor(floorNumber);
            state.coverageFloorDraft = '';
            const affected = result.affectedBatchIds?.length ?? 0;
            state.coverageMessage = affected
                ? `已${action === 'exclude' ? '标记' : '撤销'}第 ${result.record?.floor ?? floorNumber} 楼；${affected} 个已完成批次仍保留旧结果，暂不自动重新生成。`
                : `已${action === 'exclude' ? '标记' : '撤销'}第 ${result.record?.floor ?? floorNumber} 楼。`;
            state.coverageMessageType = affected ? 'warning' : 'success';
        } catch (error) {
            state.coverageMessage = error?.message || '楼层标记保存失败。';
            state.coverageMessageType = 'error';
        } finally {
            state.coverageSaveBusy = false;
            await renderKeepingCalendarPosition();
        }
        if (!['success', 'warning'].includes(state.coverageMessageType)) return;
        const message = state.coverageMessage;
        const delay = state.coverageMessageType === 'warning' ? 4000 : 2000;
        coverageMessageTimer = windowRef?.setTimeout?.(() => {
            coverageMessageTimer = null;
            if (state.coverageMessage !== message) return;
            state.coverageMessage = '';
            if (router.current().routeId === 'memory.summary.coverage') renderKeepingCalendarPosition();
        }, delay);
    }

    function loadAutoSummaryDraft() {
        state.autoResetStart = undefined;
        state.autoResetConfirmed = false;
        state.autoSummaryDraft = createAutoSummaryDraft(manualSummaryService.autoState());
        state.autoSummaryChatId = currentChatLabel(getContext());
        state.autoSummaryMessage = '';
        state.autoSummaryBacklog = false;
        dirty.setBaseline('auto-summary', state.autoSummaryDraft);
    }

    function renderAutoSummary() {
        if (!state.autoSummaryDraft || state.autoSummaryChatId !== currentChatLabel(getContext())) loadAutoSummaryDraft();
        const snapshot = manualSummaryService.autoState();
        const draft = state.autoSummaryDraft;
        const pending = snapshot.pendingAuto;
        const backfill = snapshot.backfill?.chatId === snapshot.chatId ? snapshot.backfill : null;
        const backfillRunning = ['running', 'pause-requested'].includes(backfill?.status);
        const busy = state.autoSummaryBusy || pending?.status === 'running' || backfillRunning;
        const locked = snapshot.auto?.initialized || snapshot.progress?.lastProcessedFloor != null || Boolean(pending);
        const plan = snapshot.backfillPlan ?? {};
        const ranges = value => escapeHtml(autoSummaryRanges(value));
        const observationTime = snapshot.recentObservation?.at
            ? new Date(snapshot.recentObservation.at).toLocaleString('zh-CN', { hour12: false }) : '';
        shell.innerHTML = `${focusedHeader('自动总结', 'tkm-auto-summary-form')}<main class="tkm-shell__body tkm-auto-summary" data-tkm-scroll>
            <form id="tkm-auto-summary-form" data-tkm-form="auto-summary" novalidate>
                <section class="tkm-summary-surface tkm-auto-summary-settings">
                    <label class="tkm-summary-user-toggle"><input type="checkbox" data-auto-summary-field="enabled" ${draft.enabled ? 'checked' : ''}><span><strong>启用自动总结</strong></span></label>

                    <div class="tkm-auto-summary-fields"><label><span>每批楼层数</span><input type="number" min="1" step="1" inputmode="numeric" data-auto-summary-field="batchSize" value="${escapeHtml(draft.batchSize)}"></label><label><span>最近保留楼层数</span><input type="number" min="0" step="1" inputmode="numeric" data-auto-summary-field="retainedFloors" value="${escapeHtml(draft.retainedFloors)}"></label></div>
                    ${locked ? `<p class="tkm-settings-note">首次起点：第 ${escapeHtml(snapshot.progress?.startFloor ?? 0)} 楼</p><details class="tkm-auto-summary-reset"><summary>重设起点</summary><label><span>新的起始楼层</span><input type="number" min="0" step="1" inputmode="numeric" data-auto-reset-start value="${escapeHtml(state.autoResetStart ?? snapshot.progress?.startFloor ?? 0)}"></label><button type="button" data-action="reset-auto-summary-start" ${busy || pending ? 'disabled' : ''}>重设起点</button></details>` : `<label class="tkm-auto-summary-start"><span>首次起始楼层</span><input type="number" min="0" step="1" inputmode="numeric" data-auto-summary-field="startFloor" value="${escapeHtml(draft.startFloor)}"></label>`}
                    <label class="tkm-summary-user-toggle"><input type="checkbox" data-auto-summary-field="hideSummarizedFloors" ${draft.hideSummarizedFloors ? 'checked' : ''}><span><strong>总结成功后隐藏来源楼层</strong><small>只隐藏模型上下文，不删除原文</small></span></label>
                </section>
                ${state.autoSummaryMessage ? (state.autoSummaryMessageType === 'success' ? `<aside class="tkm-summary-feedback-toast tkm-summary-feedback-toast--success" role="status" aria-live="polite"><span>${escapeHtml(state.autoSummaryMessage)}</span><button type="button" data-action="dismiss-auto-summary-message" aria-label="关闭提示">×</button></aside>` : `<p class="tkm-inline-error" role="alert">${escapeHtml(state.autoSummaryMessage)}</p>`) : ''}
            </form>
                ${plan.pendingFloors ? `<section class="tkm-auto-summary-backlog"><h2>待总结楼层</h2><dl><div><dt>可处理</dt><dd>${escapeHtml(plan.pendingFloors)} 楼</dd></div><div><dt>完整批次</dt><dd>${escapeHtml(plan.fullBatchCount)} 批</dd></div>${plan.range ? `<div><dt>范围</dt><dd>${ranges([plan.range])}</dd></div>` : ''}</dl>${plan.remainder ? `<p class="tkm-auto-summary-tail">待凑批：${escapeHtml(plan.remainder)} 楼</p>` : ''}</section>` : ''}
            <section class="tkm-summary-surface tkm-auto-summary-start-action"><button type="button" class="tkm-summary-primary" data-action="start-auto-summary-backfill" ${busy || pending ? 'disabled' : ''}>开始总结</button></section>
            ${backfill ? `<section class="tkm-summary-surface tkm-auto-summary-backfill" aria-live="polite"><h2>本轮补录</h2><p>${escapeHtml(autoSummaryBackfillCopy(backfill))}</p>${backfill.lastError ? `<p class="tkm-inline-error" role="alert">${escapeHtml(backfill.lastError.message ?? backfill.lastError)}</p>` : ''}${backfillRunning ? `<button type="button" data-action="pause-auto-summary-backfill" ${backfill.status === 'pause-requested' ? 'disabled' : ''}>${backfill.status === 'pause-requested' ? '将在本批完成后暂停' : '完成本批后暂停'}</button>` : ''}</section>` : ''}
            <details class="tkm-auto-summary-details" ${state.autoSummaryDetailsOpen ? 'open' : ''}><summary>查看进度详情</summary><div class="tkm-auto-summary-details__content">
            <section class="tkm-summary-surface tkm-auto-summary-observation"><h2>最近检查</h2><p>${escapeHtml(autoSummaryObservation(snapshot.recentObservation))}</p>${observationTime ? `<time datetime="${escapeHtml(snapshot.recentObservation.at)}">${escapeHtml(observationTime)}</time>` : ''}</section>
            <section class="tkm-summary-surface tkm-auto-summary-progress"><h2>当前进度</h2><dl><div><dt>本轮起点</dt><dd>第 ${escapeHtml(snapshot.progress?.startFloor ?? 0)} 楼</dd></div><div><dt>已处理到</dt><dd>${snapshot.progress?.lastProcessedFloor == null ? '尚未处理' : `第 ${escapeHtml(snapshot.progress.lastProcessedFloor)} 楼`}</dd></div><div><dt>计划下一批</dt><dd>${ranges(snapshot.plannedRange ? [snapshot.plannedRange] : [])}</dd></div><div><dt>本轮已处理</dt><dd>${ranges(snapshot.processedRanges)}</dd></div><div><dt>保留区</dt><dd>${ranges(snapshot.retainedRange ? [snapshot.retainedRange] : [])}</dd></div></dl></section>
            </div></details>
            ${pending ? `<section class="tkm-summary-surface tkm-auto-summary-pending"><h2>${escapeHtml(autoSummaryStatus(snapshot))}</h2><dl><div><dt>当前任务</dt><dd>楼层 ${ranges(pending.floorRange ? [pending.floorRange] : [])}</dd></div>${pending.stage ? `<div><dt>当前阶段</dt><dd>${escapeHtml(autoSummaryStage(pending.stage))}</dd></div>` : ''}</dl>${pending.error ? `<p class="tkm-inline-error" role="alert">${escapeHtml(pending.error.message ?? pending.error)}</p>` : ''}<p class="tkm-settings-note">${pending.status === 'interrupted' ? '请手动重试这一批。' : snapshot.auto?.enabled ? '失败批次会在下一次正常回复后重试，成功前不建立后续批次。' : '自动重试已停止；仍可手动重试或跳过。'}</p><div class="tkm-auto-summary-actions"><button type="button" data-action="retry-auto-summary" ${busy ? 'disabled' : ''}>重试本批</button><button type="button" class="danger" data-action="skip-auto-summary" ${busy ? 'disabled' : ''}>跳过这个批次</button></div></section>` : '<p class="tkm-settings-note">没有待处理批次。</p>'}
            ${snapshot.lastResult ? `<p class="tkm-settings-note">${escapeHtml(autoSummaryLastResult(snapshot.lastResult))}</p>` : ''}
        </main>`;
        shell.querySelectorAll('.tkm-focused-save, [data-auto-summary-field]').forEach(button => { button.disabled = state.autoSummaryBusy || (button.classList.contains('tkm-focused-save') && busy); });
        if (backfillRunning) shell.querySelectorAll('[data-auto-summary-field], [data-tkm-form="auto-summary"] button[type="submit"]').forEach(control => { control.disabled = true; });
    }

    async function saveAutoSummary({ startFromRecent = false } = {}) {
        if (state.autoSummaryBusy) return;
        const chatId = currentChatLabel(getContext());
        state.autoSummaryBusy = true;
        state.autoSummaryMessage = '';
        await renderKeepingCalendarPosition();
        try {
            await manualSummaryService.configureAuto({ ...state.autoSummaryDraft, ...(startFromRecent ? { startFromRecent: true, enabled: true } : {}) });
            if (chatId !== currentChatLabel(getContext())) return;
            loadAutoSummaryDraft();
            state.autoSummaryMessage = '自动总结设置已保存。';
            state.autoSummaryMessageType = 'success';
            if (autoSummaryMessageTimer) windowRef?.clearTimeout?.(autoSummaryMessageTimer);
            autoSummaryMessageTimer = windowRef?.setTimeout?.(() => {
                if (state.autoSummaryMessageType !== 'success') return;
                state.autoSummaryMessage = '';
                if (router.current().routeId === 'memory.summary.auto') renderKeepingCalendarPosition();
            }, 2000);
        } catch (error) {
            if (chatId !== currentChatLabel(getContext())) return;
            state.autoSummaryBacklog = error?.code === 'auto_backlog_choice_required';
            state.autoSummaryMessage = state.autoSummaryBacklog ? '请选择从最近保留区开始，或返回继续整理旧楼。' : error?.message || '设置保存失败，修改已保留。';
            state.autoSummaryMessageType = 'error';
        } finally {
            state.autoSummaryBusy = false;
            await renderKeepingCalendarPosition();
        }
    }

    async function runAutoSummaryAction(action) {
        if (state.autoSummaryBusy) return;
        const snapshot = manualSummaryService.autoState();
        if (!snapshot.pendingAuto || snapshot.pendingAuto.status === 'running') return;
        const chatId = currentChatLabel(getContext());
        if (action === 'skip') {
            if (autoSummarySkipGate.isPending()) return;
            state.autoSummarySkipSnapshot = snapshot;
            const answer = autoSummarySkipGate.request();
            await renderKeepingCalendarPosition();
            if (!await answer || chatId !== currentChatLabel(getContext())) return;
            if (manualSummaryService.autoState().pendingAuto?.taskId !== snapshot.pendingAuto.taskId) {
                state.autoSummaryMessage = '待处理批次已变化，请重新查看后操作。';
                state.autoSummaryMessageType = 'error';
                await renderKeepingCalendarPosition();
                return;
            }
        }
        state.autoSummaryBusy = true;
        state.autoSummaryMessage = '';
        await renderKeepingCalendarPosition();
        try {
            if (action === 'skip') await manualSummaryService.skipAutomatic({ confirmed: true });
            else await manualSummaryService.retryAutomatic();
        } catch (error) {
            if (chatId === currentChatLabel(getContext())) {
                state.autoSummaryMessage = error?.message || '操作失败，待处理批次已保留。';
                state.autoSummaryMessageType = 'error';
            }
        } finally {
            state.autoSummaryBusy = false;
            await renderKeepingCalendarPosition();
        }
    }

    async function runAutoSummaryBackfill() {
        if (state.autoSummaryBusy) return;
        const snapshot = manualSummaryService.autoState();
        if (snapshot.pendingAuto || ['running', 'pause-requested'].includes(snapshot.backfill?.status)) return;
        const chatId = currentChatLabel(getContext());
        state.autoSummaryBusy = true;
        state.autoSummaryMessage = '';
        await renderKeepingCalendarPosition();
        try {
            await manualSummaryService.configureAuto({ ...state.autoSummaryDraft, enabled: true, startBackfill: true });
            if (chatId !== currentChatLabel(getContext())) return;
            loadAutoSummaryDraft();
            state.autoSummaryBusy = false;
            if (!manualSummaryService.autoState().backfillPlan?.fullBatchCount) {
                state.autoSummaryMessage = '自动总结已启用，等待后续正常 AI 回复积累完整批次。';
                state.autoSummaryMessageType = 'success';
                return;
            }
            await renderKeepingCalendarPosition();
            const result = await manualSummaryService.startBackfill();
            if (chatId !== currentChatLabel(getContext())) return;
            state.autoSummaryMessage = result.status === 'completed' ? '本轮可处理的完整批次已完成。'
                : result.status === 'paused' ? '补录已按要求在本批完成后暂停。'
                    : result.lastError?.message || '补录已停止，待处理批次已保留。';
            state.autoSummaryMessageType = ['completed', 'paused'].includes(result.status) ? 'success' : 'error';
        } catch (error) {
            if (chatId === currentChatLabel(getContext())) {
                state.autoSummaryMessage = error?.message || '补录未开始。';
                state.autoSummaryMessageType = 'error';
            }
        } finally {
            state.autoSummaryBusy = false;
            if (state.autoSummaryMessageType === 'success' && state.autoSummaryMessage) {
                if (autoSummaryMessageTimer) windowRef?.clearTimeout?.(autoSummaryMessageTimer);
                autoSummaryMessageTimer = windowRef?.setTimeout?.(() => {
                    if (state.autoSummaryMessageType !== 'success') return;
                    state.autoSummaryMessage = '';
                    if (router.current().routeId === 'memory.summary.auto') renderKeepingCalendarPosition();
                }, 2000);
            }
            await renderKeepingCalendarPosition();
        }
    }

    function manualSummaryRequest() {
        return {
            startFloor: state.manualSummaryDraft.startFloor,
            endFloor: state.manualSummaryDraft.endFloor,
            skipUserMessages: !state.manualSummaryDraft.includeUserMessages,
        };
    }

    function manualSummaryRangeReady() {
        const start = String(state.manualSummaryDraft.startFloor ?? '').trim();
        const end = String(state.manualSummaryDraft.endFloor ?? '').trim();
        return /^\d+$/.test(start) && /^\d+$/.test(end) && Number(end) >= Number(start);
    }

    function syncManualSummaryRangeUi() {
        const ready = manualSummaryRangeReady();
        const blocked = !ready || state.manualSummaryBusy || Boolean(manualSummaryService.pendingReview()) || !manualSummaryService.providerState().available;
        const preflight = shell.querySelector('.tkm-summary-preflight');
        if (preflight) preflight.hidden = !ready;
        shell.querySelectorAll('.tkm-summary-primary, .tkm-focused-save').forEach(button => { button.disabled = blocked; });
    }

    function previewMessagesMarkup(preview) {
        if (!preview) return '';
        const floors = (preview.sourceFloors ?? []).map(floor => `<article class="tkm-summary-preview-floor"><header><strong>#${escapeHtml(floor.floor)} · ${escapeHtml(floor.speaker)}</strong></header><p>${escapeHtml(floor.content)}</p></article>`).join('');
        const promptPartsMarkup = parts => (parts ?? []).map((part, index) => `<details class="tkm-summary-preview-message"><summary><span>${escapeHtml(part.name || `提示词 ${index + 1}`)}</span><small>${escapeHtml(String(part.role).toUpperCase())}${part.fixed ? ' · 插件内容' : ' · 用户设置'}</small><i aria-hidden="true"></i></summary><pre>${escapeHtml(part.content)}</pre></details>`).join('');
        const promptParts = preview.promptParts ?? preview.messages.map((message, index) => ({
            id: `message-${index + 1}`, name: `提示词 ${index + 1}`, role: message.role, content: message.content, fixed: message.protected,
        }));
        const secondParts = preview.secondPromptParts ?? [];
        const thirdParts = preview.thirdPromptParts ?? [];
        const open = state.manualSummaryPreviewOpen;
        return `<section class="tkm-summary-preview"><button type="button" class="tkm-summary-preview-toggle" data-action="toggle-manual-summary-preview" aria-expanded="${Boolean(open)}" aria-controls="tkm-summary-preview-content"><span>总结内容预览</span><span>${open ? '收起' : '展开'}</span><i aria-hidden="true"></i></button><div id="tkm-summary-preview-content" ${open ? '' : 'hidden'}>${open ? `<details class="tkm-summary-preview-source" open><summary><span>将总结的聊天正文</span><button type="button" class="tkm-inline-link tkm-summary-cleaning-shortcut" data-action="go-route" data-route="settings.summary.cleaning">总结清洗 ›</button><small>${preview.sourceFloors?.length ?? 0} 个楼层</small><i aria-hidden="true"></i></summary><div>${floors}</div></details><section class="tkm-summary-preview-prompts"><header><div><strong>${preview.stages > 1 ? '第一次调用的提示词结构' : '本次调用的提示词结构'}</strong><small>${promptParts.length} 个模块${preview.promptTransportMode === 'text' ? ' · 发送时合并为单条文本' : ''}</small></div><span><button type="button" data-action="collapse-all-preview-prompts">全部折叠</button><button type="button" data-action="expand-all-preview-prompts">全部展开</button></span></header>${promptPartsMarkup(promptParts)}</section>${secondParts.length ? `<section class="tkm-summary-preview-prompts" data-summary-preview-stage="second"><header><div><strong>第二次调用的提示词结构</strong><small>${secondParts.length} 个模块 · 生成后自动调用</small></div></header>${promptPartsMarkup(secondParts)}</section>` : ''}${thirdParts.length ? `<section class="tkm-summary-preview-prompts" data-summary-preview-stage="third"><header><div><strong>第三次调用的提示词结构</strong><small>${thirdParts.length} 个模块 · 关键词生成后自动调用</small></div></header>${promptPartsMarkup(thirdParts)}</section>` : ''}<button type="button" data-action="collapse-manual-summary-preview">收起总结内容预览</button>` : ''}</div></section>`;
    }

    async function renderKeepingManualSummaryPosition({ focusPreview = false } = {}) {
        const scrollTop = shell.querySelector('.tkm-manual-summary')?.scrollTop ?? 0;
        await render();
        const body = shell.querySelector('.tkm-manual-summary');
        if (!body) return;
        body.scrollTop = scrollTop;
        if (focusPreview) {
            const toggle = body.querySelector('[data-action="toggle-manual-summary-preview"]');
            toggle?.focus({ preventScroll: true });
            toggle?.scrollIntoView({ block: 'nearest' });
        }
        updateScrollControls();
    }

    async function renderKeepingEventLibraryPosition(targetSelector = '') {
        const scrollTop = shell.querySelector('.tkm-event-library-editor')?.scrollTop ?? 0;
        await render();
        const body = shell.querySelector('.tkm-event-library-editor');
        if (!body) return;
        body.scrollTop = scrollTop;
        if (targetSelector) body.querySelector(targetSelector)?.scrollIntoView?.({ block: 'nearest' });
        updateScrollControls();
    }

    function revealEventLibraryReorderFeedback(action, selector) {
        const feedback = state.eventLibraryReorderFeedback;
        if (!feedback) return;
        const row = shell.querySelector(selector);
        const live = shell.querySelector('[data-event-library-reorder-status]');
        const reducedMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        row?.classList.add('tkm-event-library-item--moved');
        if (live) live.textContent = `已移至第 ${feedback.position} 条`;
        row?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
        const focusTarget = row?.querySelector(`[data-action="${action}"]:not(:disabled)`)
            ?? row?.querySelector('[data-action="move-event-library-up"]:not(:disabled), [data-action="move-event-library-down"]:not(:disabled)');
        focusTarget?.focus?.({ preventScroll: true });
        if (eventLibraryReorderTimer) windowRef?.clearTimeout?.(eventLibraryReorderTimer);
        eventLibraryReorderTimer = windowRef?.setTimeout?.(() => {
            row?.classList.remove('tkm-event-library-item--moved');
            if (live) live.textContent = '';
            state.eventLibraryReorderFeedback = null;
            eventLibraryReorderTimer = null;
        }, 1600);
    }

    function ensureManualSummaryChatState() {
        const chatId = currentChatLabel(getContext());
        if (state.manualSummaryChatId === chatId) return;
        const manualRun = manualSummaryService.manualState?.() ?? { status: 'idle' };
        state.summaryGapPlan = null;
        state.summaryGapCount = undefined;
        state.manualSummaryChatId = chatId;
        state.manualSummaryDraft = createManualSummaryDraft();
        if (['failed', 'interrupted'].includes(manualRun.status) && Array.isArray(manualRun.requestedRange)) {
            state.manualSummaryDraft.startFloor = String(manualRun.requestedRange[0]);
            state.manualSummaryDraft.endFloor = String(manualRun.requestedRange[1]);
        }
        state.manualSummaryPreview = null;
        state.manualSummaryPreviewOpen = false;
        state.manualSummaryMessage = ['failed', 'interrupted'].includes(manualRun.status)
            ? manualRun.error?.message ?? '上次手动总结未完成，可保留原楼层范围重试。' : '';
        state.manualSummaryMessageType = state.manualSummaryMessage ? 'error' : '';
        state.manualSummaryBusy = manualRun.status === 'running';
        state.manualSummaryDuplicateConfirmed = false;
        state.summaryReviewDraft = null;
        state.summaryReviewMessage = '';
        dirty.setBaseline('manual-summary', state.manualSummaryDraft);
    }

    function renderManualSummary() {
        ensureManualSummaryChatState();
        state.manualSummaryBusy = manualSummaryService.runtimeState?.().status === 'running';
        const provider = manualSummaryService.providerState();
        const available = provider.available === true;
        const pending = manualSummaryService.pendingReview();
        const preview = state.manualSummaryPreview;
        const duplicate = preview?.warnings?.some(item => item.code === 'duplicate_floor_range');
        const adjusted = preview?.endAdjusted
            ? `<p class="tkm-summary-notice">结束楼是用户消息，本次实际总结到第 ${escapeHtml(preview.floorRange?.[1])} 楼。</p>`
            : '';
        const rangeReady = manualSummaryRangeReady();
        const startDisabled = !available || !rangeReady || state.manualSummaryBusy || pending;
        shell.innerHTML = `${focusedHeader('手动总结', null, '返回上一页')}<main class="tkm-shell__body tkm-focused-task tkm-manual-summary" data-tkm-scroll>
            ${pending ? `<section class="tkm-summary-pending"><strong>有一批总结等待检查</strong><p>楼层 ${escapeHtml(pending.floorRange?.[0])}–${escapeHtml(pending.floorRange?.[1])} 的候选已保留。</p><button type="button" data-action="continue-summary-review">继续检查</button></section>` : ''}
            <form id="tkm-manual-summary-form" class="tkm-summary-range-form" data-tkm-form="manual-summary" novalidate>
                ${state.manualSummaryMessage ? (state.manualSummaryMessageType === 'success' ? `<aside class="tkm-summary-feedback-toast" role="status">${escapeHtml(state.manualSummaryMessage)}</aside>` : `<p class="tkm-inline-error" role="alert">${escapeHtml(state.manualSummaryMessage)}</p>`) : ''}
                <section class="tkm-summary-surface" aria-labelledby="tkm-summary-range-title"><h2 id="tkm-summary-range-title">楼层范围</h2><div class="tkm-summary-floor-range"><label><span>开始楼</span><input type="number" inputmode="numeric" min="0" step="1" data-summary-field="startFloor" value="${escapeHtml(state.manualSummaryDraft.startFloor)}"></label><i aria-hidden="true">—</i><label><span>结束楼</span><input type="number" inputmode="numeric" min="0" step="1" data-summary-field="endFloor" value="${escapeHtml(state.manualSummaryDraft.endFloor)}"></label></div>
                <label class="tkm-summary-user-toggle"><input type="checkbox" data-summary-field="includeUserMessages" ${state.manualSummaryDraft.includeUserMessages ? 'checked' : ''}><span><strong>包含用户消息</strong><small>关闭后仍保留楼层边界，只不把用户正文发给 AI</small></span></label>${adjusted}</section>
                <section class="tkm-summary-provider ${available ? 'is-ready' : 'is-paused'}"><div><strong>AI 来源</strong><small>${escapeHtml(summaryProviderCopy(provider))}</small></div>${available ? '<span>可用</span>' : '<button type="button" data-action="go-summary-api-settings">前往 API 设置 ›</button>'}</section>
                ${duplicate && state.manualSummaryDuplicateConfirmed ? `<section class="tkm-summary-warning" role="alert"><strong>这段楼层已经总结过</strong><p>再次生成会先保留现有记忆；确认新候选入库后，再替换这一批旧结果。</p></section>` : ''}
                <div class="tkm-summary-preflight" ${rangeReady ? '' : 'hidden'}><button type="button" data-action="preview-manual-summary" ${state.manualSummaryBusy ? 'disabled' : ''}>${preview ? '刷新总结内容预览' : '预览总结内容'}</button></div>
                ${previewMessagesMarkup(preview)}
                <div class="tkm-summary-execution-actions"><button type="submit" class="tkm-summary-primary" ${startDisabled ? 'disabled' : ''}>${state.manualSummaryBusy ? '总结中…' : '开始总结'}</button><button type="button" class="tkm-inline-link" data-action="open-summary-settings-from-manual" aria-label="事件总结设置" ${state.manualSummaryBusy ? 'disabled' : ''}>事件总结设置</button></div>
            </form>
        </main>`;
    }

    function summarySpecialDatesMarkup(items) {
        if (!items?.length) return '<p class="tkm-summary-empty-meta">没有纪念日候选。</p>';
        return `<ul class="tkm-summary-special-dates">${items.map(item => `<li><strong>${escapeHtml(item.name)}</strong><time>${escapeHtml(item.storyDate)}</time>${item.reason ? `<p>${escapeHtml(item.reason)}</p>` : ''}</li>`).join('')}</ul>`;
    }

    function syncSummaryReviewUi(draft) {
        const taskChanged = state.summaryReviewTaskId !== draft?.taskId;
        if (taskChanged) {
            state.summaryReviewTaskId = draft?.taskId ?? null;
            state.summaryReviewCollapsedIds = new Set();
            state.summaryReviewEditing = null;
            state.summaryDetailAliasOpenParents = new Set();
        }
        const validIds = new Set((draft?.candidates ?? []).map(candidate => candidate.draftId));
        state.summaryReviewCollapsedIds = new Set([...state.summaryReviewCollapsedIds].filter(id => validIds.has(id)));
        if (state.summaryReviewEditing && !validIds.has(state.summaryReviewEditing.draftId)) state.summaryReviewEditing = null;
    }

    function resetSummaryReviewUi() {
        state.summaryReviewTaskId = null;
        state.summaryReviewCollapsedIds = new Set();
        state.summaryReviewEditing = null;
        state.summaryDetailAliasOpenParents = new Set();
    }

    function summaryReviewAnchor(preferredDraftId = '') {
        const body = shell.querySelector('.tkm-summary-review');
        if (!body) return { scrollTop: 0, draftId: preferredDraftId, offset: null };
        const bodyRect = body.getBoundingClientRect?.();
        const candidates = [...shell.querySelectorAll('[data-summary-candidate-id]')];
        let target = preferredDraftId
            ? candidates.find(item => item.dataset.summaryCandidateId === preferredDraftId)
            : null;
        if (!target && body.scrollTop > 0 && bodyRect) {
            target = candidates.find(item => item.getBoundingClientRect().bottom > bodyRect.top + 12) ?? null;
        }
        return {
            scrollTop: body.scrollTop,
            draftId: target?.dataset.summaryCandidateId ?? preferredDraftId,
            offset: target && bodyRect ? target.getBoundingClientRect().top - bodyRect.top : null,
        };
    }

    async function renderKeepingSummaryReviewPosition(anchor = summaryReviewAnchor()) {
        await render();
        const body = shell.querySelector('.tkm-summary-review');
        if (!body) return;
        const settle = () => {
            body.scrollTop = Math.min(anchor.scrollTop ?? 0, Math.max(0, body.scrollHeight - body.clientHeight));
            const target = anchor.draftId
                ? [...shell.querySelectorAll('[data-summary-candidate-id]')].find(item => item.dataset.summaryCandidateId === anchor.draftId)
                : null;
            if (target && anchor.offset !== null) {
                const bodyRect = body.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                body.scrollTop += targetRect.top - bodyRect.top - anchor.offset;
                body.scrollTop = Math.min(body.scrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
            }
            updateScrollControls();
        };
        windowRef?.requestAnimationFrame?.(settle) ?? settle();
    }

    function summaryReviewValue(value) {
        const items = Array.isArray(value) ? value : [];
        return items.length ? items.map(escapeHtml).join('、') : '未填写';
    }

    function summaryCandidateTagEditor(edit, { field, label }) {
        const items = Array.isArray(edit.candidate[field]) ? edit.candidate[field] : [];
        const pending = edit.entries?.[field] ?? '';
        const tags = field === 'detailKeywords'
            ? items.map((item, index) => canEditDetailAliases(item) ? detailAliasBindingMarkup({
                parentDetail: item,
                aliases: aliasesForDetail(edit.candidate.detailAliases, items, item),
                pending: edit.aliasEntries?.[item] ?? '',
                error: edit.aliasErrors?.[item] ?? '',
                open: state.summaryDetailAliasOpenParents.has(item),
                scope: 'summary',
                index,
                draftId: edit.draftId,
            }) : `<span class="tkm-memory-editor-tag">${escapeHtml(item)}<button type="button" data-action="remove-summary-candidate-tag" data-field="${field}" data-index="${index}" data-draft-id="${escapeHtml(edit.draftId)}" aria-label="删除${escapeHtml(label)} ${escapeHtml(item)}">×</button></span>`).join('')
            : items.map((item, index) => `<span class="tkm-memory-editor-tag">${escapeHtml(item)}<button type="button" data-action="remove-summary-candidate-tag" data-field="${field}" data-index="${index}" data-draft-id="${escapeHtml(edit.draftId)}" aria-label="删除${escapeHtml(label)} ${escapeHtml(item)}">×</button></span>`).join('');
        return `<div class="tkm-memory-tag-editor"><div class="tkm-memory-field-label"><span>${escapeHtml(label)}</span></div>${tags ? `<div class="tkm-memory-editor-tags">${tags}</div>` : ''}<div class="tkm-memory-tag-entry"><input type="text" data-summary-candidate-entry-field="${field}" data-draft-id="${escapeHtml(edit.draftId)}" value="${escapeHtml(pending)}" placeholder="输入一项${escapeHtml(label)}" aria-label="添加${escapeHtml(label)}"><button type="button" data-action="commit-summary-candidate-tag" data-field="${field}" data-draft-id="${escapeHtml(edit.draftId)}" ${pending.trim() ? '' : 'hidden'} aria-label="确认添加${escapeHtml(label)}">添加</button></div></div>`;
    }

    function summaryDetailAliasFacts(candidate) {
        const bindings = reconcileDetailAliases(candidate.detailAliases, candidate.detailKeywords);
        if (!bindings.length) return '';
        return `<div class="tkm-summary-detail-aliases"><span>检索简称</span><div>${bindings.map(binding => `<p><b>${escapeHtml(binding.parentDetail)}</b><i aria-hidden="true">→</i>${binding.aliases.map(escapeHtml).join('、')}</p>`).join('')}</div></div>`;
    }

    function summaryReviewCandidateMarkup(candidate, index, draft) {
        const id = candidate.draftId;
        const editing = state.summaryReviewEditing?.draftId === id;
        const collapsed = state.summaryReviewCollapsedIds.has(id) && !editing;
        const status = summaryReviewCandidateStatus(candidate);
        const title = candidate.title || candidate.body.slice(0, 10) || '未命名记忆';
        const range = `${draft.floorRange[0]}–${draft.floorRange[1]}`;
        const time = candidate.storyTime.end && candidate.storyTime.end !== candidate.storyTime.start
            ? `${candidate.storyTime.start} → ${candidate.storyTime.end}`
            : candidate.storyTime.start || '未填写';
        const editCandidate = editing ? state.summaryReviewEditing.candidate : null;
        const legacyFields = candidate.primaryKeywords.length || candidate.auxiliaryKeywords.length;
        const legacyInputs = editing && legacyFields
            ? `${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'primaryKeywords', label: '旧版主关键词（兼容）' })}${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'auxiliaryKeywords', label: '旧版辅助关键词（兼容）' })}`
            : '';
        const legacyFacts = !editing && legacyFields
            ? `<div><span>旧版主关键词（兼容）</span><p>${summaryReviewValue(candidate.primaryKeywords)}</p></div><div><span>旧版辅助关键词（兼容）</span><p>${summaryReviewValue(candidate.auxiliaryKeywords)}</p></div>`
            : '';
        const header = `<header class="tkm-summary-candidate__header">
            <div class="tkm-summary-candidate__heading">
                <span class="tkm-summary-candidate__identity">候选 ${index + 1}/${draft.candidates.length}</span>
                <strong id="tkm-summary-candidate-${escapeHtml(id)}">${escapeHtml(title)}</strong>
                <span class="tkm-summary-candidate__summary"><time>${escapeHtml(time)}</time><span>来源 #${escapeHtml(range)}</span><span class="${status.valid ? 'is-valid' : 'is-invalid'}">${status.label}</span></span>
            </div>
            <div class="tkm-summary-candidate__header-actions">
                <button type="button" data-action="edit-summary-candidate" data-draft-id="${escapeHtml(id)}" ${editing ? 'disabled' : ''}>编辑</button>
                <button type="button" class="danger" data-action="remove-summary-candidate" data-draft-id="${escapeHtml(id)}" ${editing ? 'disabled' : ''}>移除</button>
                <button type="button" class="tkm-summary-candidate__toggle" data-action="toggle-summary-candidate" data-draft-id="${escapeHtml(id)}" aria-expanded="${!collapsed}" aria-controls="tkm-summary-candidate-content-${escapeHtml(id)}" aria-label="${collapsed ? '展开' : '收起'}${escapeHtml(title)}" ${editing ? 'disabled' : ''}><i aria-hidden="true"></i></button>
            </div>
        </header>`;
        if (collapsed) return `<section class="tkm-summary-candidate is-collapsed" data-summary-candidate-id="${escapeHtml(id)}" aria-labelledby="tkm-summary-candidate-${escapeHtml(id)}">${header}</section>`;
        if (editing) {
            return `<section class="tkm-summary-candidate is-editing" data-summary-candidate-id="${escapeHtml(id)}" aria-labelledby="tkm-summary-candidate-${escapeHtml(id)}">${header}<div class="tkm-summary-candidate__content" id="tkm-summary-candidate-content-${escapeHtml(id)}">
                <label><span>标题 <small>可选</small></span><input type="text" data-summary-candidate-field="title" data-draft-id="${escapeHtml(id)}" value="${escapeHtml(editCandidate.title)}"></label>
                <div class="tkm-summary-time-range"><label><span>开始时间</span><input type="text" data-summary-candidate-field="storyTime.start" data-draft-id="${escapeHtml(id)}" value="${escapeHtml(editCandidate.storyTime.start)}"></label><i aria-hidden="true">→</i><label><span>结束时间</span><input type="text" data-summary-candidate-field="storyTime.end" data-draft-id="${escapeHtml(id)}" value="${escapeHtml(editCandidate.storyTime.end)}"></label></div>
                <label class="tkm-summary-body-field"><span>记忆正文</span><textarea rows="8" data-summary-candidate-field="body" data-draft-id="${escapeHtml(id)}">${escapeHtml(editCandidate.body)}</textarea></label>
                <div class="tkm-summary-meta-grid">${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'people', label: '人物' })}${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'locations', label: '地点' })}${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'eventKeywords', label: '事件关键词' })}${summaryCandidateTagEditor(state.summaryReviewEditing, { field: 'detailKeywords', label: '细节关键词' })}${legacyInputs}</div>
                <details class="tkm-summary-special-date-panel"><summary><span>纪念日候选</span><small>${editCandidate.specialDateCandidates.length} 条</small><i aria-hidden="true"></i></summary>${summarySpecialDatesMarkup(editCandidate.specialDateCandidates)}</details>
                <div class="tkm-summary-candidate__edit-actions"><button type="button" data-action="cancel-summary-candidate-edit" data-draft-id="${escapeHtml(id)}">取消</button><button type="button" class="tkm-summary-candidate__save" data-action="save-summary-candidate-edit" data-draft-id="${escapeHtml(id)}">保存修改</button></div>
            </div></section>`;
        }
        return `<section class="tkm-summary-candidate" data-summary-candidate-id="${escapeHtml(id)}" aria-labelledby="tkm-summary-candidate-${escapeHtml(id)}">${header}<div class="tkm-summary-candidate__content" id="tkm-summary-candidate-content-${escapeHtml(id)}">
            <div class="tkm-summary-candidate__facts"><div><span>人物</span><p>${summaryReviewValue(candidate.people)}</p></div><div><span>地点</span><p>${summaryReviewValue(candidate.locations)}</p></div><div><span>事件关键词</span><p>${summaryReviewValue(candidate.eventKeywords)}</p></div><div><span>细节关键词</span><p>${summaryReviewValue(candidate.detailKeywords)}</p>${summaryDetailAliasFacts(candidate)}</div>${legacyFacts}</div>
            <div class="tkm-summary-candidate__body"><span>记忆正文</span><p>${escapeHtml(candidate.body)}</p></div>
            <details class="tkm-summary-special-date-panel"><summary><span>纪念日候选</span><small>${candidate.specialDateCandidates.length} 条</small><i aria-hidden="true"></i></summary>${summarySpecialDatesMarkup(candidate.specialDateCandidates)}</details>
        </div></section>`;
    }

    function renderSummaryReview() {
        ensureManualSummaryChatState();
        const pending = manualSummaryService.pendingReview();
        if (pending && state.summaryReviewDraft?.taskId !== pending.taskId) {
            state.summaryReviewDraft = createSummaryReviewDraft(pending);
            dirty.setBaseline('summary-review', state.summaryReviewDraft);
            state.summaryReviewMessage = '';
        }
        const draft = pending ? state.summaryReviewDraft : null;
        if (!draft) {
            resetSummaryReviewUi();
            shell.innerHTML = `${focusedHeader('检查总结结果', null)}<main class="tkm-shell__body tkm-summary-review" data-tkm-scroll><section class="tkm-empty-state"><h2>没有等待检查的总结</h2><button type="button" class="menu_button" data-action="return-manual-summary">返回手动总结</button></section></main>`;
            return;
        }
        syncSummaryReviewUi(draft);
        const keywordStatus = draft.keywordState === 'failed'
            ? `<section class="tkm-summary-warning" role="alert"><strong>正文草稿已保留，关键词生成失败</strong><p>${escapeHtml(draft.keywordError?.message || '可以只重试关键词，不会重新总结正文。')}</p><button type="button" data-action="retry-summary-keywords" ${state.summaryReviewBusy ? 'disabled' : ''}>${state.summaryReviewBusy ? '正在重试…' : '只重试关键词'}</button></section>`
            : draft.keywordState === 'stale'
                ? `<section class="${draft.keywordError ? 'tkm-summary-warning' : 'tkm-summary-notice'}" ${draft.keywordError ? 'role="alert"' : ''}><strong>${draft.keywordError ? '关键词重新生成失败，修改与旧关键词已保留' : '直接事实字段已修改'}</strong><p>${escapeHtml(draft.keywordError?.message || '现有关键词可能需要更新；插件不会自动再次调用 API。')}</p><button type="button" data-action="retry-summary-keywords" ${state.summaryReviewBusy || state.summaryReviewEditing ? 'disabled' : ''}>重新生成关键词</button></section>`
                : '';
        const cards = draft.candidates.map((candidate, index) => summaryReviewCandidateMarkup(candidate, index, draft)).join('');
        const aliasStatus = ['pending', 'failed'].includes(draft.aliasState)
            ? `<section class="tkm-summary-warning" role="alert"><strong>正文和关键词已保留，检索简称生成失败</strong><p>${escapeHtml(draft.aliasError?.message || '可以只重试检索简称，不会重新生成正文或关键词。')}</p><button type="button" data-action="retry-summary-aliases" ${state.summaryReviewBusy || state.summaryReviewEditing ? 'disabled' : ''}>${state.summaryReviewBusy ? '正在重试…' : '只重试检索简称'}</button></section>` : '';
        const refreshKeywords = draft.keywordState !== 'failed' && draft.keywordState !== 'stale'
            ? `<button type="button" data-action="retry-summary-keywords" ${state.summaryReviewBusy || state.summaryReviewEditing ? 'disabled' : ''}>${state.summaryReviewBusy ? '正在生成关键词…' : '重新生成关键词'}</button>` : '';
        const foldControls = draft.candidates.length ? `<div class="tkm-summary-review-fold-controls" aria-label="候选操作">${refreshKeywords}<button type="button" data-action="collapse-all-summary-candidates">全部折叠</button><button type="button" data-action="expand-all-summary-candidates">全部展开</button></div>` : '';
        const replacing = Boolean(draft.regeneration);
        shell.innerHTML = `${focusedHeader('检查总结结果', 'tkm-summary-review-form', replacing ? '返回总结范围' : '返回手动总结', state.summaryReviewBusy ? (replacing ? '正在替换…' : '正在入库…') : (replacing ? '确认替换' : '确认入库'))}<main class="tkm-shell__body tkm-summary-review" data-tkm-scroll><div class="tkm-focused-intro"><h2>楼层 ${escapeHtml(draft.floorRange[0])}–${escapeHtml(draft.floorRange[1])}</h2><p>${replacing ? '确认前旧批次和旧记忆仍然有效；确认后才会一次原地替换。' : '修改或移除候选后，再一次确认入库。纪念日只会作为待确认候选保留。'}</p></div>${state.summaryReviewMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.summaryReviewMessage)}</p>` : ''}${keywordStatus}${aliasStatus}${foldControls}<form id="tkm-summary-review-form" data-tkm-form="summary-review" novalidate>${cards || '<section class="tkm-empty-state"><h2>已移除全部候选</h2><p>至少保留一条才能入库；也可取消整批。</p></section>'}<div class="tkm-summary-review-actions"><button type="button" data-action="cancel-summary-review">取消整批</button></div></form></main>`;
        shell.querySelector('.tkm-focused-save').disabled = Boolean(state.summaryReviewBusy || state.summaryReviewEditing || !draft.candidates.length || draft.keywordState === 'failed' || ['pending', 'failed'].includes(draft.aliasState));
    }

    function hydrateMonitorItem(item) {
        if (!item?.id || item.body) return item;
        const current = memoryLibraryService.get(item.id);
        if (!current) return item;
        return {
            ...item,
            title: item.title || current.title || '',
            time: item.time || current.time?.start?.raw || current.time?.end?.raw || '',
            body: current.body || '',
        };
    }

    function monitorReason(item) {
        const provenance = Array.isArray(item?.provenance) ? item.provenance : [];
        const hasSpecialSource = provenance.some(source => source.includes('same-day') || source === 'named-origin');
        const hasOrdinarySource = provenance.includes('ordinary-qualified');
        if (item?.outcome === 'limited') return item.excludedReason || '已达到本轮召回上限';
        if (item?.outcome === 'below-threshold') return '本轮相关证据不足';
        if (item?.pool === 'resident') {
            return hasSpecialSource ? '常驻发送，同时命中纪念日' : '常驻发送';
        }
        if (item?.pool === 'anniversary') {
            const source = item.highestTier === 'named-origin' ? '纪念日的起源记忆'
                : item.highestTier === 'named-same-day' ? '命中纪念日同日' : '命中自动同日';
            return hasOrdinarySource ? `${source}，同时符合普通召回` : source;
        }
        if (item?.outcome === 'selected-special') return '已由特殊记忆名额选入';
        if (item?.outcome === 'selected') return hasSpecialSource
            ? '依据当前内容与语境选入，同时命中纪念日' : '依据当前内容与语境选入';
        return item?.reason || '';
    }

    function monitorItems(items, { includeBody = false, resultLabel = '' } = {}) {
        if (!items?.length) return '';
        return `<ul class="tkm-monitor-items">${items.map(hydrateMonitorItem).map(item => { const reason = monitorReason(item); const aliasReason = item?.alias?.reason; const details = `${includeBody && item.body ? `<p>${escapeHtml(item.body)}</p>` : ''}${reason ? `<small class="tkm-monitor-reason">${escapeHtml(reason)}</small>` : ''}${aliasReason ? `<small class="tkm-monitor-alias-reason">${escapeHtml(aliasReason)}</small>` : ''}`; return `<li><details class="tkm-monitor-memory"><summary><span><strong>${escapeHtml(item.title || '无标题记忆')}</strong>${item.time ? `<time>${escapeHtml(item.time)}</time>` : ''}</span>${resultLabel ? `<em>${escapeHtml(resultLabel)}</em>` : ''}<i aria-hidden="true"></i></summary>${details ? `<div class="tkm-monitor-memory__detail">${details}</div>` : ''}</details></li>`; }).join('')}</ul>`;
    }

    function monitorCategory(title, items, options) {
        if (!items?.length) return '';
        return `<section class="tkm-monitor-category"><h3>${escapeHtml(title)}</h3>${monitorItems(items, options)}</section>`;
    }

    function monitorMemoryGroups(ordinary, anniversary, options = {}) {
        const common = Array.isArray(ordinary) ? ordinary : [];
        const groups = [
            monitorCategory('常驻记忆', common.filter(item => item.pool === 'resident'), options),
            monitorCategory('触发记忆', common.filter(item => item.pool !== 'resident'), options),
            monitorCategory('特殊记忆', anniversary, options),
        ].filter(Boolean);
        return groups.join('') || (options.suppressEmpty ? '' : '<p class="tkm-monitor-empty">没有记忆。</p>');
    }

    function monitorUnselectedItems(estimated) {
        const selectedIds = new Set([
            ...(estimated?.ordinary ?? []).map(item => item.id),
            ...(estimated?.anniversary ?? []).map(item => item.id),
        ]);
        const byId = new Map();
        for (const item of [...(estimated?.candidates ?? []), ...(estimated?.excluded ?? [])]) {
            if (!item?.id || selectedIds.has(item.id) || (!item.alias && !['limited', 'below-threshold'].includes(item.outcome))) continue;
            const current = byId.get(item.id);
            if (!current || (!current.excludedReason && item.excludedReason)) byId.set(item.id, item);
        }
        return [...byId.values()];
    }

    function monitorUnselectedCategory(items) {
        if (!items.length) return '';
        const visible = items.slice(0, 2);
        const remaining = items.slice(2);
        return `<section class="tkm-monitor-category"><div class="tkm-monitor-category__heading"><h3>本轮未选入</h3><span>${items.length} 条</span></div>${monitorItems(visible, { includeBody: true, resultLabel: '未选' })}${remaining.length ? `<details class="tkm-monitor-more"><summary>查看其余 ${remaining.length} 条<i aria-hidden="true"></i></summary>${monitorItems(remaining, { includeBody: true, resultLabel: '未选' })}</details>` : ''}</section>`;
    }

    function monitorAliasDiagnostics(items) {
        const messages = (items ?? []).map(item => String(item?.message ?? '').trim()).filter(Boolean);
        if (!messages.length) return '';
        return `<section class="tkm-monitor-category tkm-monitor-alias-diagnostics"><h3>检索简称关系</h3><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul></section>`;
    }

    function reminderCategory(items) {
        if (!items?.length) return '';
        return `<section class="tkm-monitor-category"><h3>纪念日提醒</h3><ul class="tkm-monitor-reminders">${items.map(item => `<li>${item.kind === 'advance' ? `提前 ${escapeHtml(item.daysUntil)} 天提醒了` : '提醒了'} ${escapeHtml((item.names ?? []).join('、'))}</li>`).join('')}</ul></section>`;
    }

    function holidayReminderCategory(items) {
        if (!items?.length) return '';
        return `<section class="tkm-monitor-category"><h3>当日节日提示</h3><ul class="tkm-monitor-reminders">${items.map(item => `<li>${escapeHtml(item.name)}<small>${item.source === 'calendar' ? '内置日历' : (item.source === 'template' ? '节日模板' : '自定义节日')}</small></li>`).join('')}</ul></section>`;
    }

    function monitorContextFloors(texts) {
        if (!texts?.length) return '<p class="tkm-monitor-empty">没有补充最近楼层。</p>';
        return `<div class="tkm-monitor-context">${texts.map((text, index) => {
            const preview = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
            return `<details class="tkm-monitor-floor"><summary><span>最近第 ${index + 1} 楼</span><small>${escapeHtml(preview)}${String(text ?? '').length > 24 ? '…' : ''}</small><i aria-hidden="true"></i></summary><p>${escapeHtml(text)}</p></details>`;
        }).join('')}</div>`;
    }

    function monitorPromptPayloads(actual) {
        const labels = {
            storyTime: '当前故事日期',
            memory: '记忆上下文',
            specialDate: '纪念日提醒',
            holiday: '当日节日提示',
        };
        const rows = Object.entries(labels).map(([key, label]) => {
            const prompt = String(actual.prompts?.[key] ?? '');
            const channel = actual?.channels?.[key];
            if (!channel?.present) return '';
            const itemCount = key === 'memory'
                ? (actual?.ordinary?.length ?? 0) + (actual?.anniversary?.length ?? 0)
                : key === 'specialDate'
                    ? actual?.anniversaryReminders?.length ?? 0
                    : key === 'holiday'
                        ? actual?.holidayReminders?.length ?? 0
                        : null;
            const itemMeta = itemCount === null ? '' : `<small>${itemCount} 条</small>`;
            const summary = `<span><strong>${label}</strong>${itemMeta}</span><em>已注入 · d${escapeHtml(channel.depth ?? '—')}</em><i aria-hidden="true"></i>`;
            return prompt
                ? `<details class="tkm-monitor-prompt"><summary>${summary}</summary><pre>${escapeHtml(prompt)}</pre></details>`
                : `<div class="tkm-monitor-prompt tkm-monitor-prompt--empty"><span><strong>${label}</strong>${itemMeta}</span><em>已注入 · d${escapeHtml(channel.depth ?? '—')}</em></div>`;
        }).filter(Boolean).join('');
        return rows ? `<section class="tkm-monitor-payloads" aria-label="实际注入通道">${rows}</section>` : '<p class="tkm-monitor-empty">本轮没有实际注入通道。</p>';
    }

    function renderMonitor() {
        const data = memoryLibraryService.chatDataService.readCurrent();
        const snapshot = normalizeMonitorSnapshot(data.monitor);
        const monitorHeader = `<div class="tkm-shell__top"><header class="tkm-monitor-header"><button type="button" class="tkm-monitor-header__back" data-action="route-back" aria-label="返回记忆">‹</button><button type="button" class="tkm-monitor-header__title" data-action="nav-domain" data-domain="memory" aria-label="返回记忆根页"><h1>召回监控</h1></button><div><button type="button" data-action="go-route" data-route="recall.settings">召回设置 ›</button><button type="button" class="tkm-shell__close" data-action="close" aria-label="关闭插件">${CLOSE_ICON}</button></div></header></div><aside class="tkm-scroll-controls" data-scroll-controls hidden aria-label="页面快捷滚动"><button type="button" data-action="scroll-top" aria-label="滚动到顶部">${icon('up')}</button><button type="button" data-action="scroll-bottom" aria-label="滚动到底部">${icon('down')}</button></aside>`;
        if (snapshot.empty) {
            shell.innerHTML = `${monitorHeader}<main class="tkm-shell__body tkm-recall-monitor"><section class="tkm-empty-state"><h2>还没有正式召回记录</h2><p>正常发送、重新生成、swipe 或 continue 一次后，这里会显示插件实际使用的匹配文本与记忆。</p></section></main>${nav()}`;
            return;
        }
        const typeLabels = { normal: '普通发送', regenerate: '重新生成', swipe: 'swipe', continue: 'continue' };
        const matching = snapshot.matching;
        const estimated = snapshot.estimated;
        const actual = snapshot.actual;
        const recent = monitorContextFloors(matching?.recentTexts);
        const history = matching?.promptHistory;
        const disclosure = (number, title, subtitle, stateLabel, content, open = false) => `<details class="tkm-monitor-section" ${open ? 'open' : ''}><summary><span>${number}</span><span class="tkm-monitor-stage-copy"><strong>${title}</strong><small>${subtitle}</small></span><span class="tkm-monitor-stage-state">${stateLabel}<i aria-hidden="true"></i></span></summary><div class="tkm-monitor-section__body">${content}</div></details>`;
        const matchingBody = `<section class="tkm-monitor-category"><div class="tkm-monitor-subheading"><h3>当前输入 · 已清洗</h3></div><div class="tkm-monitor-text">${escapeHtml(matching?.input || '没有可用输入')}</div></section><section class="tkm-monitor-category"><div class="tkm-monitor-subheading"><h3>补充语境 · 已清洗</h3><button type="button" class="tkm-inline-link tkm-monitor-cleaning-link" data-action="go-route" data-route="settings.regex">文本清洗 ›</button></div>${recent}</section>${monitorAliasDiagnostics(matching?.aliasDiagnostics)}`;
        const unselected = monitorUnselectedItems(estimated);
        const selectedCount = (estimated?.ordinary?.length ?? 0) + (estimated?.anniversary?.length ?? 0);
        const estimatedBody = `<section class="tkm-monitor-result-summary"><div><strong>${selectedCount}</strong><span>预计入选</span></div><div><strong>${unselected.length}</strong><span>未选入</span></div></section>${monitorMemoryGroups(estimated?.ordinary, estimated?.anniversary, { includeBody: true, resultLabel: '入选', suppressEmpty: Boolean(unselected.length || estimated?.holidayReminders?.length) })}${monitorUnselectedCategory(unselected)}${holidayReminderCategory(estimated?.holidayReminders)}`;
        const channelCount = Object.values(actual?.channels ?? {}).filter(channel => channel?.present).length;
        const actualBody = actual?.status === 'failed'
            ? `<p class="tkm-inline-error">${escapeHtml(actual.message || '上一轮召回失败，未注入记忆。')}</p>`
            : monitorPromptPayloads(actual);
        const matchingSegments = (matching?.input ? 1 : 0) + (matching?.recentTexts?.length ?? 0);
        shell.innerHTML = `${monitorHeader}<main class="tkm-shell__body tkm-recall-monitor"><section class="tkm-monitor-summary"><div><span>最近一次流程</span><strong>${escapeHtml(typeLabels[snapshot.generationType] ?? snapshot.generationType ?? '未知类型')}</strong></div><div><span>本轮使用时间</span><strong>${escapeHtml(matching?.storyTime ?? '尚未设置')}</strong></div></section><div class="tkm-monitor-disclosures">${disclosure(1, '这次拿什么匹配', '当前输入 + 最近语境 · 已清洗', `${matchingSegments} 段`, matchingBody, true)}${disclosure(2, '预计会召回', '先看入选结果，需要时再展开证据', `${selectedCount} 入选 · ${unselected.length} 未选`, estimatedBody)}${disclosure(3, '本次实际注入', '已经写入本轮 AI 上下文的事实结果', `${channelCount} 个通道`, actualBody)}</div></main>${nav()}`;
    }

    function renderForm(editing) {
        const memory = editing ? memoryLibraryService.get(state.activeId) : null;
        const undo = memory?.mergedFrom?.length ? `<section class="tkm-memory-merge-undo"><button type="button" data-action="undo-memory-merge" ${state.memoryMergeBusy ? 'disabled' : ''}>${state.memoryMergeBusy ? '正在撤销…' : '撤销合并'}</button><small>恢复合并前的 ${memory.mergedFrom.length} 条记忆，并移除这条合并结果。</small></section>` : '';
        const savedNotice = state.formMessage === '已保存。' ? `<aside class="tkm-summary-feedback-toast tkm-summary-feedback-toast--success tkm-memory-save-toast" role="status" aria-live="polite"><span>${escapeHtml(state.formMessage)}</span><button type="button" data-action="dismiss-memory-save-message" aria-label="关闭提示">×</button></aside>` : '';
        shell.innerHTML = `${focusedHeader(editing ? '编辑记忆' : '新建记忆', 'tkm-memory-record-form')}${savedNotice}<main class="tkm-shell__body tkm-memory-editor-scroll">${memoryForm(state, editing)}${undo}</main>${state.memoryDeletePending ? memoryDeleteConfirm() : ''}`;
    }

    function renderKeywordRebuildReview() {
        const review = memoryKeywordRebuildService.currentReview();
        if (!review) {
            shell.innerHTML = `${focusedHeader('检查关键词与检索简称', null, '返回记忆库')}<main class="tkm-shell__body tkm-keyword-rebuild-review" data-tkm-scroll><section class="tkm-empty-state"><h2>没有等待确认的结果</h2><button type="button" data-action="cancel-keyword-rebuild">返回记忆库</button></section></main>`;
            return;
        }
        const list = value => value?.length ? value.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '<small>无</small>';
        const aliases = value => value?.length ? value.map(item => `<p><b>${escapeHtml(item.parentDetail)}</b><i aria-hidden="true">→</i>${escapeHtml(item.aliases.join('、') || '无')}</p>`).join('') : '<small>无</small>';
        const fields = value => `<div><dt>事件关键词</dt><dd>${list(value.event)}</dd></div><div><dt>细节关键词</dt><dd>${list(value.detail)}</dd></div><div><dt>检索简称</dt><dd class="tkm-keyword-rebuild-aliases">${aliases(value.detailAliases)}</dd></div>`;
        const cards = review.candidates.map(candidate => `<article class="tkm-keyword-rebuild-card"><h2>${escapeHtml(candidate.title || '无标题记忆')}</h2><div class="tkm-keyword-rebuild-compare"><section><h3>现有</h3><dl>${fields(candidate.current)}</dl></section><section><h3>新结果</h3><dl>${fields(candidate.next)}</dl></section></div></article>`).join('');
        shell.innerHTML = `${focusedHeader('检查关键词与检索简称', null, '取消')}<main class="tkm-shell__body tkm-keyword-rebuild-review" data-tkm-scroll>${state.keywordRebuildMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.keywordRebuildMessage)}</p>` : ''}<div class="tkm-focused-intro"><h2>${review.candidates.length} 条记忆</h2><p>确认后统一替换这些记忆的新关键词与检索简称。</p></div>${cards}<div class="tkm-summary-review-actions"><button type="button" data-action="cancel-keyword-rebuild">取消</button><button type="button" data-action="apply-memory-index-rebuild" ${state.keywordRebuildBusy ? 'disabled' : ''}>${state.keywordRebuildBusy ? '正在保存…' : '确认替换'}</button></div></main>`;
    }

    function renderMemoryMergeSource() {
        const option = memoryMergeService.inspectSelection(state.memoryMergeIds);
        const originalDisabled = !option.originalAvailable || state.memoryMergeBusy;
        const running = state.memoryMergeBusy && state.memoryMergeBusyStage === 'body';
        shell.innerHTML = `${focusedHeader('选择正文来源', null, '取消')}<main class="tkm-shell__body tkm-memory-merge" data-tkm-scroll>${state.memoryMergeMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.memoryMergeMessage)}</p>` : ''}<section class="tkm-focused-intro"><h2>正文来源</h2><p>已选择 ${escapeHtml(option.selectedCount)} 条记忆。</p></section>${running ? '<p class="tkm-memory-merge-progress" role="status" aria-live="polite">正在融合正文…</p>' : ''}<div class="tkm-memory-merge-source-options"><button type="button" data-action="start-memory-merge" data-source-mode="chat-original" ${originalDisabled ? 'disabled' : ''}><span><strong>根据聊天原文融合</strong><small>推荐 · 原文作为事实证据</small></span><i aria-hidden="true">›</i></button>${!option.originalAvailable ? `<p class="tkm-settings-note">${escapeHtml(option.originalReason)}</p>` : ''}<button type="button" data-action="start-memory-merge" data-source-mode="memory-content" ${!option.canMerge || state.memoryMergeBusy ? 'disabled' : ''}><span><strong>根据记忆内容融合</strong><small>不发送原聊天</small></span><i aria-hidden="true">›</i></button></div></main>`;
    }

    function renderMemoryMergeBody() {
        const review = memoryMergeService.currentReview();
        if (!review || review.stage !== 'body-review' || !state.memoryMergeBodyDraft) {
            shell.innerHTML = `${focusedHeader('检查融合正文', null, '取消')}<main class="tkm-shell__body tkm-memory-merge" data-tkm-scroll><section class="tkm-empty-state"><h2>没有等待检查的融合正文</h2><button type="button" data-action="cancel-memory-merge">返回记忆库</button></section></main>`;
            return;
        }
        const draft = state.memoryMergeBodyDraft;
        const generatingKeywords = state.memoryMergeBusy && state.memoryMergeBusyStage === 'keywords';
        const disabled = generatingKeywords ? 'disabled' : '';
        shell.innerHTML = `${focusedHeader('检查融合正文', 'tkm-memory-merge-body-form', '取消', generatingKeywords ? '正在生成关键词与简称…' : '生成关键词与简称', generatingKeywords)}<main class="tkm-shell__body tkm-memory-merge" data-tkm-scroll>${state.memoryMergeMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.memoryMergeMessage)}</p>` : ''}${generatingKeywords ? '<p class="tkm-memory-merge-progress" role="status" aria-live="polite">正在生成关键词与简称…</p>' : ''}${review.candidate.coherenceWarning ? `<section class="tkm-summary-warning" role="status"><strong>AI 提醒：所选内容可能不是同一事件</strong><p>${escapeHtml(review.candidate.coherenceWarning)}</p></section>` : ''}<form id="tkm-memory-merge-body-form" data-tkm-form="memory-merge-body" novalidate><section class="tkm-summary-surface"><label class="tkm-module-field"><span>标题</span><input type="text" data-memory-merge-field="title" value="${escapeHtml(draft.title)}" ${disabled}></label><label class="tkm-module-field tkm-module-content"><span>融合正文</span><textarea rows="1" data-memory-merge-field="body" ${disabled}>${escapeHtml(draft.body)}</textarea></label><label class="tkm-module-field"><span>人物</span><input type="text" data-memory-merge-field="people" value="${escapeHtml(draft.people)}" ${disabled}></label><label class="tkm-module-field"><span>地点</span><input type="text" data-memory-merge-field="locations" value="${escapeHtml(draft.locations)}" ${disabled}></label><dl class="tkm-memory-merge-facts"><div><dt>故事时间</dt><dd>${escapeHtml(review.candidate.storyTime.start)}${review.candidate.storyTime.end !== review.candidate.storyTime.start ? ` — ${escapeHtml(review.candidate.storyTime.end)}` : ''}</dd></div><div><dt>来源楼层</dt><dd>${escapeHtml(formatMemoryFloorRanges({ floorRange: review.ranges }))}</dd></div></dl></section></form></main>`;
    }

    function renderMemoryMergeFinal() {
        const review = memoryMergeService.currentReview();
        if (!review || review.stage !== 'final-review') {
            shell.innerHTML = `${focusedHeader('确认合并', null, '取消')}<main class="tkm-shell__body tkm-memory-merge" data-tkm-scroll><section class="tkm-empty-state"><h2>没有等待确认的合并结果</h2><button type="button" data-action="cancel-memory-merge">返回记忆库</button></section></main>`;
            return;
        }
        const candidate = review.candidate;
        const words = values => values?.length ? values.map(value => `<span>${escapeHtml(value)}</span>`).join('') : '<small>无</small>';
        const aliases = candidate.keywords.detailAliases?.length ? candidate.keywords.detailAliases.map(item => `<p><b>${escapeHtml(item.parentDetail)}</b> → ${escapeHtml(item.aliases.join('、') || '无')}</p>`).join('') : '<small>无</small>';
        shell.innerHTML = `${focusedHeader('确认合并', null, '取消')}<main class="tkm-shell__body tkm-memory-merge" data-tkm-scroll>${state.memoryMergeMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.memoryMergeMessage)}</p>` : ''}${candidate.aliasWarning ? `<section class="tkm-summary-warning" role="status"><strong>检索简称已自动整理</strong><p>${escapeHtml(candidate.aliasWarning)}</p></section>` : ''}<section class="tkm-focused-intro"><h2>${escapeHtml(candidate.title || '无标题记忆')}</h2><p>确认后，原记忆退出列表与召回；可从新记忆详情撤销合并。</p></section><article class="tkm-summary-surface tkm-memory-merge-final"><p>${escapeHtml(candidate.body).replaceAll('\n', '<br>')}</p><dl><div><dt>事件关键词</dt><dd>${words(candidate.keywords.event)}</dd></div><div><dt>细节关键词</dt><dd>${words(candidate.keywords.detail)}</dd></div><div><dt>检索简称</dt><dd>${aliases}</dd></div></dl></article><div class="tkm-summary-review-actions"><button type="button" data-action="cancel-memory-merge">取消</button><button type="button" data-action="confirm-memory-merge" ${state.memoryMergeBusy ? 'disabled' : ''}>${state.memoryMergeBusy ? '正在保存…' : '确认合并'}</button></div></main>`;
    }

    function storyDateInfoDialog() {
        return `<div class="tkm-confirm-layer"><button type="button" class="tkm-confirm-backdrop" data-action="close-story-date-info" aria-label="关闭日期识别说明"></button><section class="tkm-confirm-dialog tkm-story-date-info" role="dialog" aria-modal="true" aria-labelledby="tkm-story-date-info-title"><h2 id="tkm-story-date-info-title">日期识别</h2><div class="tkm-story-date-info__copy"><p><strong>会识别</strong><span>明确的当前日期；明确推进剧情日期的日、周、月、年跨度。</span></p><p><strong>不会作为当前日期</strong><span>回忆或历史资料；计划、假设、预测；仅描述过去时长；含义不明确的时间表达。</span></p></div><footer><button type="button" data-action="close-story-date-info">关闭</button></footer></section></div>`;
    }

    function renderStoryTime() { shell.innerHTML = `${header('当前故事日期')}<main class="tkm-shell__body"><div class="tkm-time-workface"><section class="tkm-time-surface">${storyTimeForm(state, storyTimeService.read())}${storyTimeExtractionForm(state)}</section>${fictionalCalendarForm(state)}</div></main>${state.storyDateInfoOpen ? storyDateInfoDialog() : ''}`; shell.querySelectorAll('[data-field="time-regex-pattern"]').forEach(fitStoryTimeTextarea); }

    function renderAnniversaries() {
        const allItems = anniversaryService.read();
        const items = (state.anniversaryTab === 'all' ? allItems : allItems.filter(item => item.status === state.anniversaryTab))
            .sort((left, right) => left.month - right.month || left.day - right.day || String(left.id).localeCompare(String(right.id)));
        const labels = { all: '全部', enabled: '已启用', paused: '已暂停', pending: '待确认' };
        const newEditor = state.anniversaryDraft && !state.anniversaryEditingId ? anniversaryForm(state) : '';
        const timeline = items.length ? `<section class="tkm-special-date-timeline">${items.map(item => anniversaryCard(item, state.anniversaryEditingId === item.id ? anniversaryForm(state) : '')).join('')}</section>` : `<section class="tkm-empty-state tkm-empty-state--compact"><h2>${labels[state.anniversaryTab]}中还没有纪念日</h2></section>`;
        shell.innerHTML = `${header('纪念日')}<main class="tkm-shell__body tkm-special-date-workface">${state.notice ? `<p class="tkm-inline-error">${escapeHtml(state.notice)}</p>` : ''}<section class="tkm-special-date-page-heading"><button type="button" class="tkm-inline-link" data-action="go-route" data-route="settings.special-date-defaults">提醒设置 ›</button><button type="button" data-action="new-anniversary" aria-expanded="${Boolean(newEditor)}">${newEditor ? '收起' : '＋ 新建纪念日'}</button></section>${newEditor}<nav class="tkm-special-date-tabs" aria-label="纪念日状态">${Object.entries(labels).map(([key, label]) => `<button type="button" data-action="anniversary-tab" data-status="${key}" class="${state.anniversaryTab === key ? 'active' : ''}">${label}</button>`).join('')}</nav>${timeline}</main>`;
    }

    function eraPartsFromOrdinal(ordinal) {
        const eras = storyTimeService.read().fictionalCalendar?.eras ?? [];
        let offset = 0;
        for (let index = 0; index < eras.length; index += 1) {
            const era = eras[index];
            const isCurrent = index === eras.length - 1;
            if (isCurrent || ordinal <= offset + era.endYear) return { era: era.name, year: ordinal - offset };
            offset += era.endYear;
        }
        return { era: '', year: ordinal };
    }

    function ordinalFromEra(eraName, year) {
        const eras = storyTimeService.read().fictionalCalendar?.eras ?? [];
        let offset = 0;
        for (const era of eras) {
            if (era.name === eraName) return offset + Math.max(1, Number(year) || 1);
            if (!Number.isInteger(era.endYear)) break;
            offset += era.endYear;
        }
        return Math.max(1, Number(year) || 1);
    }

    function ensureCalendarCursor(active) {
        if (state.calendarCursorId !== active.id) {
            state.calendarCursorId = active.id;
            state.calendarYear = null; state.calendarMonth = null; state.calendarDay = null;
        }
        if (state.calendarYear && state.calendarMonth && state.calendarDay) return;
        const storyTime = storyTimeService.read();
        const current = storyTime.current?.value;
        const today = new Date();
        if (active.type === 'fictional') {
            state.calendarYear = comparableYear(current, storyTime.fictionalCalendar) ?? active.config.cycle.anchorYear ?? 1;
            const targetOrdinal = current?.calendar === 'era' ? current.month : null;
            const months = monthsInCalendarYear(active, state.calendarYear);
            state.calendarMonth = targetOrdinal
                ? Math.max(1, months.findIndex(item => item.isLeap === Boolean(current.isLeapMonth) && item.ordinal === targetOrdinal) + 1)
                : 1;
            state.calendarDay = current?.calendar === 'era' && current.day ? current.day : 1;
        } else if (active.type === 'modern') {
            state.calendarYear = current?.calendar === 'gregorian' ? current.year : today.getFullYear();
            state.calendarMonth = current?.calendar === 'gregorian' && current.month ? current.month : today.getMonth() + 1;
            state.calendarDay = current?.calendar === 'gregorian' && current.day ? current.day : 1;
        } else {
            state.calendarYear = 1;
            state.calendarMonth = 1;
            state.calendarDay = 1;
        }
        state.calendarDay = Math.min(state.calendarDay, daysInCalendarMonth(active, state.calendarYear, state.calendarMonth));
    }

    function projectedSpecialDates(month, day) {
        return anniversaryService.read().filter(item => item.status === 'enabled' && item.month === month && item.day === day);
    }

    function calendarDate(active, day = state.calendarDay) {
        return { calendarId: active.id, year: state.calendarYear, month: state.calendarMonth, day };
    }

    function eventsForDay(active, day = state.calendarDay, { includePaused = false } = {}) {
        const date = calendarDate(active, day);
        return includePaused
            ? calendarService.events(active.id).filter(item => calendarEventMatchesDate(item, date, { calendar: active }))
            : calendarService.eventsOn(date);
    }

    function builtInHolidayTemplates(active) {
        const order = ['traditional-cn', 'modern-common', 'western-common', 'solar-terms'];
        const packs = holidayTemplatePacks(active?.type);
        return order.flatMap(packId => {
            const pack = packs.find(item => item.id === packId);
            return pack ? holidayTemplates(pack.id, active.type) : [];
        });
    }

    function builtInHolidaysForDay(active, day = state.calendarDay) {
        if (active.config?.holidaySettings?.showHolidays === false) return [];
        const date = calendarDate(active, day);
        const overrides = new Map(calendarService.events(active.id)
            .filter(item => item.kind === 'holiday' && item.templateId)
            .map(item => [item.templateId, item]));
        return builtInHolidayTemplates(active)
            .filter(item => item.packId !== 'solar-terms')
            .map(item => overrides.get(item.id) ?? {
                calendarId: active.id,
                kind: 'holiday',
                name: item.name,
                fact: item.fact,
                dateRule: item.rule,
                templateId: item.id,
                templatePack: item.packId,
                calendarLabel: true,
            })
            .filter(item => calendarEventMatchesDate(item, date, { calendar: active }));
    }

    function currentCalendarDate(active) {
        const storyTime = storyTimeService.read();
        const current = storyTime.current?.value;
        const today = new Date();
        if (active.type === 'modern') return {
            calendarId: active.id,
            year: current?.calendar === 'gregorian' ? current.year : today.getFullYear(),
            month: current?.calendar === 'gregorian' && current.month ? current.month : today.getMonth() + 1,
            day: current?.calendar === 'gregorian' && current.day ? current.day : today.getDate(),
        };
        if (active.type === 'fictional') {
            const year = comparableYear(current, storyTime.fictionalCalendar) ?? active.config.cycle.anchorYear ?? 1;
            const months = monthsInCalendarYear(active, year);
            const month = current?.calendar === 'era'
                ? Math.max(1, months.findIndex(item => item.isLeap === Boolean(current.isLeapMonth) && item.ordinal === current.month) + 1)
                : 1;
            return { calendarId: active.id, year, month, day: current?.calendar === 'era' && current.day ? current.day : 1 };
        }
        return { calendarId: active.id, year: 1, month: 1, day: 1 };
    }

    function calendarCursorIsCurrent(active) {
        const current = currentCalendarDate(active);
        return state.calendarYear === current.year
            && state.calendarMonth === current.month
            && state.calendarDay === current.day;
    }

    function nextCalendarEventDate(active, item) {
        if (item.repeat !== 'yearly') return item.date;
        const current = currentCalendarDate(active);
        for (let year = current.year; year < current.year + 100; year += 1) {
            try {
                const candidate = { ...item.date, year };
                if (calendarDayDistance(active, current, candidate) >= 0) return candidate;
            } catch { /* A cyclic calendar may omit this day in a particular year. */ }
        }
        return item.date;
    }

    function nextAnnualDate(active, month, day) {
        const current = currentCalendarDate(active);
        for (let year = current.year; year < current.year + 100; year += 1) {
            try {
                const candidate = { calendarId: active.id, year, month, day };
                if (calendarDayDistance(active, current, candidate) >= 0) return candidate;
            } catch { /* This date can be absent from a cyclic calendar year. */ }
        }
        return null;
    }

    function calendarDateLabel(active, date) {
        const month = active.type === 'modern'
            ? `${date.month}月`
            : (monthsInCalendarYear(active, date.year)[date.month - 1]?.name ?? `${date.month}月`);
        return `${date.year}年 ${month}${active.type === 'fictional' ? TRADITIONAL_DAY_NAMES[date.day] : `${date.day}日`}`;
    }

    function calendarMarkerStrip({ specials = [], events = [], solarTerm = '', holiday = '' } = {}) {
        const markers = [];
        if (specials.length) markers.push('<i class="tkm-calendar-marker tkm-calendar-marker--special" title="纪念日" aria-label="纪念日"></i>');
        if (events.length) markers.push('<i class="tkm-calendar-marker tkm-calendar-marker--schedule" title="日程安排" aria-label="日程安排"></i>');
        if (holiday) markers.push('<i class="tkm-calendar-marker tkm-calendar-marker--holiday" title="节日" aria-label="节日"></i>');
        if (solarTerm) markers.push('<i class="tkm-calendar-marker tkm-calendar-marker--solar-term" title="节气" aria-label="节气"></i>');
        return markers.length ? `<span class="tkm-calendar-markers">${markers.slice(0, 4).join('')}</span>` : '';
    }

    function calendarEventForm(active) {
        const draft = state.calendarEventDraft;
        if (!draft) return '';
        const identity = active.name === calendarTypeLabel(active) ? active.name : `${active.name} · ${calendarTypeLabel(active)}`;
        return `<form id="tkm-calendar-event-form" class="tkm-schedule-editor" data-tkm-form="calendar-event"><div class="tkm-schedule-context"><strong>${escapeHtml(identity)}</strong><span>${state.calendarEventEditingId ? '编辑已有日程' : '为选中日期新建日程'}</span></div>${state.calendarEventMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.calendarEventMessage)}</p>` : ''}<section><h2>日程</h2><label class="tkm-calendar-event-name"><span>名称 <b aria-hidden="true">*</b></span><input type="text" data-calendar-event-field="name" value="${escapeHtml(draft.name)}" placeholder="这一天要发生什么"></label><div class="tkm-calendar-event-date"><span>日期 <b aria-hidden="true">*</b></span><input type="number" inputmode="numeric" min="1" data-calendar-event-field="year" value="${escapeHtml(draft.year)}" aria-label="年"><b>年</b><input type="number" inputmode="numeric" min="1" data-calendar-event-field="month" value="${escapeHtml(draft.month)}" aria-label="月"><b>月</b><input type="number" inputmode="numeric" min="1" data-calendar-event-field="day" value="${escapeHtml(draft.day)}" aria-label="日"><b>日</b></div><fieldset class="tkm-radio-options tkm-calendar-event-options"><legend>重复</legend><label><input type="radio" name="calendar-event-repeat" value="once" ${draft.repeat === 'once' ? 'checked' : ''}><span>仅一次</span></label><label><input type="radio" name="calendar-event-repeat" value="yearly" ${draft.repeat === 'yearly' ? 'checked' : ''}><span>每年</span></label></fieldset></section><section><h2>说明</h2><label class="tkm-calendar-event-fact"><span>简短说明 <small>可选</small></span><textarea rows="4" data-calendar-event-field="fact" placeholder="补充最需要记住的信息">${escapeHtml(draft.fact)}</textarea></label></section><section><h2>状态与提醒</h2><fieldset class="tkm-radio-options tkm-calendar-event-options"><legend>状态</legend><label><input type="radio" name="calendar-event-status" value="enabled" ${draft.status === 'enabled' ? 'checked' : ''}><span>启用</span></label><label><input type="radio" name="calendar-event-status" value="paused" ${draft.status === 'paused' ? 'checked' : ''}><span>暂停</span></label></fieldset><div class="tkm-calendar-event-numbers"><label><span>提前提醒</span><input type="number" inputmode="numeric" min="0" data-calendar-event-field="advanceDays" value="${escapeHtml(draft.advanceDays)}"><b>天</b></label><label><span>持续</span><input type="number" inputmode="numeric" min="1" data-calendar-event-field="durationDays" value="${escapeHtml(draft.durationDays)}"><b>天</b></label></div></section>${state.calendarEventEditingId ? `<div class="tkm-schedule-danger"><button type="button" data-action="delete-calendar-event" data-id="${escapeHtml(state.calendarEventEditingId)}">删除这条日程</button></div>` : ''}</form>`;
    }

    function calendarEventRows(active, events) {
        if (!events.length) return '';
        return events.map(event => `<li class="tkm-calendar-fact tkm-calendar-fact--schedule"><i aria-hidden="true"></i><div><strong>${escapeHtml(event.name)}</strong><span>日程${event.repeat === 'yearly' ? ' · 每年' : ''}${event.status === 'paused' ? ' · 已暂停' : ''}${event.fact ? ` · ${escapeHtml(event.fact)}` : ''}</span></div><button type="button" class="tkm-calendar-fact__edit" data-action="edit-calendar-event" data-id="${escapeHtml(event.id)}">编辑</button></li>`).join('');
    }

    function holidayEventRows(events) {
        if (!events.length) return '';
        return events.map(event => `<li class="tkm-calendar-fact tkm-calendar-fact--holiday"><i aria-hidden="true"></i><div><strong>${escapeHtml(event.name)}</strong><span>节日${event.fact ? ` · ${escapeHtml(event.fact)}` : ''}</span></div></li>`).join('');
    }

    function calendarDayActions(active, specials = [], secondary = '', solarTerm = '', calendarHolidays = []) {
        const allEvents = eventsForDay(active, state.calendarDay, { includePaused: true });
        const events = allEvents.filter(item => item.kind === 'schedule');
        const holidays = active.config?.holidaySettings?.showHolidays === false ? [] : allEvents.filter(item => item.kind === 'holiday' && !(item.dateRule?.type === 'solar-term' && item.templatePack === 'solar-terms'));
        const savedTemplateIds = new Set(holidays.map(item => item.templateId).filter(Boolean));
        const savedNames = new Set(holidays.filter(item => !item.templateId).map(item => item.name));
        const calendarLabels = calendarHolidays
            .map(item => typeof item === 'string' ? { name: item, fact: '' } : item)
            .filter(item => item?.name && !savedNames.has(item.name) && (!item.templateId || !savedTemplateIds.has(item.templateId)))
            .map(item => ({ ...item, name: item.name, fact: item.fact ?? '', calendarLabel: true }));
        const importedTerm = allEvents.find(item => item.kind === 'holiday' && item.dateRule?.type === 'solar-term' && item.templatePack === 'solar-terms');
        const specialNames = specials.flatMap(item => item.names?.map(name => name.name) ?? []);
        const empty = !specialNames.length && !events.length && !holidays.length && !calendarLabels.length && !solarTerm;
        const specialRows = specialNames.map(name => `<li class="tkm-calendar-fact tkm-calendar-fact--anniversary"><i aria-hidden="true"></i><div><strong>${escapeHtml(name)}</strong><span>纪念日</span></div></li>`).join('');
        const termRow = solarTerm ? `<li class="tkm-calendar-fact tkm-calendar-fact--term"><i aria-hidden="true"></i><div><strong>${escapeHtml(solarTerm)}</strong><span>节气${importedTerm?.fact ? ` · ${escapeHtml(importedTerm.fact)}` : ''}</span></div></li>` : '';
        const facts = `${specialRows}${holidayEventRows([...holidays, ...calendarLabels])}${termRow}${calendarEventRows(active, events)}`;
        const weekday = active.type === 'modern' ? ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(state.calendarYear, state.calendarMonth - 1, state.calendarDay)).getUTCDay()] : '';
        const title = active.type === 'modern'
            ? `${state.calendarMonth} 月 ${state.calendarDay} 日 · 星期${weekday}`
            : `${monthsInCalendarYear(active, state.calendarYear)[state.calendarMonth - 1].name}${active.type === 'fictional' ? TRADITIONAL_DAY_NAMES[state.calendarDay] : ` ${state.calendarDay} 日`}`;
        return `<section class="tkm-calendar-day-summary"><header><strong>${title}</strong>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ''}</header><div class="tkm-calendar-day-agenda">${facts ? `<ul>${facts}</ul>` : ''}${empty && !state.calendarEventSaving ? '<p>当天没有安排。</p>' : ''}${state.calendarEventSaving ? '<p class="tkm-calendar-save-status" role="status">正在保存日程…</p>' : ''}${state.calendarEventSaving ? '' : '<button type="button" class="tkm-calendar-new-event" data-action="new-calendar-event">＋ 新建日程</button>'}</div></section>`;
    }

    function countdownOverview(active) {
        const current = currentCalendarDate(active);
        const scheduleItems = calendarService.events(active.id)
            .filter(item => item.kind === 'schedule' && item.status === 'enabled')
            .map(item => ({ kind: 'schedule', name: item.name, date: nextCalendarEventDate(active, item) }));
        const specialItems = anniversaryService.read()
            .filter(item => item.status === 'enabled')
            .map(item => ({
                kind: 'special',
                name: item.names?.map(name => name.name).filter(Boolean).join('、') || '纪念日',
                date: nextAnnualDate(active, item.month, item.day),
            }));
        const items = [...scheduleItems, ...specialItems]
            .filter(item => item.date)
            .map(item => ({ ...item, days: calendarDayDistance(active, current, item.date) }))
            .filter(item => item.days >= 0)
            .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'zh-CN'))
            .slice(0, 5);
        if (!items.length) return '';
        return `<section class="tkm-countdown-overview"><header class="tkm-countdown-heading"><h2>近期</h2></header><div>${items.map(item => {
            const remaining = item.days === 0 ? '今天' : `还有 ${item.days} 天`;
            const date = active.type === 'modern' ? `${item.date.month} 月<br>${item.date.day} 日` : escapeHtml(calendarDateLabel(active, item.date));
            return `<button type="button" data-action="select-upcoming-date" data-year="${item.date.year}" data-month="${item.date.month}" data-day="${item.date.day}"><i class="tkm-calendar-marker tkm-calendar-marker--${item.kind}" aria-hidden="true"></i><time>${date}</time><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(remaining)}</span></button>`;
        }).join('')}</div></section>`;
    }

    function modernMonthGrid(active) {
        ensureCalendarCursor(active);
        const days = daysInCalendarMonth(active, state.calendarYear, state.calendarMonth);
        const leading = (new Date(Date.UTC(state.calendarYear, state.calendarMonth - 1, 1)).getUTCDay() + 6) % 7;
        const blanks = Array.from({ length: leading }, () => '<span class="tkm-month-blank" aria-hidden="true"></span>').join('');
        const cells = Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const overlay = modernCalendarOverlay(state.calendarYear, state.calendarMonth, day);
            const solarTerm = active.config?.holidaySettings?.showSolarTerms === false ? '' : overlay.solarTerm;
            const specials = projectedSpecialDates(state.calendarMonth, day);
            const allEvents = eventsForDay(active, day, { includePaused: true });
            const events = allEvents.filter(item => item.kind === 'schedule' && item.status === 'enabled');
            const holidays = active.config?.holidaySettings?.showHolidays === false ? [] : allEvents.filter(item => item.kind === 'holiday' && !(item.dateRule?.type === 'solar-term' && item.templatePack === 'solar-terms'));
            const calendarHolidays = builtInHolidaysForDay(active, day);
            const selected = state.calendarDay === day;
            const holidayName = holidays[0]?.name || calendarHolidays[0]?.name || '';
            const markers = calendarMarkerStrip({ specials, events, holiday: holidayName, solarTerm });
            return `<button type="button" class="tkm-month-day ${selected ? 'active' : ''} ${specials.length ? 'has-special' : ''} ${events.length ? 'has-event' : ''}" data-action="select-calendar-day" data-day="${day}" aria-pressed="${selected}"><strong>${day}</strong><small>${escapeHtml(overlay.lunar?.label || '')}</small>${markers}</button>`;
        }).join('');
        return `${blanks}${cells}`;
    }

    function selectedCalendarDay(active) {
        const overlay = modernCalendarOverlay(state.calendarYear, state.calendarMonth, state.calendarDay);
        const specials = projectedSpecialDates(state.calendarMonth, state.calendarDay);
        const solarTerm = active.config?.holidaySettings?.showSolarTerms === false ? '' : overlay.solarTerm;
        const secondary = [overlay.lunar?.fullLabel || '', solarTerm].filter(Boolean).join(' · ');
        const calendarHolidays = builtInHolidaysForDay(active);
        return calendarDayActions(active, specials, secondary, solarTerm, calendarHolidays);
    }

    function newFictionalScheme(name = '') {
        const id = `scheme-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return { id, name, months: createTraditionalFictionalMonths(), leapMonth: null, solarTerms: [], sourceYear: null };
    }

    function beginFictionalCalendarEditor(active = null) {
        const scheme = newFictionalScheme();
        const current = storyTimeService.read().current?.value;
        const anchorYear = comparableYear(current, storyTimeService.read().fictionalCalendar) ?? 1;
        state.fictionalCalendarEditingId = active?.type === 'fictional' ? active.id : null;
        state.fictionalCalendarSetupStep = active?.type === 'fictional' ? 'editor' : 'source';
        state.fictionalCalendarDraft = active?.type === 'fictional'
            ? { name: active.name, ...structuredClone(active.config) }
            : { name: '架空王朝历法', schemes: [scheme], defaultSchemeId: scheme.id, cycle: { enabled: false, anchorYear, schemeIds: [scheme.id] } };
        state.fictionalSchemeOpenId = state.fictionalCalendarDraft.schemes[0]?.id ?? null;
        state.fictionalTermFocusName = '';
        state.fictionalTermOpenSchemeIds.clear();
        state.fictionalCalendarMessage = '';
        state.fictionalCalendarImportOpen = false;
        state.fictionalCalendarImportDraft.includeTraditionalHolidays = false;
        state.fictionalCalendarImportTraditionalPending = false;
        state.fictionalCalendarImportQingmingPending = false;
        state.calendarSelectorOpen = false;
        dirty.setBaseline('fictional-calendar', state.fictionalCalendarDraft);
    }

    function createDefaultCustomMonths() {
        const names = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
        return names.map((name, index) => ({ id: `custom-month-${Date.now()}-${index + 1}`, name, days: 30 }));
    }

    function beginCustomCalendarEditor(active = null) {
        state.customCalendarEditingId = active?.type === 'custom' ? active.id : null;
        state.customCalendarDraft = active?.type === 'custom'
            ? { name: active.name, months: structuredClone(active.config.months) }
            : { name: '自定义历法', months: createDefaultCustomMonths() };
        state.customCalendarMessage = '';
        state.calendarSelectorOpen = false;
        dirty.setBaseline('custom-calendar', state.customCalendarDraft);
    }

    function customCalendarEditor() {
        const draft = state.customCalendarDraft;
        if (!draft) return '';
        const rows = draft.months.map((month, index) => `<li><span>${index + 1}</span><input type="text" data-custom-month-field="name" data-index="${index}" value="${escapeHtml(month.name)}" aria-label="第 ${index + 1} 个月名称"><label><input type="number" inputmode="numeric" min="1" max="99" data-custom-month-field="days" data-index="${index}" value="${escapeHtml(month.days)}" aria-label="${escapeHtml(month.name || `第 ${index + 1} 个月`)}的天数"><span>天</span></label><div><button type="button" data-action="move-custom-month-up" data-index="${index}" aria-label="上移" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-custom-month-down" data-index="${index}" aria-label="下移" ${index === draft.months.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="danger tkm-icon-action" data-action="remove-custom-month" data-index="${index}" aria-label="删除月份" ${draft.months.length === 1 ? 'disabled' : ''}>${TRASH_ICON}</button></div></li>`).join('');
        return `<form class="tkm-custom-calendar-editor" data-tkm-form="custom-calendar"><header><h1>${state.customCalendarEditingId ? '编辑自定义历法' : '新建自定义历法'}</h1></header>${state.customCalendarMessage ? `<p class="tkm-inline-error">${escapeHtml(state.customCalendarMessage)}</p>` : ''}<label class="tkm-custom-calendar-name"><span>历法名称</span><input type="text" data-custom-field="name" value="${escapeHtml(draft.name)}"></label><section class="tkm-custom-months"><header><div><h2>一年月份</h2><p>1–24 个月 · 每月 1–99 天 · 固定七列星期</p></div><button type="button" data-action="add-custom-month" ${draft.months.length >= 24 ? 'disabled' : ''}>增加月份</button></header><ol>${rows}</ol></section><footer><button type="button" data-action="cancel-custom-calendar">取消</button><button type="submit">保存自定义历法</button></footer></form>`;
    }

    function calendarSelector(active) {
        if (!state.calendarSelectorOpen) return '';
        const definitions = calendarService.list();
        const rows = definitions.map(item => {
            const edit = item.type === 'fictional'
                ? `<button type="button" class="tkm-calendar-option__edit" data-action="edit-fictional-calendar" data-id="${escapeHtml(item.id)}">编辑</button>`
                : (item.type === 'custom' ? `<button type="button" class="tkm-calendar-option__edit" data-action="edit-custom-calendar" data-id="${escapeHtml(item.id)}">编辑</button>` : '');
            const actions = item.type === 'modern' ? '' : `<span class="tkm-calendar-option__actions">${edit}<button type="button" class="tkm-calendar-option__delete" data-action="delete-calendar" data-id="${escapeHtml(item.id)}">删除</button></span>`;
            const name = item.type === 'modern' ? '公历' : item.name;
            return `<div class="tkm-calendar-option ${item.id === active?.id ? 'active' : ''}"><button type="button" data-action="switch-calendar" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(name)}</strong><span>${item.type === 'modern' ? '农历信息支持 1949–2036' : (item.type === 'fictional' ? '架空王朝历法' : '自定义历法')}</span></button>${actions}</div>`;
        }).join('');
        const activeName = active.type === 'modern' ? '公历' : active.name;
        const anniversaryCount = anniversaryService.read().length;
        const choices = state.calendarManagementOpen ? `<div class="tkm-calendar-choice">${rows}<div class="tkm-calendar-selector__actions"><button type="button" data-action="new-fictional-calendar">新建架空王朝历法</button><button type="button" data-action="new-custom-calendar">新建自定义历法</button></div></div>` : '';
        return `<section class="tkm-calendar-selector"><button type="button" data-action="toggle-calendar-management" aria-expanded="${state.calendarManagementOpen}"><span>当前历法</span><small>${escapeHtml(activeName)} ›</small></button>${choices}<button type="button" data-action="go-route" data-route="settings.time.story"><span>当前日期提醒</span><small>›</small></button><button type="button" data-action="go-route" data-route="time.anniversaries"><span>纪念日</span><small>${anniversaryCount} 项 ›</small></button><button type="button" data-action="open-holiday-manager"><span>节日与习俗</span><small>›</small></button></section>`;
    }

    function holidayRuleLabel(event, active) {
        const rule = event.dateRule ?? {};
        if (rule.type === 'solar-term') return `跟随「${rule.name}」节气`;
        if (rule.type === 'lunar-year-end') return '农历年最后一天';
        if (rule.type === 'lunar') return `${active.type === 'fictional' ? '' : '农历 '}${rule.month}月${rule.day}日`;
        return `${rule.month ?? event.date?.month}月${rule.day ?? event.date?.day}日`;
    }

    function holidayEditor(active) {
        const draft = state.holidayDraft;
        if (!draft) return '';
        const termNames = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
        const maxMonth = draft.ruleType === 'lunar' || active.type === 'modern' ? 12 : monthsInCalendarYear(active, 1).length;
        const maxDay = draft.ruleType === 'lunar' ? 30 : (active.type === 'custom' ? 99 : 31);
        const dateField = draft.ruleType === 'solar-term'
            ? `<label><span>节气</span><select data-holiday-field="termName">${termNames.map(name => `<option value="${name}" ${draft.termName === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`
            : (draft.ruleType === 'lunar-year-end' ? '<p class="tkm-holiday-rule-note">日期：农历年最后一天</p>' : `<div class="tkm-holiday-date"><span>${draft.ruleType === 'lunar' && active.type === 'modern' ? '农历日期' : '日期'}</span><input type="number" inputmode="numeric" min="1" max="${maxMonth}" data-holiday-field="month" value="${escapeHtml(draft.month)}" aria-label="月"><b>月</b><input type="number" inputmode="numeric" min="1" max="${maxDay}" data-holiday-field="day" value="${escapeHtml(draft.day)}" aria-label="日"><b>日</b></div>`);
        return `<form class="tkm-holiday-editor" data-tkm-form="holiday"><header><h3>${state.holidayEditingId ? '编辑节日' : '新建节日'}</h3></header>${state.holidayMessage ? `<p class="tkm-inline-error">${escapeHtml(state.holidayMessage)}</p>` : ''}<label><span>名称</span><input type="text" data-holiday-field="name" value="${escapeHtml(draft.name)}"></label>${dateField}<label><span>节日介绍</span><textarea rows="3" data-holiday-field="fact">${escapeHtml(draft.fact)}</textarea></label><footer><button type="button" data-action="cancel-holiday-edit">取消</button><button type="submit">保存节日</button></footer></form>`;
    }

    function calendarTypeLabel(active) {
        return active?.type === 'modern' ? '年月日' : (active?.type === 'fictional' ? '架空王朝历法' : '自定义历法');
    }

    function activeCalendarForSettings() {
        try {
            if (!currentChatLabel(getContext())) return null;
            return calendarService.active();
        } catch {
            return null;
        }
    }

    function holidayCalendarDisplaySettings(active) {
        if (active.type === 'custom') return '';
        const settings = active.config?.holidaySettings ?? {};
        const row = (field, label, enabled) => `<button type="button" role="switch" aria-checked="${enabled}" data-action="toggle-holiday-calendar-display" data-field="${field}"><span>${label}</span><i class="tkm-setting-switch ${enabled ? 'is-on' : ''}" aria-hidden="true"></i></button>`;
        return `<section class="tkm-holiday-calendar-display">${row('showHolidays', '月历显示节日', settings.showHolidays !== false)}${active.type === 'modern' ? row('showSolarTerms', '月历显示节气', settings.showSolarTerms !== false) : ''}</section>`;
    }

    function holidayReminderSwitch({ active, item, templateId = '' }) {
        const enabled = templateId
            ? new Set(active.config?.holidaySettings?.reminderTemplateIds ?? []).has(templateId)
            : item.status === 'enabled';
        const target = templateId ? `data-template-id="${escapeHtml(templateId)}"` : `data-id="${escapeHtml(item.id)}"`;
        return `<div class="tkm-holiday-reminder-choice" role="group" aria-label="${escapeHtml(item.name)}提醒">${[true, false].map(value => `<button type="button" aria-pressed="${enabled === value}" data-action="toggle-holiday-reminder" data-enabled="${value}" ${target}>${enabled === value ? '<span aria-hidden="true">✓</span> ' : ''}${value ? '提醒' : '不提醒'}</button>`).join('')}</div>`;
    }

    function holidayRecord(active, item, { template = null } = {}) {
        const templateId = template?.id ?? item.templateId ?? '';
        const editing = Boolean(state.holidayDraft && state.holidayEditingId === (item.id || templateId));
        const editAction = item.id ? 'edit-holiday' : 'edit-holiday-preset';
        const editData = item.id
            ? `data-id="${escapeHtml(item.id)}"`
            : `data-id="${escapeHtml(template.id)}" data-pack-id="${escapeHtml(template.packId)}"`;
        const reset = templateId && item.id && holidayTemplateChanged(item) ? `<button type="button" data-action="reset-holiday" data-id="${escapeHtml(item.id)}">重置</button>` : '';
        const remove = !templateId && item.id ? `<button type="button" class="danger tkm-icon-action" data-action="delete-holiday" data-id="${escapeHtml(item.id)}" aria-label="删除${escapeHtml(item.name)}">${TRASH_ICON}</button>` : '';
        return `<div class="tkm-holiday-record-wrap"><article class="tkm-holiday-record">${holidayReminderSwitch({ active, item, templateId })}<div class="tkm-holiday-record__copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(holidayRuleLabel(item, active))}</span>${item.fact ? `<p>${escapeHtml(item.fact)}</p>` : ''}</div><div class="tkm-holiday-record__actions"><button type="button" data-action="${editAction}" ${editData}>编辑</button>${reset}${remove}</div></article>${editing ? holidayEditor(active) : ''}</div>`;
    }

    function holidayCategory(active, id, name, templates, overrides) {
        const expanded = Boolean(state.holidayPackExpanded?.[id]);
        const visible = expanded ? templates : templates.slice(0, 4);
        const rows = visible.map(template => {
            const override = overrides.get(template.id);
            const item = override ?? { name: template.name, fact: template.fact, dateRule: template.rule, templateId: template.id };
            return holidayRecord(active, item, { template });
        }).join('');
        if (!rows) return '';
        const open = new Set(Array.isArray(state.holidayPackOpen) ? state.holidayPackOpen : []).has(id);
        return `<section class="tkm-holiday-category ${open ? 'is-open' : ''}"><button type="button" data-action="toggle-holiday-category" data-id="${escapeHtml(id)}" aria-expanded="${open}"><span><strong>${escapeHtml(name)}</strong><small>${templates.length} 项</small></span><i aria-hidden="true"></i></button>${open ? `<div class="tkm-holiday-category__items">${rows}${templates.length > 4 ? `<button type="button" class="tkm-inline-link" data-action="toggle-holiday-rest" data-id="${escapeHtml(id)}">${expanded ? '收起其余' : `查看其余 ${templates.length - 4} 项`}</button>` : ''}</div>` : ''}</section>`;
    }

    function holidayManager(active) {
        if (!active) return '<p class="tkm-settings-empty">请先在「时间－日历」中绑定历法。</p>';
        if (state.holidayPresetCalendarId !== active.id) {
            state.holidayPresetCalendarId = active.id;
            state.holidayPackOpen = [];
            state.holidayDraft = null;
            state.holidayEditingId = null;
            state.holidayMessage = '';
        }
        const events = calendarService.events(active.id).filter(item => item.kind === 'holiday');
        const overrides = new Map(events.filter(item => item.templateId).map(item => [item.templateId, item]));
        const packs = holidayTemplatePacks(active.type);
        const packNames = { 'traditional-cn': '中国传统节日', 'modern-common': '现代常见节日', 'western-common': '西方常见节日', 'solar-terms': '节气' };
        const categories = ['traditional-cn', 'modern-common', 'western-common', 'solar-terms'].map(id => {
            const pack = packs.find(item => item.id === id);
            return pack ? holidayCategory(active, id, packNames[id], holidayTemplates(id, active.type), overrides) : '';
        }).join('');
        const customEvents = events.filter(item => !item.templateId);
        const customRows = customEvents.map(item => holidayRecord(active, item)).join('');
        const customOpen = new Set(Array.isArray(state.holidayPackOpen) ? state.holidayPackOpen : []).has('custom');
        const customCategory = `<section class="tkm-holiday-category ${customOpen ? 'is-open' : ''}"><button type="button" data-action="toggle-holiday-category" data-id="custom" aria-expanded="${customOpen}"><span><strong>自定义节日</strong><small>${customEvents.length} 项</small></span><i aria-hidden="true"></i></button>${customOpen ? `<div class="tkm-holiday-category__items">${customRows || '<p class="tkm-holiday-empty">还没有自定义节日。</p>'}</div>` : ''}</section>`;
        const type = calendarTypeLabel(active);
        return `<section class="tkm-holiday-manager"><div class="tkm-holiday-manager__heading"><div class="tkm-holiday-calendar-label"><strong>${escapeHtml(active.name)}</strong><span>${escapeHtml(type)} · 当前历法</span></div><div class="tkm-holiday-heading-actions"><button type="button" class="tkm-inline-link" data-action="go-route" data-route="settings.time.holiday">提醒设置 ›</button><button type="button" data-action="new-holiday">＋ 新建</button></div></div>${holidayCalendarDisplaySettings(active)}${state.holidayMessage && !state.holidayDraft ? `<p class="tkm-inline-success">${escapeHtml(state.holidayMessage)}</p>` : ''}<div class="tkm-holiday-list-heading"><h3>节日与习俗</h3><details class="tkm-holiday-notice"><summary aria-label="查看节日资料说明"><span aria-hidden="true">i</span></summary><p>${HOLIDAY_DATA_NOTICE}</p></details></div><div class="tkm-holiday-categories">${categories}${customCategory}</div>${state.holidayDraft && !state.holidayEditingId ? holidayEditor(active) : ''}</section>`;
    }

    function schemeMonthFields(scheme) {
        const seasons = ['春', '夏', '秋', '冬'];
        const rows = seasons.map((season, seasonIndex) => {
            const months = scheme.months.slice(seasonIndex * 3, seasonIndex * 3 + 3);
            return `<div class="tkm-scheme-season-row"><span>${season}</span>${months.map((month, offset) => {
                const index = seasonIndex * 3 + offset;
                const large = Number(month.days) === 30;
                return `<button type="button" data-action="toggle-fictional-month-size" data-scheme-id="${escapeHtml(scheme.id)}" data-month-index="${index}" aria-label="${escapeHtml(month.name)}，${large ? '大月三十天' : '小月二十九天'}"><span>${escapeHtml(month.name)}</span><b>${large ? '大' : '小'}</b></button>`;
            }).join('')}</div>`;
        }).join('');
        return `<div class="tkm-scheme-months"><p>大月 30 天 · 小月 29 天</p><div class="tkm-scheme-month-grid">${rows}</div></div>`;
    }

    function schemeSummary(scheme) {
        const large = scheme.months.filter(month => Number(month.days) === 30).length;
        const small = scheme.months.length - large;
        const leap = scheme.leapMonth
            ? ` · 闰${scheme.months[scheme.leapMonth.afterMonth - 1]?.name ?? ''}（${Number(scheme.leapMonth.days) === 30 ? '大' : '小'}）`
            : '';
        const source = scheme.sourceYear ? ` · 参考 ${scheme.sourceYear} 年农历` : '';
        return `${large} 个大月 · ${small} 个小月${leap}${source}`;
    }

    function solarTermEditor(scheme) {
        const terms = Array.isArray(scheme.solarTerms) ? scheme.solarTerms : [];
        const focusTarget = Boolean(state.fictionalTermFocusName && terms.some(term => term.name === state.fictionalTermFocusName));
        const open = focusTarget || state.fictionalTermOpenSchemeIds.has(scheme.id);
        const rows = terms.map((term, index) => `<div class="tkm-solar-term-row"><input type="text" data-fictional-term-field="name" data-scheme-id="${escapeHtml(scheme.id)}" data-term-index="${index}" value="${escapeHtml(term.name)}" placeholder="节气名称" aria-label="节气名称"><select data-fictional-term-field="monthId" data-scheme-id="${escapeHtml(scheme.id)}" data-term-index="${index}" aria-label="${escapeHtml(term.name || '节气')}所在月份">${term.monthId ? '' : '<option value="" selected disabled>选择月份</option>'}${scheme.months.map(month => `<option value="${escapeHtml(month.id)}" ${term.monthId === month.id ? 'selected' : ''}>${escapeHtml(month.name)}</option>`).join('')}${scheme.leapMonth ? `<option value="leap-month-${scheme.leapMonth.afterMonth}" ${term.monthId === `leap-month-${scheme.leapMonth.afterMonth}` ? 'selected' : ''}>闰${escapeHtml(scheme.months[scheme.leapMonth.afterMonth - 1].name)}</option>` : ''}</select><input type="number" inputmode="numeric" min="1" max="30" data-fictional-term-field="day" data-scheme-id="${escapeHtml(scheme.id)}" data-term-index="${index}" value="${escapeHtml(term.day)}" placeholder="日" aria-label="日期"><button type="button" class="danger tkm-icon-action" data-action="remove-fictional-solar-term" data-scheme-id="${escapeHtml(scheme.id)}" data-term-index="${index}" aria-label="删除${escapeHtml(term.name || '节气')}">${TRASH_ICON}</button></div>`).join('');
        return `<details class="tkm-solar-term-editor ${focusTarget ? 'is-focus-target' : ''}" data-scheme-id="${escapeHtml(scheme.id)}" ${open ? 'open' : ''}><summary>节气（${terms.length}）</summary><div>${focusTarget ? `<p class="tkm-solar-term-guidance">请设置「${escapeHtml(state.fictionalTermFocusName)}」所在月份与日期；按年份循环时，每种年份规则都需要设置。</p>` : ''}${rows || '<p class="tkm-settings-empty">还没有配置节气。</p>'}<button type="button" class="tkm-text-action" data-action="add-fictional-solar-term" data-scheme-id="${escapeHtml(scheme.id)}">＋ 添加节气</button></div></details>`;
    }

    function fictionalSchemeCard(scheme, index, total) {
        const open = state.fictionalSchemeOpenId === scheme.id;
        const leap = scheme.leapMonth;
        const genericName = /^(默认方案|方案\s*\d+|循环第\s*\d+\s*年)$/.test(scheme.name ?? '');
        const displayName = scheme.name && !genericName ? ` · ${scheme.name}` : '';
        return `<section class="tkm-year-scheme ${open ? 'is-open' : ''}"><header><button type="button" data-action="toggle-fictional-scheme" data-id="${escapeHtml(scheme.id)}"><strong>第 ${index + 1} 年${escapeHtml(displayName)}</strong><small>${escapeHtml(schemeSummary(scheme))}</small><i aria-hidden="true"></i></button><span><button type="button" data-action="move-fictional-scheme-up" data-index="${index}" aria-label="上移" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-fictional-scheme-down" data-index="${index}" aria-label="下移" ${index === total - 1 ? 'disabled' : ''}>↓</button><button type="button" class="danger tkm-icon-action" data-action="remove-fictional-scheme" data-index="${index}" aria-label="删除循环年份" ${total === 1 ? 'disabled' : ''}>${TRASH_ICON}</button></span></header>${open ? `<div class="tkm-year-scheme__body"><label class="tkm-fictional-name-field"><span>年份名称</span><input type="text" data-fictional-scheme-name data-scheme-id="${escapeHtml(scheme.id)}" value="${escapeHtml(genericName ? '' : scheme.name)}" placeholder="可选"></label>${schemeMonthFields(scheme)}<div class="tkm-leap-month">${leap ? `<label><span>闰月</span><select data-fictional-leap-field="afterMonth" data-scheme-id="${escapeHtml(scheme.id)}">${scheme.months.map((month, monthIndex) => `<option value="${monthIndex + 1}" ${Number(leap.afterMonth) === monthIndex + 1 ? 'selected' : ''}>${escapeHtml(month.name)}之后</option>`).join('')}</select></label><select data-fictional-leap-field="days" data-scheme-id="${escapeHtml(scheme.id)}" aria-label="闰月大小"><option value="29" ${Number(leap.days) === 29 ? 'selected' : ''}>小月</option><option value="30" ${Number(leap.days) === 30 ? 'selected' : ''}>大月</option></select><button type="button" class="danger" data-action="remove-fictional-leap" data-id="${escapeHtml(scheme.id)}">删除闰月</button>` : `<button type="button" data-action="add-fictional-leap" data-id="${escapeHtml(scheme.id)}">添加闰月</button>`}</div>${solarTermEditor(scheme)}</div>` : ''}</section>`;
    }

    function repeatedFictionalYear(scheme) {
        const leap = scheme.leapMonth;
        return `<section class="tkm-repeated-year"><header><h2>每年月份</h2><span>${escapeHtml(schemeSummary(scheme))}</span></header>${schemeMonthFields(scheme)}<div class="tkm-leap-month">${leap ? `<label><span>闰月</span><select data-fictional-leap-field="afterMonth" data-scheme-id="${escapeHtml(scheme.id)}">${scheme.months.map((month, monthIndex) => `<option value="${monthIndex + 1}" ${Number(leap.afterMonth) === monthIndex + 1 ? 'selected' : ''}>${escapeHtml(month.name)}之后</option>`).join('')}</select></label><select data-fictional-leap-field="days" data-scheme-id="${escapeHtml(scheme.id)}" aria-label="闰月大小"><option value="29" ${Number(leap.days) === 29 ? 'selected' : ''}>小月</option><option value="30" ${Number(leap.days) === 30 ? 'selected' : ''}>大月</option></select><button type="button" class="danger" data-action="remove-fictional-leap" data-id="${escapeHtml(scheme.id)}">删除闰月</button>` : `<button type="button" data-action="add-fictional-leap" data-id="${escapeHtml(scheme.id)}">添加闰月</button>`}</div>${solarTermEditor(scheme)}</section>`;
    }

    function fictionalCalendarEditor() {
        const draft = state.fictionalCalendarDraft;
        if (!draft) return '';
        const importDraft = state.fictionalCalendarImportDraft;
        const repeated = draft.schemes.find(scheme => scheme.id === draft.defaultSchemeId) ?? draft.schemes[0];
        if (!state.fictionalCalendarEditingId && state.fictionalCalendarSetupStep === 'source') {
            return `<section class="tkm-calendar-onboarding"><button type="button" class="tkm-calendar-onboarding__back" data-action="cancel-fictional-calendar">‹ 返回</button><h1>月份怎样建立？</h1><div><button type="button" data-action="choose-fictional-setup" data-choice="import"><span><strong>从现实农历导入</strong><small>选择一个或多个连续参考年份</small></span><i aria-hidden="true">›</i></button><button type="button" data-action="choose-fictional-setup" data-choice="manual"><span><strong>自己设置月份</strong><small>逐月设置名称与天数</small></span><i aria-hidden="true">›</i></button></div></section>`;
        }
        const yearContent = draft.cycle.enabled
            ? `<section class="tkm-year-cycle"><header><h2>月份安排</h2><p>${draft.schemes.length === 1 ? '这套月份每年重复。' : `${draft.schemes.length} 套月份按顺序重复。`}</p></header><div class="tkm-year-schemes">${draft.schemes.map((scheme, index) => fictionalSchemeCard(scheme, index, draft.schemes.length)).join('')}</div></section>`
            : repeatedFictionalYear(repeated);
        const singleYear = state.fictionalImportSingleYear === true;
        const importFields = `<div class="tkm-fictional-import-mode" role="group" aria-label="导入年份方式"><button type="button" data-action="fictional-import-mode" data-mode="single" aria-pressed="${singleYear}">只导入一年</button><button type="button" data-action="fictional-import-mode" data-mode="range" aria-pressed="${!singleYear}">连续导入</button></div><div><label><span>参考现实年份</span><span class="tkm-fictional-import-range"><input type="number" inputmode="numeric" min="1949" max="2036" data-fictional-import="startYear" value="${escapeHtml(importDraft.startYear)}">${singleYear ? '' : `<i>—</i><input type="number" inputmode="numeric" min="1949" max="2036" data-fictional-import="endYear" value="${escapeHtml(importDraft.endYear)}">`}</span></label></div><button type="button" class="tkm-inline-link" data-action="return-fictional-import">‹ 返回历法编辑</button>`;
        const importSummary = singleYear || Number(importDraft.startYear) === Number(importDraft.endYear)
            ? '只导入一年时，这套月份每年重复。'
            : `导入 ${Math.abs(Number(importDraft.endYear) - Number(importDraft.startYear)) + 1} 年时，按相同年数为一轮重复。`;
        return `<form class="tkm-fictional-editor" data-tkm-form="fictional-calendar"><header><h1>${state.fictionalCalendarEditingId ? '编辑架空王朝历法' : '新建架空王朝历法'}</h1></header>${state.fictionalCalendarMessage ? `<p class="tkm-inline-error">${escapeHtml(state.fictionalCalendarMessage)}</p>` : ''}<label class="tkm-fictional-name-field"><span>历法名称</span><input type="text" data-fictional-field="name" value="${escapeHtml(draft.name)}"></label>${state.fictionalCalendarSetupStep === 'import' ? '' : yearContent}<div class="tkm-fictional-tools">${state.fictionalCalendarSetupStep === 'editor' && draft.cycle.enabled ? '<button type="button" data-action="add-fictional-scheme">增加年份</button>' : ''}<button type="button" data-action="toggle-fictional-import" aria-expanded="${state.fictionalCalendarImportOpen}">从现实农历导入</button></div>${state.fictionalCalendarImportOpen ? `<section class="tkm-fictional-import"><header><strong>导入月份安排</strong></header>${importFields}<p>${escapeHtml(importSummary)}</p><label><input type="checkbox" data-fictional-import="includeSolarTerms" ${importDraft.includeSolarTerms ? 'checked' : ''}> 同时导入二十四节气</label><button type="button" data-action="import-fictional-years">应用这些年份</button></section>` : ''}<footer><button type="button" data-action="cancel-fictional-calendar">取消</button>${state.fictionalCalendarSetupStep === 'import' ? '' : '<button type="submit">保存架空王朝历法</button>'}</footer></form>`;
    }

    function fictionalMonthGrid(active) {
        ensureCalendarCursor(active);
        const months = monthsInCalendarYear(active, state.calendarYear);
        const month = months[state.calendarMonth - 1];
        const scheme = resolveFictionalYearScheme(active, state.calendarYear);
        const terms = active.config?.holidaySettings?.showSolarTerms === false ? [] : (scheme.solarTerms?.filter(item => item.monthId === month.id) ?? []);
        const leading = ((calendarDayDistance(active, { calendarId: active.id, year: 1, month: 1, day: 1 }, { calendarId: active.id, year: state.calendarYear, month: state.calendarMonth, day: 1 }) % 7) + 7) % 7;
        const blanks = Array.from({ length: leading }, () => '<span class="tkm-month-blank" aria-hidden="true"></span>').join('');
        const cells = Array.from({ length: month.days }, (_, index) => {
            const day = index + 1;
            const specials = month.isLeap ? [] : projectedSpecialDates(month.ordinal, day);
            const allEvents = eventsForDay(active, day, { includePaused: true });
            const events = allEvents.filter(item => item.kind === 'schedule' && item.status === 'enabled');
            const holidays = active.config?.holidaySettings?.showHolidays === false ? [] : allEvents.filter(item => item.kind === 'holiday' && !(item.dateRule?.type === 'solar-term' && item.templatePack === 'solar-terms'));
            const builtIns = builtInHolidaysForDay(active, day);
            const term = terms.find(item => Number(item.day) === day)?.name ?? '';
            const selected = state.calendarDay === day;
            const holidayName = holidays[0]?.name || builtIns[0]?.name || '';
            const markers = calendarMarkerStrip({ specials, events, holiday: holidayName, solarTerm: term });
            return `<button type="button" class="tkm-month-day ${selected ? 'active' : ''} ${specials.length ? 'has-special' : ''} ${events.length ? 'has-event' : ''}" data-action="select-calendar-day" data-day="${day}" aria-pressed="${selected}"><strong>${day}</strong><small>${escapeHtml(TRADITIONAL_DAY_NAMES[day])}</small>${markers}</button>`;
        }).join('');
        return `${blanks}${cells}`;
    }

    function selectedFictionalDay(active) {
        const month = monthsInCalendarYear(active, state.calendarYear)[state.calendarMonth - 1];
        const scheme = resolveFictionalYearScheme(active, state.calendarYear);
        const term = active.config?.holidaySettings?.showSolarTerms === false ? '' : (scheme.solarTerms?.find(item => item.monthId === month.id && Number(item.day) === state.calendarDay)?.name ?? '');
        const specials = month.isLeap ? [] : projectedSpecialDates(month.ordinal, state.calendarDay);
        return calendarDayActions(active, specials, '', term, builtInHolidaysForDay(active));
    }

    function customMonthGrid(active) {
        ensureCalendarCursor(active);
        const months = monthsInCalendarYear(active, state.calendarYear);
        const days = daysInCalendarMonth(active, state.calendarYear, state.calendarMonth);
        const daysPerYear = months.reduce((total, month) => total + Number(month.days), 0);
        const priorMonths = months.slice(0, state.calendarMonth - 1).reduce((total, month) => total + Number(month.days), 0);
        const leading = (((state.calendarYear - 1) * daysPerYear) + priorMonths) % 7;
        const blanks = Array.from({ length: leading }, () => '<span class="tkm-month-blank" aria-hidden="true"></span>').join('');
        const cells = Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const selected = state.calendarDay === day;
            const allEvents = eventsForDay(active, day, { includePaused: true });
            const events = allEvents.filter(item => item.kind === 'schedule' && item.status === 'enabled');
            const holidays = allEvents.filter(item => item.kind === 'holiday');
            return `<button type="button" class="tkm-month-day ${selected ? 'active' : ''} ${events.length ? 'has-event' : ''}" data-action="select-calendar-day" data-day="${day}" aria-pressed="${selected}"><strong>${day}</strong>${calendarMarkerStrip({ events, holiday: holidays[0]?.name })}</button>`;
        }).join('');
        return `${blanks}${cells}`;
    }

    function selectedCustomDay(active) {
        const month = monthsInCalendarYear(active, state.calendarYear)[state.calendarMonth - 1];
        return calendarDayActions(active);
    }

    function renderCalendar() {
        const active = calendarService.active();
        if (state.fictionalCalendarDraft) {
            shell.innerHTML = `${header('日历', { rootTitle: true })}<main class="tkm-shell__body tkm-calendar-workface">${fictionalCalendarEditor()}</main>${nav()}`;
            return;
        }
        if (state.customCalendarDraft) {
            shell.innerHTML = `${header('日历', { rootTitle: true })}<main class="tkm-shell__body tkm-calendar-workface">${customCalendarEditor()}</main>${nav()}`;
            return;
        }
        if (!active) {
            shell.innerHTML = `${header('日历', { rootTitle: true })}<main class="tkm-shell__body tkm-calendar-workface"><section class="tkm-calendar-bind"><h1>为当前聊天选择历法</h1><div><button type="button" data-action="bind-modern-calendar"><span><strong>年月日</strong><small>公历、农历、节气与常用节日</small></span><i aria-hidden="true">›</i></button><button type="button" data-action="new-fictional-calendar"><span><strong>架空王朝历法</strong><small>使用故事自己的年份与月份</small></span><i aria-hidden="true">›</i></button><button type="button" data-action="new-custom-calendar"><span><strong>自定义历法</strong><small>自定义月份名称与天数</small></span><i aria-hidden="true">›</i></button></div></section></main>${nav()}`;
            return;
        }
        ensureCalendarCursor(active);
        const fictional = active.type === 'fictional';
        const custom = active.type === 'custom';
        const month = fictional || custom ? monthsInCalendarYear(active, state.calendarYear)[state.calendarMonth - 1] : null;
        const era = fictional ? eraPartsFromOrdinal(state.calendarYear) : null;
        const title = fictional ? `${era.era ? `${era.era}${era.year}年` : `第 ${era.year} 年`} · ${month.name}` : (custom ? `${state.calendarYear} 年 · ${month.name}` : `${state.calendarYear} 年 ${state.calendarMonth} 月`);
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        const grid = fictional ? fictionalMonthGrid(active) : (custom ? customMonthGrid(active) : modernMonthGrid(active));
        const summary = fictional ? selectedFictionalDay(active) : (custom ? selectedCustomDay(active) : selectedCalendarDay(active));
        const storyTime = storyTimeService.read().current?.raw || '尚未设置';
        const settingsAction = `<button type="button" class="tkm-calendar-settings-trigger" data-action="toggle-calendar-selector" aria-expanded="${state.calendarSelectorOpen}">日历设置</button>`;
        const returnToCurrent = calendarCursorIsCurrent(active) ? '' : '<button type="button" class="tkm-calendar-return-current" data-action="return-current-calendar-date">回到当前</button>';
        shell.innerHTML = `${header('日历', { rootTitle: true, actions: settingsAction })}<main class="tkm-shell__body tkm-calendar-workface"><button type="button" class="tkm-story-time-context" data-action="open-story-time"><span>当前故事日期</span><strong>${escapeHtml(storyTime)}</strong><i aria-hidden="true">›</i></button>${calendarSelector(active)}<section class="tkm-month-surface ${fictional ? 'tkm-month-surface--fictional' : (custom ? 'tkm-month-surface--custom' : '')}"><header><button type="button" data-action="previous-calendar-month" aria-label="上个月">‹</button><div class="tkm-calendar-month-heading"><h1>${escapeHtml(title)}</h1>${returnToCurrent}</div><button type="button" data-action="next-calendar-month" aria-label="下个月">›</button></header><div class="tkm-month-weekdays" aria-hidden="true">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="tkm-month-grid tkm-month-grid--full">${grid}</div></section>${summary}${countdownOverview(active)}</main>${nav()}`;
    }

    function renderScheduleEditor() {
        const active = calendarService.active();
        if (!active || !state.calendarEventDraft) {
            router.reset('time.calendar');
            renderCalendar();
            return;
        }
        const title = state.calendarEventEditingId ? '编辑日程' : '新建日程';
        shell.innerHTML = `${focusedHeader(title, 'tkm-calendar-event-form', '返回日历')}<main class="tkm-shell__body tkm-schedule-editor-scroll">${calendarEventForm(active)}</main>`;
    }

    function renderHolidayManagement() {
        const active = calendarService.active();
        if (!active) {
            router.reset('time.calendar');
            renderCalendar();
            return;
        }
        shell.innerHTML = `${header('节日与习俗')}<main class="tkm-shell__body tkm-holiday-management-page">${holidayManager(active)}</main>`;
    }

    function recallSettingsMarkup() {
        if (!state.recallSettingsDraft) {
            state.recallSettingsDraft = recallSettingsService.read();
            state.recallSettingsMessage = '';
            state.recallSettingsMessageType = '';
            dirty.setBaseline('recall-settings', state.recallSettingsDraft);
        }
        const draft = state.recallSettingsDraft;
        let residentCount = 0;
        try { residentCount = memoryLibraryService.read().filter(memory => memory.mode === 'resident').length; } catch { /* No current chat. */ }
        const excludedTerms = draft.excludedTerms ?? [];
        return `<form class="tkm-settings-child-form tkm-recall-policy" data-tkm-form="recall-settings">
            ${state.recallSettingsMessage ? (state.recallSettingsMessageType === 'success' ? `<aside class="tkm-summary-feedback-toast" role="status">${escapeHtml(state.recallSettingsMessage)}</aside>` : `<p class="tkm-inline-error" role="alert">${escapeHtml(state.recallSettingsMessage)}</p>`) : ''}
            <section class="tkm-settings-surface" aria-labelledby="tkm-recall-range">
                <h2 id="tkm-recall-range">匹配范围</h2>
                <label class="tkm-settings-row tkm-settings-row--field"><span class="tkm-settings-row__copy"><strong>最近匹配楼层</strong><small>除当前输入外，再读取最近楼层参与匹配</small></span><input class="tkm-settings-number" type="number" inputmode="numeric" min="0" step="1" data-recall-setting="recentFloorCount" value="${escapeHtml(draft.recentFloorCount)}"></label>
            </section>
            <section class="tkm-settings-surface" aria-labelledby="tkm-recall-current">
                <h2 id="tkm-recall-current">当前聊天</h2>
                <div class="tkm-settings-row"><span class="tkm-settings-row__copy"><strong>常驻记忆</strong><small>不占触发召回的条数或 Token 上限</small></span><output class="tkm-settings-value">${residentCount} 条</output></div>
            </section>
            <section class="tkm-settings-surface" aria-labelledby="tkm-recall-trigger">
                <h2 id="tkm-recall-trigger">触发召回</h2>
                <div class="tkm-settings-compact-grid"><label><span>召回数上限</span><input class="tkm-settings-number" type="number" inputmode="numeric" min="1" step="1" data-recall-setting="maxCount" value="${escapeHtml(draft.maxCount)}"></label><label><span>Token 上限</span><input class="tkm-settings-number tkm-settings-number--wide" type="number" inputmode="numeric" min="1" step="1" data-recall-setting="maxTokens" value="${escapeHtml(draft.tokenEnabled ? draft.maxTokens : '')}" placeholder="留空则无上限"></label></div>
                <p class="tkm-settings-note">Token 留空表示不限制；单条完整记忆不会被截断。</p>
            </section>
            <section class="tkm-settings-surface tkm-recall-excluded" aria-labelledby="tkm-recall-excluded-title">
                <h2 id="tkm-recall-excluded-title">排除词</h2>
                <div class="tkm-recall-excluded__add"><input type="text" data-recall-excluded-term value="${escapeHtml(state.recallExcludedTermDraft)}" placeholder="输入完整词" autocomplete="off" aria-label="新增排除词"><button type="button" data-action="add-recall-excluded-term">添加</button></div>
                ${excludedTerms.length ? `<div class="tkm-recall-excluded__list" aria-label="已有排除词">${excludedTerms.map(term => `<span class="tkm-recall-excluded__chip"><span>${escapeHtml(term)}</span><button type="button" data-action="remove-recall-excluded-term" data-term="${escapeHtml(term)}" aria-label="删除排除词 ${escapeHtml(term)}">×</button></span>`).join('')}</div>` : '<p class="tkm-settings-note">还没有排除词。</p>'}
            </section>
            <section class="tkm-settings-surface tkm-recall-special-surface" aria-labelledby="tkm-recall-special">
                <div class="tkm-settings-section-heading"><h2 id="tkm-recall-special">纪念日召回</h2><button type="button" class="tkm-settings-heading-link" data-action="go-route" data-route="time.anniversaries"><span>管理纪念日</span><i aria-hidden="true"></i></button></div>
                <label class="tkm-settings-row tkm-settings-row--field"><span class="tkm-settings-row__copy"><strong>纪念日记忆上限</strong><small>同日与命名纪念日相关记忆共享</small></span><input class="tkm-settings-number" type="number" inputmode="numeric" min="1" step="1" data-recall-setting="anniversaryPoolLimit" value="${escapeHtml(draft.anniversaryPoolLimit)}"></label>
                <div class="tkm-settings-row"><span class="tkm-settings-row__copy"><strong>自动同日回忆</strong></span>${settingsSwitch('toggle-recall-same-day', draft.automaticSameDayEnabled, '自动同日回忆')}</div>
                <p class="tkm-settings-note">上限留空只停止相关记忆选取，不关闭纪念日当天或提前提醒。</p>
            </section>
            <section class="tkm-settings-surface" aria-labelledby="tkm-recall-position">
                <h2 id="tkm-recall-position">注入位置</h2>
                <label class="tkm-settings-row tkm-settings-row--field"><span class="tkm-settings-row__copy"><strong>记忆内容</strong></span><input class="tkm-settings-number" type="number" inputmode="numeric" min="0" max="10000" step="1" data-recall-setting="memoryInjectionDepth" value="${escapeHtml(draft.memoryInjectionDepth)}"></label>
            </section>
            <section class="tkm-settings-list tkm-ui-surface" aria-label="召回配置工具">${settingsDirectoryRow('settings.regex', '召回文本清洗')}</section>
        </form>`;
    }

    function settingsDirectoryRow(routeId, title, summary) {
        return `<button type="button" class="tkm-settings-entry tkm-ui-row" data-action="go-route" data-route="${routeId}"><span class="tkm-settings-entry__copy"><strong>${title}</strong>${summary ? `<small>${summary}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
    }

    function settingsSwitch(action, checked, label, disabled = false, extra = '') {
        return `<button type="button" class="tkm-feature-switch ${checked ? 'is-on' : ''}" role="switch" aria-checked="${checked}" aria-label="${escapeHtml(label)}" data-action="${action}" ${disabled ? 'disabled' : ''} ${extra}><span aria-hidden="true"></span></button>`;
    }

    function eventMemoryRecallDirectory({ includeMonitor = true } = {}) {
        const entry = (routeId, title) => `<button type="button" data-action="go-route" data-route="${routeId}">${title}</button>`;
        const monitor = includeMonitor ? entry('recall.monitor', '召回监控') : '';
        return `<nav class="tkm-memory-recall-directory" aria-label="事件记忆工具">${monitor}${entry('recall.settings', '召回设置')}${entry('settings.summary', '事件总结设置')}</nav>`;
    }

    function summaryId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function summarySettings() {
        const settings = getGlobalSettings();
        settings.summary ??= structuredClone(DEFAULT_GLOBAL_SETTINGS.summary);
        settings.summary.promptOverrides = normalizePromptOverrides(settings.summary.promptOverrides);
        settings.summary.fastModeWarningAcknowledged ??= false;
        settings.summary.cleaning ??= { rules: [], shortcuts: [] };
        return settings.summary;
    }

    async function commitSummarySettings(nextSummary) {
        return persistSummarySettings({ getGlobalSettings, saveGlobalSettings, nextSummary: syncActivePromptProfile(nextSummary) });
    }

    function summaryPromptProfileMarkup(summary) {
        const profiles = summary.promptProfiles ?? [];
        return `<details class="tkm-summary-prompt-profiles"><summary>提示词方案${profiles.find(p => p.id === summary.activePromptProfileId) ? ` · ${escapeHtml(profiles.find(p => p.id === summary.activePromptProfileId).name)}` : ''}</summary><label><span>切换方案</span><select data-summary-prompt-profile><option value="" ${summary.activePromptProfileId ? '' : 'selected'} disabled>当前提示词</option>${profiles.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === summary.activePromptProfileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label><div class="tkm-summary-inline-heading"><input class="tkm-summary-field-control" data-summary-profile-name aria-label="新方案名称" value="${escapeHtml(state.summaryProfileName ?? '')}" placeholder="新方案名称"><button type="button" data-action="save-summary-prompt-profile">另存方案</button>${summary.activePromptProfileId ? '<button type="button" class="danger" data-action="delete-summary-prompt-profile">删除方案</button>' : ''}</div></details>`;
    }

    function showSummarySettingsMessage(message, type = 'success') {
        state.summarySettingsMessage = message;
        state.summarySettingsMessageType = type;
        if (summaryMessageTimer) windowRef?.clearTimeout?.(summaryMessageTimer);
        if (type === 'success') {
            summaryMessageTimer = windowRef?.setTimeout?.(() => {
                summaryMessageTimer = null;
                state.summarySettingsMessage = '';
                // Summary routes belong to Memory now. Remove only the out-of-flow
                // toast; rerendering would steal focus and reset the editor scroll.
                if (!shell.hidden && router.current().routeId.startsWith('settings.summary')) shell.querySelector('.tkm-summary-toast')?.remove();
            }, 2200);
        }
    }

    function summarySettingsStatus() {
        if (!state.summarySettingsMessage) return '';
        const className = state.summarySettingsMessageType === 'error' ? 'tkm-inline-error' : 'tkm-summary-toast';
        return `<p class="${className}" role="${state.summarySettingsMessageType === 'error' ? 'alert' : 'status'}">${escapeHtml(state.summarySettingsMessage)}</p>`;
    }

    function revealSummaryReorderFeedback(action, selector) {
        const feedback = state.summaryReorderFeedback;
        if (!feedback) return;
        const row = shell.querySelector(selector);
        const reducedMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        row?.classList.add('tkm-reorder-feedback');
        let live = shell.querySelector('[data-summary-reorder-status]');
        if (!live) {
            live = documentRef.createElement('p');
            live.className = 'tkm-visually-hidden';
            live.dataset.summaryReorderStatus = '';
            live.setAttribute('role', 'status');
            live.setAttribute('aria-live', 'polite');
            shell.querySelector('.tkm-shell__body')?.append(live);
        }
        if (live) live.textContent = `已移至第 ${feedback.position} 条`;
        row?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
        const focusTarget = row?.querySelector(`[data-action="${action}"]:not(:disabled)`)
            ?? row?.querySelector('[data-action*="move-summary-"]:not(:disabled)');
        focusTarget?.focus?.();
        if (reorderFeedbackTimer) windowRef?.clearTimeout?.(reorderFeedbackTimer);
        reorderFeedbackTimer = windowRef?.setTimeout?.(() => {
            row?.classList.remove('tkm-reorder-feedback');
            if (live) live.textContent = '';
            state.summaryReorderFeedback = null;
            reorderFeedbackTimer = null;
        }, 900);
    }

    function summaryPromptStructureMarkup(keys) {
        return keys.map(key => {
            const parts = summaryPromptStructure(summarySettings(), key).reduce((rows, part) => {
                const previous = rows.at(-1);
                if (part.id === 'format.output' && previous?.id === 'format.contract') {
                    rows[rows.length - 1] = { ...previous, content: `${previous.content}\n\n${part.content}` };
                } else rows.push(part);
                return rows;
            }, []);
            return `<section class="tkm-summary-inline-group"><h3>${escapeHtml(PROMPT_TEXT_DEFINITIONS[key].title)}</h3>${parts.map(part => {
            const editorKey = part.editorKey ?? (part.id === 'task.identity' ? `${key}Identity` : part.id === 'rules.context' ? `${key}Context` : ['rules.generation', 'prompt.aliases'].includes(part.id) ? key : null);
            const customId = part.id.startsWith('prompt.custom.') ? part.id.slice('prompt.custom.'.length) : null;
            const name = part.id === 'rules.generation' ? (['fast', 'qualitySummary', 'enhancedSummary'].includes(key) ? '总结要求' : key === 'merge' ? '合并要求' : key === 'aliases' ? '检索简称要求' : '关键词要求') : part.id === 'rules.context' ? '补充要求' : part.id === 'content.input' ? '待处理内容' : part.id.startsWith('format.') ? '格式要求' : part.name;
            if (!editorKey && !customId) return `<details class="tkm-summary-prompt-structure"><summary class="tkm-summary-inline-toggle"><span>${escapeHtml(name)}<small class="tkm-summary-prompt-permission">只读</small></span><span class="tkm-summary-readonly-chevron" aria-hidden="true">⌄</span></summary><pre>${escapeHtml(part.content)}</pre></details>`;
            const open = editorKey ? state.summaryPromptTextDraft?.key === editorKey : state.summaryCustomPromptDraft?.id === customId && state.summaryPromptStage === key;
            return `<section class="tkm-summary-inline-prompt ${open ? 'is-open' : ''}"><button type="button" class="tkm-summary-inline-toggle" data-stage="${key}" data-action="${customId ? 'edit-summary-custom-prompt' : 'edit-summary-prompt-text'}" ${customId ? `data-id="${escapeHtml(customId)}"` : `data-key="${editorKey}"`} aria-expanded="${open}"><span>${escapeHtml(name)}</span><span aria-hidden="true">${open ? '⌃' : '⌄'}</span></button>${open ? summaryInlinePromptForm() : ''}</section>`;
        }).join('')}</section>`;
        }).join('');
    }

    function renderSummarySettings() {
        const summary = summarySettings();
        if (state.summaryPromptFullscreen && (state.summaryPromptTextDraft || state.summaryCustomPromptDraft)) { renderSummaryPromptEditor(); return; }
        const modes = [['fast', '一次生成', '一次生成正文、关键词和检索简称'], ['quality', '两次生成', '先生成正文，再生成关键词和检索简称'], ['enhanced', '三次生成', '依次生成正文、关键词、检索简称']];
        const keys = { fast: ['fast'], quality: ['qualitySummary', 'qualityKeywords'], enhanced: ['enhancedSummary', 'enhancedKeywords', 'aliases'] }[summary.generationMode] ?? ['qualitySummary', 'qualityKeywords'];
        const customRows = summary.promptOverrides.customPrompts.map(item => `<div class="tkm-summary-inline-heading"><span>${escapeHtml(item.name)}</span><button type="button" class="tkm-inline-link" data-action="delete-summary-custom-prompt" data-id="${escapeHtml(item.id)}" aria-label="删除${escapeHtml(item.name)}">删除</button></div>`).join('');
        const newCustom = state.summaryCustomPromptDraft && !summary.promptOverrides.customPrompts.some(item => item.id === state.summaryCustomPromptDraft.id);
        const library = eventLibraryStatus(summary);
        shell.innerHTML = `${header('事件总结设置')}<main class="tkm-shell__body tkm-settings-child tkm-summary-settings tkm-summary-inline-settings" data-tkm-scroll>${summarySettingsStatus()}<label class="tkm-summary-setting-toggle"><span>手动总结入库前检查</span><input type="checkbox" data-summary-setting="manualReviewEnabled" aria-label="手动总结入库前检查" ${summary.manualReviewEnabled !== false ? 'checked' : ''}></label><div class="tkm-summary-inline-group">${settingsDirectoryRow('settings.summary.cleaning', '事件总结文本清洗')}</div><h2>生成模式</h2><div role="radiogroup" aria-label="生成模式" class="tkm-summary-inline-modes">${modes.map(([mode, label]) => `<button type="button" data-action="set-summary-generation-mode" data-mode="${mode}" role="radio" aria-checked="${summary.generationMode === mode}"><span aria-hidden="true" class="tkm-summary-mode-check">${summary.generationMode === mode ? '✓' : ''}</span><span>${label}</span></button>`).join('')}</div><p class="tkm-summary-mode-description">${modes.find(([mode]) => mode === summary.generationMode)?.[2] ?? ''}</p>${summaryPromptProfileMarkup(summary)}<h2>总结记忆提示词</h2>${summaryPromptStructureMarkup(keys)}<h2>合并记忆提示词</h2>${summaryPromptStructureMarkup(['merge'])}<div class="tkm-summary-inline-heading"><h2>自定义提示词</h2><button type="button" class="tkm-inline-link" data-action="new-summary-custom-prompt">＋ 新建</button></div><div class="tkm-summary-inline-group">${customRows}${newCustom ? summaryInlinePromptForm() : ''}${!customRows && !newCustom ? '<p class="tkm-summary-inline-empty">暂无自定义提示词</p>' : ''}</div><h2>事件词库</h2><div class="tkm-summary-inline-group">${settingsDirectoryRow('settings.summary.events', '事件词库', `${library.source === 'custom' ? '已自定义' : '使用默认'} · ${library.count} 条`)}</div></main>`;
    }

    function summaryInlinePromptForm() {
        const custom = state.summaryCustomPromptDraft;
        const draft = custom ?? state.summaryPromptTextDraft;
        if (!draft) return '';
        const formKind = custom ? 'summary-custom-prompt' : 'summary-prompt-text';
        const attributes = custom ? 'data-summary-custom-prompt-field="content"' : 'data-summary-prompt-text-field="value"';
        const fullscreen = Boolean(state.summaryPromptFullscreen);
        const tools = fullscreen ? '<button type="button" class="tkm-inline-link" data-action="route-back">返回原位编辑</button>' : '<button type="button" class="tkm-inline-link" data-action="summary-prompt-fullscreen">全屏编辑 ↗</button>';
        return `<div class="tkm-summary-inline-editor"><div class="tkm-summary-inline-tools">${tools}</div><form id="tkm-${formKind}-form" data-tkm-form="${formKind}" novalidate>${custom && !fullscreen ? `<label><span>名称</span><input class="tkm-summary-field-control" data-summary-custom-prompt-field="name" value="${escapeHtml(custom.name)}"></label><label><span>插入位置</span><select data-summary-custom-prompt-field="position"><option value="before" ${custom.position !== 'after' ? 'selected' : ''}>AI 任务之前</option><option value="after" ${custom.position === 'after' ? 'selected' : ''}>AI 任务之后</option></select></label><p class="tkm-summary-insertion-order">${custom.position === 'after' ? 'AI 任务 → 此提示词 → 待处理内容' : '此提示词 → AI 任务 → 待处理内容'}</p>` : ''}<textarea class="tkm-summary-field-control" rows="8" ${attributes} aria-label="${escapeHtml(custom?.name || PROMPT_TEXT_DEFINITIONS[draft.key]?.title || '自定义提示词')}" spellcheck="false">${escapeHtml(custom ? custom.content : draft.value)}</textarea><div class="tkm-summary-inline-actions">${custom ? '' : '<button type="button" class="tkm-inline-link" data-action="restore-summary-prompt-text">恢复默认</button>'}<button type="button" data-action="cancel-summary-inline-prompt"><span>取消</span></button><button type="submit"><span>保存</span></button></div></form></div>`;
    }

    function renderSummaryPromptEditor() {
        const customDraft = state.summaryCustomPromptDraft;
        if (customDraft) {
            const editing = summarySettings().promptOverrides.customPrompts.some(item => item.id === customDraft.id);
            const title = editing ? customDraft.name || '编辑自定义' : '新建自定义';
            shell.innerHTML = `${focusedHeader(title, null, '返回原位编辑')}<main class="tkm-shell__body tkm-summary-prompt-editor" data-tkm-scroll>${summarySettingsStatus()}${summaryInlinePromptForm()}</main>`;
            return;
        }
        const draft = state.summaryPromptTextDraft;
        if (!draft) {
            renderSummarySettings(); return;
        }
        const title = PROMPT_TEXT_DEFINITIONS[draft.key].title;
        shell.innerHTML = `${focusedHeader(title, null, '返回原位编辑')}<main class="tkm-shell__body tkm-summary-prompt-editor" data-tkm-scroll>${summarySettingsStatus()}${summaryInlinePromptForm()}</main>`;
    }

    function regexEditorFieldsMarkup(draft, { fieldAttribute = 'regex-field', includeEnabled = false, includeCaptureGroup = false, includeReplace = true } = {}) {
        const field = name => `data-${fieldAttribute}="${name}"`;
        return `${includeEnabled ? `<label class="tkm-summary-cleaning-enabled tkm-summary-setting-toggle"><input type="checkbox" ${field('enabled')} ${draft.enabled !== false ? 'checked' : ''}><span>启用这条规则</span></label>` : ''}<div class="tkm-regex-editor-pair"><label><span>动作</span><select ${field('action')}><option value="extract" ${draft.action === 'extract' ? 'selected' : ''}>提取</option><option value="exclude" ${draft.action === 'exclude' ? 'selected' : ''}>排除</option>${includeReplace ? `<option value="replace" ${draft.action === 'replace' ? 'selected' : ''}>替换</option>` : ''}</select></label><label class="tkm-regex-flags"><span>正则标志</span><input type="text" ${field('flags')} value="${escapeHtml(draft.flags ?? 'su')}" placeholder="su"></label></div><label><span>正则表达式</span><textarea rows="4" ${field('pattern')} spellcheck="false">${escapeHtml(draft.pattern ?? '')}</textarea></label>${includeCaptureGroup && draft.action === 'extract' ? `<label><span>提取分组</span><input type="number" min="0" step="1" ${field('captureGroup')} value="${escapeHtml(draft.captureGroup ?? 0)}"></label>` : ''}${draft.action === 'replace' ? `<label><span>替换文字</span><textarea rows="2" ${field('replacement')}>${escapeHtml(draft.replacement ?? '')}</textarea></label>` : ''}`;
    }

    function summaryCleaningEditorMarkup() {
        const draft = state.summaryCleaningRuleDraft;
        if (!draft) return '';
        const inspected = draft.pattern ? inspectGlobalRegexRule(draft) : { valid: true, error: '' };
        return `<div class="tkm-regex-inline-editor tkm-summary-cleaning-fields"><h3>${state.summaryCleaningEditingIndex === -1 ? '新建规则' : '编辑规则'}</h3>${regexEditorFieldsMarkup(draft, { fieldAttribute: 'summary-cleaning-edit-field', includeEnabled: true, includeCaptureGroup: true })}${inspected.valid ? '' : `<p class="tkm-inline-error" role="alert">${escapeHtml(inspected.error)}</p>`}<footer><button type="button" data-action="cancel-summary-cleaning-edit">取消</button><button type="button" data-action="apply-summary-cleaning-edit">应用修改</button></footer></div>`;
    }

    function summaryCleaningRuleMarkup(rule, index, total) {
        const actionsLocked = Boolean(state.summaryCleaningRuleDraft);
        const labels = { extract: '提取', exclude: '排除', replace: '替换' };
        const inspected = inspectGlobalRegexRule(rule);
        const valid = rule.enabled === false || inspected.valid;
        const status = rule.enabled === false ? '关闭' : (valid ? '可用' : '规则无效');
        const editing = state.summaryCleaningRuleDraft && state.summaryCleaningEditingIndex === index;
        const moved = Boolean(rule.id && state.summaryReorderFeedback?.id === rule.id && state.summaryReorderFeedback?.position === index + 1);
        return `<li class="tkm-regex-row ${editing ? 'tkm-regex-row--editing' : ''} ${moved ? 'tkm-reorder-feedback' : ''} tkm-summary-cleaning-rule" data-summary-cleaning-id="${escapeHtml(rule.id)}"><div class="tkm-regex-row__main"><span>${index + 1}. ${escapeHtml(labels[rule.action] ?? '排除')}</span><code>${escapeHtml(rule.pattern || '空表达式')}</code><small class="${valid ? '' : 'tkm-regex-invalid'}">${status}</small></div><div class="tkm-regex-row__actions"><button type="button" class="tkm-regex-move" aria-label="上移" title="上移" data-action="move-summary-cleaning-up" data-index="${index}" ${actionsLocked || index === 0 ? 'disabled' : ''}><span aria-hidden="true">↑</span></button><button type="button" class="tkm-regex-move" aria-label="下移" title="下移" data-action="move-summary-cleaning-down" data-index="${index}" ${actionsLocked || index === total - 1 ? 'disabled' : ''}><span aria-hidden="true">↓</span></button><button type="button" data-action="edit-summary-cleaning" data-index="${index}" ${actionsLocked ? 'disabled' : ''}>编辑</button><button type="button" class="danger" data-action="delete-summary-cleaning" data-index="${index}" ${actionsLocked ? 'disabled' : ''}>删除</button></div>${editing ? summaryCleaningEditorMarkup() : ''}</li>`;
    }

    function summaryCleaningQuickMarkup() {
        const group = (title, action) => {
            const items = BUILTIN_REGEX_SHORTCUTS.map((item, index) => ({ ...item, index })).filter(item => item.action === action);
            return `<section><h3>${title}</h3><ul>${items.map(item => `<li><code>${escapeHtml(item.label || item.pattern)}</code><button type="button" data-action="add-summary-cleaning-shortcut" data-index="${item.index}">＋ 添加</button></li>`).join('')}</ul></section>`;
        };
        return `<section class="tkm-regex-quick tkm-summary-cleaning-quick" aria-label="快捷添加">${group('快捷排除', 'exclude')}${group('快捷提取', 'extract')}</section>`;
    }

    function renderSummaryCleaning() {
        const draft = state.summaryCleaningDraft ?? [];
        const newEditor = state.summaryCleaningRuleDraft && state.summaryCleaningEditingIndex === -1
            ? `<li class="tkm-regex-row tkm-regex-row--editing">${summaryCleaningEditorMarkup()}</li>` : '';
        const rules = draft.map((rule, index) => summaryCleaningRuleMarkup(rule, index, draft.length)).join('');
        const list = newEditor || rules ? `<ol class="tkm-regex-list tkm-summary-cleaning-list">${newEditor}${rules}</ol>` : '<div class="tkm-settings-empty"><strong>没有总结清洗规则</strong></div>';
        shell.innerHTML = `${header('总结文本清洗')}<main class="tkm-shell__body tkm-settings-child tkm-text-cleaning tkm-summary-cleaning" data-tkm-scroll>${summarySettingsStatus()}<div class="tkm-regex-list-heading"><div><h2>规则</h2><span>从上到下依次处理</span></div><div class="tkm-regex-toolbar tkm-summary-cleaning-toolbar"><button type="button" data-action="toggle-summary-cleaning-quick" aria-expanded="${Boolean(state.summaryCleaningQuickOpen)}" ${state.summaryCleaningRuleDraft ? 'disabled' : ''}>${state.summaryCleaningQuickOpen ? '收起快捷添加' : '快捷添加'}</button><button type="button" data-action="add-summary-cleaning" ${state.summaryCleaningRuleDraft ? 'disabled' : ''}>新建规则</button></div></div>${state.summaryCleaningQuickOpen ? summaryCleaningQuickMarkup() : ''}<section class="tkm-settings-surface tkm-regex-rules">${list}</section></main>`;
    }

    function regexRuleRows() {
        const rules = getGlobalSettings().regexRules ?? [];
        const actionsLocked = Boolean(state.regexDraft);
        const labels = { extract: '提取', exclude: '排除', replace: '替换' };
        const newEditor = state.regexDraft && state.regexDraftKind === 'rule' && state.regexEditingIndex === null
            ? `<li class="tkm-regex-row tkm-regex-row--editing">${regexEditorMarkup()}</li>` : '';
        if (!rules.length && !newEditor) return '<div class="tkm-settings-empty"><strong>还没有清洗规则</strong><span>插件目前会直接使用聊天文本副本。</span></div>';
        return `<ol class="tkm-regex-list">${newEditor}${rules.map((rule, index) => {
            const status = inspectGlobalRegexRule(rule);
            const editing = state.regexDraft && state.regexDraftKind === 'rule' && state.regexEditingIndex === index;
            const moved = Boolean(rule.id
                && state.regexReorderFeedback?.id === rule.id
                && state.regexReorderFeedback?.index === index);
            return `<li class="tkm-regex-row ${editing ? 'tkm-regex-row--editing' : ''} ${moved ? 'tkm-reorder-feedback' : ''}" data-regex-id="${escapeHtml(rule.id || '')}"><div class="tkm-regex-row__main"><span>${index + 1}. ${escapeHtml(labels[rule.action] ?? '排除')}</span><code>${escapeHtml(rule.pattern || '空表达式')}</code><small class="${status.valid ? '' : 'tkm-regex-invalid'}">${status.valid ? '可用' : '规则无效 · 已跳过'}</small></div><div class="tkm-regex-row__actions"><button type="button" class="tkm-regex-move" aria-label="上移" title="上移" data-action="move-regex-up" data-index="${index}" ${actionsLocked || index === 0 ? 'disabled' : ''}><span aria-hidden="true">↑</span></button><button type="button" class="tkm-regex-move" aria-label="下移" title="下移" data-action="move-regex-down" data-index="${index}" ${actionsLocked || index === rules.length - 1 ? 'disabled' : ''}><span aria-hidden="true">↓</span></button><button type="button" data-action="edit-regex" data-index="${index}" ${actionsLocked ? 'disabled' : ''}>编辑</button><button type="button" class="danger" data-action="delete-regex" data-index="${index}" ${actionsLocked ? 'disabled' : ''}>删除</button></div>${editing ? regexEditorMarkup() : ''}</li>`;
        }).join('')}</ol>`;
    }

    function regexSettingsMarkup() {
        const editingShortcut = state.regexDraft && state.regexDraftKind === 'shortcut';
        const movedStatus = state.regexReorderFeedback ? `已移至第 ${state.regexReorderFeedback.index + 1} 条` : '';
        return `${state.regexMessage ? (state.regexMessageType === 'error' ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.regexMessage)}</p>` : `<aside class="tkm-summary-feedback-toast" role="status">${escapeHtml(state.regexMessage)}</aside>`) : ''}<p class="tkm-visually-hidden" role="status" aria-live="polite" data-reorder-status>${movedStatus}</p><div class="tkm-regex-list-heading"><div><h2>规则</h2><span>从上到下依次处理</span></div><div class="tkm-regex-toolbar"><button type="button" data-action="open-regex-quick" aria-expanded="${state.regexQuickOpen}" ${state.regexDraft ? 'disabled' : ''}>${state.regexQuickOpen ? '收起快捷添加' : '快捷添加'}</button><button type="button" data-action="new-regex" ${state.regexDraft ? 'disabled' : ''}>新建规则</button></div></div>${state.regexQuickOpen ? regexQuickMarkup() : ''}${editingShortcut ? `<section class="tkm-regex-shortcut-editor">${regexEditorMarkup()}</section>` : ''}<section class="tkm-settings-surface tkm-regex-rules">${regexRuleRows()}</section>`;
    }

    function regexQuickMarkup() {
        const custom = getGlobalSettings().regexShortcuts ?? [];
        const group = (title, action) => {
            const builtins = BUILTIN_REGEX_SHORTCUTS.map((item, index) => ({ ...item, source: 'builtin', index })).filter(item => item.action === action);
            const saved = custom.map((item, index) => ({ ...item, source: 'custom', index })).filter(item => item.action === action);
            const items = [...builtins, ...saved];
            return `<section><h3>${title}</h3>${items.length ? `<ul>${items.map(item => `<li><code>${escapeHtml(item.label || item.pattern)}</code><span><button type="button" data-action="add-regex-shortcut" data-source="${item.source}" data-index="${item.index}">＋ 添加</button>${item.source === 'custom' ? `<button type="button" class="danger" data-action="delete-regex-shortcut" data-index="${item.index}">删除</button>` : ''}</span></li>`).join('')}</ul>` : '<p>暂无</p>'}</section>`;
        };
        return `<section class="tkm-regex-quick" aria-label="快捷添加">${group('快捷排除', 'exclude')}${group('快捷提取', 'extract')}<button type="button" class="tkm-regex-quick-create" data-action="new-regex-shortcut">新建快捷操作</button></section>`;
    }

    function regexEditorMarkup() {
        const draft = state.regexDraft;
        if (!draft) return '';
        const shortcut = state.regexDraftKind === 'shortcut';
        const inspected = draft.pattern ? inspectGlobalRegexRule(draft) : { valid: true, error: '' };
        const actionHelp = draft.action === 'extract'
            ? '没有匹配时，保留进入本规则前的文本。'
            : (draft.action === 'exclude' ? '从当前文本副本中移除匹配内容。' : '把匹配内容替换成指定文本。');
        return `<form class="tkm-regex-inline-editor" data-tkm-form="global-regex"><h3>${shortcut ? '新建快捷操作' : (state.regexEditingIndex === null ? '新建规则' : '编辑规则')}</h3>${regexEditorFieldsMarkup(draft, { includeReplace: !shortcut })}<p class="tkm-settings-note">${actionHelp}</p>${inspected.valid ? '' : `<p class="tkm-inline-error" role="alert">${escapeHtml(inspected.error)}</p>`}<footer><button type="button" data-action="cancel-regex">取消</button><button type="submit">${shortcut ? '保存为快捷操作' : '保存规则'}</button></footer></form>`;
    }

    function loadApiDraft(preferredId = null) {
        const presetState = getSecondaryApiPresetState(getContext());
        const id = preferredId ?? presetState.activePresetId;
        const preset = presetState.presets.find(item => item.id === id) ?? null;
        state.apiDraft = {
            source: getGlobalSettings().aiProvider?.source ?? (preset ? 'plugin' : ''),
            presetId: preset?.id ?? '', name: preset?.name ?? '', endpoint: preset?.endpoint ?? '',
            apiKey: '', model: preset?.model ?? '', hasSecret: Boolean(preset?.secretId),
            presets: presetState.presets,
        };
        state.apiModels = [];
        state.apiDialog = null;
        state.apiDialogName = '';
        dirty.setBaseline('api', state.apiDraft);
    }

    function apiStatusMarkup() {
        if (!state.apiMessage && !state.apiBusy) return '<p class="tkm-api-status" role="status" aria-live="polite"></p>';
        const type = state.apiMessageType === 'error'
            ? 'tkm-api-status--error'
            : state.apiMessageType === 'success' ? 'tkm-api-status--success' : '';
        const message = state.apiBusy ? state.apiMessage || '正在处理…' : state.apiMessage;
        if (!state.apiBusy && state.apiMessageType === 'success') return `<aside class="tkm-summary-feedback-toast tkm-summary-feedback-toast--success" role="status" aria-live="polite"><span>${escapeHtml(message)}</span><button type="button" data-action="dismiss-api-feedback" aria-label="关闭提示">×</button></aside>`;
        return `<p class="tkm-api-status ${type}" role="status" aria-live="polite">${escapeHtml(message)}</p>`;
    }

    function apiDialogMarkup() {
        if (state.apiDialog === 'save-as') {
            return `<div class="tkm-modal-layer"><button type="button" class="tkm-modal-backdrop" data-action="cancel-api-dialog" aria-label="取消另存为"></button><form class="tkm-api-dialog" data-tkm-form="api-save-as" role="dialog" aria-modal="true" aria-labelledby="tkm-api-save-as-title"><h2 id="tkm-api-save-as-title">另存为新方案</h2><p>复制当前完整配置，保存后两个方案彼此独立。</p><label><span>新方案名称</span><input type="text" data-api-dialog-field="name" value="${escapeHtml(state.apiDialogName)}" autocomplete="off"></label><footer><button type="button" data-action="cancel-api-dialog">取消</button><button type="submit">另存为</button></footer></form></div>`;
        }
        if (state.apiDialog === 'delete') {
            return `<div class="tkm-modal-layer"><button type="button" class="tkm-modal-backdrop" data-action="cancel-api-dialog" aria-label="取消删除"></button><section class="tkm-api-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-api-delete-title"><h2 id="tkm-api-delete-title">删除当前方案？</h2><p>只删除「${escapeHtml(state.apiDraft?.name || '当前方案')}」，不会改变 SillyTavern 当前连接。</p><footer><button type="button" data-action="cancel-api-dialog">取消</button><button type="button" class="danger" data-action="confirm-delete-api-scheme">删除</button></footer></section></div>`;
        }
        return '';
    }

    function apiSettingsMarkup() {
        if (!state.apiDraft) loadApiDraft();
        const draft = state.apiDraft;
        const source = `<section class="tkm-api-source-picker" role="radiogroup" aria-labelledby="tkm-api-source-title"><h2 id="tkm-api-source-title">API 来源</h2><div class="tkm-api-source-options"><button type="button" class="tkm-api-choice ${draft.source === 'sillytavern' ? 'is-selected' : ''}" data-action="select-api-source" data-source="sillytavern" role="radio" aria-checked="${draft.source === 'sillytavern'}"><i class="tkm-choice-indicator" aria-hidden="true"></i><span><strong>SillyTavern 当前 API</strong><small>使用酒馆现在的连接</small></span></button><button type="button" class="tkm-api-choice ${draft.source === 'plugin' ? 'is-selected' : ''}" data-action="select-api-source" data-source="plugin" role="radio" aria-checked="${draft.source === 'plugin'}"><i class="tkm-choice-indicator" aria-hidden="true"></i><span><strong>插件 API</strong><small>使用插件保存的独立方案</small></span></button></div></section>`;
        if (draft.source !== 'plugin') {
            return `${source}<section class="tkm-api-scheme-section" aria-labelledby="tkm-api-current-title"><h2 id="tkm-api-current-title">连接测试</h2><div class="tkm-settings-surface tkm-api-current"><div class="tkm-api-current-head"><strong>SillyTavern 当前 API</strong></div><div class="tkm-api-test-row"><button type="button" data-action="test-api-draft" ${state.apiBusy ? 'disabled' : ''}>${state.apiBusy ? '测试中…' : '测试当前配置'}</button>${apiStatusMarkup()}</div></div></section>${apiDialogMarkup()}`;
        }
        const presetOptions = draft.presets.length
            ? draft.presets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.presetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')
            : '<option value="">尚未保存方案</option>';
        const modelOptions = state.apiModels.map(model => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join('');
        const draftDirty = dirty.isDirty('api', draft);
        return `${source}<section class="tkm-api-scheme-section" aria-labelledby="tkm-api-scheme-title"><h2 id="tkm-api-scheme-title">插件 API 方案</h2><div class="tkm-settings-surface tkm-api-editor"><div class="tkm-api-scheme-head"><label class="tkm-api-preset"><span class="tkm-visually-hidden">方案</span><select data-api-field="presetId" aria-label="当前方案" ${state.apiBusy ? 'disabled' : ''}>${presetOptions}</select></label><div class="tkm-api-actions"><button type="button" class="primary" data-action="save-api-scheme" ${state.apiBusy ? 'disabled' : ''}>保存</button><button type="button" data-action="save-api-scheme-as" ${state.apiBusy ? 'disabled' : ''}>另存为</button><button type="button" class="danger" data-action="delete-api-scheme" ${draft.presetId && !state.apiBusy ? '' : 'disabled'}>删除</button></div></div>${draftDirty ? '<p class="tkm-api-dirty">当前草稿有未保存修改</p>' : ''}<div class="tkm-api-field-stack"><label class="tkm-api-field"><span>方案名称</span><input type="text" data-api-field="name" value="${escapeHtml(draft.name)}" placeholder="例如：OpenAI"></label><label class="tkm-api-field"><span>URL</span><input type="url" data-api-field="endpoint" value="${escapeHtml(draft.endpoint)}" placeholder="https://example.com/v1" inputmode="url"></label><div class="tkm-api-field"><span class="tkm-api-key-heading"><b>API Key</b><small>${draft.hasSecret ? '已保存密钥' : ''}</small></span><div class="tkm-api-key-row"><input type="password" data-api-field="apiKey" value="${escapeHtml(draft.apiKey)}" placeholder="${draft.hasSecret ? '输入新 Key 以替换' : '输入 API Key'}" autocomplete="new-password"><button type="button" data-action="toggle-api-key">显示</button></div></div><div class="tkm-api-field"><span>模型</span><input type="text" data-api-field="model" value="${escapeHtml(draft.model)}" placeholder="模型名称"></div>${state.apiModels.length ? `<label class="tkm-api-field"><span>可用模型</span><select data-api-field="modelChoice"><option value="">选择一个模型</option>${modelOptions}</select></label>` : ''}</div><div class="tkm-api-test-row"><button type="button" class="tkm-inline-link" data-action="fetch-api-models" ${state.apiBusy ? 'disabled' : ''}>获取模型</button><button type="button" data-action="test-api-draft" ${state.apiBusy ? 'disabled' : ''}>${state.apiBusy ? '测试中…' : '测试当前配置'}</button>${apiStatusMarkup()}</div></div></section>${apiDialogMarkup()}`;
    }

    function promptModuleInlineEditor(draft, management = '') {
        const contentLabel = ({ prompt: '模块内容', collect: '模块内容', sync: '模块内容' })[draft.lifecycle] ?? '模块内容';
        const roleOptions = Object.entries(PROMPT_MODULE_ROLE_LABELS).map(([value, label]) => `<option value="${value}" ${draft.role === value ? 'selected' : ''}>${label}</option>`).join('');
        return `<form class="tkm-module-inline-editor${state.promptModuleMessage ? ' needs-decision' : ''}" data-tkm-form="prompt-module" novalidate><label class="tkm-module-field"><span>模块名称</span><input type="text" data-prompt-module-field="name" value="${escapeHtml(draft.name)}" placeholder="例如：角色认知" autocomplete="off"></label><div class="tkm-module-field-pair"><label class="tkm-module-field"><span>发送角色</span><select data-prompt-module-field="role">${roleOptions}</select></label><label class="tkm-module-field"><span>注入深度</span><input type="number" inputmode="numeric" min="0" max="10000" step="1" data-prompt-module-field="depth" value="${escapeHtml(draft.depth)}"></label></div><label class="tkm-module-field tkm-module-content"><span>${contentLabel}</span><textarea rows="4" data-prompt-module-field="content" placeholder="写下希望 AI 生成或遵循的具体要求">${escapeHtml(draft.content)}</textarea></label>${state.promptModuleMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.promptModuleMessage)}</p>` : ''}${management}<footer class="tkm-module-inline-actions"><button type="button" data-action="cancel-prompt-module-edit"><span>取消</span></button><button type="submit" class="save" ${state.promptModuleBusy ? 'disabled' : ''}><span>${state.promptModuleBusy ? '保存中…' : '保存'}</span></button></footer></form>`;
    }

    function promptModuleRow(module, index, count, summary = '') {
        const scope = module.scope;
        const reorder = count > 1 ? `<button type="button" data-action="move-prompt-module-up" data-id="${escapeHtml(module.id)}" data-scope="${scope}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-action="move-prompt-module-down" data-id="${escapeHtml(module.id)}" data-scope="${scope}" ${index === count - 1 ? 'disabled' : ''}>下移</button>` : '';
        const management = `<div class="tkm-module-inline-management">${reorder}<button type="button" class="danger" data-action="delete-prompt-module-row" data-id="${escapeHtml(module.id)}" data-scope="${scope}">删除</button></div>`;
        const view = module.lifecycle === 'prompt' ? '' : `<button type="button" class="tkm-module-result-link" data-action="view-prompt-module-result" data-id="${escapeHtml(module.id)}" data-scope="${scope}">查看结果</button>`;
        const editing = state.promptModuleDraft?.id === module.id && state.promptModuleDraft?.scope === scope;
        return `<article class="tkm-module-row${editing ? ' is-editing' : ''}" data-module-id="${escapeHtml(module.id)}" data-module-scope="${scope}"><button type="button" class="tkm-module-row__main" data-action="edit-prompt-module" data-id="${escapeHtml(module.id)}" data-scope="${scope}" aria-expanded="${editing}"><span><strong>${escapeHtml(module.name)}</strong><small>${escapeHtml(summary)}</small></span></button><div class="tkm-module-row__actions">${view}<button type="button" class="tkm-compact-switch ${module.enabled ? 'is-on' : ''}" role="switch" aria-checked="${module.enabled}" data-action="toggle-prompt-module" data-id="${escapeHtml(module.id)}" data-scope="${scope}" aria-label="${module.enabled ? '停用' : '启用'}模块 ${escapeHtml(module.name)}"><i aria-hidden="true"></i></button></div>${editing ? promptModuleInlineEditor(state.promptModuleDraft, management) : ''}</article>`;
    }

    function promptModuleGroup(scope, modules, resultSummaryByModule, characterIdentity = null) {
        const title = scope === 'global' ? '全局模块' : scope === 'character'
            ? `角色卡模块${characterIdentity?.name ? ` · ${escapeHtml(characterIdentity.name)}` : ''}`
            : '当前聊天模块';
        const rows = modules.map((module, index) => promptModuleRow(module, index, modules.length, resultSummaryByModule.get(`${scope}:${module.id}`) ?? `${PROMPT_MODULE_ROLE_LABELS[module.role]} · 深度 ${module.depth}`)).join('');
        const creating = state.promptModuleDraft && !state.promptModuleDraft.id && state.promptModuleDraft.scope === scope;
        const create = scope !== 'character' || characterIdentity
            ? `<button type="button" data-action="new-prompt-module" data-scope="${scope}">＋ 新建</button>`
            : '';
        const unavailable = scope === 'character' && !characterIdentity
            ? '<p class="tkm-settings-note">仅在单角色聊天中可用。</p>'
            : '';
        const list = modules.length || creating
            ? `<div class="tkm-module-list">${rows}${creating ? `<article class="tkm-module-row is-editing is-new">${promptModuleInlineEditor(state.promptModuleDraft)}</article>` : ''}</div>`
            : '<p class="tkm-module-empty">这里还没有模块</p>';
        return `<section class="tkm-module-scope-group" aria-labelledby="tkm-module-${scope}-title"><header><h2 id="tkm-module-${scope}-title">${title}</h2>${create}</header><div class="tkm-module-group${modules.length || creating ? '' : ' is-empty'}">${unavailable}${list}</div></section>`;
    }

    function renderPromptModules() {
        let groups = { global: [], character: [], chat: [], characterIdentity: null };
        let resultSummaryByModule = new Map();
        try {
            groups = promptModuleService.read();
            const stored = moduleResultService?.read?.() ?? {};
            const activeResults = new Map((moduleResultService?.readActive?.() ?? []).map(result => [result.moduleId, result]));
            for (const scope of ['global', 'character', 'chat']) {
                for (const module of groups[scope] ?? []) {
                    if (module.lifecycle === 'prompt') continue;
                    const values = (stored[scope] ?? []).filter(item => item.moduleId === module.id);
                    const latest = module.lifecycle === 'sync' ? activeResults.get(module.id) : values.at(-1);
                    const summary = module.lifecycle === 'collect'
                        ? (values.length ? `已收集 ${values.length} 条 · 最近第 ${latest.source.messageId + 1} 楼` : '尚无收集内容')
                        : (latest ? `当前状态 · 更新于第 ${latest.source.messageId + 1} 楼` : '尚无追踪状态');
                    resultSummaryByModule.set(`${scope}:${module.id}`, summary);
                }
            }
        } catch (error) {
            state.promptModuleListMessage = error?.message || '模块列表暂时不可用。';
        }
        const toast = state.promptModuleNotice
            ? `<aside class="tkm-summary-feedback-toast tkm-summary-feedback-toast--success" role="status" aria-live="polite"><span>${escapeHtml(state.promptModuleNotice)}</span><button type="button" data-action="dismiss-prompt-module-notice" aria-label="关闭提示">×</button></aside>`
            : '';
        const snapshot = featureSnapshot();
        const lifecycleEntries = Object.entries(PROMPT_MODULE_LIFECYCLE_LABELS)
            .filter(([value]) => isModuleLifecycleEnabled(snapshot, value));
        if (!lifecycleEntries.some(([value]) => value === state.promptModuleLifecycle)) {
            state.promptModuleLifecycle = lifecycleEntries[0]?.[0] ?? 'prompt';
        }
        const lifecycle = state.promptModuleLifecycle;
        const tabs = `<nav class="tkm-workface-switch tkm-module-purpose-tabs" aria-label="模块用途" role="tablist" style="--tkm-workface-count:${lifecycleEntries.length}">${lifecycleEntries.map(([value, label]) => `<button type="button" class="${lifecycle === value ? 'active' : ''}" data-action="select-prompt-module-lifecycle" data-lifecycle="${value}" role="tab" aria-selected="${lifecycle === value}" ${lifecycle === value ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
        const visible = scope => (groups[scope] ?? []).filter(module => module.lifecycle === lifecycle);
        shell.innerHTML = `${header('模块')}<main class="tkm-shell__body tkm-modules-root" data-tkm-scroll>${toast}${tabs}${state.promptModuleListMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.promptModuleListMessage)}</p>` : ''}${promptModuleGroup('global', visible('global'), resultSummaryByModule)}${promptModuleGroup('character', visible('character'), resultSummaryByModule, groups.characterIdentity)}${promptModuleGroup('chat', visible('chat'), resultSummaryByModule)}</main>${nav()}`;
    }

    function showPromptModuleNotice(message) {
        if (promptModuleNoticeTimer) windowRef?.clearTimeout?.(promptModuleNoticeTimer);
        state.promptModuleNotice = message;
        promptModuleNoticeTimer = windowRef?.setTimeout?.(() => {
            promptModuleNoticeTimer = null;
            if (state.promptModuleNotice !== message) return;
            state.promptModuleNotice = '';
            if (router.current().routeId === 'modules.index') render();
        }, 2000);
    }

    function promptModuleDraftDirty() {
        return Boolean(state.promptModuleDraft && dirty.isDirty('prompt-module', state.promptModuleDraft));
    }

    function closePromptModuleInlineEditor() {
        state.promptModuleDraft = null;
        state.promptModuleMessage = '';
        state.promptModuleBusy = false;
    }

    function renderPromptModuleEditor() {
        const draft = state.promptModuleDraft;
        if (!draft) {
            router.back('modules.index');
            render();
            return;
        }
        const editing = Boolean(draft.id);
        const title = `${editing ? '编辑' : '新建'}${PROMPT_MODULE_SCOPE_LABELS[draft.scope]}${PROMPT_MODULE_LIFECYCLE_LABELS[draft.lifecycle]}`;
        const contentLabel = ({ prompt: '提示词内容', collect: '收集内容与要求', sync: '追踪内容与更新要求' })[draft.lifecycle] ?? '提示词内容';
        const roleOptions = Object.entries(PROMPT_MODULE_ROLE_LABELS).map(([value, label]) => `<button type="button" data-action="select-prompt-module-role" data-role="${value}" role="radio" aria-checked="${draft.role === value}" class="${draft.role === value ? 'is-selected' : ''}"><i class="tkm-choice-indicator" aria-hidden="true"></i>${label}</button>`).join('');
        shell.innerHTML = `${focusedHeader(title, 'tkm-prompt-module-form')}<main class="tkm-shell__body tkm-module-editor" data-tkm-scroll><form id="tkm-prompt-module-form" data-tkm-form="prompt-module" novalidate><label class="tkm-module-field"><span>模块名称</span><input type="text" data-prompt-module-field="name" value="${escapeHtml(draft.name)}" placeholder="例如：角色认知" autocomplete="off"></label><div class="tkm-module-field-pair"><fieldset class="tkm-module-role"><legend>发送角色</legend><div role="radiogroup">${roleOptions}</div></fieldset><label class="tkm-module-field"><span>注入深度</span><input type="number" inputmode="numeric" min="0" max="10000" step="1" data-prompt-module-field="depth" value="${escapeHtml(draft.depth)}"></label></div><label class="tkm-module-field tkm-module-content"><span>${contentLabel}</span><textarea rows="8" data-prompt-module-field="content" placeholder="写下希望 AI 生成或遵循的具体要求">${escapeHtml(draft.content)}</textarea></label>${state.promptModuleMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.promptModuleMessage)}</p>` : ''}</form></main>`;
    }

    function renderPromptModuleResult() {
        const target = state.promptModuleResultTarget;
        const module = target && (promptModuleService.read()[target.scope] ?? []).find(item => item.id === target.id);
        if (!module || module.lifecycle === 'prompt') { router.back('modules.index'); renderPromptModules(); return; }
        const all = moduleResultService?.read?.()[target.scope] ?? [];
        const moduleValues = all.filter(item => item.moduleId === module.id);
        const current = module.lifecycle === 'sync'
            ? (moduleResultService?.readActive?.() ?? []).find(item => item.moduleId === module.id) ?? null
            : null;
        const sameResult = (left, right) => left && right && left.moduleId === right.moduleId
            && left.value === right.value && left.source.messageId === right.source.messageId
            && (left.source.swipeId ?? null) === (right.source.swipeId ?? null)
            && (left.source.chatId ?? null) === (right.source.chatId ?? null)
            && (left.source.characterKey ?? null) === (right.source.characterKey ?? null);
        const recentHistory = module.lifecycle === 'sync' && current
            ? moduleValues.filter(item => !sameResult(item, current)).slice(-2).reverse()
            : [];
        const collectBody = moduleValues.map(item => `<article class="tkm-module-result-entry"><small>第 ${item.source.messageId + 1} 楼</small><p>${escapeHtml(item.value)}</p></article>`).join('');
        const syncBody = current ? `<article class="tkm-module-result-entry tkm-module-result-entry--current"><small>当前 · 第 ${current.source.messageId + 1} 楼</small><p>${escapeHtml(current.value)}</p></article>${recentHistory.map((item, index) => `<details class="tkm-module-result-history"><summary><span>${index === 0 ? '上一次' : '前两次'} · 第 ${item.source.messageId + 1} 楼</span><small>${escapeHtml(item.value.replace(/\s+/g, ' ').trim().slice(0, 48))}${item.value.replace(/\s+/g, ' ').trim().length > 48 ? '…' : ''}</small></summary><p>${escapeHtml(item.value)}</p></details>`).join('')}` : '';
        const body = (module.lifecycle === 'collect' ? collectBody : syncBody)
            || '<p class="tkm-module-result-empty">尚无结果</p>';
        const summary = module.lifecycle === 'collect'
            ? `共 ${moduleValues.length} 条 · 按来源顺序`
            : '当前状态与最近两次变化';
        shell.innerHTML = `${focusedHeader('模块结果')}<main class="tkm-shell__body tkm-module-results" data-tkm-scroll><header class="tkm-module-results__heading"><h1>${escapeHtml(module.name)}</h1><p>${escapeHtml(summary)}</p></header><section class="tkm-module-result-group">${body}</section></main>`;
    }

    function renderSettingsIndex() {
        const snapshot = featureSnapshot();
        shell.innerHTML = `${header('设置', { rootTitle: true })}<main class="tkm-shell__body tkm-settings-root"><div class="tkm-settings-directory"><section class="tkm-settings-directory__group" aria-labelledby="tkm-settings-plugin-title"><h2 id="tkm-settings-plugin-title">插件</h2><div class="tkm-settings-list tkm-ui-surface"><div class="tkm-settings-entry tkm-ui-row"><span class="tkm-settings-entry__copy"><strong>启用${PRODUCT_NAME}</strong></span>${settingsSwitch('toggle-plugin-global', snapshot.globallyEnabled, `启用${PRODUCT_NAME}`)}</div><div class="tkm-settings-entry tkm-ui-row"><span class="tkm-settings-entry__copy"><strong>在当前聊天中使用</strong></span>${settingsSwitch('toggle-plugin-chat', snapshot.chatEnabled, '在当前聊天中使用', !snapshot.hasChat || !snapshot.globallyEnabled)}</div>${settingsDirectoryRow('settings.features', '功能管理')}</div></section><section class="tkm-settings-directory__group" aria-labelledby="tkm-settings-ai-title"><h2 id="tkm-settings-ai-title">AI</h2><div class="tkm-settings-list tkm-ui-surface">${settingsDirectoryRow('settings.ai', 'API 设置')}</div></section><footer class="tkm-about-signature" aria-label="关于${PRODUCT_NAME}"><div class="tkm-about-signature__identity">${productBrandMark('tkm-brand-mark tkm-about-signature__mark')}<strong>${PRODUCT_FULL_NAME}</strong></div><p class="tkm-about-signature__meta"><span>${PRODUCT_DESCRIPTION}</span><span>${PRODUCT_DISPLAY_VERSION}</span></p></footer></div></main>${nav()}`;
    }

    function renderFeatureManagement() {
        const snapshot = featureSnapshot();
        const rows = FEATURE_DEFINITIONS.map(feature => `<div class="tkm-settings-entry tkm-ui-row"><span class="tkm-settings-entry__copy"><strong>${escapeHtml(feature.label)}</strong></span>${settingsSwitch('toggle-plugin-feature', getGlobalSettings()?.plugin?.features?.[feature.id] !== false, feature.label, false, `data-feature="${feature.id}"`)}</div>`).join('');
        shell.innerHTML = `${compactChildHeader('功能管理')}<main class="tkm-shell__body tkm-settings-child tkm-feature-management" data-tkm-scroll><section class="tkm-settings-list tkm-ui-surface" aria-label="功能开关">${rows}</section>${!snapshot.globallyEnabled ? '<p class="tkm-settings-note">插件重新启用后，保留的功能选择会继续生效。</p>' : ''}</main>`;
    }

    function renderRecallSettings() {
        shell.innerHTML = `${compactChildHeader('召回设置')}<main class="tkm-shell__body tkm-settings-child tkm-recall-settings-page" data-tkm-scroll>${recallSettingsMarkup()}</main>`;
    }

    function renderAiSettings() {
        shell.innerHTML = `${header('API 设置')}<main class="tkm-shell__body tkm-settings-child tkm-ai-settings" data-tkm-api-scroll>${apiSettingsMarkup()}</main>`;
    }

    function renderSpecialDateDefaults() {
        shell.innerHTML = `${header('纪念日提醒')}<main class="tkm-shell__body tkm-settings-child tkm-time-prompt-page">${timePromptReadOnly('系统内容', '<time_keyword_special_date>\n{当天或提前提醒事实}\n{单条纪念日的个性提醒}\n</time_keyword_special_date>')}<section class="tkm-settings-surface tkm-time-prompt-editor"><h2>用户补充内容</h2><textarea rows="5" data-field="special-prompt-general">${escapeHtml(state.specialPromptDraft.general)}</textarea><footer><button type="button" data-action="reset-time-prompt" data-field="general">重置</button></footer></section><section class="tkm-settings-surface"><h2>提醒设置</h2><div class="tkm-settings-depth-grid"><label><span>提前提醒</span><input class="tkm-settings-number" type="number" inputmode="numeric" min="0" step="1" data-field="special-prompt-default-days" value="${escapeHtml(state.specialPromptDraft.defaultDays)}"></label>${timeDepthField('specialDateInjectionDepth')}</div></section>${timePromptStatus()}</main>`;
    }

    function timePromptReadOnly(title, content) {
        return `<section class="tkm-settings-surface tkm-time-prompt-fixed"><h2>${title}</h2><div class="tkm-time-prompt-readonly" role="textbox" aria-readonly="true">${escapeHtml(content)}</div></section>`;
    }

    function timeDepthField(field) {
        return `<label><span>注入深度</span><input class="tkm-settings-number" type="number" inputmode="numeric" min="0" max="10000" step="1" data-recall-setting="${field}" value="${escapeHtml(state.recallSettingsDraft?.[field] ?? '')}"></label>`;
    }

    function timePromptStatus() {
        return `${state.recallSettingsMessageType === 'error' && state.recallSettingsMessage ? `<p class="tkm-inline-error" role="alert">${escapeHtml(state.recallSettingsMessage)}</p>` : ''}<p class="tkm-visually-hidden" data-special-prompt-status role="status" aria-live="polite">${escapeHtml(state.specialPromptMessage)}</p>`;
    }

    function renderStoryTimePromptSettings() {
        const enabled = state.recallSettingsDraft?.storyTimeReminderEnabled === true;
        shell.innerHTML = `${header('当前日期提醒')}<main class="tkm-shell__body tkm-settings-child tkm-time-prompt-page"><section class="tkm-settings-surface"><div class="tkm-settings-row"><span class="tkm-settings-row__copy"><strong>启用</strong></span><label class="tkm-switch-control" aria-label="启用当前日期提醒"><input type="checkbox" data-recall-setting="storyTimeReminderEnabled" ${enabled ? 'checked' : ''}><b>${enabled ? '开' : '关'}</b></label></div></section><section class="tkm-settings-surface tkm-time-prompt-editor"><div class="tkm-settings-section-heading"><h2>提示词</h2><button type="button" class="tkm-text-action" data-action="reset-time-prompt" data-field="storyTimeInstruction">恢复默认</button></div><textarea rows="9" data-field="story-time-instruction">${escapeHtml(state.specialPromptDraft.storyTimeInstruction)}</textarea></section><section class="tkm-settings-surface"><h2>注入深度</h2><div class="tkm-settings-depth-grid tkm-settings-depth-grid--single">${timeDepthField('storyTimeInjectionDepth')}</div></section>${timePromptStatus()}</main>`;
    }

    function renderHolidayPromptSettings() {
        const fixed = `<time_keyword_holiday>\n当前故事日期对应以下节日。\n${DEFAULT_HOLIDAY_INSTRUCTION}\n{节日名称与习俗；提前时显示距离天数}\n</time_keyword_holiday>`;
        shell.innerHTML = `${header('节日习俗提醒')}<main class="tkm-shell__body tkm-settings-child tkm-time-prompt-page">${timePromptReadOnly('系统内容', fixed)}<section class="tkm-settings-surface tkm-time-prompt-editor"><h2>用户补充内容</h2><textarea rows="5" data-field="holiday-instruction" placeholder="可选">${escapeHtml(state.specialPromptDraft.holidayInstruction)}</textarea></section><section class="tkm-settings-surface"><h2>提醒设置</h2><div class="tkm-settings-depth-grid"><label><span>提前提醒</span><span class="tkm-settings-number-unit"><input class="tkm-settings-number" type="number" inputmode="numeric" min="0" step="1" data-field="holiday-advance-days" value="${escapeHtml(state.specialPromptDraft.holidayAdvanceDays)}"><b>天</b></span></label>${timeDepthField('holidayInjectionDepth')}</div></section>${timePromptStatus()}</main>`;
    }

    function renderRegexList() {
        shell.innerHTML = `${compactChildHeader('召回文本清洗')}<main class="tkm-shell__body tkm-settings-child tkm-text-cleaning" data-tkm-scroll>${regexSettingsMarkup()}</main>`;
    }

    function updateScrollControls() {
        const body = shell.querySelector('.tkm-shell__body');
        const controls = shell.querySelector('[data-scroll-controls]');
        if (!body || !controls) return;
        const status = getScrollControlState(body);
        controls.hidden = !status.visible;
        controls.querySelector('[data-action="scroll-top"]').hidden = !status.showTop;
        controls.querySelector('[data-action="scroll-bottom"]').hidden = !status.showBottom;
    }

    function finalizeShell() {
        shell.classList.toggle('tkm-shell--confirming', discardGate.isPending() || fastModeWarningGate.isPending() || summaryReviewCancelGate.isPending() || autoSummarySkipGate.isPending() || coverageRegenerationGate.isPending() || state.memoryDeletePending);
        shell.classList.remove('tkm-shell--modal');
        shell.classList.toggle('tkm-shell--api-dialog', Boolean(state.apiDialog));
        // Keep API dialogs outside the scrolling body and its host-theme stacking context.
        const apiLayer = shell.querySelector('.tkm-modal-layer:has(.tkm-api-dialog)');
        if (apiLayer && apiLayer.parentElement !== shell) shell.append(apiLayer);
        shell.classList.toggle('tkm-shell--calendar-event-editing', Boolean(state.calendarEventDraft));
        shell.classList.toggle('tkm-shell--holiday-editing', Boolean(state.holidayDraft));
        if (discardGate.isPending() && !shell.querySelector('.tkm-confirm-layer')) {
            shell.insertAdjacentHTML('beforeend', discardConfirm());
            shell.querySelector('[data-action="keep-editing"]')?.focus();
        }
        if (fastModeWarningGate.isPending() && !shell.querySelector('.tkm-confirm-layer')) {
            shell.insertAdjacentHTML('beforeend', fastModeWarningConfirm());
            shell.querySelector('[data-action="cancel-fast-mode"]')?.focus();
        }
        if (summaryReviewCancelGate.isPending() && !shell.querySelector('.tkm-confirm-layer')) {
            shell.insertAdjacentHTML('beforeend', summaryReviewCancelConfirm());
            shell.querySelector('[data-action="keep-summary-review-candidates"]')?.focus();
        }
        if (state.memoryDeletePending) shell.querySelector('[data-action="cancel-memory-delete"]')?.focus?.();
        if (autoSummarySkipGate.isPending() && !shell.querySelector('.tkm-confirm-layer')) {
            shell.insertAdjacentHTML('beforeend', `<div class="tkm-confirm-layer"><section class="tkm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tkm-auto-skip-title"><h2 id="tkm-auto-skip-title">跳过这个批次</h2><p>${escapeHtml(autoSummarySkipCopy(state.autoSummarySkipSnapshot))}</p><footer><button type="button" data-action="cancel-auto-summary-skip">保留本批</button><button type="button" class="danger" data-action="confirm-auto-summary-skip">确认跳过</button></footer></section></div>`);
            shell.querySelector('[data-action="cancel-auto-summary-skip"]')?.focus?.();
        }
        if (coverageRegenerationGate.isPending() && !shell.querySelector('.tkm-confirm-layer')) {
            shell.insertAdjacentHTML('beforeend', coverageRegenerationConfirm());
            shell.querySelector('[data-action="cancel-coverage-regeneration"]')?.focus?.();
        }
        if (state.apiDialog) {
            shell.querySelector('.tkm-api-dialog input, .tkm-api-dialog [data-action="confirm-delete-api-scheme"]')?.focus?.();
        }
        shell.querySelectorAll('.tkm-summary-candidate textarea, .tkm-memory-merge [data-memory-merge-field="body"]').forEach(textarea => {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        });
        const body = shell.querySelector('.tkm-shell__body');
        body?.addEventListener('scroll', updateScrollControls, { passive: true });
        documentRef.defaultView?.requestAnimationFrame?.(updateScrollControls);
        updateScrollControls();
    }

    shell.addEventListener('toggle', event => {
        if (event.target?.matches?.('.tkm-auto-summary-details')) state.autoSummaryDetailsOpen = event.target.open;
        const termEditor = event.target?.matches?.('.tkm-solar-term-editor') ? event.target : null;
        if (termEditor?.dataset.schemeId) {
            if (termEditor.open) state.fictionalTermOpenSchemeIds.add(termEditor.dataset.schemeId);
            else state.fictionalTermOpenSchemeIds.delete(termEditor.dataset.schemeId);
        }
        updateScrollControls();
    }, true);
    const resizeSummaryPromptEditors = () => {
        const viewport = windowRef?.visualViewport;
        const height = viewport?.height ?? windowRef?.innerHeight;
        if (height) shell.style.setProperty('--tkm-edit-viewport-height', `${height}px`);
        updateScrollControls();
    };
    windowRef?.addEventListener?.('resize', resizeSummaryPromptEditors, { passive: true });
    windowRef?.visualViewport?.addEventListener?.('resize', () => { resizeSummaryPromptEditors(); queueFocusedFieldVisibility(); }, { passive: true });
    // viewport scroll is a user/browser gesture, not a request to reposition a field.
    async function render() {
        let route = getRoute(router.current().routeId);
        if (!isRouteEnabled(featureSnapshot(), route.id)) {
            router.reset('settings.index');
            route = getRoute('settings.index');
        }
        if (route.id !== 'time.calendar') { state.calendarSelectorOpen = false; state.calendarManagementOpen = false; } shell.dataset.route = route.id;
        shell.dataset.promptFullscreen = String(Boolean(state.summaryPromptFullscreen));
        shell.classList.toggle('tkm-shell--full-screen', Boolean(route.fullScreen));
        const binding = chatDataService.inspectCurrent();
        if (binding.status === 'branch-pending' && route.requiresChat) { renderBranchDecision(binding); finalizeShell(); return; }
        if (route.requiresChat) {
            if (binding.status !== 'ready') { renderUnavailable(binding.message); finalizeShell(); return; }
            try { memoryLibraryService.read(); } catch (error) { renderUnavailable(error?.message); finalizeShell(); return; }
        }
        if (route.id === 'settings.index') renderSettingsIndex();
        else if (route.id === 'settings.features') renderFeatureManagement();
        else if (route.id === 'settings.ai') renderAiSettings();
        else if (route.id === 'settings.regex') renderRegexList();
        else if (route.id === 'settings.time.story') renderStoryTimePromptSettings();
        else if (route.id === 'settings.time.holiday') renderHolidayPromptSettings();
        else if (route.id === 'settings.special-date-defaults') renderSpecialDateDefaults();
        else if (route.id === 'settings.summary') renderSummarySettings();
        else if (route.id === 'settings.summary.prompt') renderSummaryPromptEditor();
        else if (route.id === 'settings.summary.events') renderSummaryEventLibrary();
        else if (route.id === 'settings.summary.cleaning') renderSummaryCleaning();
        else if (route.id === 'memory.create') renderCreateMemory();
        else if (route.id === 'memory.summary.manual') renderManualSummary();
        else if (route.id === 'memory.summary.auto') renderAutoSummary();
        else if (route.id === 'memory.summary.coverage') renderSummaryCoverage();
        else if (route.id === 'memory.summary.review') renderSummaryReview();
        else if (route.id === 'memory.keywords.review') renderKeywordRebuildReview();
        else if (route.id === 'memory.merge.source') renderMemoryMergeSource();
        else if (route.id === 'memory.merge.body') renderMemoryMergeBody();
        else if (route.id === 'memory.merge.final') renderMemoryMergeFinal();
        else if (route.id === 'memory.record') renderForm(Boolean(state.activeId));
        else if (route.id === 'recall.monitor') renderMonitor();
        else if (route.id === 'modules.index') renderPromptModules();
        else if (route.id === 'modules.record') renderPromptModuleEditor();
        else if (route.id === 'modules.result') renderPromptModuleResult();
        else if (route.id === 'recall.settings') renderRecallSettings();
        else if (route.id === 'time.story') renderStoryTime();
        else if (route.id === 'time.anniversaries') renderAnniversaries();
        else if (route.id === 'time.calendar') renderCalendar();
        else if (route.id === 'time.schedule') renderScheduleEditor();
        else if (route.id === 'time.holidays') renderHolidayManagement();
        else await renderLibrary();
        finalizeShell();
        resizeSummaryPromptEditors();
        shell.querySelectorAll('.tkm-event-library-editor textarea').forEach(growSummaryPromptTextarea);
    }

    function growSummaryPromptTextarea(area) {
        if (area.closest('.tkm-event-library-editor')) {
            area.style.height = 'auto';
            area.style.height = `${Math.max(96, area.scrollHeight + 2)}px`;
            return;
        }
        // Editors are bounded by CSS. Input must not measure/reflow every textarea.
        area.style.removeProperty('height');
    }

    function rememberApiPosition(target = null) {
        return captureApiSettingsPosition(shell, { target });
    }

    async function renderKeepingApiPosition(position, options = {}) {
        await render();
        restoreApiSettingsPosition(shell, position, options);
        updateScrollControls();
    }

    async function renderKeepingCalendarPosition(revealSelector = '', savedScrollTop = null) {
        const previousBody = shell.querySelector('.tkm-shell__body');
        const scrollTop = savedScrollTop ?? previousBody?.scrollTop ?? 0;
        await render();
        const body = shell.querySelector('.tkm-shell__body');
        if (!body) return;
        const settle = () => {
            body.scrollTop = Math.min(scrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
            const target = revealSelector ? shell.querySelector(revealSelector) : null;
            if (target) {
                const bodyRect = body.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const inset = 12;
                if (targetRect.height > bodyRect.height - inset * 2 || targetRect.top < bodyRect.top + inset) {
                    body.scrollTop += targetRect.top - bodyRect.top - inset;
                } else if (targetRect.bottom > bodyRect.bottom - inset) {
                    body.scrollTop += targetRect.bottom - bodyRect.bottom + inset;
                }
            }
            updateScrollControls();
        };
        if (documentRef.defaultView?.requestAnimationFrame) {
            documentRef.defaultView.requestAnimationFrame(settle);
        } else {
            settle();
        }
    }

    function summaryTextareaPosition() {
        const area = shell.querySelector('[data-summary-prompt-text-field="value"], [data-summary-custom-prompt-field="content"]');
        return area ? { scrollTop: area.scrollTop, start: area.selectionStart, end: area.selectionEnd, direction: area.selectionDirection } : null;
    }

    function restoreSummaryTextareaPosition(position) {
        const area = shell.querySelector('[data-summary-prompt-text-field="value"], [data-summary-custom-prompt-field="content"]');
        if (!area || !position) return;
        area.setSelectionRange?.(position.start, position.end, position.direction);
        area.scrollTop = position.scrollTop;
    }

    async function renderKeepingMemoryEditorPosition({ revealSelector = '', focusSelector = '', savedScrollTop = null } = {}) {
        const previousBody = shell.querySelector('.tkm-memory-editor-scroll');
        const scrollTop = savedScrollTop ?? previousBody?.scrollTop ?? 0;
        await render();
        const body = shell.querySelector('.tkm-memory-editor-scroll');
        if (!body) return;
        const settle = () => {
            body.scrollTop = Math.min(scrollTop, Math.max(0, body.scrollHeight - body.clientHeight));
            const target = revealSelector ? shell.querySelector(revealSelector) : null;
            target?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
            const focusTarget = focusSelector ? shell.querySelector(focusSelector) : null;
            if (focusTarget?.focus) {
                try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
            }
            updateScrollControls();
        };
        settle();
        documentRef.defaultView?.requestAnimationFrame?.(settle);
    }

    const rememberScroll = () => { state.listScrollTop = shell.querySelector('[data-tkm-scroll]')?.scrollTop ?? state.listScrollTop; };
    const storyTimeSnapshot = () => {
        const storyTime = storyTimeService.read();
        return { current: storyTime.current?.raw ?? '', extraction: extractionRuleDraftFrom(storyTime), calendar: calendarDraftFrom(storyTime) };
    };
    const loadStoryTimeState = () => {
        const snapshot = storyTimeSnapshot();
        state.storyTimeDraft = snapshot.current;
        state.extractionRuleDraft = snapshot.extraction;
        state.calendarDraft = snapshot.calendar;
        dirty.setBaseline('story-time', snapshot);
    };
    const loadSpecialDateState = () => {
        const settings = getGlobalSettings();
        state.specialPromptDraft = {
            general: settings.templates?.specialDateReminder ?? DEFAULT_GLOBAL_SETTINGS.templates.specialDateReminder,
            defaultDays: settings.defaults?.anniversaryAdvanceDays ?? DEFAULT_GLOBAL_SETTINGS.defaults.anniversaryAdvanceDays,
            storyTimeInstruction: settings.templates?.storyTimeInstruction || DEFAULT_GLOBAL_SETTINGS.templates.storyTimeInstruction,
            holidayInstruction: settings.templates?.holidayInstruction ?? '',
            holidayAdvanceDays: settings.defaults?.holidayAdvanceDays ?? 0,
        };
        state.specialPromptErrors = { general: '', defaultDays: '', storyTimeInstruction: '', holidayInstruction: '', holidayAdvanceDays: '' };
        state.specialPromptMessage = '';
    };
    let pendingAutoSave = Promise.resolve();
    const queueAutoSave = operation => {
        pendingAutoSave = pendingAutoSave.then(operation, operation);
        return pendingAutoSave;
    };
    async function saveStoryTimeDraft() {
        state.storyTimeMessage = '';
        try {
            const current = await storyTimeService.setManualAnchor(state.storyTimeDraft);
            state.storyTimeDraft = current.raw;
            dirty.setBaseline('story-time', storyTimeSnapshot());
        } catch (error) {
            state.storyTimeMessage = error?.message || '当前日期保存失败。';
            throw error;
        }
    }
    function extractionRuleDraftReady() {
        const draft = state.extractionRuleDraft;
        if (!draft.enabled) return true;
        if (draft.mode === 'regex') return Boolean(String(draft.pattern ?? '').trim());
        return draft.markers.length > 0 && draft.markers.every(item => String(item.start ?? '').trim() && String(item.end ?? '').trim());
    }
    async function saveExtractionRuleDraft() {
        state.extractionRuleMessage = '';
        try {
            const rule = await storyTimeService.setExtractionRule(state.extractionRuleDraft);
            state.extractionRuleDraft = { ...rule, markers: structuredClone(rule.markers ?? []) };
            dirty.setBaseline('story-time', storyTimeSnapshot());
        } catch (error) {
            state.extractionRuleMessage = error?.message || '识别规则保存失败。';
            throw error;
        }
    }
    const autoSaveExtractionRuleDraft = () => extractionRuleDraftReady()
        ? queueAutoSave(saveExtractionRuleDraft)
        : Promise.resolve(false);
    async function saveCalendarDraft() {
        state.calendarMessage = '';
        state.calendarDraft.enabled = state.calendarDraft.eras.length > 0;
        try {
            const calendar = await storyTimeService.setFictionalCalendar(state.calendarDraft);
            state.calendarDraft = { enabled: calendar.enabled, eras: structuredClone(calendar.eras) };
            dirty.setBaseline('story-time', storyTimeSnapshot());
        } catch (error) {
            state.calendarMessage = error?.message || '架空纪年保存失败。';
            throw error;
        }
    }
    async function saveRecallSettingsDraft() {
        state.recallSettingsMessage = '';
        state.recallSettingsMessageType = '';
        state.recallSettingsDraft.countEnabled = true;
        try {
            await recallSettingsService.save(state.recallSettingsDraft);
            state.recallSettingsDraft = recallSettingsService.read();
            dirty.setBaseline('recall-settings', state.recallSettingsDraft);
        } catch (error) {
            state.recallSettingsMessage = error?.message || '召回参数保存失败。';
            state.recallSettingsMessageType = 'error';
            throw error;
        }
    }
    async function saveSpecialPromptField(field) {
        state.specialPromptMessage = '';
        state.specialPromptErrors[field] = '';
        try {
            const settings = getGlobalSettings();
            if (field === 'defaultDays' || field === 'holidayAdvanceDays') {
                const draftKey = field === 'defaultDays' ? 'defaultDays' : 'holidayAdvanceDays';
                const settingKey = field === 'defaultDays' ? 'anniversaryAdvanceDays' : 'holidayAdvanceDays';
                const days = Number(state.specialPromptDraft[draftKey]);
                if (!Number.isInteger(days) || days < 0) throw new Error('提前天数必须是 0 或正整数。');
                settings.defaults = { ...(settings.defaults ?? {}), [settingKey]: days };
                state.specialPromptDraft[draftKey] = days;
                state.specialPromptMessage = '提前提醒已更新。';
            } else if (field === 'general') {
                const general = String(state.specialPromptDraft.general ?? '').trim();
                if (!general) throw new Error('通用提醒不能为空。');
                settings.templates = { ...(settings.templates ?? {}), specialDateReminder: general };
                state.specialPromptDraft.general = general;
                state.specialPromptMessage = '通用提醒已更新。';
            } else {
                const value = String(state.specialPromptDraft[field] ?? '').trim();
                if (field === 'storyTimeInstruction' && !value) throw new Error('提示词不能为空。');
                settings.templates = { ...(settings.templates ?? {}), [field]: value };
                state.specialPromptDraft[field] = value;
                state.specialPromptMessage = field === 'storyTimeInstruction' ? '提示词已更新。' : '用户补充内容已更新。';
            }
            await saveGlobalSettings();
            const live = shell.querySelector('[data-special-prompt-status]');
            if (live) live.textContent = state.specialPromptMessage;
        } catch (error) {
            state.specialPromptErrors[field] = error?.message || '提醒设置保存失败。';
            throw error;
        }
    }
    function openSummaryPromptTextDraft(key) {
        state.summaryPromptTextDraft = createSummaryPromptTextDraft(summarySettings(), key);
        state.summaryCustomPromptDraft = null;
        state.summarySettingsMessage = '';
        dirty.setBaseline('summary-prompt-text', state.summaryPromptTextDraft);
    }
    function openSummaryCustomPromptDraft(item = null) {
        state.summaryCustomPromptDraft = createSummaryCustomPromptDraft(item);
        state.summaryPromptTextDraft = null;
        state.summarySettingsMessage = '';
        dirty.setBaseline('summary-custom-prompt', state.summaryCustomPromptDraft);
    }
    function loadSummaryEventLibraryDraft() {
        state.summaryEventLibraryDraft = createSummaryEventLibraryDraft(summarySettings());
        state.summaryEventLibrarySelected = new Set();
        state.summaryEventLibraryEditingIndex = null;
        state.summarySettingsMessage = '';
        dirty.setBaseline('summary-event-library', state.summaryEventLibraryDraft);
    }
    function summaryCleaningDirtySnapshot() {
        return {
            rules: state.summaryCleaningDraft,
            editingIndex: state.summaryCleaningEditingIndex,
            ruleDraft: state.summaryCleaningRuleDraft,
        };
    }
    function loadSummaryCleaningDraft() {
        state.summaryCleaningDraft = createSummaryCleaningDraft(summarySettings().cleaning.rules);
        state.summaryCleaningRuleDraft = null;
        state.summaryCleaningEditingIndex = null;
        state.summaryCleaningQuickOpen = false;
        state.summarySettingsMessage = '';
        dirty.setBaseline('summary-cleaning', summaryCleaningDirtySnapshot());
    }
    async function saveSummaryCleaningRules(rules, message = '') {
        const validated = validateSummaryCleaningDraft(rules);
        const nextSummary = structuredClone(summarySettings());
        nextSummary.cleaning.rules = structuredClone(validated);
        const savedSummary = await commitSummarySettings(nextSummary);
        state.summaryCleaningDraft = createSummaryCleaningDraft(savedSummary.cleaning.rules);
        state.summaryCleaningRuleDraft = null;
        state.summaryCleaningEditingIndex = null;
        dirty.setBaseline('summary-cleaning', summaryCleaningDirtySnapshot());
        if (message) showSummarySettingsMessage(message);
    }
    function currentDirtyEntry() {
        const routeId = router.current().routeId;
        if (routeId === 'memory.merge.body' && state.memoryMergeBodyDraft) return ['memory-merge-body', state.memoryMergeBodyDraft];
        // Floor selection is transient; generated candidates retain their own protection.
        if (routeId === 'memory.summary.manual') return null;
        if (routeId === 'memory.summary.auto') return ['auto-summary', state.autoSummaryDraft];
        if (routeId === 'memory.summary.review' && state.summaryReviewDraft) return ['summary-review', state.summaryReviewDraft];
        if (['settings.summary', 'settings.summary.prompt'].includes(routeId) && state.summaryCustomPromptDraft) return ['summary-custom-prompt', state.summaryCustomPromptDraft];
        if (['settings.summary', 'settings.summary.prompt'].includes(routeId) && state.summaryPromptTextDraft) return ['summary-prompt-text', state.summaryPromptTextDraft];
        if (routeId === 'settings.summary.events' && state.summaryEventLibraryDraft) return ['summary-event-library', state.summaryEventLibraryDraft];
        if (routeId === 'settings.summary.cleaning' && state.summaryCleaningDraft) return ['summary-cleaning', summaryCleaningDirtySnapshot()];
        if (routeId === 'memory.record') return ['memory', memoryDirtySnapshot(state)];
        if (['modules.index', 'modules.record'].includes(routeId) && state.promptModuleDraft) return ['prompt-module', state.promptModuleDraft];
        if (routeId === 'time.anniversaries' && state.anniversaryDraft) return ['anniversary', state.anniversaryDraft];
        if (routeId === 'time.calendar' && state.fictionalCalendarDraft) return ['fictional-calendar', state.fictionalCalendarDraft];
        if (routeId === 'time.calendar' && state.customCalendarDraft) return ['custom-calendar', state.customCalendarDraft];
        if (routeId === 'time.schedule' && state.calendarEventDraft) return ['calendar-event', state.calendarEventDraft];
        if (routeId === 'time.holidays' && state.holidayDraft) return ['holiday', state.holidayDraft];
        if (state.regexDraft) return ['regex', state.regexDraft];
        if (routeId === 'settings.ai' && state.apiDraft) return ['api', state.apiDraft];
        if (routeId === 'recall.settings') return ['recall-settings', state.recallSettingsDraft];
        if (routeId === 'time.story') return ['story-time', { current: state.storyTimeDraft, extraction: state.extractionRuleDraft, calendar: state.calendarDraft }];
        return null;
    }
    const hasSummaryCandidateEdit = () => router.current().routeId === 'memory.summary.review'
        && summaryCandidateEditChanged(state.summaryReviewEditing);
    const mayClose = async (apiPosition = null) => {
        await pendingAutoSave.catch(() => {});
        if (state.coverageGapBusy || state.summaryReviewBusy) return false;
        const entry = currentDirtyEntry();
        const hasCandidateEdit = hasSummaryCandidateEdit();
        if (!hasCandidateEdit && (!entry || !dirty.isDirty(entry[0], entry[1]))) return true;
        const decision = discardGate.request();
        if (apiPosition) await renderKeepingApiPosition(apiPosition, { restoreFocus: false });
        else if (router.current().routeId.startsWith('settings.summary') || router.current().routeId === 'time.holidays') {
            const textPosition = summaryTextareaPosition();
            await renderKeepingCalendarPosition();
            restoreSummaryTextareaPosition(textPosition);
        }
        else await render();
        return decision;
    };
    function discardTransientRouteDraft(routeId) {
        if (routeId.startsWith('memory.merge.')) {
            memoryMergeService.cancel();
    state.memoryMergeIds = [];
    state.memoryMergeBusy = false;
    state.memoryMergeBusyStage = '';
            state.memoryMergeMessage = '';
            state.memoryMergeBodyDraft = null;
        }
        if (routeId === 'memory.summary.auto') state.autoSummaryDraft = null;
        if (routeId === 'memory.summary.review') {
            state.summaryGapPlan = null;
            state.summaryReviewDraft = null;
            state.summaryReviewMessage = '';
            resetSummaryReviewUi();
        }
        if (routeId === 'memory.summary.manual' && !state.manualSummaryBusy) {
            discardManualSummaryTransientState(state);
            dirty.setBaseline('manual-summary', state.manualSummaryDraft);
        }
        if (['settings.summary', 'settings.summary.prompt'].includes(routeId)) {
            state.summaryPromptTextDraft = null;
            state.summaryCustomPromptDraft = null;
            state.summaryPromptFullscreen = false;
        }
        if (routeId === 'settings.summary.events') {
            state.summaryEventLibraryDraft = null;
            state.summaryEventLibrarySelected = new Set();
        }
        if (routeId === 'settings.summary.cleaning') {
            state.summaryCleaningDraft = null;
            state.summaryCleaningRuleDraft = null;
            state.summaryCleaningEditingIndex = null;
        }
        if (['modules.index', 'modules.record'].includes(routeId)) closePromptModuleInlineEditor();
    }
    async function go(routeId, options = {}) {
        if (!await mayClose()) return false;
        const departingRoute = router.current().routeId;
        if (routeId !== departingRoute && ['settings.summary', 'settings.summary.prompt'].includes(departingRoute)) discardTransientRouteDraft(departingRoute);
        if (router.current().routeId === 'memory.library') rememberScroll();
        if (routeId === 'recall.settings') {
            state.settingsSection = 'recall';
            state.recallSettingsDraft = recallSettingsService.read();
            dirty.setBaseline('recall-settings', state.recallSettingsDraft);
        }
        if (['settings.time.story', 'settings.time.holiday', 'settings.special-date-defaults'].includes(routeId)) {
            loadSpecialDateState();
            state.recallSettingsDraft = recallSettingsService.read();
            state.recallSettingsMessage = '';
            state.recallSettingsMessageType = '';
        }
        if (routeId === 'settings.summary.cleaning') loadSummaryCleaningDraft();
        if (routeId === 'settings.summary.events') loadSummaryEventLibraryDraft();
        if (routeId === 'time.story') {
            loadStoryTimeState();
        }
        if (routeId === 'time.anniversaries') {
            loadSpecialDateState();
        }
        router.go(routeId, options);
        await render();
        return true;
    }
    function openNew(returnTo = 'memory.library') {
        rememberScroll(); state.activeId = null; state.draft = blankDraft(); state.formErrors = {}; state.formMessage = '';
        state.memoryEntryDrafts = createBlankMemoryEntryDrafts();
        state.memoryDetailAliasEntries = {}; state.memoryDetailAliasErrors = {}; state.memoryDetailAliasOpenParents = new Set();
        dirty.setBaseline('memory', memoryDirtySnapshot(state)); router.go('memory.record', { returnTo }); render();
    }

    async function submitAnniversaryForm() {
        state.anniversaryErrors = {}; state.anniversaryMessage = '';
        try {
            if (state.anniversaryEditingId) await anniversaryService.update(state.anniversaryEditingId, state.anniversaryDraft);
            else await anniversaryService.create(state.anniversaryDraft);
            dirty.setBaseline('anniversary', state.anniversaryDraft);
            state.anniversaryDraft = null; state.anniversaryEditingId = null;
            await renderKeepingCalendarPosition('.tkm-special-date-timeline');
        } catch (error) {
            state.anniversaryErrors = error.fields ?? {}; state.anniversaryMessage = error.message; await renderKeepingCalendarPosition('.tkm-special-date-form');
        }
    }

    async function submitMemoryForm() {
        if (memoryFormMessageTimer) windowRef?.clearTimeout?.(memoryFormMessageTimer);
        memoryFormMessageTimer = null;
        state.formErrors = {}; state.formMessage = '';
        const savedScrollTop = shell.querySelector('.tkm-memory-editor-scroll')?.scrollTop ?? 0;
        try {
            for (const field of Object.keys(state.memoryEntryDrafts)) {
                const pending = state.memoryEntryDrafts[field];
                if (pending.trim()) state.draft[field] = appendMemoryEditorEntry(state.draft[field], field, pending);
                state.memoryEntryDrafts[field] = '';
            }
            for (const [parentDetail, pending] of Object.entries(state.memoryDetailAliasEntries)) {
                if (!pending.trim()) continue;
                const next = appendDetailAlias(state.draft.detailAliases, state.draft.detailKeywords, parentDetail, pending);
                const accepted = (next.find(binding => binding.parentDetail === parentDetail)?.aliases ?? [])
                    .some(alias => alias.toLocaleLowerCase() === pending.trim().toLocaleLowerCase());
                if (!accepted) {
                    state.memoryDetailAliasErrors[parentDetail] = '请填写父词中连续出现、且不同于完整父词的汉字检索简称。';
                    state.memoryDetailAliasOpenParents.add(parentDetail);
                    throw new Error('请先修正未保存的检索简称。');
                }
                state.draft.detailAliases = next;
                state.memoryDetailAliasEntries[parentDetail] = '';
                delete state.memoryDetailAliasErrors[parentDetail];
            }
            const floorRanges = state.draft.sourceFloorRanges.map(range => [range.start, range.end]);
            const payload = {
                ...state.draft,
                ...memoryEditorListPayload(state.draft),
                source: {
                    ...(state.draft.source ?? {}),
                    floorRange: floorRanges.length === 1 ? floorRanges[0] : floorRanges,
                },
            };
            const memory = state.activeId ? await memoryLibraryService.update(state.activeId, payload) : await memoryLibraryService.create(payload);
            state.activeId = memory.id; state.draft = draftFromMemory(memory); state.memoryEntryDrafts = createBlankMemoryEntryDrafts(); state.formMessage = '已保存。'; dirty.setBaseline('memory', memoryDirtySnapshot(state)); await renderKeepingMemoryEditorPosition({ savedScrollTop });
            memoryFormMessageTimer = windowRef?.setTimeout?.(() => {
                memoryFormMessageTimer = null;
                if (state.formMessage !== '已保存。') return;
                state.formMessage = '';
                shell.querySelector('.tkm-memory-save-toast')?.remove();
            }, 2200);
        } catch (error) { state.formErrors = error.fields ?? {}; state.formMessage = error.message; await renderKeepingMemoryEditorPosition({ savedScrollTop }); }
    }

    async function startKeywordRebuild(ids, returnTo) {
        if (state.keywordRebuildBusy) return;
        if (!memoryKeywordRebuildService.providerState().available) {
            state.keywordRebuildMessage = '当前选择的 AI 来源不可用。';
            state.formMessage = state.keywordRebuildMessage;
            await render();
            return;
        }
        if (returnTo === 'memory.record' && dirty.isDirty('memory', memoryDirtySnapshot(state))) {
            state.formMessage = '请先保存这条记忆，再重建关键词与检索简称。';
            await render();
            return;
        }
        state.keywordRebuildBusy = true;
        state.keywordRebuildMessage = '';
        state.keywordRebuildReturnTo = returnTo;
        await render();
        try {
            await memoryKeywordRebuildService.start(ids);
            state.keywordRebuildBusy = false;
            router.go('memory.keywords.review', { returnTo });
            await render();
        } catch (error) {
            state.keywordRebuildBusy = false;
            state.keywordRebuildMessage = error?.message || '关键词与检索简称生成失败。';
            if (returnTo === 'memory.record') state.formMessage = state.keywordRebuildMessage;
            else { state.notice = state.keywordRebuildMessage; state.noticeType = 'error'; }
            await render();
        }
    }

    function refreshManualSummaryPreview() {
        const preview = manualSummaryService.preview(manualSummaryRequest());
        state.manualSummaryPreview = preview;
        state.manualSummaryMessage = '';
        state.manualSummaryMessageType = '';
        return preview;
    }

    async function submitManualSummary() {
        if (state.manualSummaryBusy || manualSummaryService.pendingReview() || !manualSummaryService.providerState().available) return;
        state.manualSummaryMessage = '';
        state.manualSummaryMessageType = '';
        try {
            const preview = refreshManualSummaryPreview();
            const duplicate = preview.warnings?.some(item => item.code === 'duplicate_floor_range');
            if (duplicate && !state.manualSummaryDuplicateConfirmed) {
                state.manualSummaryDuplicateConfirmed = true;
                await render();
                return;
            }
            state.manualSummaryBusy = true;
            await render();
            const request = manualSummaryRequest();
            const requestChatId = currentChatLabel(getContext());
            const requestedRange = [Number(request.startFloor), Number(request.endFloor)];
            void manualSummaryService.start(request).then(async result => {
                const sameChat = requestChatId === currentChatLabel(getContext());
                if (state.manualSummaryChatId === requestChatId) {
                    state.manualSummaryBusy = false;
                    state.manualSummaryDuplicateConfirmed = false;
                }
                if (!sameChat) return;
                if (result.status === 'awaiting-review' || result.status === 'keyword-failed' || result.status === 'alias-failed') {
                    state.summaryReviewDraft = createSummaryReviewDraft(result.pending);
                    state.summaryReviewMessage = '';
                    dirty.setBaseline('summary-review', state.summaryReviewDraft);
                    dirty.setBaseline('manual-summary', state.manualSummaryDraft);
                    summaryNotifier?.manual?.({ status: 'review', floorRange: result.pending?.floorRange ?? requestedRange });
                    if (router.current().routeId === 'memory.summary.manual') {
                        router.go('memory.summary.review', { returnTo: 'memory.summary.manual' });
                    } else {
                        state.notice = '手动总结已生成，请前往入库前检查。';
                        state.noticeType = 'success';
                    }
                    await render();
                    return;
                }
                state.createMemoryNotice = `已入库第 ${result.ordinal} 批，共 ${result.memories?.length ?? 0} 条记忆。`;
                state.notice = state.createMemoryNotice;
                state.noticeType = 'success';
                state.manualSummaryPreview = null;
                dirty.setBaseline('manual-summary', state.manualSummaryDraft);
                summaryNotifier?.manual?.({ status: 'completed', floorRange: result.floorRange ?? requestedRange });
                if (router.current().routeId === 'memory.summary.manual') router.reset('memory.library');
                await render();
            }).catch(async error => {
                const sameChat = requestChatId === currentChatLabel(getContext());
                if (state.manualSummaryChatId === requestChatId) state.manualSummaryBusy = false;
                const interrupted = error?.code === 'summary_interrupted';
                summaryNotifier?.manual?.({ status: interrupted ? 'interrupted' : 'failed', floorRange: requestedRange });
                if (!sameChat) return;
                state.manualSummaryMessage = error?.message || '总结失败，楼层范围已保留。';
                state.manualSummaryMessageType = 'error';
                if (router.current().routeId !== 'memory.summary.manual') {
                    state.notice = state.manualSummaryMessage;
                    state.noticeType = 'error';
                }
                await render();
            });
        } catch (error) {
            state.manualSummaryBusy = false;
            state.manualSummaryMessage = error?.message || '总结失败，楼层范围已保留。';
            state.manualSummaryMessageType = 'error';
            await render();
        }
    }

    function renderSummaryEventLibrary() {
        const draft = state.summaryEventLibraryDraft;
        if (!draft) { router.back('settings.summary'); render(); return; }
        state.summaryEventLibrarySelected ??= new Set();
        const entries = draft.entries.map((item, index) => {
            const open = state.summaryEventLibraryEditingIndex === index;
            const name = item.name || '新事件词';
            const selected = state.summaryEventLibrarySelected.has(index);
            const enabled = item.enabled !== false;
            return `<li class="tkm-event-library-item" data-event-library-index="${index}"><div class="tkm-event-library-row"><label class="tkm-event-library-select"><input type="checkbox" data-action="select-event-library-item" data-index="${index}" ${selected ? 'checked' : ''} aria-label="选择「${escapeHtml(name)}」用于批量操作"></label><button type="button" class="tkm-event-library-toggle" data-action="toggle-event-library-item" data-index="${index}" aria-expanded="${open}"><span>${index + 1}. ${escapeHtml(name)}</span><span aria-hidden="true">${open ? '⌃' : '⌄'}</span></button><button type="button" class="tkm-compact-switch tkm-event-library-enabled ${enabled ? 'is-on' : ''}" role="switch" aria-checked="${enabled}" data-action="set-event-library-enabled" data-index="${index}" data-operation="${enabled ? 'disable' : 'enable'}" aria-label="${enabled ? '停用' : '启用'}事件词「${escapeHtml(name)}」"><i aria-hidden="true"></i></button></div>${open ? `<div class="tkm-event-library-fields"><label><span>事件词</span><input class="tkm-summary-field-control" type="text" data-event-library-field="name" data-index="${index}" value="${escapeHtml(item.name)}"></label><label><span>解释</span><textarea class="tkm-summary-field-control" rows="4" data-event-library-field="definition" data-index="${index}">${escapeHtml(item.definition)}</textarea></label><div class="tkm-event-library-row-actions"><button type="button" data-action="move-event-library-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-action="move-event-library-down" data-index="${index}" ${index === draft.entries.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="danger" data-action="delete-event-library-item" data-index="${index}">删除</button></div></div>` : `<p class="tkm-event-library-preview">${escapeHtml(item.definition)}</p>`}</li>`;
        }).join('');
        shell.innerHTML = `${focusedHeader('事件词库', 'tkm-event-library-form')}<main class="tkm-shell__body tkm-settings-child tkm-event-library-editor" data-tkm-scroll>${summarySettingsStatus()}<form id="tkm-event-library-form" data-tkm-form="event-library" novalidate><div class="tkm-event-library-toolbar"><span>${draft.useDefault ? '使用默认' : '自定义'} · ${draft.entries.length} 条</span><button type="button" class="tkm-inline-link" data-action="restore-event-library">恢复默认</button><button type="button" class="tkm-inline-link" data-action="add-event-library-item">＋ 新增事件词</button></div><p class="tkm-visually-hidden" role="status" aria-live="polite" data-event-library-reorder-status></p><div class="tkm-event-library-batch"><span>已选 ${state.summaryEventLibrarySelected.size} 条</span><button type="button" data-action="select-all-event-library">全选</button><button type="button" data-action="clear-event-library-selection">清空</button>${[["enable","启用"],["disable","停用"],["delete","删除"]].map(([operation,label]) => `<button type="button" data-action="batch-event-library" data-operation="${operation}" ${state.summaryEventLibrarySelected.size ? '' : 'disabled'}>${label}</button>`).join('')}</div><ol class="tkm-event-library-list">${entries || '<li class="tkm-settings-empty"><strong>事件词库为空</strong><span>保存后，新总结不会选择事件关键词。</span></li>'}</ol></form></main>`;
    }

    async function cancelSummaryReview({ removingLast = false } = {}) {
        const draft = state.summaryReviewDraft;
        if (!draft || state.summaryReviewBusy || summaryReviewCancelGate.isPending()) return;
        const anchor = summaryReviewAnchor();
        if (draft.candidates.length) {
            state.summaryReviewRemovingLast = removingLast;
            const decision = summaryReviewCancelGate.request();
            await renderKeepingSummaryReviewPosition(anchor);
            const confirmed = await decision;
            state.summaryReviewRemovingLast = false;
            if (!confirmed) {
                shell.querySelector(`[data-action="${removingLast ? 'remove-summary-candidate' : 'cancel-summary-review'}"]`)?.focus({ preventScroll: true });
                return;
            }
        }
        if (state.summaryReviewDraft !== draft) return;
        state.summaryReviewBusy = true;
        await renderKeepingSummaryReviewPosition(anchor);
        try {
            await manualSummaryService.cancel({ taskId: draft.taskId });
            state.summaryReviewBusy = false;
            state.summaryReviewDraft = null;
            state.summaryReviewMessage = '';
            state.manualSummaryPreview = null;
            state.manualSummaryPreviewOpen = false;
            resetSummaryReviewUi();
            if (draft.uncoveredOnly) state.summaryGapPlan = null;
            router.reset(draft.regeneration || draft.uncoveredOnly ? 'memory.summary.coverage' : 'memory.summary.manual');
            if (!draft.regeneration) dirty.setBaseline('manual-summary', state.manualSummaryDraft);
            await render();
        } catch (error) {
            state.summaryReviewBusy = false;
            state.summaryReviewMessage = error?.message || '取消失败，候选仍已保留。';
            await renderKeepingSummaryReviewPosition(anchor);
        }
    }

    async function submitSummaryReview() {
        if (!state.summaryReviewDraft || state.summaryReviewBusy) return;
        if (state.summaryReviewDraft.keywordState === 'failed' || ['pending', 'failed'].includes(state.summaryReviewDraft.aliasState)) return;
        if (state.summaryReviewEditing) {
            state.summaryReviewMessage = '请先保存或取消当前候选的修改。';
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(state.summaryReviewEditing.draftId));
            return;
        }
        const anchor = summaryReviewAnchor();
        state.summaryReviewBusy = true;
        state.summaryReviewMessage = '';
        await renderKeepingSummaryReviewPosition(anchor);
        try {
            const replacing = Boolean(state.summaryReviewDraft.regeneration);
            const uncovered = state.summaryReviewDraft.uncoveredOnly;
            const uncoveredTaskId = state.summaryReviewDraft.taskId;
            const result = await manualSummaryService.confirm({
                taskId: state.summaryReviewDraft.taskId,
                candidates: state.summaryReviewDraft.candidates,
            });
            state.summaryReviewBusy = false;
            state.summaryReviewDraft = null;
            state.notice = replacing
                ? `已原地替换第 ${result.ordinal} 批，共 ${result.memories?.length ?? 0} 条记忆。`
                : `已入库第 ${result.ordinal} 批，共 ${result.memories?.length ?? 0} 条记忆。`;
            state.noticeType = 'success';
            state.manualSummaryPreview = null;
            if (uncovered) {
                router.reset('memory.summary.coverage');
                if (state.summaryGapPlan?.chatId === currentChatLabel(getContext()) && state.summaryGapPlan.taskId === uncoveredTaskId) { state.summaryGapPlan.index++; await runUncoveredPlan(); }
                else { state.summaryGapPlan = null; await render(); }
                return;
            }
            router.reset('memory.library');
            await render();
        } catch (error) {
            state.summaryReviewBusy = false;
            state.summaryReviewMessage = error?.message || '候选入库失败，修改已保留。';
            await renderKeepingSummaryReviewPosition(anchor);
        }
    }

    async function runMutation(operation) {
        state.notice = '';
        state.noticeType = '';
        try {
            await operation();
            return true;
        } catch (error) {
            state.notice = error?.message || '操作未保存，请重试。';
            state.noticeType = 'error';
            await render();
            return false;
        }
    }

    async function commitRegexRules(rules) {
        const settings = getGlobalSettings();
        settings.regexRules = structuredClone(rules);
        await saveGlobalSettings();
    }
    function showRegexMessage(message, { autoClear = true } = {}) {
        if (regexMessageTimer) windowRef?.clearTimeout?.(regexMessageTimer);
        regexMessageTimer = null;
        state.regexMessage = message;
        state.regexMessageType = autoClear ? 'success' : 'error';
        if (!message || !autoClear) return;
        regexMessageTimer = windowRef?.setTimeout?.(() => {
            regexMessageTimer = null;
            if (state.regexMessage !== message) return;
            state.regexMessage = '';
            if (router.current().routeId === 'settings.regex') {
                const scrollTop = shell.querySelector('.tkm-shell__body')?.scrollTop ?? 0;
                renderKeepingCalendarPosition('', scrollTop);
            }
        }, 2200);
    }
    function ensureStableRegexRuleIds(rules) {
        const used = new Set();
        return rules.map((rule, index) => {
            const copy = { ...rule };
            let id = String(copy.id ?? '').trim();
            if (!id || used.has(id)) id = `regex-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
            copy.id = id;
            used.add(id);
            return copy;
        });
    }
    function revealRegexReorderFeedback(action) {
        const feedback = state.regexReorderFeedback;
        if (!feedback) return;
        const row = [...shell.querySelectorAll('[data-regex-id]')].find(item => item.dataset.regexId === feedback.id);
        const reducedMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        row?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
        const focusTarget = row?.querySelector(`[data-action="${action}"]:not(:disabled)`)
            ?? row?.querySelector('[data-action="move-regex-up"]:not(:disabled), [data-action="move-regex-down"]:not(:disabled)');
        focusTarget?.focus?.();
        if (reorderFeedbackTimer) windowRef?.clearTimeout?.(reorderFeedbackTimer);
        reorderFeedbackTimer = windowRef?.setTimeout?.(() => {
            row?.classList.remove('tkm-reorder-feedback');
            state.regexReorderFeedback = null;
            reorderFeedbackTimer = null;
        }, 900);
    }
    function sameRegexRule(left, right) {
        return left?.action === right?.action
            && String(left?.pattern ?? '') === String(right?.pattern ?? '')
            && String(left?.flags ?? 'su') === String(right?.flags ?? 'su')
            && String(left?.replacement ?? '') === String(right?.replacement ?? '');
    }

    shell.addEventListener('focusin', event => {
        if (!event.target.matches?.('input:not([type="radio"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]')) return;
        queueFocusedFieldVisibility(120);
    });
    shell.addEventListener('input', event => {
        if (event.target.matches?.('[data-summary-profile-name]')) { state.summaryProfileName = event.target.value; return; }
        const mergeField = event.target.dataset?.memoryMergeField;
        if (mergeField && state.memoryMergeBodyDraft) {
            state.memoryMergeBodyDraft[mergeField] = event.target.value;
            if (event.target.matches('textarea')) {
                event.target.style.height = 'auto';
                event.target.style.height = `${event.target.scrollHeight}px`;
            }
            state.memoryMergeMessage = '';
            return;
        }
        const promptModuleField = event.target.dataset?.promptModuleField;
        if (promptModuleField && state.promptModuleDraft && !['enabled', 'role'].includes(promptModuleField)) {
            state.promptModuleDraft[promptModuleField] = event.target.value;
            state.promptModuleMessage = '';
            return;
        }
        if (event.target.matches?.('[data-summary-gap-count]')) { state.summaryGapCount = event.target.value; return; }
        if (event.target.matches?.('[data-auto-reset-start]')) { state.autoResetStart = event.target.value; state.autoResetConfirmed = false; return; }
        if (event.target.matches?.('[data-coverage-floor]')) {
            state.coverageFloorDraft = event.target.value;
            state.coverageMessage = '';
            state.coverageMessageType = '';
            return;
        }
        const autoField = event.target.dataset?.autoSummaryField;
        if (autoField && state.autoSummaryDraft) {
            state.autoSummaryDraft[autoField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
            state.autoSummaryMessage = '';
            return;
        }
        const memoryEntryField = event.target.dataset?.memoryEntryField;
        if (memoryEntryField && state.memoryEntryDrafts) {
            state.memoryEntryDrafts[memoryEntryField] = event.target.value;
            const button = event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-memory-tag"]');
            if (button) button.hidden = !event.target.value.trim();
        }
        const memoryDetailAliasParent = event.target.matches?.('[data-memory-detail-alias-entry]') ? event.target.dataset.parentDetail : '';
        if (memoryDetailAliasParent && state.draft?.detailKeywords.includes(memoryDetailAliasParent)) {
            state.memoryDetailAliasEntries[memoryDetailAliasParent] = event.target.value;
            delete state.memoryDetailAliasErrors[memoryDetailAliasParent];
            const button = event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-memory-detail-alias"]');
            if (button) button.hidden = !event.target.value.trim();
        }
        const field = event.target.dataset?.draftField;
        if (field && state.draft) {
            state.draft[field] = event.target.value;
        }
        const floorField = event.target.dataset?.floorField;
        if (floorField && state.draft) state.draft.sourceFloorRanges[Number(event.target.dataset.index)][floorField] = event.target.value;
        if (event.target.name === 'mode' && state.draft) state.draft.mode = event.target.value;
        if (event.target.dataset?.field === 'story-time-draft') state.storyTimeDraft = event.target.value;
        if (event.target.dataset?.field === 'time-regex-pattern') { state.extractionRuleDraft.pattern = event.target.value; state.extractionRuleMessage = ''; state.extractionRuleMessageType = ''; fitStoryTimeTextarea(event.target); }
        const summaryField = event.target.dataset?.summaryField;
        if (summaryField && summaryField !== 'includeUserMessages') {
            state.manualSummaryDraft[summaryField] = event.target.value;
            state.manualSummaryPreview = null;
            state.manualSummaryPreviewOpen = false;
            state.manualSummaryDuplicateConfirmed = false;
            state.manualSummaryMessage = '';
            shell.querySelector('.tkm-summary-preview')?.remove();
            shell.querySelector('.tkm-summary-warning')?.remove();
            syncManualSummaryRangeUi();
        }
        const summaryCandidateField = event.target.dataset?.summaryCandidateField;
        if (summaryCandidateField && state.summaryReviewEditing?.draftId === event.target.dataset.draftId) {
            updateSummaryCandidateEdit(state.summaryReviewEditing, summaryCandidateField, event.target.value);
            if (event.target.matches('textarea')) {
                event.target.style.height = 'auto';
                event.target.style.height = `${event.target.scrollHeight}px`;
            }
            state.summaryReviewMessage = '';
        }
        const summaryCandidateEntryField = event.target.dataset?.summaryCandidateEntryField;
        if (summaryCandidateEntryField && state.summaryReviewEditing?.draftId === event.target.dataset.draftId) {
            updateSummaryCandidateEntry(state.summaryReviewEditing, summaryCandidateEntryField, event.target.value);
            const button = event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-summary-candidate-tag"]');
            if (button) button.hidden = !event.target.value.trim();
            state.summaryReviewMessage = '';
        }
        const summaryDetailAliasParent = event.target.matches?.('[data-summary-detail-alias-entry]') ? event.target.dataset.parentDetail : '';
        if (summaryDetailAliasParent && state.summaryReviewEditing?.draftId === event.target.dataset.draftId) {
            updateSummaryDetailAliasEntry(state.summaryReviewEditing, summaryDetailAliasParent, event.target.value);
            const button = event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-summary-candidate-detail-alias"]');
            if (button) button.hidden = !event.target.value.trim();
            state.summaryReviewMessage = '';
        }
        if (event.target.dataset?.field === 'time-regex-flags') { state.extractionRuleDraft.flags = event.target.value; state.extractionRuleMessage = ''; state.extractionRuleMessageType = ''; }
        if (event.target.dataset?.field === 'special-prompt-general') state.specialPromptDraft.general = event.target.value;
        if (event.target.dataset?.field === 'special-prompt-default-days') state.specialPromptDraft.defaultDays = event.target.value;
        if (event.target.dataset?.field === 'story-time-instruction') state.specialPromptDraft.storyTimeInstruction = event.target.value;
        if (event.target.dataset?.field === 'holiday-instruction') state.specialPromptDraft.holidayInstruction = event.target.value;
        if (event.target.dataset?.field === 'holiday-advance-days') state.specialPromptDraft.holidayAdvanceDays = event.target.value;
        const timeMarkerField = event.target.dataset?.timeMarkerField;
        if (timeMarkerField) { state.extractionRuleDraft.markers[Number(event.target.dataset.index)][timeMarkerField] = event.target.value; state.extractionRuleMessage = ''; state.extractionRuleMessageType = ''; }
        const anniversaryField = event.target.dataset?.anniversaryField;
        if (anniversaryField && state.anniversaryDraft) {
            const [group, child] = anniversaryField.split('.');
            if (child) state.anniversaryDraft[group][child] = event.target.value;
            else state.anniversaryDraft[group] = event.target.value;
        }
        const anniversaryNameField = event.target.dataset?.anniversaryNameField;
        if (anniversaryNameField && state.anniversaryDraft) {
            state.anniversaryDraft.names[Number(event.target.dataset.index)][anniversaryNameField] = event.target.value;
        }
        const eraField = event.target.dataset?.eraField;
        if (eraField) state.calendarDraft.eras[Number(event.target.dataset.eraIndex)][eraField] = event.target.value;
        const fictionalField = event.target.dataset?.fictionalField;
        if (fictionalField && state.fictionalCalendarDraft && event.target.type !== 'checkbox') {
            state.fictionalCalendarDraft[fictionalField] = event.target.value;
        }
        const customField = event.target.dataset?.customField;
        if (customField && state.customCalendarDraft) state.customCalendarDraft[customField] = event.target.value;
        const customMonthField = event.target.dataset?.customMonthField;
        if (customMonthField && state.customCalendarDraft) {
            const month = state.customCalendarDraft.months[Number(event.target.dataset.index)];
            if (month) month[customMonthField] = event.target.value;
        }
        const calendarEventField = event.target.dataset?.calendarEventField;
        if (calendarEventField && state.calendarEventDraft) state.calendarEventDraft[calendarEventField] = event.target.value;
        const holidayField = event.target.dataset?.holidayField;
        if (holidayField && state.holidayDraft) state.holidayDraft[holidayField] = event.target.value;
        if (event.target.dataset?.fictionalSchemeName && state.fictionalCalendarDraft) {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === event.target.dataset.schemeId);
            if (scheme) scheme.name = event.target.value;
        }
        const termField = event.target.dataset?.fictionalTermField;
        if (termField && state.fictionalCalendarDraft) {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === event.target.dataset.schemeId);
            const term = scheme?.solarTerms?.[Number(event.target.dataset.termIndex)];
            if (term) term[termField] = event.target.value;
        }
        const fictionalImport = event.target.dataset?.fictionalImport;
        if (fictionalImport && !['includeSolarTerms', 'includeTraditionalHolidays'].includes(fictionalImport)) state.fictionalCalendarImportDraft[fictionalImport] = event.target.value;
        const regexField = event.target.dataset?.regexField;
        if (regexField && state.regexDraft) state.regexDraft[regexField] = event.target.value;
        const apiField = event.target.dataset?.apiField;
        if (apiField && state.apiDraft && !['presetId', 'modelChoice'].includes(apiField)) state.apiDraft[apiField] = event.target.value;
        if (event.target.dataset?.apiDialogField === 'name') state.apiDialogName = event.target.value;
        const recallSetting = event.target.dataset?.recallSetting;
        if (recallSetting && state.recallSettingsDraft && event.target.type !== 'checkbox') {
            state.recallSettingsDraft[recallSetting] = event.target.value;
            if (recallSetting === 'maxTokens') state.recallSettingsDraft.tokenEnabled = event.target.value.trim() !== '';
        }
        if (event.target.dataset?.summaryPromptTextField === 'value' && state.summaryPromptTextDraft) {
            state.summaryPromptTextDraft.value = event.target.value;
            state.summaryPromptTextDraft.useDefault = false;
            state.summarySettingsMessage = '';
            growSummaryPromptTextarea(event.target);
        }
        if (event.target.dataset?.recallExcludedTerm !== undefined) {
            state.recallExcludedTermDraft = event.target.value;
            state.recallSettingsMessage = '';
            state.recallSettingsMessageType = '';
        }
        const summaryCustomPromptField = event.target.dataset?.summaryCustomPromptField;
        if (summaryCustomPromptField && state.summaryCustomPromptDraft && ['name', 'content', 'position'].includes(summaryCustomPromptField)) {
            state.summaryCustomPromptDraft[summaryCustomPromptField] = event.target.value;
            state.summarySettingsMessage = '';
            if (summaryCustomPromptField === 'content') growSummaryPromptTextarea(event.target);
            if (summaryCustomPromptField === 'position') {
                const order = shell.querySelector('.tkm-summary-insertion-order');
                if (order) order.textContent = event.target.value === 'after' ? 'AI 任务 → 此提示词 → 待处理内容' : '此提示词 → AI 任务 → 待处理内容';
            }
        }
        const eventLibraryField = event.target.dataset?.eventLibraryField;
        if (eventLibraryField && state.summaryEventLibraryDraft) {
            const entry = state.summaryEventLibraryDraft.entries[Number(event.target.dataset.index)];
            if (entry && ['name', 'definition'].includes(eventLibraryField)) {
                entry[eventLibraryField] = event.target.value;
                if (eventLibraryField === 'definition') growSummaryPromptTextarea(event.target);
                state.summaryEventLibraryDraft.useDefault = false;
                state.summarySettingsMessage = '';
            }
        }
        const summaryCleaningEditField = event.target.dataset?.summaryCleaningEditField;
        if (summaryCleaningEditField && summaryCleaningEditField !== 'enabled' && state.summaryCleaningRuleDraft) {
            state.summaryCleaningRuleDraft[summaryCleaningEditField] = summaryCleaningEditField === 'captureGroup'
                ? Number(event.target.value)
                : event.target.value;
        }
    });
    shell.addEventListener('focusout', event => {
        const target = event.target;
        if (target.dataset?.field === 'story-time-draft') queueAutoSave(saveStoryTimeDraft).catch(() => render());
        if (target.dataset?.timeMarkerField || ['time-regex-pattern', 'time-regex-flags'].includes(target.dataset?.field)) autoSaveExtractionRuleDraft().catch(() => render());
        if (target.dataset?.eraField) queueAutoSave(saveCalendarDraft).catch(() => render());
        if (target.dataset?.recallSetting && target.type !== 'checkbox') queueAutoSave(saveRecallSettingsDraft).catch(() => render());
        if (target.dataset?.field === 'special-prompt-general') queueAutoSave(() => saveSpecialPromptField('general')).catch(() => render());
        if (target.dataset?.field === 'special-prompt-default-days') queueAutoSave(() => saveSpecialPromptField('defaultDays')).catch(() => render());
        if (target.dataset?.field === 'story-time-instruction') queueAutoSave(() => saveSpecialPromptField('storyTimeInstruction')).catch(() => render());
        if (target.dataset?.field === 'holiday-instruction') queueAutoSave(() => saveSpecialPromptField('holidayInstruction')).catch(() => render());
        if (target.dataset?.field === 'holiday-advance-days') queueAutoSave(() => saveSpecialPromptField('holidayAdvanceDays')).catch(() => render());
    });
    shell.addEventListener('change', async event => {
        if (event.target.matches?.('[data-summary-prompt-profile]')) {
            if (!await mayClose()) { await renderKeepingCalendarPosition(); return; }
            try {
                await commitSummarySettings(selectPromptProfile(summarySettings(), event.target.value));
                state.summaryPromptTextDraft = null; state.summaryCustomPromptDraft = null;
                showSummarySettingsMessage('提示词方案已切换。');
            } catch (error) { showSummarySettingsMessage(error?.message || '方案切换失败。', 'error'); }
            await renderKeepingCalendarPosition(); return;
        }
        const promptModuleField = event.target.dataset?.promptModuleField;
        if (promptModuleField && state.promptModuleDraft) {
            state.promptModuleDraft[promptModuleField] = promptModuleField === 'enabled'
                ? event.target.checked
                : event.target.value;
            state.promptModuleMessage = '';
            if (promptModuleField === 'lifecycle') await renderKeepingCalendarPosition();
            return;
        }

        const summarySetting = event.target.dataset?.summarySetting;
        if (summarySetting) {
            try {
                const nextSummary = structuredClone(summarySettings());
                nextSummary[summarySetting] = event.target.checked;
                await commitSummarySettings(nextSummary);
                showSummarySettingsMessage('手动检查设置已更新。');
            } catch (error) { showSummarySettingsMessage(error?.message || '事件总结设置保存失败。', 'error'); }
            await render(); return;
        }
        if (event.target.dataset?.summaryCleaningEditField === 'enabled' && state.summaryCleaningRuleDraft) {
            state.summaryCleaningRuleDraft.enabled = event.target.checked;
            return;
        }
        if (event.target.dataset?.summaryCleaningEditField === 'action' && state.summaryCleaningRuleDraft) {
            state.summaryCleaningRuleDraft.action = event.target.value;
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-fields'); return;
        }
        if (event.target.dataset?.summaryField === 'includeUserMessages') {
            state.manualSummaryDraft.includeUserMessages = event.target.checked;
            state.manualSummaryPreview = null;
            state.manualSummaryPreviewOpen = false;
            state.manualSummaryDuplicateConfirmed = false;
            state.manualSummaryMessage = '';
            shell.querySelector('.tkm-summary-preview')?.remove();
            return;
        }
        const immediateFilter = event.target.dataset?.filterImmediate;
        if (immediateFilter) {
            state[immediateFilter] = event.target.value;
            state.filterDraft = normalizeMemoryFilterDraft(state);
            state.selected.clear(); state.listScrollTop = 0; render(); return;
        }
        if (event.target.name === 'calendar-event-repeat' && state.calendarEventDraft) state.calendarEventDraft.repeat = event.target.value;
        if (event.target.name === 'calendar-event-status' && state.calendarEventDraft) state.calendarEventDraft.status = event.target.value;
        if (event.target.name === 'holiday-status' && state.holidayDraft) state.holidayDraft.status = event.target.value;
        if (event.target.dataset?.regexField === 'action' && state.regexDraft) { state.regexDraft.action = event.target.value; state.regexMessage = ''; render(); return; }
        if (event.target.dataset?.apiField === 'presetId' && state.apiDraft) {
            const position = rememberApiPosition(event.target);
            if (!await mayClose(position)) { await renderKeepingApiPosition(position); return; }
            try { const preset = selectSecondaryApiPreset({ context: getContext(), presetId: event.target.value }); loadApiDraft(preset.id); state.apiMessage = ''; state.apiMessageType = ''; } catch (error) { state.apiMessage = error?.message || '切换方案失败。'; state.apiMessageType = 'error'; }
            await renderKeepingApiPosition(position); return;
        }
        if (event.target.dataset?.apiField === 'modelChoice' && state.apiDraft && event.target.value) {
            const position = rememberApiPosition(event.target);
            state.apiDraft.model = event.target.value;
            await renderKeepingApiPosition(position); return;
        }
        const leapField = event.target.dataset?.fictionalLeapField;
        if (leapField && state.fictionalCalendarDraft) {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === event.target.dataset.schemeId);
            if (scheme?.leapMonth) {
                const previousLeapId = `leap-month-${scheme.leapMonth.afterMonth}`;
                scheme.leapMonth[leapField] = Number(event.target.value);
                if (leapField === 'afterMonth') {
                    const nextLeapId = `leap-month-${scheme.leapMonth.afterMonth}`;
                    for (const term of scheme.solarTerms ?? []) if (term.monthId === previousLeapId) term.monthId = nextLeapId;
                }
            }
            await render(); return;
        }
        if (event.target.dataset?.fictionalAnchor && state.fictionalCalendarDraft) {
            const wrapper = event.target.closest('.tkm-fictional-anchor');
            const era = wrapper?.querySelector('[data-fictional-anchor="era"]')?.value ?? '';
            const year = wrapper?.querySelector('[data-fictional-anchor="year"]')?.value ?? '1';
            state.fictionalCalendarDraft.cycle.anchorYear = ordinalFromEra(era, year);
            return;
        }
        if (event.target.dataset?.fictionalImport === 'includeSolarTerms') {
            state.fictionalCalendarImportDraft.includeSolarTerms = event.target.checked;
            await renderKeepingCalendarPosition('.tkm-fictional-import');
            return;
        }
        if (event.target.dataset?.fictionalImport === 'includeTraditionalHolidays') {
            state.fictionalCalendarImportDraft.includeTraditionalHolidays = event.target.checked;
            await renderKeepingCalendarPosition('.tkm-fictional-import');
            return;
        }
        const recallSetting = event.target.dataset?.recallSetting;
        if (recallSetting && event.target.type === 'checkbox' && state.recallSettingsDraft) { state.recallSettingsDraft[recallSetting] = event.target.checked; state.recallSettingsMessage = ''; await queueAutoSave(saveRecallSettingsDraft).catch(() => {}); await render(); return; }
        if (event.target.dataset?.field === 'time-regex-enabled') {
            state.extractionRuleDraft.enabled = event.target.checked; state.extractionRuleMessage = '';
            if (event.target.checked && !state.extractionRuleDraft.markers.length) state.extractionRuleDraft.markers.push({ name: '', start: '', end: '' });
            await autoSaveExtractionRuleDraft().catch(() => {});
            await renderKeepingCalendarPosition('.tkm-recognition-section'); return;
        }
        if (event.target.dataset?.field === 'time-rule-regex') {
            state.extractionRuleDraft.mode = event.target.checked ? 'regex' : 'markers'; state.extractionRuleMessage = '';
            await autoSaveExtractionRuleDraft().catch(() => {});
            await render(); return;
        }
    });
    shell.addEventListener('submit', async event => {
        if (event.target.dataset?.tkmForm === 'prompt-module') {
            event.preventDefault();
            if (state.promptModuleBusy || !state.promptModuleDraft) return;
            state.promptModuleBusy = true;
            state.promptModuleMessage = '';
            const draft = structuredClone(state.promptModuleDraft);
            try {
                const saved = draft.id
                    ? await promptModuleService.update(draft.scope, draft.id, promptModulePayload(draft))
                    : await promptModuleService.create(promptModulePayload(draft));
                dirty.setBaseline('prompt-module', createPromptModuleDraft(saved));
                closePromptModuleInlineEditor();
                state.promptModuleListMessage = '';
                if (router.current().routeId === 'modules.record') router.back('modules.index');
                showPromptModuleNotice(`模块「${saved.name}」已保存。`);
                await render();
            } catch (error) {
                state.promptModuleBusy = false;
                state.promptModuleMessage = error?.message || '模块保存失败，请重试。';
                await renderKeepingCalendarPosition();
            }
            return;
        }
        if (event.target.dataset?.tkmForm === 'summary-exclusion') {
            event.preventDefault();
            await updateSummaryExclusion('exclude', state.coverageFloorDraft);
            return;
        }
        if (event.target.dataset?.tkmForm === 'summary-prompt-text') {
            event.preventDefault();
            const promptScrollTop = state.summaryPromptFullscreen ? state.summaryInlineScrollTop : null;
            try {
                const nextSummary = applySummaryPromptTextDraft(summarySettings(), state.summaryPromptTextDraft);
                const savedSummary = await commitSummarySettings(nextSummary);
                dirty.setBaseline('summary-prompt-text', createSummaryPromptTextDraft(savedSummary, state.summaryPromptTextDraft.key));
                state.summaryPromptTextDraft = null;
                state.summaryPromptFullscreen = false;
                showSummarySettingsMessage('提示词已保存。');
            } catch (error) { showSummarySettingsMessage(error?.message || '完整提示词保存失败。', 'error'); }
            await renderKeepingCalendarPosition('', promptScrollTop);
            return;
        }
        if (event.target.dataset?.tkmForm === 'summary-custom-prompt') {
            event.preventDefault();
            const promptScrollTop = state.summaryPromptFullscreen ? state.summaryInlineScrollTop : null;
            try {
                const nextSummary = applySummaryCustomPromptDraft(summarySettings(), state.summaryCustomPromptDraft);
                await commitSummarySettings(nextSummary);
                dirty.setBaseline('summary-custom-prompt', state.summaryCustomPromptDraft);
                state.summaryCustomPromptDraft = null;
                state.summaryPromptFullscreen = false;
                showSummarySettingsMessage('自定义提示词已保存。');
            } catch (error) { showSummarySettingsMessage(error?.message || '自定义提示词保存失败。', 'error'); }
            await renderKeepingCalendarPosition('', promptScrollTop);
            return;
        }
        if (event.target.dataset?.tkmForm === 'event-library') {
            event.preventDefault();
            try {
                const nextSummary = applySummaryEventLibraryDraft(summarySettings(), state.summaryEventLibraryDraft);
                const savedSummary = await commitSummarySettings(nextSummary);
                state.summaryEventLibraryDraft = createSummaryEventLibraryDraft(savedSummary);
                state.summaryEventLibrarySelected = new Set();
                dirty.setBaseline('summary-event-library', state.summaryEventLibraryDraft);
                showSummarySettingsMessage('事件词库已保存。');
            } catch (error) { showSummarySettingsMessage(error?.message || '事件词库保存失败。', 'error'); }
            await renderKeepingEventLibraryPosition();
            return;
        }
        if (event.target.dataset?.tkmForm === 'manual-summary') { event.preventDefault(); submitManualSummary(); return; }
        if (event.target.dataset?.tkmForm === 'auto-summary') { event.preventDefault(); saveAutoSummary(); return; }
        if (event.target.dataset?.tkmForm === 'summary-review') { event.preventDefault(); submitSummaryReview(); return; }
        if (event.target.dataset?.tkmForm === 'memory-merge-body') {
            event.preventDefault();
            if (state.memoryMergeBusy || !state.memoryMergeBodyDraft) return;
            const review = memoryMergeService.currentReview();
            if (!review || review.stage !== 'body-review') return;
            state.memoryMergeBusy = true;
            state.memoryMergeBusyStage = 'keywords';
            state.memoryMergeMessage = '';
            await render();
            try {
                const splitFacts = value => String(value ?? '').split(/[，,、；;\r\n]+/u).map(item => item.trim()).filter(Boolean);
                await memoryMergeService.confirmBody(review.id, {
                    title: state.memoryMergeBodyDraft.title,
                    body: state.memoryMergeBodyDraft.body,
                    people: splitFacts(state.memoryMergeBodyDraft.people),
                    locations: splitFacts(state.memoryMergeBodyDraft.locations),
                });
                state.memoryMergeBusy = false;
                state.memoryMergeBusyStage = '';
                router.go('memory.merge.final', { returnTo: 'memory.library' });
            } catch (error) {
                state.memoryMergeBusy = false;
                state.memoryMergeBusyStage = '';
                state.memoryMergeMessage = error?.message || '关键词与简称生成失败，原记忆保持不变。';
            }
            await render();
            return;
        }
        if (event.target.dataset?.tkmForm === 'memory-search') {
            event.preventDefault();
            state.query = shell.querySelector('[data-field="search"]')?.value ?? '';
            state.memorySearchOpen = true;
            state.selected.clear();
            state.listScrollTop = 0;
            render();
        }
        if (event.target.dataset?.tkmForm === 'memory') { event.preventDefault(); submitMemoryForm(); }
        if (event.target.dataset?.tkmForm === 'calendar') {
            event.preventDefault(); state.calendarMessage = ''; state.calendarMessageType = '';
            storyTimeService.setFictionalCalendar(state.calendarDraft).then(calendar => { state.calendarDraft = { enabled: calendar.enabled, eras: structuredClone(calendar.eras) }; state.calendarMessage = '纪年配置已保存，现有记忆与当前故事时间已重新解析。'; state.calendarMessageType = 'success'; dirty.setBaseline('story-time', storyTimeSnapshot()); render(); }).catch(error => { state.calendarMessage = error.message; state.calendarMessageType = 'error'; render(); });
        }
        if (event.target.dataset?.tkmForm === 'anniversary') { event.preventDefault(); submitAnniversaryForm(); }
        if (event.target.dataset?.tkmForm === 'global-regex') {
            event.preventDefault(); state.regexMessage = '';
            const inspected = inspectGlobalRegexRule(state.regexDraft);
            const saved = inspected.valid ? inspected.rule : {
                action: state.regexDraft.action,
                pattern: String(state.regexDraft.pattern ?? ''),
                flags: String(state.regexDraft.flags ?? 'su'),
                replacement: state.regexDraft.action === 'replace' ? String(state.regexDraft.replacement ?? '') : '',
            };
            saved.id = state.regexDraft.id || `regex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const settings = getGlobalSettings();
            const shortcut = state.regexDraftKind === 'shortcut';
            const target = shortcut ? [...(settings.regexShortcuts ?? [])] : [...(settings.regexRules ?? [])];
            if (shortcut) target.push(saved);
            else if (state.regexEditingIndex === null) target.unshift(saved);
            else target[state.regexEditingIndex] = saved;
            const commit = shortcut
                ? (() => { settings.regexShortcuts = structuredClone(target); return saveGlobalSettings(); })
                : commitRegexRules(target);
            Promise.resolve(commit).then(() => {
                const message = shortcut ? '已保存到快捷列表。' : (inspected.valid ? '规则已保存。' : '规则已保存，但表达式有误；运行时会跳过它。');
                showRegexMessage(message, { autoClear: inspected.valid });
                dirty.setBaseline('regex', state.regexDraft); state.regexDraft = null; state.regexEditingIndex = null; state.regexDraftKind = 'rule'; render();
            }).catch(error => { state.regexMessage = error?.message || '规则保存失败。'; state.regexMessageType = 'error'; render(); });
        }
        if (event.target.dataset?.tkmForm === 'api-save-as') {
            event.preventDefault();
            const position = state.apiDialogReturnPosition ?? rememberApiPosition(event.target);
            const name = state.apiDialogName.trim();
            if (!name) { state.apiMessage = '请填写新方案名称。'; state.apiMessageType = 'error'; await renderKeepingApiPosition(position, { restoreFocus: false }); return; }
            state.apiDialog = null; state.apiBusy = true; state.apiMessage = '正在另存方案…'; state.apiMessageType = '';
            await renderKeepingApiPosition(position);
            try {
                const result = await saveSecondaryApiScheme({
                    context: getContext(), presetId: null, sourcePresetId: state.apiDraft.presetId || null,
                    name, endpoint: state.apiDraft.endpoint, model: state.apiDraft.model, apiKey: state.apiDraft.apiKey,
                });
                const settings = getGlobalSettings(); settings.aiProvider.source = 'plugin'; await saveGlobalSettings();
                loadApiDraft(result.preset.id); state.apiMessage = `已另存为「${name}」。`; state.apiMessageType = 'success';
            } catch (error) { state.apiMessage = error?.message || '另存方案失败。'; state.apiMessageType = 'error'; }
            state.apiBusy = false; state.apiDialogReturnPosition = null;
            await renderKeepingApiPosition(position);
        }
        if (event.target.dataset?.tkmForm === 'fictional-calendar') {
            event.preventDefault();
            state.fictionalCalendarMessage = '';
            const draft = structuredClone(state.fictionalCalendarDraft);
            draft.cycle.schemeIds = draft.schemes.map(item => item.id);
            const operation = state.fictionalCalendarEditingId
                ? calendarService.update(state.fictionalCalendarEditingId, { name: draft.name, config: draft })
                : calendarService.bind({ type: 'fictional', name: draft.name, config: draft });
            Promise.resolve(operation).then(async saved => {
                let holidayResult = null;
                if (state.fictionalCalendarImportTraditionalPending) {
                    const ids = traditionalHolidayTemplateIds({ includeQingming: state.fictionalCalendarImportQingmingPending });
                    holidayResult = await calendarService.importHolidayTemplates('traditional-cn', ids, {}, saved.id);
                }
                dirty.setBaseline('fictional-calendar', state.fictionalCalendarDraft);
                state.fictionalCalendarDraft = null;
                state.fictionalCalendarEditingId = null;
                state.fictionalSchemeOpenId = null;
                state.fictionalTermFocusName = '';
                state.fictionalCalendarImportTraditionalPending = false;
                state.fictionalCalendarImportQingmingPending = false;
                state.calendarCursorId = null;
                state.notice = holidayResult
                    ? `${saved.name}已保存，并应用 ${holidayResult.imported.length} 项传统节日${holidayResult.skipped.length ? `；${holidayResult.skipped.length} 项已存在` : ''}${holidayResult.failures.length ? `；${holidayResult.failures.length} 项未能应用` : ''}。`
                    : `${saved.name}已保存。`;
                render();
            }).catch(error => { state.fictionalCalendarMessage = error?.message || '架空王朝历法保存失败。'; render(); });
        }
        if (event.target.dataset?.tkmForm === 'custom-calendar') {
            event.preventDefault();
            state.customCalendarMessage = '';
            const draft = structuredClone(state.customCalendarDraft);
            const config = { months: draft.months };
            const operation = state.customCalendarEditingId
                ? calendarService.update(state.customCalendarEditingId, { name: draft.name, config })
                : calendarService.bind({ type: 'custom', name: draft.name, config });
            Promise.resolve(operation).then(saved => {
                dirty.setBaseline('custom-calendar', state.customCalendarDraft);
                state.customCalendarDraft = null;
                state.customCalendarEditingId = null;
                state.customCalendarMessage = '';
                state.calendarCursorId = null;
                state.notice = `${saved.name}已保存。`;
                render();
            }).catch(error => { state.customCalendarMessage = error?.message || '自定义历法保存失败。'; render(); });
        }
        if (event.target.dataset?.tkmForm === 'calendar-event') {
            event.preventDefault();
            if (state.calendarEventSaving) return;
            state.calendarEventMessage = '';
            const draft = structuredClone(state.calendarEventDraft);
            const editingId = state.calendarEventEditingId;
            const input = {
                ...draft,
                date: { year: draft.year, month: draft.month, day: draft.day },
            };
            const operation = editingId
                ? calendarService.updateEvent(editingId, input)
                : calendarService.createEvent(input);
            state.calendarEventSaving = true;
            Promise.resolve(operation).then(() => {
                dirty.setBaseline('calendar-event', draft);
                state.calendarEventSaving = false;
                state.calendarEventDraft = null;
                state.calendarEventEditingId = null;
                state.calendarEventMessage = '';
                router.back('time.calendar');
                return renderKeepingCalendarPosition('.tkm-calendar-day-summary > header');
            }).catch(error => {
                state.calendarEventSaving = false;
                state.calendarEventDraft = draft;
                state.calendarEventEditingId = editingId;
                state.calendarEventMessage = error?.message || '日历事件保存失败。';
                return renderKeepingCalendarPosition('.tkm-schedule-editor');
            });
        }
        if (event.target.dataset?.tkmForm === 'holiday') {
            event.preventDefault();
            const draft = structuredClone(state.holidayDraft);
            const active = calendarService.active();
            const dateRule = draft.ruleType === 'solar-term'
                ? { type: 'solar-term', name: draft.termName }
                : (draft.ruleType === 'lunar-year-end' ? { type: 'lunar-year-end' } : { type: draft.ruleType, month: draft.month, day: draft.day });
            const input = {
                kind: 'holiday', calendarId: active.id, name: draft.name, fact: draft.fact, status: draft.status,
                dateRule, date: draft.ruleType === 'fixed' ? { year: 1, month: draft.month, day: draft.day } : null,
                templateId: draft.templateId, templatePack: draft.templatePack,
            };
            const operation = calendarService.events(active.id).some(item => item.id === state.holidayEditingId)
                ? calendarService.updateEvent(state.holidayEditingId, input)
                : calendarService.createEvent(input);
            Promise.resolve(operation).then(() => {
                dirty.setBaseline('holiday', draft);
                state.holidayDraft = null; state.holidayEditingId = null; state.holidayMessage = '节日已保存。';
                renderKeepingCalendarPosition();
            }).catch(error => { state.holidayMessage = error?.message || '节日保存失败。'; renderKeepingCalendarPosition(); });
        }
        if (event.target.dataset?.tkmForm === 'recall-settings') {
            event.preventDefault(); state.recallSettingsMessage = ''; state.recallSettingsMessageType = '';
            recallSettingsService.save(state.recallSettingsDraft).then(() => {
                state.recallSettingsDraft = recallSettingsService.read();
                state.recallSettingsMessage = '召回参数已保存，并会从下一次正式发送开始使用。';
                state.recallSettingsMessageType = 'success'; dirty.setBaseline('recall-settings', state.recallSettingsDraft); render();
            }).catch(error => { state.recallSettingsMessage = error?.message || '召回参数保存失败。'; state.recallSettingsMessageType = 'error'; render(); });
        }
    });
    shell.addEventListener('click', async event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const leavingRoute = router.current().routeId;
        if (action === 'dismiss-memory-save-message') {
            if (memoryFormMessageTimer) windowRef?.clearTimeout?.(memoryFormMessageTimer);
            memoryFormMessageTimer = null;
            state.formMessage = '';
            shell.querySelector('.tkm-memory-save-toast')?.remove();
            return;
        }
        if (action === 'dismiss-coverage-message') {
            if (coverageMessageTimer) windowRef?.clearTimeout?.(coverageMessageTimer);
            coverageMessageTimer = null;
            state.coverageMessage = '';
            state.coverageMessageType = '';
            await renderKeepingCalendarPosition();
            return;
        }
        if (action === 'dismiss-prompt-module-notice') {
            if (promptModuleNoticeTimer) windowRef?.clearTimeout?.(promptModuleNoticeTimer);
            promptModuleNoticeTimer = null;
            state.promptModuleNotice = '';
            await renderKeepingCalendarPosition();
            return;
        }
        if (action === 'add-recall-excluded-term') {
            try {
                state.recallSettingsDraft = await queueAutoSave(() => recallSettingsService.addExcludedTerm(state.recallExcludedTermDraft));
                state.recallExcludedTermDraft = '';
                state.recallSettingsMessage = '';
                state.recallSettingsMessageType = '';
                dirty.setBaseline('recall-settings', state.recallSettingsDraft);
            } catch (error) {
                state.recallSettingsMessage = error?.message || '排除词保存失败。';
                state.recallSettingsMessageType = 'error';
            }
            await renderKeepingCalendarPosition('.tkm-recall-excluded');
            return;
        }
        if (action === 'remove-recall-excluded-term') {
            try {
                state.recallSettingsDraft = await queueAutoSave(() => recallSettingsService.removeExcludedTerm(button.dataset.term));
                state.recallSettingsMessage = '';
                state.recallSettingsMessageType = '';
                dirty.setBaseline('recall-settings', state.recallSettingsDraft);
            } catch (error) {
                state.recallSettingsMessage = error?.message || '排除词删除失败。';
                state.recallSettingsMessageType = 'error';
            }
            await renderKeepingCalendarPosition('.tkm-recall-excluded');
            return;
        }
        if (action === 'dismiss-auto-summary-message') {
            if (autoSummaryMessageTimer) windowRef?.clearTimeout?.(autoSummaryMessageTimer);
            autoSummaryMessageTimer = null;
            state.autoSummaryMessage = '';
            state.autoSummaryMessageType = '';
            await renderKeepingCalendarPosition();
            return;
        }
        if (action === 'open-story-date-info') {
            state.storyDateInfoOpen = true;
            await renderKeepingCalendarPosition('.tkm-inline-info');
            return;
        }
        if (action === 'close-story-date-info') {
            state.storyDateInfoOpen = false;
            await renderKeepingCalendarPosition('.tkm-inline-info');
            return;
        }
        if (action === 'reidentify-story-time') {
            if (state.storyTimeRecognizeBusy) return;
            state.storyTimeRecognizeBusy = true;
            state.storyTimeMessage = '';
            try {
                await pendingAutoSave.catch(() => {});
                const result = await storyTimeService.reidentifyFromChat(getContext()?.chat);
                if (!result.candidateCount) {
                    state.storyTimeMessage = '当前聊天没有可重新识别的正文。';
                } else if (!result.current) {
                    state.storyTimeMessage = '最近正文中未识别到有效日期，当前日期未修改。';
                } else {
                    state.storyTimeDraft = result.current.raw;
                    dirty.setBaseline('story-time', storyTimeSnapshot());
                    state.notice = `已重新识别：${result.current.raw}`;
                    state.noticeType = 'success';
                }
            } catch (error) {
                state.storyTimeMessage = error?.message || '重新识别日期失败。';
            } finally {
                state.storyTimeRecognizeBusy = false;
            }
            await renderKeepingCalendarPosition('.tkm-time-source-row');
            return;
        }
        if (button.classList.contains('tkm-summary-cleaning-shortcut')) event.preventDefault();
        if (action === 'keep-editing' || action === 'confirm-discard') { discardGate.settle(action === 'confirm-discard'); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (action === 'cancel-fast-mode' || action === 'confirm-fast-mode') {
            fastModeWarningGate.settle(action === 'confirm-fast-mode');
            shell.querySelector('.tkm-confirm-layer')?.remove();
            shell.classList.toggle('tkm-shell--confirming', discardGate.isPending() || fastModeWarningGate.isPending() || summaryReviewCancelGate.isPending() || state.memoryDeletePending);
            return;
        }
        if (action === 'keep-summary-review-candidates' || action === 'confirm-summary-review-cancel') {
            summaryReviewCancelGate.settle(action === 'confirm-summary-review-cancel');
            shell.querySelector('.tkm-confirm-layer')?.remove();
            shell.classList.toggle('tkm-shell--confirming', discardGate.isPending() || fastModeWarningGate.isPending() || summaryReviewCancelGate.isPending() || state.memoryDeletePending);
            return;
        }
        if (action === 'cancel-coverage-regeneration' || action === 'confirm-coverage-regeneration') {
            coverageRegenerationGate.settle(action === 'confirm-coverage-regeneration');
            shell.querySelector('.tkm-confirm-layer')?.remove();
            shell.classList.remove('tkm-shell--confirming');
            return;
        }
        if (action === 'cancel-memory-delete') { state.memoryDeletePending = false; if (router.current().routeId === 'memory.library') state.activeId = null; await render(); return; }
        if (action === 'confirm-memory-delete') {
            try {
                await memoryLibraryService.remove(state.activeId);
                state.memoryDeletePending = false; state.activeId = null; state.draft = null; router.reset('memory.library'); await render();
            } catch (error) {
                state.memoryDeletePending = false;
                if (router.current().routeId === 'memory.library') {
                    state.activeId = null; state.notice = error?.message || '记忆删除失败，请重试。'; state.noticeType = 'error';
                } else state.formMessage = error?.message || '记忆删除失败，请重试。';
                await render();
            }
            return;
        }
        if (action === 'resolve-branch-import' || action === 'resolve-branch-empty') {
            if (state.branchDecisionBusy) return;
            state.branchDecisionBusy = true;
            state.branchDecisionMessage = '';
            await render();
            try {
                await chatDataService.resolveCurrentBranch(action === 'resolve-branch-import' ? 'import' : 'empty');
                state.branchDecisionBusy = false;
                state.branchDecisionMessage = '';
                state.notice = action === 'resolve-branch-import' ? '已建立独立分支记忆库。' : '已建立空的分支记忆库。';
                state.noticeType = 'success';
                router.reset('memory.library');
                await render();
            } catch (error) {
                state.branchDecisionBusy = false;
                state.branchDecisionMessage = error?.message || '分支记忆处理失败，请重试。';
                await render();
            }
            return;
        }
        if (action === 'defer-branch-decision') {
            state.branchDecisionMessage = '';
            shell.hidden = true;
            return;
        }
        if (action === 'close') {
            const routeId = router.current().routeId;
            const entry = currentDirtyEntry();
            const wasDirty = Boolean(entry && dirty.isDirty(entry[0], entry[1])) || hasSummaryCandidateEdit();
            if (await mayClose()) { if (wasDirty || routeId.startsWith('memory.merge.')) discardTransientRouteDraft(routeId); if (routeId === 'memory.keywords.review') memoryKeywordRebuildService.cancel(); shell.hidden = true; }
            return;
        }
        if (action === 'route-back') {
            if (state.summaryPromptFullscreen && ['settings.summary', 'settings.summary.prompt'].includes(leavingRoute)) {
                const position = summaryTextareaPosition();
                state.summaryPromptFullscreen = false;
                await renderKeepingCalendarPosition('', state.summaryInlineScrollTop ?? 0);
                restoreSummaryTextareaPosition(position);
                return;
            }
            if (leavingRoute === 'settings.summary.prompt' && (state.summaryPromptTextDraft || state.summaryCustomPromptDraft)) {
                if (!await mayClose()) return;
                state.summaryPromptTextDraft = null;
                state.summaryCustomPromptDraft = null;
                await render();
                return;
            }
            const entry = currentDirtyEntry();
            const wasDirty = Boolean(entry && dirty.isDirty(entry[0], entry[1]));
            if (!await mayClose()) return;
            if (leavingRoute.startsWith('memory.merge.')) {
                discardTransientRouteDraft(leavingRoute);
                state.selected.clear();
                state.multi = false;
                router.reset('memory.library');
                await render();
                return;
            }
            if (wasDirty && leavingRoute === 'memory.summary.manual') discardTransientRouteDraft(leavingRoute);
            if (['settings.summary', 'settings.summary.prompt'].includes(leavingRoute) || (wasDirty && ['settings.summary.events', 'settings.summary.cleaning'].includes(leavingRoute))) discardTransientRouteDraft(leavingRoute);
            if (['modules.index', 'modules.record'].includes(leavingRoute)) discardTransientRouteDraft(leavingRoute);
            if (leavingRoute === 'memory.summary.review') {
                state.summaryGapPlan = null;
                state.summaryReviewDraft = null;
                state.summaryReviewMessage = '';
                resetSummaryReviewUi();
            }
            if (leavingRoute === 'memory.summary.manual') {
                state.manualSummaryPreview = null;
                state.manualSummaryDuplicateConfirmed = false;
            }
            if (leavingRoute === 'time.schedule') {
                state.calendarEventDraft = null;
                state.calendarEventEditingId = null;
                state.calendarEventMessage = '';
            }
            if (leavingRoute === 'time.holidays') {
                state.holidayDraft = null;
                state.holidayEditingId = null;
                state.holidayMessage = '';
            }
            const domainFallback = {
                memory: 'memory.library',
                time: 'time.calendar',
                modules: 'modules.index',
                settings: 'settings.index',
            }[getRoute(router.current().routeId).domain] ?? 'settings.index';
            if (router.current().returnTo) router.back(domainFallback);
            else router.reset(domainFallback);
            await render(); return;
        }
        if (action === 'nav-domain') { if (!isDomainEnabled(featureSnapshot(), button.dataset.domain)) return; if (!await mayClose()) return; if (['settings.summary', 'settings.summary.prompt'].includes(leavingRoute)) discardTransientRouteDraft(leavingRoute); if (leavingRoute === 'modules.index') closePromptModuleInlineEditor(); const next = router.activateDomain(button.dataset.domain); if (next.routeId === 'time.story') loadStoryTimeState(); state.notice = ''; state.multi = false; state.filterOpen = false; state.filterMenu = null; state.selected.clear(); await render(); return; }
        if (action === 'select-prompt-module-lifecycle') {
            if (promptModuleDraftDirty()) {
                state.promptModuleMessage = '请先取消或保存当前编辑。';
                await renderKeepingCalendarPosition('.tkm-module-row.is-editing');
                return;
            }
            closePromptModuleInlineEditor();
            if (Object.hasOwn(PROMPT_MODULE_LIFECYCLE_LABELS, button.dataset.lifecycle)) {
                state.promptModuleLifecycle = button.dataset.lifecycle;
                await renderKeepingCalendarPosition();
            }
            if (leavingRoute === 'memory.keywords.review') {
                memoryKeywordRebuildService.cancel();
                state.keywordRebuildMessage = '';
            }
            return;
        }
        if (action === 'new-prompt-module') {
            const scope = ['global', 'character', 'chat'].includes(button.dataset.scope) ? button.dataset.scope : 'global';
            if (state.promptModuleDraft) {
                if (promptModuleDraftDirty()) {
                    state.promptModuleMessage = '请先取消或保存当前编辑。';
                    await renderKeepingCalendarPosition('.tkm-module-row.is-editing');
                    return;
                }
                if (!state.promptModuleDraft.id && state.promptModuleDraft.scope === scope) {
                    closePromptModuleInlineEditor();
                    await renderKeepingCalendarPosition(`.tkm-module-scope-group [data-action="new-prompt-module"][data-scope="${scope}"]`);
                    return;
                }
            }
            state.promptModuleDraft = createPromptModuleDraft(null, scope, state.promptModuleLifecycle);
            state.promptModuleMessage = '';
            dirty.setBaseline('prompt-module', state.promptModuleDraft);
            await renderKeepingCalendarPosition(`.tkm-module-scope-group [data-action="new-prompt-module"][data-scope="${scope}"]`);
            return;
        }
        if (action === 'edit-prompt-module') {
            const modules = promptModuleService.read()[button.dataset.scope] ?? [];
            const module = modules.find(item => item.id === button.dataset.id);
            if (!module) { state.promptModuleListMessage = '没有找到要编辑的模块。'; await renderKeepingCalendarPosition(); return; }
            if (state.promptModuleDraft) {
                if (state.promptModuleDraft.id === module.id && state.promptModuleDraft.scope === module.scope) {
                    if (promptModuleDraftDirty()) {
                        state.promptModuleMessage = '请使用取消或保存结束编辑。';
                        await renderKeepingCalendarPosition(`[data-module-id="${module.id}"]`);
                    } else {
                        closePromptModuleInlineEditor();
                        await renderKeepingCalendarPosition(`[data-module-id="${module.id}"]`);
                    }
                    return;
                }
                if (promptModuleDraftDirty()) {
                    state.promptModuleMessage = '请先取消或保存当前编辑。';
                    await renderKeepingCalendarPosition('.tkm-module-row.is-editing');
                    return;
                }
            }
            state.promptModuleDraft = createPromptModuleDraft(module);
            state.promptModuleMessage = '';
            dirty.setBaseline('prompt-module', state.promptModuleDraft);
            await renderKeepingCalendarPosition(`[data-module-id="${module.id}"]`);
            return;
        }
        if (action === 'cancel-prompt-module-edit') {
            const anchor = state.promptModuleDraft?.id ? `[data-module-id="${state.promptModuleDraft.id}"]` : '.tkm-module-scope-group';
            closePromptModuleInlineEditor();
            await renderKeepingCalendarPosition(anchor);
            return;
        }
        if (action === 'view-prompt-module-result') {
            if (promptModuleDraftDirty()) {
                state.promptModuleMessage = '请先取消或保存当前编辑。';
                await renderKeepingCalendarPosition('.tkm-module-row.is-editing');
                return;
            }
            closePromptModuleInlineEditor();
            state.promptModuleResultTarget = { id: button.dataset.id, scope: button.dataset.scope };
            router.go('modules.result', { returnTo: 'modules.index' });
            await render();
            return;
        }
        if (action === 'select-prompt-module-role' && state.promptModuleDraft) {
            if (Object.hasOwn(PROMPT_MODULE_ROLE_LABELS, button.dataset.role)) {
                state.promptModuleDraft.role = button.dataset.role;
                state.promptModuleMessage = '';
                await renderKeepingCalendarPosition();
            }
            return;
        }
        if (action === 'toggle-prompt-module') {
            const scope = button.dataset.scope;
            const module = (promptModuleService.read()[scope] ?? []).find(item => item.id === button.dataset.id);
            if (!module) return;
            try {
                await promptModuleService.setEnabled(scope, module.id, !module.enabled);
                state.promptModuleListMessage = '';
                showPromptModuleNotice(`模块「${module.name}」已${module.enabled ? '停用' : '启用'}。`);
            } catch (error) { state.promptModuleListMessage = error?.message || '模块状态保存失败。'; }
            await renderKeepingCalendarPosition(`[data-module-id="${module.id}"]`);
            return;
        }
        if (action === 'delete-prompt-module-row') {
            const scope = button.dataset.scope;
            const module = (promptModuleService.read()[scope] ?? []).find(item => item.id === button.dataset.id);
            if (!module || state.promptModuleBusy) return;
            state.promptModuleBusy = true;
            try {
                await promptModuleService.remove(scope, module.id);
                if (state.promptModuleDraft?.id === module.id && state.promptModuleDraft?.scope === scope) closePromptModuleInlineEditor();
                state.promptModuleListMessage = '';
                showPromptModuleNotice(`模块「${module.name}」已删除。`);
            } catch (error) {
                state.promptModuleListMessage = error?.message || '模块删除失败，请重试。';
            } finally {
                state.promptModuleBusy = false;
            }
            await renderKeepingCalendarPosition();
            return;
        }
        if (action === 'move-prompt-module-up' || action === 'move-prompt-module-down') {
            const scope = button.dataset.scope;
            const modules = promptModuleService.read()[scope] ?? [];
            const visibleModules = modules.filter(item => item.lifecycle === state.promptModuleLifecycle);
            const index = visibleModules.findIndex(item => item.id === button.dataset.id);
            const target = index + (action.endsWith('-up') ? -1 : 1);
            if (index < 0 || target < 0 || target >= visibleModules.length) return;
            const reorderedVisible = visibleModules.map(item => item.id);
            [reorderedVisible[index], reorderedVisible[target]] = [reorderedVisible[target], reorderedVisible[index]];
            let cursor = 0;
            const visibleIds = new Set(reorderedVisible);
            const ids = modules.map(item => visibleIds.has(item.id) ? reorderedVisible[cursor++] : item.id);
            try {
                await promptModuleService.reorder(scope, ids);
                state.promptModuleListMessage = '';
            } catch (error) { state.promptModuleListMessage = error?.message || '模块顺序保存失败。'; }
            await renderKeepingCalendarPosition(`[data-module-id="${button.dataset.id}"]`);
            return;
        }
        if (action === 'scroll-top' || action === 'scroll-bottom') {
            const body = shell.querySelector('.tkm-shell__body');
            if (!body) return;
            const top = action === 'scroll-top' ? 0 : body.scrollHeight;
            if (typeof body.scrollTo === 'function') body.scrollTo({ top, behavior: 'smooth' });
            else body.scrollTop = top;
            return;
        }
        if (action === 'bind-modern-calendar') {
            if (await runMutation(() => calendarService.bind({ type: 'modern' }))) {
                state.calendarCursorId = null;
                await render();
            }
            return;
        }
        if (action === 'toggle-holiday-category') {
            const id = button.dataset.id;
            const open = new Set(Array.isArray(state.holidayPackOpen) ? state.holidayPackOpen : []);
            const ownsEditor = state.holidayDraft && (state.holidayDraft.templatePack === id || (id === 'custom' && !state.holidayDraft.templateId));
            if (open.has(id) && ownsEditor) {
                if (!await mayClose()) return;
                state.holidayDraft = null; state.holidayEditingId = null;
            }
            if (open.has(id)) open.delete(id); else open.add(id);
            state.holidayPackOpen = [...open];
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'toggle-holiday-calendar-display') {
            const active = calendarService.active();
            const field = button.dataset.field;
            if (!active || !['showHolidays', 'showSolarTerms'].includes(field)) return;
            const settings = active.config?.holidaySettings ?? {};
            await calendarService.update(active.id, { config: { holidaySettings: { ...settings, [field]: settings[field] === false } } });
            await renderKeepingCalendarPosition('.tkm-holiday-calendar-display'); return;
        }
        if (action === 'toggle-holiday-reminder') {
            const active = calendarService.active();
            if (!active) return;
            const templateId = String(button.dataset.templateId ?? '').trim();
            if (templateId) {
                const settings = active.config?.holidaySettings ?? { reminderTemplateIds: [] };
                const selected = new Set(settings.reminderTemplateIds ?? []);
                if (button.dataset.enabled === String(selected.has(templateId))) return;
                if (selected.has(templateId)) selected.delete(templateId);
                else selected.add(templateId);
                await calendarService.update(active.id, { config: { holidaySettings: { ...settings, reminderTemplateIds: [...selected] } } });
            } else {
                const item = calendarService.events(active.id).find(eventItem => eventItem.kind === 'holiday' && eventItem.id === button.dataset.id && !eventItem.templateId);
                if (!item) return;
                if (button.dataset.enabled === String(item.status === 'enabled')) return;
                await calendarService.updateEvent(item.id, { status: item.status === 'enabled' ? 'paused' : 'enabled' });
            }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'edit-holiday-preset') {
            if (state.holidayDraft && !await mayClose()) return;
            const active = calendarService.active();
            if (!active) return;
            let item = calendarService.events(active.id).find(eventItem => eventItem.kind === 'holiday' && eventItem.templateId === button.dataset.id);
            if (!item) {
                const template = holidayTemplates(button.dataset.packId, active.type).find(entry => entry.id === button.dataset.id);
                if (template) item = { name: template.name, fact: template.fact, dateRule: structuredClone(template.rule), templateId: template.id, templatePack: template.packId };
            }
            if (!item) return;
            state.holidayDraft = holidayDraftFrom(item, active, calendarDate(active));
            state.holidayEditingId = item.id || item.templateId;
            state.holidayMessage = '';
            dirty.setBaseline('holiday', state.holidayDraft);
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'new-holiday') {
            if (state.holidayDraft && !await mayClose()) return;
            const active = calendarService.active();
            state.holidayDraft = holidayDraftFrom(null, active, calendarDate(active));
            state.holidayDraft.ruleType = active.type === 'fictional' ? 'lunar' : 'fixed';
            state.holidayEditingId = null; state.holidayMessage = '';
            dirty.setBaseline('holiday', state.holidayDraft);
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'edit-holiday') {
            if (state.holidayDraft && !await mayClose()) return;
            const active = calendarService.active();
            const item = calendarService.events(active.id).find(eventItem => eventItem.id === button.dataset.id && eventItem.kind === 'holiday');
            if (!item) return;
            state.holidayDraft = holidayDraftFrom(item, active, calendarDate(active));
            state.holidayEditingId = item.id; state.holidayMessage = '';
            dirty.setBaseline('holiday', state.holidayDraft);
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'cancel-holiday-edit') {
            if (!await mayClose()) return;
            state.holidayDraft = null; state.holidayEditingId = null; state.holidayMessage = '';
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'reset-holiday') {
            if (state.holidayDraft && !await mayClose()) return;
            await calendarService.resetHolidayTemplate(button.dataset.id);
            state.holidayDraft = null; state.holidayEditingId = null;
            state.holidayMessage = '已重置节日内容。';
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'delete-holiday') {
            const item = calendarService.events().find(eventItem => eventItem.id === button.dataset.id && eventItem.kind === 'holiday');
            if (!item || item.templateId) return;
            await calendarService.removeEvent(item.id);
            if (state.holidayEditingId === button.dataset.id) { state.holidayDraft = null; state.holidayEditingId = null; }
            await renderKeepingCalendarPosition('.tkm-holiday-categories'); return;
        }
        if (action === 'toggle-calendar-selector') { state.calendarSelectorOpen = !state.calendarSelectorOpen; if (!state.calendarSelectorOpen) state.calendarManagementOpen = false; await renderKeepingCalendarPosition(state.calendarSelectorOpen ? '.tkm-calendar-selector' : '.tkm-story-time-context'); return; }
        if (action === 'toggle-calendar-management') { state.calendarManagementOpen = !state.calendarManagementOpen; await renderKeepingCalendarPosition(state.calendarManagementOpen ? '.tkm-calendar-choice' : '.tkm-calendar-selector'); return; }
        if (action === 'open-holiday-manager') { await go('time.holidays', { returnTo: 'time.calendar' }); return; }
        if (action === 'edit-active-calendar-rules') {
            if (!await mayClose()) return;
            const target = calendarService.active();
            if (!target || target.type === 'modern') return;
            if (target.type === 'fictional') {
                beginFictionalCalendarEditor(target);
                await renderKeepingCalendarPosition('.tkm-fictional-editor'); return;
            }
            beginCustomCalendarEditor(target);
            await renderKeepingCalendarPosition('.tkm-custom-calendar-editor'); return;
        }
        if (action === 'switch-calendar') {
            if (!await mayClose()) return;
            if (await runMutation(() => calendarService.switchTo(button.dataset.id))) {
                state.calendarSelectorOpen = false; state.calendarManagementOpen = false; state.calendarCursorId = null; state.calendarEventDraft = null; state.calendarEventEditingId = null; state.holidayDraft = null; state.holidayEditingId = null; state.holidayPackOpen = null; await renderKeepingCalendarPosition('.tkm-month-surface');
            }
            return;
        }
        if (action === 'delete-calendar') {
            if (!await mayClose()) return;
            const target = calendarService.list().find(item => item.id === button.dataset.id);
            if (!target || target.type === 'modern') return;
            const owned = calendarService.events(target.id);
            const scheduleCount = owned.filter(item => item.kind === 'schedule').length;
            const holidayCount = owned.filter(item => item.kind === 'holiday').length;
            const related = [scheduleCount ? `${scheduleCount} 条日程` : '', holidayCount ? `${holidayCount} 个节日` : ''].filter(Boolean).join('、');
            if (!ask(`删除「${target.name}」？${related ? `\n将同时删除其中的${related}。` : ''}\n此操作不会删除其他历法的数据。`)) return;
            if (await runMutation(() => calendarService.remove(target.id))) {
                state.calendarCursorId = null; state.calendarYear = null; state.calendarMonth = null; state.calendarDay = null;
                state.calendarEventDraft = null; state.calendarEventEditingId = null;
                state.holidayDraft = null; state.holidayEditingId = null; state.holidayPackOpen = null;
                state.fictionalCalendarDraft = null; state.fictionalCalendarEditingId = null;
                state.customCalendarDraft = null; state.customCalendarEditingId = null;
                await renderKeepingCalendarPosition('.tkm-calendar-selector');
            }
            return;
        }
        if (action === 'new-fictional-calendar') { beginFictionalCalendarEditor(); await renderKeepingCalendarPosition('.tkm-fictional-editor'); return; }
        if (action === 'edit-fictional-calendar') {
            const target = calendarService.list().find(item => item.id === button.dataset.id);
            if (!target) return;
            beginFictionalCalendarEditor(target); await renderKeepingCalendarPosition('.tkm-fictional-editor'); return;
        }
        if (action === 'cancel-fictional-calendar') {
            if (!await mayClose()) return;
            state.fictionalCalendarDraft = null; state.fictionalCalendarEditingId = null;
            state.fictionalCalendarSetupStep = null; state.fictionalSchemeOpenId = null; state.fictionalTermFocusName = ''; state.fictionalTermOpenSchemeIds.clear(); state.fictionalCalendarMessage = '';
            await renderKeepingCalendarPosition('.tkm-calendar-selector'); return;
        }
        if (action === 'new-custom-calendar') { beginCustomCalendarEditor(); await renderKeepingCalendarPosition('.tkm-custom-calendar-editor'); return; }
        if (action === 'edit-custom-calendar') {
            const target = calendarService.list().find(item => item.id === button.dataset.id);
            if (!target) return;
            beginCustomCalendarEditor(target); await renderKeepingCalendarPosition('.tkm-custom-calendar-editor'); return;
        }
        if (action === 'cancel-custom-calendar') {
            if (!await mayClose()) return;
            state.customCalendarDraft = null;
            state.customCalendarEditingId = null;
            state.customCalendarMessage = '';
            await renderKeepingCalendarPosition('.tkm-calendar-toolbar'); return;
        }
        if (action === 'add-custom-month') {
            if (state.customCalendarDraft.months.length >= 24) return;
            const index = state.customCalendarDraft.months.length;
            state.customCalendarDraft.months.push({
                id: `custom-month-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: `第 ${index + 1} 月`,
                days: 30,
            });
            await renderKeepingCalendarPosition('.tkm-custom-months li:last-child'); return;
        }
        if (action === 'remove-custom-month') {
            if (state.customCalendarDraft.months.length <= 1) return;
            state.customCalendarDraft.months.splice(Number(button.dataset.index), 1);
            await renderKeepingCalendarPosition('.tkm-custom-months'); return;
        }
        if (action === 'move-custom-month-up' || action === 'move-custom-month-down') {
            const from = Number(button.dataset.index);
            const to = from + (action === 'move-custom-month-up' ? -1 : 1);
            const months = state.customCalendarDraft.months;
            if (to >= 0 && to < months.length) [months[from], months[to]] = [months[to], months[from]];
            await renderKeepingCalendarPosition(`.tkm-custom-months li:nth-child(${to + 1})`); return;
        }
        if (action === 'toggle-fictional-scheme') {
            state.fictionalSchemeOpenId = state.fictionalSchemeOpenId === button.dataset.id ? null : button.dataset.id;
            await renderKeepingCalendarPosition('.tkm-year-scheme.is-open'); return;
        }
        if (action === 'choose-fictional-setup') {
            const importing = button.dataset.choice === 'import';
            state.fictionalCalendarSetupStep = importing ? 'import' : 'editor';
            state.fictionalCalendarDraft.cycle.enabled = importing;
            state.fictionalCalendarImportOpen = importing;
            state.fictionalCalendarMessage = '';
            await renderKeepingCalendarPosition(importing ? '.tkm-fictional-import' : '.tkm-repeated-year'); return;
        }
        if (action === 'toggle-fictional-month-size') {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === button.dataset.schemeId);
            const month = scheme?.months?.[Number(button.dataset.monthIndex)];
            if (month) month.days = Number(month.days) === 30 ? 29 : 30;
            await renderKeepingCalendarPosition(`[data-scheme-id="${button.dataset.schemeId}"]`); return;
        }
        if (action === 'add-fictional-scheme') {
            const scheme = newFictionalScheme();
            state.fictionalCalendarDraft.schemes.push(scheme);
            state.fictionalCalendarDraft.cycle.schemeIds = state.fictionalCalendarDraft.schemes.map(item => item.id);
            state.fictionalSchemeOpenId = scheme.id; await renderKeepingCalendarPosition('.tkm-year-scheme:last-child'); return;
        }
        if (action === 'remove-fictional-scheme') {
            const index = Number(button.dataset.index);
            if (state.fictionalCalendarDraft.schemes.length <= 1) return;
            const [removed] = state.fictionalCalendarDraft.schemes.splice(index, 1);
            if (state.fictionalCalendarDraft.defaultSchemeId === removed.id) state.fictionalCalendarDraft.defaultSchemeId = state.fictionalCalendarDraft.schemes[0].id;
            state.fictionalCalendarDraft.cycle.schemeIds = state.fictionalCalendarDraft.schemes.map(item => item.id);
            if (state.fictionalSchemeOpenId === removed.id) state.fictionalSchemeOpenId = state.fictionalCalendarDraft.schemes[0].id;
            await renderKeepingCalendarPosition('.tkm-year-schemes'); return;
        }
        if (action === 'move-fictional-scheme-up' || action === 'move-fictional-scheme-down') {
            const from = Number(button.dataset.index);
            const to = from + (action === 'move-fictional-scheme-up' ? -1 : 1);
            const schemes = state.fictionalCalendarDraft.schemes;
            if (to >= 0 && to < schemes.length) [schemes[from], schemes[to]] = [schemes[to], schemes[from]];
            state.fictionalCalendarDraft.cycle.schemeIds = schemes.map(item => item.id);
            await renderKeepingCalendarPosition(`.tkm-year-scheme:nth-child(${to + 1})`); return;
        }
        if (action === 'add-fictional-leap') {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === button.dataset.id);
            if (scheme) scheme.leapMonth = { afterMonth: 4, days: 29 };
            await renderKeepingCalendarPosition('.tkm-leap-month'); return;
        }
        if (action === 'remove-fictional-leap') {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === button.dataset.id);
            if (scheme) {
                const leapId = `leap-month-${scheme.leapMonth?.afterMonth}`;
                scheme.solarTerms = (scheme.solarTerms ?? []).filter(item => item.monthId !== leapId);
                scheme.leapMonth = null;
            }
            await renderKeepingCalendarPosition('.tkm-leap-month'); return;
        }
        if (action === 'add-fictional-solar-term') {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === button.dataset.schemeId);
            if (!scheme) return;
            scheme.solarTerms ??= [];
            scheme.solarTerms.push({ name: '', monthId: '', day: '' });
            state.fictionalTermFocusName = '';
            state.fictionalTermOpenSchemeIds.add(scheme.id);
            await renderKeepingCalendarPosition(`.tkm-solar-term-editor[data-scheme-id="${scheme.id}"] .tkm-solar-term-row:last-of-type`); return;
        }
        if (action === 'remove-fictional-solar-term') {
            const scheme = state.fictionalCalendarDraft.schemes.find(item => item.id === button.dataset.schemeId);
            if (!scheme) return;
            scheme.solarTerms.splice(Number(button.dataset.termIndex), 1);
            state.fictionalTermOpenSchemeIds.add(scheme.id);
            await renderKeepingCalendarPosition(`.tkm-solar-term-editor[data-scheme-id="${scheme.id}"]`); return;
        }
        if (action === 'toggle-fictional-import') { state.fictionalCalendarImportOpen = !state.fictionalCalendarImportOpen; state.fictionalCalendarMessage = ''; await renderKeepingCalendarPosition(); return; }
        if (action === 'fictional-import-mode') { state.fictionalImportSingleYear = button.dataset.mode === 'single'; await renderKeepingCalendarPosition(); return; }
        if (action === 'return-fictional-import') {
            state.fictionalCalendarImportOpen = false;
            if (state.fictionalCalendarSetupStep === 'import') state.fictionalCalendarSetupStep = 'source';
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'import-fictional-years') {
            try {
                const imported = importRealLunarYearRange(
                    state.fictionalCalendarImportDraft.startYear,
                    state.fictionalImportSingleYear ? state.fictionalCalendarImportDraft.startYear : state.fictionalCalendarImportDraft.endYear,
                    { includeSolarTerms: state.fictionalCalendarImportDraft.includeSolarTerms },
                );
                if (state.fictionalCalendarSetupStep === 'import' || imported.length > 1) {
                    state.fictionalCalendarDraft.schemes = imported;
                    state.fictionalCalendarDraft.defaultSchemeId = imported[0]?.id ?? state.fictionalCalendarDraft.defaultSchemeId;
                    state.fictionalCalendarDraft.cycle.enabled = true;
                    state.fictionalCalendarSetupStep = 'editor';
                    state.fictionalCalendarImportOpen = false;
                    state.fictionalSchemeOpenId = imported[0]?.id ?? null;
                    state.fictionalCalendarMessage = imported.length === 1
                        ? `已导入 ${imported[0].sourceYear} 年的月份安排；将按年重复。`
                        : `已导入连续 ${imported.length} 年的月份安排；将按这组年份重复。`;
                } else if (state.fictionalCalendarDraft.cycle.enabled) {
                    for (const scheme of imported) {
                        const index = state.fictionalCalendarDraft.schemes.findIndex(item => item.id === scheme.id);
                        if (index >= 0) state.fictionalCalendarDraft.schemes[index] = scheme;
                        else state.fictionalCalendarDraft.schemes.push(scheme);
                    }
                    state.fictionalSchemeOpenId = imported[0]?.id ?? state.fictionalSchemeOpenId;
                    state.fictionalCalendarMessage = `已加入 ${imported.length} 个现实农历年份。`;
                } else {
                    const currentId = state.fictionalCalendarDraft.defaultSchemeId ?? state.fictionalCalendarDraft.schemes[0]?.id;
                    const currentIndex = state.fictionalCalendarDraft.schemes.findIndex(item => item.id === currentId);
                    const source = imported[0];
                    const replacement = { ...source, id: currentId, name: source?.name ?? '' };
                    if (currentIndex >= 0) state.fictionalCalendarDraft.schemes[currentIndex] = replacement;
                    else state.fictionalCalendarDraft.schemes.unshift(replacement);
                    state.fictionalCalendarDraft.defaultSchemeId = replacement.id;
                    state.fictionalCalendarMessage = `已采用 ${source.sourceYear} 年现实农历的月份规则。`;
                }
                state.fictionalCalendarDraft.cycle.schemeIds = state.fictionalCalendarDraft.schemes.map(item => item.id);
                state.fictionalCalendarImportTraditionalPending = false;
                state.fictionalCalendarImportQingmingPending = false;
            } catch (error) { state.fictionalCalendarMessage = error?.message || '现实年份导入失败。'; }
            await renderKeepingCalendarPosition(state.fictionalCalendarImportOpen ? '.tkm-fictional-import' : '.tkm-year-cycle'); return;
        }
        if (action === 'select-calendar-day') {
            if (state.calendarEventDraft && !await mayClose()) return;
            state.calendarEventDraft = null; state.calendarEventEditingId = null;
            state.calendarDay = Number(button.dataset.day);
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'new-calendar-event') {
            const active = calendarService.active();
            if (!active) return;
            state.calendarEventDraft = blankCalendarEventDraft(active, calendarDate(active));
            state.calendarEventEditingId = null;
            state.calendarEventMessage = '';
            dirty.setBaseline('calendar-event', state.calendarEventDraft);
            router.go('time.schedule', { returnTo: 'time.calendar' });
            await render(); return;
        }
        if (action === 'edit-calendar-event') {
            const eventItem = calendarService.events().find(item => item.id === button.dataset.id);
            if (!eventItem) return;
            state.calendarEventDraft = calendarEventDraftFrom(eventItem);
            state.calendarEventEditingId = eventItem.id;
            state.calendarEventMessage = '';
            dirty.setBaseline('calendar-event', state.calendarEventDraft);
            router.go('time.schedule', { returnTo: 'time.calendar' });
            await render(); return;
        }
        if (action === 'cancel-calendar-event') {
            if (!await mayClose()) return;
            state.calendarEventDraft = null; state.calendarEventEditingId = null; state.calendarEventMessage = '';
            await renderKeepingCalendarPosition('.tkm-calendar-day-summary'); return;
        }
        if (action === 'toggle-calendar-event-status') {
            const eventItem = calendarService.events().find(item => item.id === button.dataset.id);
            if (!eventItem) return;
            if (await runMutation(() => calendarService.updateEvent(eventItem.id, { status: eventItem.status === 'paused' ? 'enabled' : 'paused' }))) await renderKeepingCalendarPosition('.tkm-calendar-day-summary');
            return;
        }
        if (action === 'delete-calendar-event') {
            if (!ask('删除这个日历事件？')) return;
            if (await runMutation(() => calendarService.removeEvent(button.dataset.id))) {
                if (state.calendarEventEditingId === button.dataset.id) { state.calendarEventDraft = null; state.calendarEventEditingId = null; }
                if (router.current().routeId === 'time.schedule') router.back('time.calendar');
                await renderKeepingCalendarPosition('.tkm-calendar-day-summary');
            }
            return;
        }
        if (action === 'select-upcoming-date') {
            const savedScrollTop = shell.querySelector('.tkm-shell__body')?.scrollTop ?? 0;
            state.calendarYear = Number(button.dataset.year);
            state.calendarMonth = Number(button.dataset.month);
            state.calendarDay = Number(button.dataset.day);
            await renderKeepingCalendarPosition('', savedScrollTop); return;
        }
        if (action === 'return-current-calendar-date') {
            const active = calendarService.active();
            if (!active) return;
            const current = currentCalendarDate(active);
            state.calendarYear = current.year;
            state.calendarMonth = current.month;
            state.calendarDay = current.day;
            await renderKeepingCalendarPosition('.tkm-month-surface'); return;
        }
        if (action === 'previous-calendar-month' || action === 'next-calendar-month') {
            if (state.calendarEventDraft && !await mayClose()) return;
            state.calendarEventDraft = null; state.calendarEventEditingId = null; state.calendarEventMessage = '';
            const direction = action === 'previous-calendar-month' ? -1 : 1;
            state.calendarMonth += direction;
            const active = calendarService.active();
            if (state.calendarMonth < 1) {
                if (state.calendarYear === 1) state.calendarMonth = 1;
                else {
                    state.calendarYear -= 1;
                    state.calendarMonth = active?.type === 'modern' ? 12 : monthsInCalendarYear(active, state.calendarYear).length;
                }
            }
            const monthCount = active?.type === 'modern' ? 12 : monthsInCalendarYear(active, Math.max(1, state.calendarYear)).length;
            if (state.calendarMonth > monthCount) { state.calendarMonth = 1; state.calendarYear += 1; }
            state.calendarYear = Math.max(1, state.calendarYear);
            state.calendarDay = Math.min(state.calendarDay, daysInCalendarMonth(active, state.calendarYear, state.calendarMonth));
            await renderKeepingCalendarPosition('.tkm-month-surface'); return;
        }
        if (action === 'commit-memory-tag') {
            const field = button.dataset.field;
            const pending = state.memoryEntryDrafts?.[field] ?? '';
            if (!state.draft || !(field in state.memoryEntryDrafts) || !pending.trim()) return;
            state.draft[field] = appendMemoryEditorEntry(state.draft[field], field, pending);
            if (field === 'detailKeywords') state.draft.detailAliases = reconcileDetailAliases(state.draft.detailAliases, state.draft.detailKeywords);
            state.memoryEntryDrafts[field] = '';
            await renderKeepingMemoryEditorPosition({
                revealSelector: `[data-memory-entry-field="${field}"]`,
                focusSelector: `[data-memory-entry-field="${field}"]`,
            });
            return;
        }
        if (action === 'select-memory-mode') {
            const mode = button.dataset.mode;
            if (!state.draft || !['resident', 'trigger'].includes(mode)) return;
            state.draft.mode = mode;
            state.formErrors = { ...state.formErrors, mode: '' };
            for (const choice of shell.querySelectorAll('[data-action="select-memory-mode"]')) {
                const selected = choice.dataset.mode === mode;
                choice.classList.toggle('is-selected', selected);
                choice.setAttribute('aria-checked', String(selected));
            }
            const group = button.closest('.tkm-memory-mode');
            group?.classList.remove('tkm-field-error');
            group?.querySelector('.tkm-inline-error')?.remove();
            return;
        }
        if (action === 'remove-memory-tag') {
            const field = button.dataset.field;
            if (!state.draft || !(field in state.memoryEntryDrafts)) return;
            state.draft[field] = removeMemoryEditorEntry(state.draft[field], field, Number(button.dataset.index));
            if (field === 'detailKeywords') {
                const parentDetail = button.dataset.parentDetail;
                state.draft.detailAliases = reconcileDetailAliases(state.draft.detailAliases, state.draft.detailKeywords);
                delete state.memoryDetailAliasEntries[parentDetail];
                delete state.memoryDetailAliasErrors[parentDetail];
                state.memoryDetailAliasOpenParents.delete(parentDetail);
            }
            await renderKeepingMemoryEditorPosition({ revealSelector: `[data-memory-entry-field="${field}"]` }); return;
        }
        if (action === 'add-memory-floor') {
            if (!state.draft) return;
            state.draft.sourceFloorRanges.push({ start: '', end: '' });
            await renderKeepingMemoryEditorPosition({
                revealSelector: '.tkm-source-range-row:last-child',
                focusSelector: '.tkm-source-range-row:last-child input',
            });
            return;
        }
        if (action === 'remove-memory-floor') {
            if (!state.draft || state.draft.sourceFloorRanges.length <= 1) return;
            const removedIndex = Number(button.dataset.index);
            state.draft.sourceFloorRanges.splice(removedIndex, 1);
            const remainingIndex = Math.min(removedIndex, state.draft.sourceFloorRanges.length - 1);
            await renderKeepingMemoryEditorPosition({ revealSelector: `.tkm-source-range-row:nth-child(${remainingIndex + 1})` }); return;
        }
        if (action === 'toggle-plugin-global') {
            const settings = getGlobalSettings();
            settings.plugin ??= structuredClone(DEFAULT_GLOBAL_SETTINGS.plugin);
            settings.plugin.enabled = settings.plugin.enabled === false;
            await Promise.resolve(saveGlobalSettings());
            await render(); return;
        }
        if (action === 'toggle-plugin-chat') {
            if (featureSnapshot().globallyEnabled === false) return;
            await chatDataService.updateCurrent(root => {
                root.plugin ??= { enabled: true };
                root.plugin.enabled = root.plugin.enabled === false;
            });
            await render(); return;
        }
        if (action === 'toggle-plugin-feature') {
            const featureId = button.dataset.feature;
            if (!FEATURE_DEFINITIONS.some(feature => feature.id === featureId)) return;
            const settings = getGlobalSettings();
            settings.plugin ??= structuredClone(DEFAULT_GLOBAL_SETTINGS.plugin);
            settings.plugin.features ??= structuredClone(DEFAULT_GLOBAL_SETTINGS.plugin.features);
            settings.plugin.features[featureId] = settings.plugin.features[featureId] === false;
            await Promise.resolve(saveGlobalSettings());
            await render(); return;
        }
        if (action === 'toggle-recall-same-day') {
            state.recallSettingsDraft.automaticSameDayEnabled = !state.recallSettingsDraft.automaticSameDayEnabled;
            try {
                await saveRecallSettingsDraft();
                state.recallSettingsMessage = '自动同日回忆已更新。';
                state.recallSettingsMessageType = 'success';
            } catch { /* The persistent error is rendered beside the setting. */ }
            await render(); return;
        }
        if (action === 'go-route') {
            if (button.dataset.route === router.current().routeId) return;
            if (button.dataset.route === 'time.story') loadStoryTimeState();
            if (button.dataset.route === 'time.anniversaries') loadSpecialDateState();
            await go(button.dataset.route, { returnTo: router.current().routeId }); return;
        }
        if (action === 'save-summary-prompt-profile' || action === 'delete-summary-prompt-profile') {
            if (!await mayClose()) return;
            try {
                const summary = summarySettings();
                const next = action === 'save-summary-prompt-profile' ? savePromptProfile(summary, state.summaryProfileName ?? '') : deletePromptProfile(summary, summary.activePromptProfileId);
                await commitSummarySettings(next);
                state.summaryProfileName = ''; state.summaryPromptTextDraft = null; state.summaryCustomPromptDraft = null;
                showSummarySettingsMessage(action === 'save-summary-prompt-profile' ? '提示词方案已保存。' : '方案已删除，当前提示词保留。');
            } catch (error) { showSummarySettingsMessage(error?.message || '方案保存失败。', 'error'); }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'set-summary-generation-mode') {
            const mode = button.dataset.mode;
            if (!['quality', 'fast', 'enhanced'].includes(mode)) return;
            const currentSummary = summarySettings();
            if (currentSummary.generationMode === mode) return;
            if (!await mayClose()) return;
            if (requiresFastModeConfirmation(currentSummary, mode)) {
                const decision = fastModeWarningGate.request();
                await render();
                if (!await decision) return;
            }
            try { const nextSummary = applySummaryGenerationMode(currentSummary, mode); await commitSummarySettings(nextSummary); state.summaryPromptTextDraft = null; state.summaryCustomPromptDraft = null; showSummarySettingsMessage(({ quality: '已使用两次生成。', fast: '已使用一次生成。', enhanced: '已使用三次生成。' })[mode]); }
            catch (error) { showSummarySettingsMessage(error?.message || '生成方式保存失败。', 'error'); }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'toggle-holiday-rest') {
            state.holidayPackExpanded ??= {};
            if (state.holidayPackExpanded[button.dataset.id] && state.holidayDraft?.templatePack === button.dataset.id) {
                if (!await mayClose()) return;
                state.holidayDraft = null; state.holidayEditingId = null;
            }
            state.holidayPackExpanded[button.dataset.id] = !state.holidayPackExpanded[button.dataset.id];
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'summary-prompt-fullscreen') {
            const position = summaryTextareaPosition();
            state.summaryInlineScrollTop = shell.querySelector('[data-tkm-scroll]')?.scrollTop ?? 0;
            state.summaryPromptFullscreen = true;
            await render(); restoreSummaryTextareaPosition(position); return;
        }
        if (action === 'cancel-summary-inline-prompt') {
            const scrollTop = state.summaryPromptFullscreen ? state.summaryInlineScrollTop : null;
            state.summaryPromptTextDraft = null; state.summaryCustomPromptDraft = null;
            state.summaryPromptFullscreen = false;
            await renderKeepingCalendarPosition('', scrollTop); return;
        }
        if (action === 'edit-summary-prompt-text') {
            if (!await mayClose()) return;
            if (state.summaryPromptTextDraft?.key === button.dataset.key) { state.summaryPromptTextDraft = null; await renderKeepingCalendarPosition(); return; }
            openSummaryPromptTextDraft(button.dataset.key);
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'new-summary-custom-prompt') {
            if (!await mayClose()) return;
            openSummaryCustomPromptDraft();
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'edit-summary-custom-prompt') {
            const item = summarySettings().promptOverrides.customPrompts.find(entry => entry.id === button.dataset.id);
            if (!item) return;
            if (!await mayClose()) return;
            if (state.summaryCustomPromptDraft?.id === item.id && state.summaryPromptStage === button.dataset.stage) { state.summaryCustomPromptDraft = null; await renderKeepingCalendarPosition(); return; }
            openSummaryCustomPromptDraft(item);
            state.summaryPromptStage = button.dataset.stage;
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'delete-summary-custom-prompt') {
            if (!await mayClose()) return;
            try {
                const nextSummary = deleteSummaryCustomPrompt(summarySettings(), button.dataset.id);
                await commitSummarySettings(nextSummary);
                state.summaryPromptTextDraft = null; state.summaryCustomPromptDraft = null;
                showSummarySettingsMessage('自定义提示词已删除。');
            } catch (error) { showSummarySettingsMessage(error?.message || '自定义提示词删除失败。', 'error'); }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'set-summary-custom-prompt-position' && state.summaryCustomPromptDraft) {
            state.summaryCustomPromptDraft.position = button.dataset.position === 'after' ? 'after' : 'before';
            await renderKeepingCalendarPosition();
            shell.querySelector('.tkm-position-picker summary')?.focus({preventScroll:true});
            return;
        }
        if (action === 'restore-summary-prompt-text' && state.summaryPromptTextDraft) {
            state.summaryPromptTextDraft = restoreSummaryPromptTextDraft(state.summaryPromptTextDraft);
            state.summarySettingsMessage = '';
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'select-event-library-item' && state.summaryEventLibraryDraft) {
            state.summaryEventLibrarySelected ??= new Set();
            const i = Number(button.dataset.index);
            if (state.summaryEventLibrarySelected.has(i)) state.summaryEventLibrarySelected.delete(i);
            else state.summaryEventLibrarySelected.add(i);
            await renderKeepingEventLibraryPosition(); return;
        }
        if ((action === 'set-event-library-enabled' || action === 'batch-event-library') && state.summaryEventLibraryDraft) {
            try {
                const indices = action === 'set-event-library-enabled' ? [Number(button.dataset.index)] : [...(state.summaryEventLibrarySelected ?? [])];
                state.summaryEventLibraryDraft = applyEventLibrarySelection(state.summaryEventLibraryDraft, indices, button.dataset.operation);
                if (button.dataset.operation === 'delete') { state.summaryEventLibrarySelected = new Set(); state.summaryEventLibraryEditingIndex = null; }
            } catch (error) { showSummarySettingsMessage(error?.message || '词库操作失败。', 'error'); }
            await renderKeepingEventLibraryPosition(); return;
        }
        if (action === 'select-all-event-library') {
            state.summaryEventLibrarySelected = new Set(state.summaryEventLibraryDraft.entries.map((_, i) => i));
            await renderKeepingEventLibraryPosition(); return;
        }
        if (action === 'clear-event-library-selection') { state.summaryEventLibrarySelected = new Set(); await renderKeepingEventLibraryPosition(); return; }
        if (action === 'toggle-event-library-item' && state.summaryEventLibraryDraft) {
            const index = Number(button.dataset.index);
            if (!Number.isInteger(index) || !state.summaryEventLibraryDraft.entries[index]) return;
            state.summaryEventLibraryEditingIndex = state.summaryEventLibraryEditingIndex === index ? null : index;
            await renderKeepingEventLibraryPosition(); return;
        }
        if (action === 'add-event-library-item' && state.summaryEventLibraryDraft) {
            state.summaryEventLibrarySelected = new Set();
            state.summaryEventLibraryDraft.entries.unshift({ name: '', definition: '' });
            state.summaryEventLibraryDraft.useDefault = false;
            const index = 0;
            state.summaryEventLibraryEditingIndex = index;
            await renderKeepingEventLibraryPosition(`[data-event-library-index="${index}"]`); return;
        }
        if (action === 'restore-event-library' && state.summaryEventLibraryDraft) {
            state.summaryEventLibrarySelected = new Set();
            state.summaryEventLibraryDraft = restoreSummaryEventLibraryDraft();
            state.summaryEventLibraryEditingIndex = null;
            state.summarySettingsMessage = '';
            await renderKeepingEventLibraryPosition(); return;
        }
        if (action === 'delete-event-library-item' && state.summaryEventLibraryDraft) {
            state.summaryEventLibrarySelected = new Set();
            state.summaryEventLibraryDraft.entries.splice(Number(button.dataset.index), 1);
            state.summaryEventLibraryEditingIndex = null;
            state.summaryEventLibraryDraft.useDefault = false;
            await renderKeepingEventLibraryPosition(); return;
        }
        if ((action === 'move-event-library-up' || action === 'move-event-library-down') && state.summaryEventLibraryDraft) {
            state.summaryEventLibrarySelected = new Set();
            const from = Number(button.dataset.index);
            const to = from + (action.endsWith('up') ? -1 : 1);
            if (to < 0 || to >= state.summaryEventLibraryDraft.entries.length) return;
            const [entry] = state.summaryEventLibraryDraft.entries.splice(from, 1);
            state.summaryEventLibraryDraft.entries.splice(to, 0, entry);
            state.summaryEventLibraryEditingIndex = to;
            state.summaryEventLibraryDraft.useDefault = false;
            state.eventLibraryReorderFeedback = { position: to + 1 };
            const selector = `[data-event-library-index="${to}"]`;
            await renderKeepingEventLibraryPosition(selector);
            revealEventLibraryReorderFeedback(action, selector); return;
        }
        if (action === 'add-summary-cleaning' && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            state.summaryCleaningQuickOpen = false;
            state.summaryCleaningRuleDraft = { id: summaryId('summary-clean'), enabled: true, action: 'exclude', pattern: '', flags: 'su', replacement: '', captureGroup: 0 };
            state.summaryCleaningEditingIndex = -1;
            state.summarySettingsMessage = '';
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-list'); return;
        }
        if (action === 'toggle-summary-cleaning-quick' && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            state.summaryCleaningQuickOpen = !state.summaryCleaningQuickOpen;
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-toolbar'); return;
        }
        if (action === 'add-summary-cleaning-shortcut' && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            const shortcut = BUILTIN_REGEX_SHORTCUTS[Number(button.dataset.index)];
            if (!shortcut) return;
            if (state.summaryCleaningDraft.some(rule => sameRegexRule(rule, shortcut))) {
                showSummarySettingsMessage('这条规则已存在。');
                await renderKeepingCalendarPosition('.tkm-summary-cleaning-quick'); return;
            }
            const rule = { ...structuredClone(shortcut), id: summaryId('summary-clean'), enabled: true, captureGroup: 0 };
            try { await saveSummaryCleaningRules([...state.summaryCleaningDraft, rule], '已添加到总结清洗规则。'); }
            catch (error) { showSummarySettingsMessage(error?.message || '添加快捷规则失败。', 'error'); }
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-quick'); return;
        }
        if (action === 'edit-summary-cleaning' && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            const index = Number(button.dataset.index);
            const rule = state.summaryCleaningDraft[index];
            if (!rule) return;
            state.summaryCleaningRuleDraft = structuredClone(rule);
            state.summaryCleaningEditingIndex = index;
            state.summarySettingsMessage = '';
            await renderKeepingCalendarPosition(`[data-summary-cleaning-id="${rule.id}"]`); return;
        }
        if (action === 'cancel-summary-cleaning-edit') {
            state.summaryCleaningRuleDraft = null;
            state.summaryCleaningEditingIndex = null;
            state.summarySettingsMessage = '';
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-list'); return;
        }
        if (action === 'apply-summary-cleaning-edit' && state.summaryCleaningDraft && state.summaryCleaningRuleDraft) {
            try {
                const [rule] = validateSummaryCleaningDraft([state.summaryCleaningRuleDraft]);
                const nextRules = structuredClone(state.summaryCleaningDraft);
                if (state.summaryCleaningEditingIndex === -1) nextRules.unshift(rule);
                else nextRules[state.summaryCleaningEditingIndex] = rule;
                await saveSummaryCleaningRules(nextRules, '清洗规则已更新。');
            } catch (error) {
                showSummarySettingsMessage(error?.message || '总结清洗规则无效。', 'error');
            }
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-list'); return;
        }
        if (action === 'delete-summary-cleaning' && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            try {
                const nextRules = structuredClone(state.summaryCleaningDraft);
                nextRules.splice(Number(button.dataset.index), 1);
                await saveSummaryCleaningRules(nextRules, '清洗规则已删除。');
            } catch (error) { showSummarySettingsMessage(error?.message || '清洗规则删除失败。', 'error'); }
            await renderKeepingCalendarPosition('.tkm-summary-cleaning-list'); return;
        }
        if ((action === 'move-summary-cleaning-up' || action === 'move-summary-cleaning-down') && state.summaryCleaningDraft) {
            if (state.summaryCleaningRuleDraft) return;
            const from = Number(button.dataset.index); const to = from + (action.endsWith('up') ? -1 : 1);
            if (to < 0 || to >= state.summaryCleaningDraft.length) return;
            const nextRules = structuredClone(state.summaryCleaningDraft);
            const [rule] = nextRules.splice(from, 1); nextRules.splice(to, 0, rule);
            try { await saveSummaryCleaningRules(nextRules); }
            catch (error) { showSummarySettingsMessage(error?.message || '清洗规则排序失败。', 'error'); await render(); return; }
            state.summaryReorderFeedback = { id: rule.id, position: to + 1 };
            const selector = `[data-summary-cleaning-id="${rule.id}"]`;
            await renderKeepingCalendarPosition(selector); revealSummaryReorderFeedback(action, selector); return;
        }
        if (action === 'time-workface') {
            const routeId = button.dataset.route;
            if (routeId === router.current().routeId || !['time.story', 'time.anniversaries', 'time.calendar'].includes(routeId)) return;
            if (!await mayClose()) return;
            if (routeId === 'time.story') loadStoryTimeState(); else loadSpecialDateState();
            router.reset(routeId); await render(); return;
        }
        if (action === 'open-add-memory') {
            state.multi = false; state.selected.clear();
            state.createMemoryNotice = '';
            await go('memory.create', { returnTo: 'memory.library' }); return;
        }
        if (action === 'manual-add-memory') { openNew('memory.create'); return; }
        if (action === 'open-auto-summary') {
            loadAutoSummaryDraft();
            router.go('memory.summary.auto', { returnTo: 'memory.create' });
            await render(); return;
        }
        if (action === 'open-summary-coverage') { router.go('memory.summary.coverage', { returnTo: 'memory.create' }); await render(); return; }
        if (action === 'coverage-auto-settings') { loadAutoSummaryDraft(); router.go('memory.summary.auto', { returnTo: 'memory.summary.coverage' }); await render(); return; }
        if (action === 'include-summary-floor') { await updateSummaryExclusion('include', button.dataset.floor); return; }
        if (action === 'regenerate-summary-batch') {
            if (state.coverageSaveBusy || state.coverageRegeneratingBatchId) return;
            const batchId = button.dataset.batchId;
            const batch = manualSummaryService.regenerationBatchOptions().find(item => item.id === batchId && item.canRegenerate);
            if (!batch || coverageRegenerationGate.isPending()) return;
            const regenerationChatId = currentChatLabel(getContext());
            state.coverageRegenerationConfirm = {
                batchId: batch.id,
                ordinal: batch.ordinal ?? null,
                floorRange: Array.isArray(batch.floorRange) ? [...batch.floorRange] : null,
            };
            const regenerationDecision = coverageRegenerationGate.request();
            await renderKeepingCalendarPosition();
            const regenerationConfirmed = await regenerationDecision;
            state.coverageRegenerationConfirm = null;
            if (!regenerationConfirmed || regenerationChatId !== currentChatLabel(getContext())) return;
            state.coverageRegeneratingBatchId = batchId; state.coverageMessage = ''; state.coverageMessageType = '';
            await renderKeepingCalendarPosition();
            try {
                const result = await manualSummaryService.regenerateBatch({ batchId });
                state.coverageRegeneratingBatchId = null;
                state.summaryReviewDraft = createSummaryReviewDraft(result.pending);
                state.summaryReviewMessage = '';
                dirty.setBaseline('summary-review', state.summaryReviewDraft);
                router.go('memory.summary.review', { returnTo: 'memory.summary.coverage' });
                await render();
            } catch (error) {
                state.coverageRegeneratingBatchId = null;
                state.coverageMessage = error?.message || '重新生成失败，旧结果已保留。';
                state.coverageMessageType = 'error';
                await renderKeepingCalendarPosition();
            }
            return;
        }
        if (action === 'auto-summary-start-recent') { await saveAutoSummary({ startFromRecent: true }); return; }
        if (action === 'reset-auto-summary-start') {
            try {
                if (dirty.isDirty('auto-summary', state.autoSummaryDraft)) throw new Error('请先保存自动总结设置，再重设起点。');
                await manualSummaryService.resetAutomaticStart(state.autoResetStart ?? manualSummaryService.autoState().progress.startFloor);
                state.autoResetConfirmed = false; state.autoSummaryMessage = ''; loadAutoSummaryDraft();
            } catch (error) { state.autoSummaryMessage = error?.message || '起点重设失败。'; state.autoSummaryMessageType = 'error'; }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'next-reply-summary') {
            try {
                const cancel = manualSummaryService.autoState().nextReplyRequested;
                if (!cancel && dirty.isDirty('auto-summary', state.autoSummaryDraft)) throw new Error('请先保存自动总结设置，再等待下一次回复。');
                manualSummaryService.requestNextReplySummary({ cancel });
                state.autoSummaryMessage = '';
            } catch (error) { state.autoSummaryMessage = error?.message || '无法等待下一次回复。'; state.autoSummaryMessageType = 'error'; }
            await renderKeepingCalendarPosition(); return;
        }
        if (action === 'start-auto-summary-backfill') { await runAutoSummaryBackfill(); return; }
        if (action === 'pause-auto-summary-backfill') { manualSummaryService.requestBackfillPause(); await renderKeepingCalendarPosition(); return; }
        if (action === 'retry-auto-summary') { await runAutoSummaryAction('retry'); return; }
        if (action === 'skip-auto-summary') { await runAutoSummaryAction('skip'); return; }
        if (action === 'cancel-auto-summary-skip' || action === 'confirm-auto-summary-skip') {
            autoSummarySkipGate.settle(action === 'confirm-auto-summary-skip');
            shell.querySelector('.tkm-confirm-layer')?.remove();
            shell.classList.remove('tkm-shell--confirming');
            return;
        }
        if (action === 'toggle-memory-detail-alias') {
            const parentDetail = button.dataset.parentDetail;
            if (!state.draft?.detailKeywords.includes(parentDetail)) return;
            if (state.memoryDetailAliasOpenParents.has(parentDetail)) state.memoryDetailAliasOpenParents.delete(parentDetail);
            else state.memoryDetailAliasOpenParents.add(parentDetail);
            await renderKeepingMemoryEditorPosition(); return;
        }
        if (action === 'commit-memory-detail-alias') {
            const parentDetail = button.dataset.parentDetail;
            const pending = state.memoryDetailAliasEntries[parentDetail] ?? '';
            if (!state.draft?.detailKeywords.includes(parentDetail) || !pending.trim()) return;
            const next = appendDetailAlias(state.draft.detailAliases, state.draft.detailKeywords, parentDetail, pending);
            const accepted = (next.find(binding => binding.parentDetail === parentDetail)?.aliases ?? [])
                .some(alias => alias.toLocaleLowerCase() === pending.trim().toLocaleLowerCase());
            if (!accepted) {
                state.memoryDetailAliasErrors[parentDetail] = '请填写父词中连续出现、且不同于完整父词的汉字检索简称。';
                state.memoryDetailAliasOpenParents.add(parentDetail);
                await renderKeepingMemoryEditorPosition(); return;
            }
            state.draft.detailAliases = next;
            state.memoryDetailAliasEntries[parentDetail] = '';
            delete state.memoryDetailAliasErrors[parentDetail];
            state.memoryDetailAliasOpenParents.add(parentDetail);
            await renderKeepingMemoryEditorPosition(); return;
        }
        if (action === 'remove-memory-detail-alias') {
            const parentDetail = button.dataset.parentDetail;
            if (!state.draft?.detailKeywords.includes(parentDetail)) return;
            state.draft.detailAliases = removeDetailAlias(state.draft.detailAliases, state.draft.detailKeywords, parentDetail, Number(button.dataset.aliasIndex));
            delete state.memoryDetailAliasErrors[parentDetail];
            state.memoryDetailAliasOpenParents.add(parentDetail);
            await renderKeepingMemoryEditorPosition(); return;
        }
        if (action === 'open-manual-summary') {
            ensureManualSummaryChatState();
            const returnTo = router.current().routeId === 'memory.summary.coverage'
                ? 'memory.summary.coverage'
                : 'memory.create';
            const pending = manualSummaryService.pendingReview();
            if (pending) {
                state.summaryReviewDraft = createSummaryReviewDraft(pending);
                state.summaryReviewMessage = '';
                dirty.setBaseline('summary-review', state.summaryReviewDraft);
                router.go('memory.summary.review', { returnTo });
            } else {
                state.manualSummaryMessage = '';
                state.manualSummaryPreview = null;
                state.manualSummaryDuplicateConfirmed = false;
                dirty.setBaseline('manual-summary', state.manualSummaryDraft);
                router.go('memory.summary.manual', { returnTo });
            }
            await render(); return;
        }
        if (action === 'continue-summary-review') {
            const pending = manualSummaryService.pendingReview();
            if (!pending) { state.manualSummaryMessage = '这批候选已不存在。'; await render(); return; }
            state.summaryReviewDraft = createSummaryReviewDraft(pending);
            state.summaryReviewMessage = '';
            dirty.setBaseline('summary-review', state.summaryReviewDraft);
            router.go('memory.summary.review', { returnTo: 'memory.summary.manual' });
            await render(); return;
        }
        if (action === 'retry-summary-keywords') {
            if (!state.summaryReviewDraft || state.summaryReviewBusy || state.summaryReviewEditing) return;
            const anchor = summaryReviewAnchor();
            state.summaryReviewBusy = true; state.summaryReviewMessage = ''; await renderKeepingSummaryReviewPosition(anchor);
            try {
                const result = await manualSummaryService.retryKeywords({ taskId: state.summaryReviewDraft.taskId, candidates: state.summaryReviewDraft.candidates });
                state.summaryReviewBusy = false; state.summaryReviewDraft = createSummaryReviewDraft(result.pending);
                syncSummaryReviewUi(state.summaryReviewDraft);
                dirty.setBaseline('summary-review', state.summaryReviewDraft); await renderKeepingSummaryReviewPosition(anchor);
            } catch (error) {
                state.summaryReviewBusy = false; state.summaryReviewMessage = error?.message || '关键词重试失败，正文草稿与旧关键词仍已保留。'; await renderKeepingSummaryReviewPosition(anchor);
            }
            return;
        }
        if (action === 'retry-summary-aliases') {
            if (!state.summaryReviewDraft || state.summaryReviewBusy || state.summaryReviewEditing) return;
            const anchor = summaryReviewAnchor();
            state.summaryReviewBusy = true; state.summaryReviewMessage = ''; await renderKeepingSummaryReviewPosition(anchor);
            try {
                const result = await manualSummaryService.retryAliases({ taskId: state.summaryReviewDraft.taskId, candidates: state.summaryReviewDraft.candidates });
                state.summaryReviewBusy = false; state.summaryReviewDraft = createSummaryReviewDraft(result.pending);
                syncSummaryReviewUi(state.summaryReviewDraft);
                dirty.setBaseline('summary-review', state.summaryReviewDraft); await renderKeepingSummaryReviewPosition(anchor);
            } catch (error) {
                state.summaryReviewBusy = false; state.summaryReviewMessage = error?.message || '检索简称重试失败，正文和关键词仍已保留。'; await renderKeepingSummaryReviewPosition(anchor);
            }
            return;
        }
        if (action === 'return-manual-summary') { router.reset('memory.summary.manual'); dirty.setBaseline('manual-summary', state.manualSummaryDraft); await render(); return; }
        if (action === 'preview-manual-summary') {
            try { refreshManualSummaryPreview(); state.manualSummaryPreviewOpen = true; await renderKeepingManualSummaryPosition(); }
            catch (error) { state.manualSummaryMessage = error?.message || '无法生成输入预览。'; state.manualSummaryMessageType = 'error'; await renderKeepingManualSummaryPosition(); }
            return;
        }
        if (action === 'toggle-manual-summary-preview' || action === 'collapse-manual-summary-preview') {
            state.manualSummaryPreviewOpen = action === 'toggle-manual-summary-preview' && !state.manualSummaryPreviewOpen;
            await renderKeepingManualSummaryPosition({ focusPreview: true }); return;
        }
        if (action === 'collapse-all-preview-prompts' || action === 'expand-all-preview-prompts') {
            const open = action === 'expand-all-preview-prompts';
            shell.querySelectorAll('.tkm-summary-preview-message').forEach(item => { item.open = open; });
            button.closest('.tkm-summary-preview-prompts')?.scrollIntoView?.({ block: 'nearest' });
            return;
        }
        if (action === 'go-summary-api-settings') { router.go('settings.ai', { returnTo: 'memory.summary.manual' }); loadApiDraft(); await render(); return; }
        if (action === 'open-summary-settings-from-manual') {
            if (state.manualSummaryBusy) return;
            router.go('settings.summary', { returnTo: 'memory.summary.manual' });
            await render();
            return;
        }
        if (action === 'toggle-summary-candidate') {
            if (!state.summaryReviewDraft) return;
            const draftId = button.dataset.draftId;
            if (!draftId || state.summaryReviewEditing?.draftId === draftId) return;
            const anchor = summaryReviewAnchor(draftId);
            if (state.summaryReviewCollapsedIds.has(draftId)) state.summaryReviewCollapsedIds.delete(draftId);
            else state.summaryReviewCollapsedIds.add(draftId);
            await renderKeepingSummaryReviewPosition(anchor); return;
        }
        if (action === 'collapse-all-summary-candidates' || action === 'expand-all-summary-candidates') {
            if (!state.summaryReviewDraft) return;
            const anchor = summaryReviewAnchor();
            const editingId = state.summaryReviewEditing?.draftId;
            if (action.startsWith('collapse')) {
                state.summaryReviewCollapsedIds = new Set(state.summaryReviewDraft.candidates.map(candidate => candidate.draftId).filter(id => id !== editingId));
            } else {
                state.summaryReviewCollapsedIds = new Set();
            }
            await renderKeepingSummaryReviewPosition(anchor); return;
        }
        if (action === 'edit-summary-candidate') {
            if (!state.summaryReviewDraft || state.summaryReviewEditing) return;
            const draftId = button.dataset.draftId;
            const candidate = state.summaryReviewDraft.candidates.find(item => item.draftId === draftId);
            if (!candidate) return;
            const anchor = summaryReviewAnchor(draftId);
            state.summaryReviewEditing = createSummaryCandidateEdit(candidate, { wasCollapsed: state.summaryReviewCollapsedIds.has(draftId) });
            state.summaryDetailAliasOpenParents = new Set();
            state.summaryReviewCollapsedIds.delete(draftId);
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(anchor); return;
        }
        if (action === 'toggle-summary-candidate-detail-alias') {
            const edit = state.summaryReviewEditing;
            const parentDetail = button.dataset.parentDetail;
            if (!edit || edit.draftId !== button.dataset.draftId || !edit.candidate.detailKeywords.includes(parentDetail)) return;
            if (state.summaryDetailAliasOpenParents.has(parentDetail)) state.summaryDetailAliasOpenParents.delete(parentDetail);
            else state.summaryDetailAliasOpenParents.add(parentDetail);
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(edit.draftId)); return;
        }
        if (action === 'commit-summary-candidate-detail-alias') {
            const edit = state.summaryReviewEditing;
            const parentDetail = button.dataset.parentDetail;
            if (!edit || edit.draftId !== button.dataset.draftId) return;
            appendSummaryDetailAlias(edit, parentDetail);
            state.summaryDetailAliasOpenParents.add(parentDetail);
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(edit.draftId)); return;
        }
        if (action === 'remove-summary-candidate-detail-alias') {
            const edit = state.summaryReviewEditing;
            const parentDetail = button.dataset.parentDetail;
            if (!edit || edit.draftId !== button.dataset.draftId) return;
            removeSummaryDetailAlias(edit, parentDetail, Number(button.dataset.aliasIndex));
            state.summaryDetailAliasOpenParents.add(parentDetail);
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(edit.draftId)); return;
        }
        if (action === 'commit-summary-candidate-tag') {
            const edit = state.summaryReviewEditing;
            const field = button.dataset.field;
            if (!edit || edit.draftId !== button.dataset.draftId || !edit.entries?.[field]?.trim()) return;
            appendSummaryCandidateEntry(edit, field);
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(edit.draftId));
            return;
        }
        if (action === 'remove-summary-candidate-tag') {
            const edit = state.summaryReviewEditing;
            const field = button.dataset.field;
            if (!edit || edit.draftId !== button.dataset.draftId) return;
            removeSummaryCandidateEntry(edit, field, Number(button.dataset.index));
            if (field === 'detailKeywords') {
                state.summaryDetailAliasOpenParents.delete(button.dataset.parentDetail);
                delete edit.aliasEntries?.[button.dataset.parentDetail];
            }
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(summaryReviewAnchor(edit.draftId));
            return;
        }
        if (action === 'save-summary-candidate-edit' || action === 'cancel-summary-candidate-edit') {
            const edit = state.summaryReviewEditing;
            if (!state.summaryReviewDraft || !edit || edit.draftId !== button.dataset.draftId) return;
            const anchor = summaryReviewAnchor(edit.draftId);
            if (action.startsWith('save') && !commitSummaryCandidateEdit(state.summaryReviewDraft, edit)) {
                state.summaryReviewMessage = '请先修正未保存的检索简称。';
                await renderKeepingSummaryReviewPosition(anchor); return;
            }
            if (edit.wasCollapsed) state.summaryReviewCollapsedIds.add(edit.draftId);
            state.summaryReviewEditing = null;
            state.summaryDetailAliasOpenParents = new Set();
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition(anchor); return;
        }
        if (action === 'remove-summary-candidate') {
            if (!state.summaryReviewDraft || state.summaryReviewBusy) return;
            const draftId = button.dataset.draftId;
            const index = state.summaryReviewDraft.candidates.findIndex(candidate => candidate.draftId === draftId);
            if (index < 0 || state.summaryReviewEditing?.draftId === draftId) return;
            if (state.summaryReviewDraft.candidates.length === 1) { await cancelSummaryReview({ removingLast: true }); return; }
            const nextId = state.summaryReviewDraft.candidates[index + 1]?.draftId ?? state.summaryReviewDraft.candidates[index - 1]?.draftId ?? '';
            const anchor = summaryReviewAnchor(nextId || draftId);
            state.summaryReviewDraft.candidates.splice(index, 1);
            state.summaryReviewCollapsedIds.delete(draftId);
            state.summaryReviewMessage = '';
            await renderKeepingSummaryReviewPosition({ ...anchor, draftId: nextId }); return;
        }
        if (action === 'cancel-summary-review') {
            await cancelSummaryReview();
            return;
        }
        if (action === 'back-library') { if (!await mayClose()) return; router.reset('memory.library'); state.notice = ''; state.multi = false; state.selected.clear(); state.draft = null; await render(); return; }
        if (action === 'select-api-source') {
            const nextSource = button.dataset.source;
            if (!state.apiDraft || !['sillytavern', 'plugin'].includes(nextSource) || nextSource === state.apiDraft.source) return;
            const position = rememberApiPosition(button);
            if (!await mayClose(position)) { await renderKeepingApiPosition(position); return; }
            const presetId = state.apiDraft.presetId;
            loadApiDraft(presetId);
            state.apiDraft.source = nextSource;
            const settings = getGlobalSettings(); settings.aiProvider.source = nextSource; await saveGlobalSettings(); state.apiMessage = ''; state.apiMessageType = ''; dirty.setBaseline('api', state.apiDraft);
            await renderKeepingApiPosition(position); return;
        }
        if (action === 'save-api-scheme-as') {
            const position = rememberApiPosition(button);
            state.apiDialogReturnPosition = position;
            state.apiDialog = 'save-as'; state.apiDialogName = `${state.apiDraft?.name || '新方案'}副本`;
            await renderKeepingApiPosition(position, { restoreFocus: false }); return;
        }
        if (action === 'save-api-scheme') {
            const position = rememberApiPosition(button);
            state.apiBusy = true; state.apiMessage = ''; await renderKeepingApiPosition(position);
            try {
                const result = await saveSecondaryApiScheme({
                    context: getContext(), presetId: state.apiDraft.presetId || null,
                    sourcePresetId: null, name: state.apiDraft.name,
                    endpoint: state.apiDraft.endpoint, model: state.apiDraft.model, apiKey: state.apiDraft.apiKey,
                });
                const settings = getGlobalSettings(); settings.aiProvider.source = 'plugin'; await saveGlobalSettings();
                loadApiDraft(result.preset.id); state.apiMessage = '方案已保存。'; state.apiMessageType = 'success';
            } catch (error) { state.apiMessage = error?.message || '保存方案失败。'; state.apiMessageType = 'error'; }
            state.apiBusy = false; await renderKeepingApiPosition(position, { restoreFocus: false }); return;
        }
        if (action === 'fetch-api-models') {
            const position = rememberApiPosition(button);
            state.apiBusy = true; state.apiMessage = ''; await renderKeepingApiPosition(position);
            try {
                const result = await fetchSecondaryApiPresetModels({ context: getContext(), presetId: state.apiDraft.presetId || null, endpoint: state.apiDraft.endpoint, apiKey: state.apiDraft.apiKey });
                state.apiModels = result.models; state.apiMessage = result.models.length ? `已获取 ${result.models.length} 个模型。` : '连接成功，可手动填写模型。'; state.apiMessageType = 'success';
            } catch (error) { state.apiMessage = error?.message || '获取模型失败；仍可手动填写模型。'; state.apiMessageType = 'error'; }
            state.apiBusy = false; await renderKeepingApiPosition(position, { restoreFocus: false });
            if (state.apiMessageType === 'success') {
                const message = state.apiMessage;
                windowRef?.setTimeout?.(() => {
                    if (state.apiMessage !== message || state.apiMessageType !== 'success') return;
                    state.apiMessage = '';
                    shell.querySelector('.tkm-summary-feedback-toast')?.remove();
                }, 2000);
            }
            return;
        }
        if (action === 'test-api-draft') {
            const position = rememberApiPosition(button);
            state.apiBusy = true; state.apiMessage = '正在测试当前配置…'; state.apiMessageType = ''; await renderKeepingApiPosition(position);
            try {
                if (state.apiDraft.source === 'sillytavern') await runMainApiBackgroundProbe(getContext());
                else await runSecondaryApiGenerationProbe({ context: getContext(), presetId: state.apiDraft.presetId || null, endpoint: state.apiDraft.endpoint, model: state.apiDraft.model, apiKey: state.apiDraft.apiKey });
                state.apiMessage = '当前配置测试通过。'; state.apiMessageType = 'success';
            } catch (error) { state.apiMessage = error?.message || '测试失败。'; state.apiMessageType = 'error'; }
            state.apiBusy = false; await renderKeepingApiPosition(position); return;
        }
        if (action === 'delete-api-scheme') {
            if (!state.apiDraft?.presetId) return;
            const position = rememberApiPosition(button);
            state.apiDialogReturnPosition = position;
            state.apiDialog = 'delete'; await renderKeepingApiPosition(position, { restoreFocus: false }); return;
        }
        if (action === 'confirm-delete-api-scheme') {
            if (!state.apiDraft?.presetId) return;
            const position = state.apiDialogReturnPosition ?? rememberApiPosition(button);
            state.apiDialog = null;
            try { await deleteSecondaryApiPreset({ context: getContext(), presetId: state.apiDraft.presetId }); loadApiDraft(); state.apiMessage = '方案已删除。'; state.apiMessageType = 'success'; } catch (error) { state.apiMessage = error?.message || '删除方案失败。'; state.apiMessageType = 'error'; }
            state.apiDialogReturnPosition = null;
            await renderKeepingApiPosition(position); return;
        }
        if (action === 'dismiss-api-feedback') { state.apiMessage = ''; shell.querySelector('.tkm-summary-feedback-toast')?.remove(); return; }
        if (action === 'cancel-api-dialog') {
            const position = state.apiDialogReturnPosition ?? rememberApiPosition(button);
            state.apiDialog = null; state.apiDialogName = ''; state.apiDialogReturnPosition = null;
            await renderKeepingApiPosition(position); return;
        }
        if (action === 'toggle-api-key') {
            const input = shell.querySelector('[data-api-field="apiKey"]');
            if (!input) return;
            const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.textContent = show ? '隐藏' : '显示'; return;
        }
        if (action === 'new-regex') {
            if (state.regexDraft && !await mayClose()) return;
            state.regexQuickOpen = false; state.regexDraft = blankGlobalRegexDraft(); state.regexDraftKind = 'rule'; state.regexEditingIndex = null; state.regexMessage = ''; dirty.setBaseline('regex', state.regexDraft); await render(); return;
        }
        if (action === 'edit-regex') {
            if (state.regexDraft) return;
            const index = Number(button.dataset.index); const rule = getGlobalSettings().regexRules?.[index]; if (!rule) return;
            state.regexQuickOpen = false; state.regexDraft = globalRegexDraftFrom(rule); state.regexDraftKind = 'rule'; state.regexEditingIndex = index; state.regexMessage = ''; dirty.setBaseline('regex', state.regexDraft); await render(); return;
        }
        if (action === 'cancel-regex') { if (!await mayClose()) return; state.regexDraft = null; state.regexEditingIndex = null; state.regexDraftKind = 'rule'; await render(); return; }
        if (action === 'open-regex-quick') {
            if (state.regexDraft && !await mayClose()) return;
            const scrollTop = shell.querySelector('.tkm-shell__body')?.scrollTop ?? 0;
            state.regexQuickOpen = !state.regexQuickOpen; state.regexMessage = ''; await renderKeepingCalendarPosition('', scrollTop); return;
        }
        if (action === 'close-regex-quick') { state.regexQuickOpen = false; await render(); return; }
        if (action === 'new-regex-shortcut') { state.regexQuickOpen = false; state.regexDraft = blankGlobalRegexDraft(); state.regexDraftKind = 'shortcut'; state.regexEditingIndex = null; state.regexMessage = ''; dirty.setBaseline('regex', state.regexDraft); await render(); return; }
        if (action === 'add-regex-shortcut') {
            const index = Number(button.dataset.index);
            const source = button.dataset.source === 'custom' ? (getGlobalSettings().regexShortcuts ?? []) : BUILTIN_REGEX_SHORTCUTS;
            const shortcut = source[index];
            if (!shortcut) return;
            const rules = ensureStableRegexRuleIds(getGlobalSettings().regexRules ?? []);
            if (rules.some(rule => sameRegexRule(rule, shortcut))) { showRegexMessage('这条规则已存在。'); await render(); return; }
            rules.push({ ...structuredClone(shortcut), id: `regex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
            await commitRegexRules(rules); showRegexMessage('已添加到清洗规则。'); await render(); return;
        }
        if (action === 'delete-regex-shortcut') {
            if (!ask('删除这条快捷操作？')) return;
            const settings = getGlobalSettings(); const shortcuts = [...(settings.regexShortcuts ?? [])]; shortcuts.splice(Number(button.dataset.index), 1); settings.regexShortcuts = shortcuts; await saveGlobalSettings(); await render(); return;
        }
        if (action === 'delete-regex') { if (state.regexDraft || !ask('删除这条全局清洗规则？')) return; const rules = [...(getGlobalSettings().regexRules ?? [])]; rules.splice(Number(button.dataset.index), 1); await commitRegexRules(rules); showRegexMessage('规则已删除。'); await render(); return; }
        if (action === 'move-regex-up' || action === 'move-regex-down') {
            if (state.regexDraft) return;
            const rules = ensureStableRegexRuleIds(getGlobalSettings().regexRules ?? []);
            const from = Number(button.dataset.index);
            const to = from + (action === 'move-regex-up' ? -1 : 1);
            if (to < 0 || to >= rules.length) return;
            const moved = rules[from];
            [rules[from], rules[to]] = [rules[to], rules[from]];
            await commitRegexRules(rules);
            state.regexReorderFeedback = { id: moved.id, index: to };
            await render();
            revealRegexReorderFeedback(action);
            return;
        }
        if (action === 'anniversary-tab') { if (state.anniversaryDraft && !await mayClose()) return; state.anniversaryDraft = null; state.anniversaryEditingId = null; state.anniversaryTab = button.dataset.status; await renderKeepingCalendarPosition('.tkm-special-date-tabs'); return; }
        if (action === 'reset-time-prompt') {
            const field = button.dataset.field;
            if (field === 'general') state.specialPromptDraft.general = DEFAULT_GLOBAL_SETTINGS.templates.specialDateReminder;
            else if (field === 'storyTimeInstruction') state.specialPromptDraft[field] = DEFAULT_GLOBAL_SETTINGS.templates.storyTimeInstruction;
            else if (field === 'holidayInstruction') state.specialPromptDraft[field] = '';
            else return;
            await queueAutoSave(() => saveSpecialPromptField(field)).catch(() => {});
            await render();
            return;
        }
        if (action === 'new-anniversary') {
            if (state.anniversaryDraft && !await mayClose()) return;
            if (state.anniversaryDraft && !state.anniversaryEditingId) { state.anniversaryDraft = null; await renderKeepingCalendarPosition('.tkm-special-date-page-heading'); return; }
            state.specialPromptOpen = false; state.anniversaryDraft = blankAnniversaryDraft(state.specialPromptDraft.defaultDays); state.anniversaryEditingId = null; state.anniversaryErrors = {}; state.anniversaryMessage = ''; dirty.setBaseline('anniversary', state.anniversaryDraft); await renderKeepingCalendarPosition('.tkm-special-date-form'); return;
        }
        if (action === 'edit-anniversary') {
            if (state.anniversaryEditingId === button.dataset.id) { if (!await mayClose()) return; state.anniversaryDraft = null; state.anniversaryEditingId = null; await renderKeepingCalendarPosition(`[data-anniversary-record-id="${button.dataset.id}"]`); return; }
            if (state.anniversaryDraft && !await mayClose()) return;
            const item = anniversaryService.get(button.dataset.id); if (!item) return; state.specialPromptOpen = false; state.anniversaryDraft = draftFromAnniversary(item, state.specialPromptDraft.defaultDays); state.anniversaryEditingId = item.id; state.anniversaryErrors = {}; state.anniversaryMessage = ''; dirty.setBaseline('anniversary', state.anniversaryDraft); await renderKeepingCalendarPosition(`[data-anniversary-record-id="${item.id}"] .tkm-special-date-form`); return;
        }
        if (action === 'cancel-anniversary-form') { if (!await mayClose()) return; const recordId = state.anniversaryEditingId; state.anniversaryDraft = null; state.anniversaryEditingId = null; await renderKeepingCalendarPosition(recordId ? `[data-anniversary-record-id="${recordId}"]` : '.tkm-special-date-page-heading'); return; }
        if (action === 'add-anniversary-name') { state.anniversaryDraft.names.push({ id: '', name: '', startYearRaw: '', personalPrompt: '' }); await renderKeepingCalendarPosition('.tkm-special-name:last-child'); return; }
        if (action === 'remove-anniversary-name') { state.anniversaryDraft.names.splice(Number(button.dataset.index), 1); await renderKeepingCalendarPosition('.tkm-special-names'); return; }
        if (action === 'set-anniversary-draft-status') { if (!state.anniversaryDraft || !['enabled', 'paused'].includes(button.dataset.status)) return; state.anniversaryDraft.status = button.dataset.status; await renderKeepingCalendarPosition('.tkm-special-status'); return; }
        if (action === 'set-anniversary-status') { if (await runMutation(() => anniversaryService.setStatus(button.dataset.id, button.dataset.status))) await renderKeepingCalendarPosition(`[data-anniversary-record-id="${button.dataset.id}"]`); return; }
        if (action === 'delete-anniversary') { if (!ask('删除这组纪念日？')) return; if (await runMutation(() => anniversaryService.remove(button.dataset.id))) { if (state.anniversaryEditingId === button.dataset.id) { state.anniversaryDraft = null; state.anniversaryEditingId = null; } await renderKeepingCalendarPosition('.tkm-special-date-timeline'); } return; }
        if (action === 'new-memory') { state.createMemoryNotice = ''; await go('memory.create', { returnTo: 'memory.library' }); return; }
        if (action === 'open-story-time') { loadStoryTimeState(); state.storyTimeMessage = ''; state.extractionRuleMessage = ''; state.extractionRuleMessageType = ''; state.calendarMessage = ''; state.calendarMessageType = ''; await go('time.story', { returnTo: router.current().routeId }); return; }
        if (action === 'open-memory-search') { state.memorySearchOpen = true; await render(); shell.querySelector('[data-field="search"]')?.focus(); return; }
        if (action === 'close-memory-search') { state.memorySearchOpen = false; state.query = ''; state.selected.clear(); state.listScrollTop = 0; await render(); return; }
        if (action === 'view-list' || action === 'view-timeline') { state.libraryView = action === 'view-list' ? 'list' : 'timeline'; state.multi = false; state.selected.clear(); state.listScrollTop = 0; await render(); return; }
        if (action === 'open-filter') { rememberScroll(); state.filterOpen = !state.filterOpen; state.filterMenu = null; await render(); return; }
        if (action === 'set-filter') {
            const key = button.dataset.key;
            if (key !== 'mode' && key !== 'fieldState') return;
            state[key] = button.dataset.value;
            state.filterDraft = normalizeMemoryFilterDraft(state);
            state.filterMenu = null; state.selected.clear(); state.listScrollTop = 0;
            await render(); return;
        }
        if (action === 'clear-filters') { state.query = ''; state.memorySearchOpen = false; state.mode = 'all'; state.fieldState = 'all'; state.filterDraft = normalizeMemoryFilterDraft(); state.filterOpen = false; state.filterMenu = null; state.selected.clear(); state.listScrollTop = 0; await render(); return; }
        if (action === 'clear-memory-search') { state.query = ''; state.selected.clear(); state.listScrollTop = 0; await render(); return; }
        if (action === 'toggle-multi') {
            rememberScroll();
            const next = toggleMemoryMultiState(state);
            state.multi = next.multi; state.libraryView = next.libraryView; state.filterOpen = false; state.filterMenu = null; state.selected.clear();
            await render(); return;
        }
        if (action === 'clear-memory-selection') { rememberScroll(); state.selected.clear(); await render(); return; }
        if (action === 'toggle-select') { rememberScroll(); state.selected = toggleMemorySelection(state.selected, button.dataset.id); await render(); return; }
        if (action === 'select-all') { rememberScroll(); for (const memory of memoryLibraryService.list({ query: state.query, mode: state.mode, fieldState: state.fieldState })) state.selected.add(memory.id); await render(); return; }
        if (action === 'open-memory') { rememberScroll(); state.activeId = button.dataset.id; state.draft = draftFromMemory(memoryLibraryService.get(state.activeId)); state.memoryEntryDrafts = createBlankMemoryEntryDrafts(); state.memoryDetailAliasEntries = {}; state.memoryDetailAliasErrors = {}; state.memoryDetailAliasOpenParents = new Set(); state.formErrors = {}; state.formMessage = ''; dirty.setBaseline('memory', memoryDirtySnapshot(state)); router.go('memory.record', { returnTo: 'memory.library' }); await render(); return; }
        if (action === 'delete-library-memory') { state.activeId = button.dataset.id; state.memoryDeletePending = true; await render(); return; }
        if (action === 'rebuild-memory-keywords') { await startKeywordRebuild([state.activeId], 'memory.record'); return; }
        if (action === 'bulk-rebuild-keywords') { await startKeywordRebuild([...state.selected], 'memory.library'); return; }
        if (action === 'bulk-merge-memories') {
            const ids = [...state.selected];
            const inspected = memoryMergeService.inspectSelection(ids);
            if (!inspected.canMerge) {
                state.notice = inspected.reason;
                state.noticeType = 'error';
                await render();
                return;
            }
            state.memoryMergeIds = ids;
            state.memoryMergeMessage = '';
            state.memoryMergeBodyDraft = null;
            router.go('memory.merge.source', { returnTo: 'memory.library' });
            await render();
            return;
        }
        if (action === 'start-memory-merge') {
            if (state.memoryMergeBusy) return;
            state.memoryMergeBusy = true;
            state.memoryMergeBusyStage = 'body';
            state.memoryMergeMessage = '';
            await render();
            try {
                const review = await memoryMergeService.start(state.memoryMergeIds, button.dataset.sourceMode);
                state.memoryMergeBodyDraft = {
                    title: review.candidate.title,
                    body: review.candidate.body,
                    people: (review.candidate.people ?? []).join('、'),
                    locations: (review.candidate.locations ?? []).join('、'),
                };
                dirty.setBaseline('memory-merge-body', state.memoryMergeBodyDraft);
                state.memoryMergeBusy = false;
                state.memoryMergeBusyStage = '';
                router.go('memory.merge.body', { returnTo: 'memory.library' });
            } catch (error) {
                state.memoryMergeBusy = false;
                state.memoryMergeBusyStage = '';
                state.memoryMergeMessage = error?.message || '融合正文生成失败，原记忆保持不变。';
            }
            await render();
            return;
        }
        if (action === 'cancel-memory-merge') {
            discardTransientRouteDraft(router.current().routeId);
            state.selected.clear();
            state.multi = false;
            router.reset('memory.library');
            await render();
            return;
        }
        if (action === 'confirm-memory-merge') {
            const review = memoryMergeService.currentReview();
            if (!review || state.memoryMergeBusy) return;
            state.memoryMergeBusy = true;
            state.memoryMergeMessage = '';
            await render();
            try {
                await memoryMergeService.confirm(review.id);
                state.memoryMergeBusy = false;
                state.memoryMergeIds = [];
                state.memoryMergeBodyDraft = null;
                state.selected.clear();
                state.multi = false;
                state.notice = '记忆已合并。';
                state.noticeType = 'success';
                router.reset('memory.library');
            } catch (error) {
                state.memoryMergeBusy = false;
                state.memoryMergeMessage = error?.message || '合并保存失败，原记忆保持不变。';
            }
            await render();
            return;
        }
        if (action === 'undo-memory-merge') {
            if (!state.activeId || state.memoryMergeBusy || !ask('撤销这次合并并恢复原记忆？')) return;
            state.memoryMergeBusy = true;
            state.formMessage = '';
            await render();
            try {
                const result = await memoryMergeService.undo(state.activeId);
                state.memoryMergeBusy = false;
                state.activeId = null;
                state.draft = null;
                state.notice = `已撤销合并，恢复 ${result.restored} 条记忆。`;
                state.noticeType = 'success';
                router.reset('memory.library');
            } catch (error) {
                state.memoryMergeBusy = false;
                state.formMessage = error?.message || '撤销合并失败。';
            }
            await render();
            return;
        }
        if (action === 'cancel-keyword-rebuild') {
            memoryKeywordRebuildService.cancel();
            state.keywordRebuildMessage = '';
            router.back(state.keywordRebuildReturnTo);
            await render();
            return;
        }
        if (action === 'apply-memory-index-rebuild') {
            const review = memoryKeywordRebuildService.currentReview();
            if (!review || state.keywordRebuildBusy) return;
            state.keywordRebuildBusy = true;
            state.keywordRebuildMessage = '';
            await render();
            try {
                const result = await memoryKeywordRebuildService.confirm(review.id);
                state.keywordRebuildBusy = false;
                state.selected.clear();
                state.notice = `已更新 ${result.count} 条记忆的关键词与检索简称。`;
                state.noticeType = 'success';
                if (state.keywordRebuildReturnTo === 'memory.record' && state.activeId) {
                    state.draft = draftFromMemory(memoryLibraryService.get(state.activeId));
                    dirty.setBaseline('memory', memoryDirtySnapshot(state));
                }
                router.back(state.keywordRebuildReturnTo);
                await render();
            } catch (error) {
                state.keywordRebuildBusy = false;
                state.keywordRebuildMessage = error?.message || '保存失败，原关键词与检索简称保持不变。';
                await render();
            }
            return;
        }
        if (action === 'cancel-form') { if (!await mayClose()) return; state.draft = null; state.activeId = null; router.back('memory.library'); await render(); return; }
        if (action === 'add-era') {
            state.calendarDraft.eras.push({ name: '', endYear: null }); state.calendarDraft.enabled = true; state.calendarMessage = '';
            await renderKeepingCalendarPosition('.tkm-era-compact:last-child'); return;
        }
        if (action === 'remove-era') {
            const removedIndex = Number(button.dataset.index);
            state.calendarDraft.eras.splice(removedIndex, 1); state.calendarDraft.enabled = state.calendarDraft.eras.length > 0; state.calendarMessage = '';
            await queueAutoSave(saveCalendarDraft).catch(() => {});
            const remainingIndex = Math.min(removedIndex, state.calendarDraft.eras.length - 1);
            await renderKeepingCalendarPosition(remainingIndex >= 0 ? `.tkm-era-compact:nth-child(${remainingIndex + 1})` : '.tkm-calendar-section'); return;
        }
        if (action === 'move-era-up' || action === 'move-era-down') {
            const from = Number(button.dataset.index); const to = from + (action === 'move-era-up' ? -1 : 1);
            if (to >= 0 && to < state.calendarDraft.eras.length) [state.calendarDraft.eras[from], state.calendarDraft.eras[to]] = [state.calendarDraft.eras[to], state.calendarDraft.eras[from]];
            state.calendarMessage = ''; await queueAutoSave(saveCalendarDraft).catch(() => {});
            await renderKeepingCalendarPosition(`.tkm-era-compact:nth-child(${to + 1})`); return;
        }
        if (action === 'set-time-extraction-mode') {
            const mode = button.dataset.mode;
            if (!['markers', 'regex'].includes(mode) || state.extractionRuleDraft.mode === mode) return;
            state.extractionRuleDraft.mode = mode; state.extractionRuleMessage = '';
            await autoSaveExtractionRuleDraft().catch(() => {});
            await renderKeepingCalendarPosition('.tkm-time-method-picker'); return;
        }
        if (action === 'add-time-marker') {
            state.extractionRuleDraft.markers.push({ name: '', start: '', end: '' }); state.extractionRuleMessage = '';
            await renderKeepingCalendarPosition('.tkm-time-marker-row:last-child'); return;
        }
        if (action === 'remove-time-marker') {
            const removedIndex = Number(button.dataset.index);
            state.extractionRuleDraft.markers.splice(removedIndex, 1); state.extractionRuleMessage = '';
            await autoSaveExtractionRuleDraft().catch(() => {});
            const remainingIndex = Math.min(removedIndex, state.extractionRuleDraft.markers.length - 1);
            await renderKeepingCalendarPosition(remainingIndex >= 0 ? `.tkm-time-marker-row:nth-child(${remainingIndex + 1})` : '.tkm-time-method-body'); return;
        }
        if (action === 'delete-memory') { state.memoryDeletePending = true; await render(); return; }
        if (action === 'bulk-resident' || action === 'bulk-trigger') {
            rememberScroll();
            if (await runMutation(() => memoryLibraryService.setModeMany([...state.selected], action === 'bulk-resident' ? 'resident' : 'trigger'))) { state.selected.clear(); await render(); }
            return;
        }
        if (action === 'bulk-delete') {
            if (!state.selected.size || !ask(`删除选中的 ${state.selected.size} 条记忆？`)) return;
            rememberScroll();
            if (await runMutation(() => memoryLibraryService.removeMany([...state.selected]))) { state.selected.clear(); await render(); }
            return;
        }
    });
    shell.addEventListener('keydown', async event => {
        const memoryEntryField = event.target.dataset?.memoryEntryField;
        if (event.key === 'Enter' && memoryEntryField && state.memoryEntryDrafts?.[memoryEntryField]?.trim()) {
            event.preventDefault();
            event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-memory-tag"]')?.click();
            return;
        }
        if (event.key === 'Enter' && event.target.matches?.('[data-memory-detail-alias-entry]') && event.target.value.trim()) {
            event.preventDefault();
            event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-memory-detail-alias"]')?.click();
            return;
        }
        const summaryCandidateEntryField = event.target.dataset?.summaryCandidateEntryField;
        if (event.key === 'Enter' && summaryCandidateEntryField && state.summaryReviewEditing?.entries?.[summaryCandidateEntryField]?.trim()) {
            event.preventDefault();
            event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-summary-candidate-tag"]')?.click();
            return;
        }
        if (event.key === 'Enter' && event.target.matches?.('[data-summary-detail-alias-entry]') && event.target.value.trim()) {
            event.preventDefault();
            event.target.closest('.tkm-memory-tag-entry')?.querySelector('[data-action="commit-summary-candidate-detail-alias"]')?.click();
            return;
        }
        if (event.key !== 'Escape') return;
        if (coverageRegenerationGate.isPending()) { coverageRegenerationGate.settle(false); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (autoSummarySkipGate.isPending()) { autoSummarySkipGate.settle(false); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (state.apiDialog) {
            const position = state.apiDialogReturnPosition ?? rememberApiPosition();
            state.apiDialog = null; state.apiDialogName = ''; state.apiDialogReturnPosition = null;
            await renderKeepingApiPosition(position); return;
        }
        if (state.memoryDeletePending) { state.memoryDeletePending = false; await render(); return; }
        if (summaryReviewCancelGate.isPending()) { summaryReviewCancelGate.settle(false); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (fastModeWarningGate.isPending()) { fastModeWarningGate.settle(false); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (discardGate.isPending()) { discardGate.settle(false); shell.querySelector('.tkm-confirm-layer')?.remove(); shell.classList.remove('tkm-shell--confirming'); return; }
        if (state.filterOpen) { state.filterOpen = false; state.filterMenu = null; await render(); return; }
        const routeId = router.current().routeId;
        const entry = currentDirtyEntry();
        const wasDirty = Boolean(entry && dirty.isDirty(entry[0], entry[1])) || hasSummaryCandidateEdit();
        if (await mayClose()) { if (wasDirty) discardTransientRouteDraft(routeId); shell.hidden = true; }
    });

    const controller = {
        element: shell,
        open() { shell.hidden = false; render(); },
        async close() {
            const routeId = router.current().routeId;
            const entry = currentDirtyEntry();
            const wasDirty = Boolean(entry && dirty.isDirty(entry[0], entry[1])) || hasSummaryCandidateEdit();
            if (await mayClose()) { if (wasDirty) discardTransientRouteDraft(routeId); shell.hidden = true; }
        },
        refresh: () => {
            const routeId = router.current().routeId;
            if (routeId === 'time.story') {
                const entry = currentDirtyEntry();
                if (!entry || !dirty.isDirty(entry[0], entry[1])) loadStoryTimeState();
            }
            return routeId === 'memory.summary.auto' ? renderKeepingCalendarPosition() : render();
        },
        setTheme(themeId) {
            if (!UI_THEME_IDS.includes(themeId)) throw new TypeError(`未知 UI 主题：${themeId}`);
            shell.dataset.tkmTheme = themeId;
        },
        destroy() { shell.remove(); },
    };
    shell._tkmController = controller;
    documentRef.body.append(shell);
    return controller;
}

export { SHELL_ID };
