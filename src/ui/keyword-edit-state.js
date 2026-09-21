import { normalizeTextList } from '../domain/memory.js';

export const KEYWORD_DRAFT_FIELDS = Object.freeze([
    'eventKeywordsText',
    'detailKeywordsText',
    'primaryKeywordsText',
    'auxiliaryKeywordsText',
]);

export function isKeywordDraftField(field) {
    return KEYWORD_DRAFT_FIELDS.includes(field);
}

export function commitKeywordText(value) {
    return normalizeTextList(value).join('、');
}
