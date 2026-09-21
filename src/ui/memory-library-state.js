const MEMORY_MODES = new Set(['all', 'resident', 'trigger']);
const FIELD_STATES = new Set(['all', 'missing-event', 'missing-detail', 'no-new-keywords']);

export function normalizeMemoryFilterDraft({ mode = 'all', fieldState = 'all' } = {}) {
    return {
        mode: MEMORY_MODES.has(mode) ? mode : 'all',
        fieldState: FIELD_STATES.has(fieldState) ? fieldState : 'all',
    };
}

export function countActiveMemoryFilters(filters = {}) {
    const normalized = normalizeMemoryFilterDraft(filters);
    return Number(normalized.mode !== 'all') + Number(normalized.fieldState !== 'all');
}

export function toggleMemoryMultiState({ multi = false, libraryView = 'list' } = {}) {
    return multi
        ? { multi: false, libraryView }
        : { multi: true, libraryView: 'list' };
}

export function toggleMemorySelection(selected, id) {
    const next = new Set(selected ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
}
