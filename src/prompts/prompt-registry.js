import { ALIAS_MODULES } from './alias-modules.js';
import { sha256Hex } from './hash.js';
import { INDEX_MODULES } from './index-modules.js';
import { MERGE_MODULES } from './merge-modules.js';
import { PROMPT_SCHEMAS } from './schemas.js';
import { SUMMARY_MODULES } from './summary-modules.js';
import { TASK_CONTRACTS } from './task-contracts.js';

function record(id, role, content) {
    return Object.freeze({ id, role, content, sha256: sha256Hex(content) });
}

const promptEntries = [
    ...Object.entries(ALIAS_MODULES).map(([id, content]) => [id, record(id, 'system', content)]),
    ...Object.entries(SUMMARY_MODULES).map(([id, content]) => [id, record(id, 'system', content)]),
    ...Object.entries(INDEX_MODULES).map(([id, content]) => [id, record(id, 'system', content)]),
    ...Object.entries(MERGE_MODULES).map(([id, content]) => [id, record(id, 'system', content)]),
    ...Object.entries(TASK_CONTRACTS).map(([id, content]) => [id, record(id, 'user', content)]),
];

export const PROMPT_REGISTRY = Object.freeze(Object.fromEntries(promptEntries));
export const PROMPT_MODULE_IDS = Object.freeze(Object.keys(PROMPT_REGISTRY));
export const PROMPT_SCHEMA_IDS = Object.freeze(Object.keys(PROMPT_SCHEMAS));

export function getPromptModule(id) {
    const item = PROMPT_REGISTRY[id];
    if (!item) throw new Error(`Unknown prompt module: ${id}`);
    return item;
}

export function getPromptSchema(id) {
    const schema = PROMPT_SCHEMAS[id];
    if (!schema) throw new Error(`Unknown prompt schema: ${id}`);
    return schema;
}
