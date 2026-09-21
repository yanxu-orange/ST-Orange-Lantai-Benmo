import { normalizeAtomicTextList, parseDelimitedTextList } from '../domain/text-list.js';
import { detailAliasesForEditor } from './detail-alias-editor-state.js';

export const MEMORY_EDITOR_LIST_FIELDS = Object.freeze([
    'eventKeywords',
    'detailKeywords',
    'people',
    'locations',
    'primaryKeywords',
    'auxiliaryKeywords',
]);

const MEMORY_EDITOR_ENTRY_POLICY = Object.freeze({
    delimiters: Object.freeze([',', '，', '、', ';', '；', '\r\n', '\n', '\r']),
});

function copyList(value) {
    return Array.isArray(value) ? [...value] : [];
}

function assertListField(field) {
    if (!MEMORY_EDITOR_LIST_FIELDS.includes(field)) {
        throw new TypeError(`未知的 Memory Editor 列表字段：${String(field)}`);
    }
}

export function createBlankMemoryEditorLists() {
    return Object.fromEntries(MEMORY_EDITOR_LIST_FIELDS.map(field => [field, []]));
}

export function createBlankMemoryEntryDrafts() {
    return Object.fromEntries(MEMORY_EDITOR_LIST_FIELDS.map(field => [field, '']));
}

export function memoryEditorListsFromMemory(memory) {
    const detailKeywords = copyList(memory?.keywords?.detail);
    return {
        eventKeywords: copyList(memory?.keywords?.event),
        detailKeywords,
        detailAliases: detailAliasesForEditor(memory?.keywords?.detailAliases, detailKeywords),
        people: copyList(memory?.people),
        locations: copyList(memory?.locations),
        primaryKeywords: copyList(memory?.keywords?.primary),
        auxiliaryKeywords: copyList(memory?.keywords?.auxiliary),
    };
}

export function appendMemoryEditorEntry(current, field, pending) {
    assertListField(field);
    const existing = copyList(current);
    const incoming = parseDelimitedTextList(pending, MEMORY_EDITOR_ENTRY_POLICY);
    return normalizeAtomicTextList([...existing, ...incoming]);
}

export function removeMemoryEditorEntry(current, field, index) {
    assertListField(field);
    const result = copyList(current);
    if (Number.isSafeInteger(index) && index >= 0 && index < result.length) result.splice(index, 1);
    return result;
}

export function memoryEditorListPayload(draft) {
    return {
        ...Object.fromEntries(MEMORY_EDITOR_LIST_FIELDS.map(field => [field, copyList(draft?.[field])])),
        detailAliases: detailAliasesForEditor(draft?.detailAliases, draft?.detailKeywords),
    };
}
