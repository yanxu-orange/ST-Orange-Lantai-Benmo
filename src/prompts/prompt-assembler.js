import { getDefaultPromptText, normalizeCustomSummaryPrompts, splitPromptContract } from './prompt-customization.js';
import { sha256Hex } from './hash.js';
import { PROMPT_CALL_TASKS } from './prompt-framework.js';
import { getPromptModule, getPromptSchema } from './prompt-registry.js';
import { SINGLE_THREE_PROMPT_TEXT } from './single-three-prompt-text.js';
import { TWO_STAGE_PROMPT_TEXT } from './two-stage-prompt-text.js';

const SLOT_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const KNOWN_SLOT_NAMES = Object.freeze(new Set([
    'SUMMARY_SOURCE_JSON',
    'SUMMARY_DRAFTS_JSON',
    'AVAILABLE_EVENT_KEYWORDS_JSON',
    'SUMMARY_DRAFT_OUTPUT_JSON_SCHEMA',
    'INDEX_OUTPUT_JSON_SCHEMA',
    'SUMMARY_OUTPUT_JSON_SCHEMA',
    'MEMORY_MERGE_SOURCE_JSON',
    'MEMORY_MERGE_OUTPUT_JSON_SCHEMA',
]));

export class PromptAssemblerError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'PromptAssemblerError';
        this.code = code;
        Object.assign(this, details);
    }
}

function fail(code, message, details) {
    throw new PromptAssemblerError(code, message, details);
}

function json(value, field) {
    try {
        const encoded = JSON.stringify(value, null, 2);
        if (encoded === undefined) fail('invalid_slot_value', `${field} 不能进行 JSON 编码。`, { field });
        return encoded.replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    } catch (cause) {
        if (cause instanceof PromptAssemblerError) throw cause;
        fail('invalid_slot_value', `${field} 不能进行 JSON 编码。`, { field, cause });
    }
}

export function renderPromptTemplate(template, slots) {
    if (typeof template !== 'string') fail('invalid_template', 'Prompt template 必须是字符串。');
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) fail('invalid_slots', 'Prompt slots 必须是对象。');
    const slotPattern = /{{([^{}]+)}}/g;
    const tokens = [];
    let match;
    while ((match = slotPattern.exec(template)) !== null) {
        const name = match[1];
        if (!SLOT_NAME_PATTERN.test(name)) fail('invalid_template_slot', `非法 Prompt slot：${name}`, { slot: name });
        if (!KNOWN_SLOT_NAMES.has(name)) fail('unknown_template_slot', `未知 Prompt slot：${name}`, { slot: name });
        if (tokens.includes(name)) fail('duplicate_template_slot', `Prompt slot 重复：${name}`, { slot: name });
        if (!Object.hasOwn(slots, name)) fail('missing_template_slot', `缺少 Prompt slot：${name}`, { slot: name });
        tokens.push(name);
    }
    const templateRemainder = template.replace(/{{([^{}]+)}}/g, '');
    if (templateRemainder.includes('{{') || templateRemainder.includes('}}')) fail('invalid_template_slot', 'Prompt template 含有未闭合或残留的 slot。');
    const extras = Object.keys(slots).filter(name => !tokens.includes(name));
    if (extras.length) fail('unknown_template_slot', `模板未声明 Prompt slot：${extras.join(', ')}`, { slots: extras });
    return template.replace(/{{([^{}]+)}}/g, (_, name) => String(slots[name]));
}

function requireSource(source) {
    if (source === undefined || source === null) fail('missing_source', '该 Prompt task 缺少 cleaned source。');
}

function requireDrafts(drafts) {
    if (!Array.isArray(drafts) || !drafts.length) fail('missing_drafts', 'Quality Stage B 缺少非空 drafts。');
}

export function validateEventKeywords(eventKeywords) {
    if (!Array.isArray(eventKeywords)) fail('invalid_event_keywords', 'eventKeywords 必须是数组。');
    const names = new Set();
    eventKeywords.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid_event_keyword_item', 'eventKeywords 每项必须是对象。', { index });
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const definition = typeof item.definition === 'string' ? item.definition.trim() : '';
        if (!name || !definition) fail('invalid_event_keyword_item', 'eventKeywords 每项都需要非空 name 与 definition。', { index });
        if (names.has(name)) fail('duplicate_event_keyword_name', `eventKeywords name 重复：${name}`, { index, name });
        names.add(name);
    });
    return eventKeywords;
}

function promptOverrideKey(task, generationMode) {
    if (task === 'fast') return 'fast';
    if (task === 'quality_stage_a') return generationMode === 'enhanced' ? 'enhancedSummary' : 'qualitySummary';
    if (task === 'quality_stage_b') return 'qualityKeywords';
    if (task === 'quality_keywords_only') return 'enhancedKeywords';
    if (task === 'merge') return 'merge';
    if (task === 'quality_stage_c') return 'aliases';
    return null;
}

function promptOverride(profile, value, task, generationMode) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) fail('invalid_prompt_overrides', 'promptOverrides 必须是对象。');
    const key = promptOverrideKey(task, generationMode);
    if (!key) return null;
    const text = value[key];
    if (text === undefined || text === null || (typeof text === 'string' && !text.trim())) return null;
    if (typeof text !== 'string') fail('invalid_prompt_override', `${key} 必须是字符串。`, { field: key });
    return { key, text };
}

function slotsFor(task, { source, drafts, eventKeywords }, schema) {
    if (task === 'merge') return {
        MEMORY_MERGE_SOURCE_JSON: json(source, 'source'),
        MEMORY_MERGE_OUTPUT_JSON_SCHEMA: JSON.stringify(schema, null, 2),
    };
    if (task === 'quality_stage_a') return {
        SUMMARY_SOURCE_JSON: json(source, 'source'),
        SUMMARY_DRAFT_OUTPUT_JSON_SCHEMA: JSON.stringify(schema, null, 2),
    };
    if (task === 'quality_stage_c') return {
        SUMMARY_DRAFTS_JSON: json(drafts, 'drafts'),
        INDEX_OUTPUT_JSON_SCHEMA: JSON.stringify(schema, null, 2),
    };
    if (['quality_stage_b', 'quality_keywords_only'].includes(task)) return {
        SUMMARY_DRAFTS_JSON: json(drafts, 'drafts'),
        AVAILABLE_EVENT_KEYWORDS_JSON: json(eventKeywords, 'eventKeywords'),
        INDEX_OUTPUT_JSON_SCHEMA: JSON.stringify(schema, null, 2),
    };
    return {
        SUMMARY_SOURCE_JSON: json(source, 'source'),
        AVAILABLE_EVENT_KEYWORDS_JSON: json(eventKeywords, 'eventKeywords'),
        SUMMARY_OUTPUT_JSON_SCHEMA: JSON.stringify(schema, null, 2),
    };
}

function twoStageOverride(promptOverrides, key) {
    const value = promptOverrides?.[key];
    if (value != null && typeof value !== 'string') fail('invalid_prompt_override', `${key} 必须是字符串。`, { field: key });
    return typeof value === 'string' && value.trim() ? value : getDefaultPromptText(key);
}

function twoStageWireSchema(schema) {
    const value = structuredClone(schema);
    const item = value.properties.indexes.items;
    item.required = [...new Set([...item.required, 'detailAliases'])];
    item.properties.detailAliases = {
        type: 'array',
        items: {
            type: 'object', additionalProperties: false,
            required: ['parentDetail', 'aliases'],
            properties: {
                parentDetail: { type: 'string', minLength: 1 },
                aliases: { type: 'array', minItems: 1, items: { type: 'string' } },
            },
        },
    };
    return value;
}

function singleGenerationWireSchema(schema) {
    const value = structuredClone(schema);
    const item = value.properties.memories.items;
    item.required = [...new Set([...item.required, 'detailAliases'])];
    item.properties.detailAliases = {
        type: 'array',
        items: {
            type: 'object', additionalProperties: false,
            required: ['parentDetail', 'aliases'],
            properties: {
                parentDetail: { type: 'string', minLength: 1 },
                aliases: { type: 'array', minItems: 1, items: { type: 'string' } },
            },
        },
    };
    return value;
}

function approvedPromptText(promptOverrides, key) {
    const value = promptOverrides?.[key];
    if (value != null && typeof value !== 'string') fail('invalid_prompt_override', `${key} 必须是字符串。`, { field: key });
    return typeof value === 'string' && value.trim() ? value : getDefaultPromptText(key);
}

function assembleApprovedSingleThreeTask({ task, source, drafts, eventKeywords, promptOverrides, profile, schema }) {
    const blocks = [];
    const add = (id, name, role, content, fixed = true, editorKey = null) => blocks.push({ id, name, role, content, fixed, ...(editorKey ? { editorKey } : {}) });
    const addEditable = (id, name, key) => {
        const custom = typeof promptOverrides?.[key] === 'string' && promptOverrides[key].trim();
        add(id, name, 'system', approvedPromptText(promptOverrides, key), !custom, key);
    };
    const customPrompts = normalizeCustomSummaryPrompts(promptOverrides?.customPrompts);
    const addCustomPrompts = position => customPrompts
        .filter(item => item.position === position)
        .forEach(item => add(`prompt.custom.${item.id}`, item.name, 'system', item.content, false));

    addCustomPrompts('before');
    if (task === 'fast') {
        addEditable('task.identity', 'AI 身份', 'fastIdentity');
        addCustomPrompts('after');
        addEditable('rules.task_order', '任务顺序', 'fastTaskOrder');
        add('content.input', '待处理故事资料', 'user', renderPromptTemplate(SINGLE_THREE_PROMPT_TEXT.single.sourceIntro, {
            SUMMARY_SOURCE_JSON: json(source, 'source'),
        }));
        addEditable('rules.summary', '总结规则', 'fastSummaryRules');
        addEditable('rules.fields', '字段填写规则', 'fastFieldRules');
        addEditable('rules.index_basis', '索引的组成与生成依据', 'fastIndexBasis');
        addEditable('rules.event_keywords', '事件词选择规则', 'fastEventRules');
        add('content.event_library', '本次可用事件词表', 'user', renderPromptTemplate(SINGLE_THREE_PROMPT_TEXT.single.eventLibraryIntro, {
            AVAILABLE_EVENT_KEYWORDS_JSON: json(eventKeywords, 'eventKeywords'),
        }));
        addEditable('rules.detail_keywords', '细节词规则与示例', 'fastDetailRules');
        addEditable('rules.detail_aliases', '检索简称规则与示例', 'fastAliasRules');
        add('format.contract', '格式要求与统一 JSON Schema', 'system', `${SINGLE_THREE_PROMPT_TEXT.single.formatRules}\n\n${JSON.stringify(singleGenerationWireSchema(schema), null, 2)}`);
        add('instruction.output', '输出指令', 'user', SINGLE_THREE_PROMPT_TEXT.single.outputInstruction);
    } else if (task === 'quality_stage_a') {
        addEditable('task.identity', 'AI 身份', 'enhancedSummaryIdentity');
        addCustomPrompts('after');
        add('content.input', '待处理故事资料', 'user', `${SINGLE_THREE_PROMPT_TEXT.threeSummary.sourceIntro}\n\n<summary_source encoding="json">\n${json(source, 'source')}\n</summary_source>`);
        addEditable('rules.summary', '总结规则', 'enhancedSummaryRules');
        addEditable('rules.fields', '字段填写规则', 'enhancedSummaryFields');
        add('format.contract', '格式要求与 JSON Schema', 'system', `${SINGLE_THREE_PROMPT_TEXT.threeSummary.formatRules}\n\n${JSON.stringify(schema, null, 2)}`);
        add('instruction.output', '输出指令', 'user', SINGLE_THREE_PROMPT_TEXT.threeSummary.outputInstruction);
    } else if (task === 'quality_keywords_only') {
        addEditable('task.identity', 'AI 身份', 'enhancedKeywordsIdentity');
        addCustomPrompts('after');
        add('content.drafts', '待处理事件摘要', 'user', renderPromptTemplate(SINGLE_THREE_PROMPT_TEXT.threeKeywords.draftsIntro, {
            SUMMARY_DRAFTS_JSON: json(drafts, 'drafts'),
        }));
        addEditable('rules.task_order', '关键词的组成与任务顺序', 'enhancedKeywordOrder');
        addEditable('rules.event_keywords', '事件词选择规则', 'enhancedEventRules');
        add('content.event_library', '本次可用事件词表', 'user', renderPromptTemplate(SINGLE_THREE_PROMPT_TEXT.threeKeywords.eventLibraryIntro, {
            AVAILABLE_EVENT_KEYWORDS_JSON: json(eventKeywords, 'eventKeywords'),
        }));
        addEditable('rules.detail_keywords', '细节词规则与示例', 'enhancedDetailRules');
        add('format.contract', '格式要求与 JSON Schema', 'system', `${SINGLE_THREE_PROMPT_TEXT.threeKeywords.formatRules}\n\n${JSON.stringify(schema, null, 2)}`);
        add('instruction.output', '输出指令', 'user', SINGLE_THREE_PROMPT_TEXT.threeKeywords.outputInstruction);
    } else {
        const aliasDrafts = drafts.map(item => ({
            draftId: item.draftId,
            body: item.body,
            detailKeywords: item.detailKeywords,
        }));
        addEditable('task.identity', 'AI 身份', 'aliasesIdentity');
        addCustomPrompts('after');
        add('content.drafts', '待处理细节词及对应事件摘要', 'user', renderPromptTemplate(SINGLE_THREE_PROMPT_TEXT.threeAliases.draftsIntro, {
            SUMMARY_DRAFTS_JSON: json(aliasDrafts, 'drafts'),
        }));
        addEditable('rules.task_order', '任务顺序', 'aliasesTaskOrder');
        addEditable('rules.detail_aliases', '检索简称规则与示例', 'aliasesRules');
        add('format.contract', '格式要求与 JSON Schema', 'system', `${SINGLE_THREE_PROMPT_TEXT.threeAliases.formatRules}\n\n${JSON.stringify(schema, null, 2)}`);
        add('instruction.output', '输出指令', 'user', SINGLE_THREE_PROMPT_TEXT.threeAliases.outputInstruction);
    }

    const messages = blocks.map(({ role, content }) => ({ role, content }));
    const customized = blocks.some(part => part.editorKey && !part.fixed);
    const materialKey = task === 'fast' ? 'fast' : task === 'quality_stage_a' ? 'enhancedSummary' : task === 'quality_keywords_only' ? 'enhancedKeywords' : 'aliases';
    return { task, messages, previewParts: blocks, jsonSchema: schema, meta: {
        profile: task,
        bundleRevision: 'single-three-approved-2026-09-20',
        moduleIds: blocks.map(item => item.id),
        moduleHashes: Object.fromEntries(blocks.map(item => [item.id, sha256Hex(item.content)])),
        systemMessageSources: blocks.map(item => ({ id: item.id, source: item.fixed ? 'plugin' : 'user' })),
        promptMaterial: {
            id: profile.promptMaterialId,
            key: materialKey,
            source: customized ? 'user' : 'plugin',
            hash: customized ? sha256Hex(blocks.filter(item => item.editorKey && !item.fixed).map(item => item.content).join('\n\n')) : null,
        },
        contractId: profile.contractId,
        contractHash: sha256Hex(blocks.find(item => item.id === 'format.contract').content),
        schemaId: profile.schemaId,
        schemaHash: sha256Hex(JSON.stringify(schema)),
        eventLibraryHash: ['fast', 'quality_keywords_only'].includes(task) ? sha256Hex(JSON.stringify(eventKeywords)) : null,
    } };
}

function assembleTwoStageTask({ task, source, drafts, eventKeywords, promptOverrides, profile, schema }) {
    const blocks = [];
    const add = (id, name, role, content, fixed = true, editorKey = null) => blocks.push({ id, name, role, content, fixed, ...(editorKey ? { editorKey } : {}) });
    const customPrompts = normalizeCustomSummaryPrompts(promptOverrides?.customPrompts);
    const addCustomPrompts = position => customPrompts
        .filter(item => item.position === position)
        .forEach(item => add(`prompt.custom.${item.id}`, item.name, 'system', item.content, false));
    const addEditable = (id, name, key) => {
        const custom = typeof promptOverrides?.[key] === 'string' && promptOverrides[key].trim();
        add(id, name, 'system', twoStageOverride(promptOverrides, key), !custom, key);
    };

    addCustomPrompts('before');
    if (task === 'quality_stage_a') {
        addEditable('task.identity', 'AI 身份', 'qualitySummaryIdentity');
        addCustomPrompts('after');
        add('content.input', '待处理故事资料', 'user', `${TWO_STAGE_PROMPT_TEXT.stageA.sourceIntro}\n\n<summary_source encoding="json">\n${json(source, 'source')}\n</summary_source>`);
        addEditable('rules.summary', '总结规则', 'qualitySummaryRules');
        addEditable('rules.fields', '字段填写规则', 'qualitySummaryFields');
        add('format.contract', '格式要求与 JSON Schema', 'system', `${TWO_STAGE_PROMPT_TEXT.stageA.formatRules}\n\n${JSON.stringify(schema, null, 2)}`);
        add('instruction.output', '输出指令', 'user', TWO_STAGE_PROMPT_TEXT.stageA.outputInstruction);
    } else {
        addEditable('task.identity', 'AI 身份', 'qualityKeywordsIdentity');
        addCustomPrompts('after');
        add('content.drafts', '待处理事件摘要', 'user', renderPromptTemplate(TWO_STAGE_PROMPT_TEXT.stageB.draftsIntro, {
            SUMMARY_DRAFTS_JSON: json(drafts, 'drafts'),
        }));
        addEditable('rules.index_order', '索引的组成与生成顺序', 'qualityIndexOrder');
        addEditable('rules.event_keywords', '事件词选择规则', 'qualityEventRules');
        add('content.event_library', '本次可用事件词表', 'user', renderPromptTemplate(TWO_STAGE_PROMPT_TEXT.stageB.eventLibraryIntro, {
            AVAILABLE_EVENT_KEYWORDS_JSON: json(eventKeywords, 'eventKeywords'),
        }));
        addEditable('rules.detail_keywords', '细节词规则与示例', 'qualityDetailRules');
        addEditable('rules.detail_aliases', '检索简称规则与示例', 'qualityAliasRules');
        add('format.contract', '格式要求与 JSON Schema', 'system', `${TWO_STAGE_PROMPT_TEXT.stageB.formatRules}\n\n${JSON.stringify(twoStageWireSchema(schema), null, 2)}`);
        add('instruction.output', '输出指令', 'user', TWO_STAGE_PROMPT_TEXT.stageB.outputInstruction);
    }

    const messages = blocks.map(({ role, content }) => ({ role, content }));
    const materialKey = task === 'quality_stage_a' ? 'qualitySummary' : 'qualityKeywords';
    const customized = blocks.some(part => part.editorKey && !part.fixed);
    return { task, messages, previewParts: blocks, jsonSchema: schema, meta: {
        profile: task,
        bundleRevision: 'two-stage-approved-2026-09-20',
        moduleIds: blocks.map(item => item.id),
        moduleHashes: Object.fromEntries(blocks.map(item => [item.id, sha256Hex(item.content)])),
        systemMessageSources: blocks.map(item => ({ id: item.id, source: item.fixed ? 'plugin' : 'user' })),
        promptMaterial: { id: profile.promptMaterialId, key: materialKey, source: customized ? 'user' : 'plugin', hash: null },
        contractId: profile.contractId,
        contractHash: sha256Hex(blocks.find(item => item.id === 'format.contract').content),
        schemaId: profile.schemaId,
        schemaHash: sha256Hex(JSON.stringify(schema)),
        eventLibraryHash: task === 'quality_stage_b' ? sha256Hex(JSON.stringify(eventKeywords)) : null,
    } };
}

export function assemblePromptTask({
    task,
    source,
    drafts,
    eventKeywords,
    promptOverrides = null,
    generationMode = null,
} = {}) {
    const profile = PROMPT_CALL_TASKS[task];
    if (!profile) fail('unknown_task', `未知 Prompt assembler task：${String(task)}`, { task });
    if (profile.contentSlotNames.includes('SUMMARY_SOURCE_JSON')) requireSource(source);
    if (profile.contentSlotNames.includes('SUMMARY_DRAFTS_JSON')) requireDrafts(drafts);
    if (profile.contentSlotNames.includes('AVAILABLE_EVENT_KEYWORDS_JSON')) validateEventKeywords(eventKeywords);

    const schema = getPromptSchema(profile.schemaId);
    if (task === 'quality_stage_b' || (task === 'quality_stage_a' && generationMode !== 'enhanced')) {
        return assembleTwoStageTask({ task, source, drafts, eventKeywords, promptOverrides, profile, schema });
    }
    if (task === 'fast' || task === 'quality_keywords_only' || task === 'quality_stage_c'
        || (task === 'quality_stage_a' && generationMode === 'enhanced')) {
        return assembleApprovedSingleThreeTask({ task, source, drafts, eventKeywords, promptOverrides, profile, schema });
    }
    const override = promptOverride(profile, promptOverrides, task, generationMode);
    const systems = override
        ? [
            ...profile.identityModuleIds.map(getPromptModule),
            { id: profile.promptMaterialId, content: override.text, sha256: sha256Hex(override.text) },
        ]
        : profile.systemModuleIds.map(getPromptModule);
    const contract = getPromptModule(profile.contractId);
    const blocks = [];
    const add = (id, name, role, content, fixed = true) => blocks.push({ id, name, role, content, fixed });
    const customPrompts = task === 'merge' ? [] : normalizeCustomSummaryPrompts(promptOverrides?.customPrompts);
    const addCustomPrompts = position => customPrompts
        .filter(item => item.position === position)
        .forEach(item => add(`prompt.custom.${item.id}`, item.name, 'system', item.content, false));
    addCustomPrompts('before');
    const identityKey = `${promptOverrideKey(task, generationMode)}Identity`;
    const identityOverride = promptOverrides?.[identityKey];
    if (identityOverride != null && typeof identityOverride !== 'string') fail('invalid_prompt_override', `${identityKey} 必须是字符串。`, { field: identityKey });
    const identity = typeof identityOverride === 'string' && identityOverride.trim() ? identityOverride : getDefaultPromptText(identityKey);
    add('task.identity', 'AI 身份', 'system', identity, !identityOverride);
    addCustomPrompts('after');
    const slots = slotsFor(task, { source, drafts, eventKeywords }, schema);
    // Extract declared slots before inserting user data so embedded tags cannot change structure.
    let ruleTemplate = contract.content;
    const dataTemplates = [];
    ruleTemplate = ruleTemplate.replace(/<(summary_source|summary_drafts|available_event_keywords|memory_merge_source) encoding="json">[\s\S]*?<\/\1>/g, value => { dataTemplates.push(value); return ''; });
    const renderSubset = template => renderPromptTemplate(template, Object.fromEntries([...template.matchAll(/{{([^{}]+)}}/g)].map(match => [match[1], slots[match[1]]])));
    add('content.input', '待处理内容', 'user', '以下仅为待处理资料。\n' + dataTemplates.map(renderSubset).join('\n\n'));
    ruleTemplate = ruleTemplate.replace(/{{(?:SUMMARY_DRAFT_OUTPUT_JSON_SCHEMA|INDEX_OUTPUT_JSON_SCHEMA|SUMMARY_OUTPUT_JSON_SCHEMA|MEMORY_MERGE_OUTPUT_JSON_SCHEMA)}}/g, '');
    let rules = systems.filter(item => !profile.identityModuleIds.includes(item.id) && task !== 'quality_stage_c').map(item => item.content).join('\n\n');
    if (!override && ['fast', 'quality_stage_b'].includes(task)) rules += `\n\n${getDefaultPromptText('aliases')}`;
    if (task !== 'quality_stage_c') add('rules.generation', '规则提示词', 'system', rules, !override);
    if (task === 'quality_stage_c') {
        const custom = typeof promptOverrides?.aliases === 'string' && promptOverrides.aliases.trim();
        add('prompt.aliases', '检索简称生成提示词', 'system', custom || getDefaultPromptText('aliases'), !custom);
    }
    const contextKey = `${promptOverrideKey(task, generationMode)}Context`;
    const contextOverride = promptOverrides?.[contextKey];
    if (contextOverride != null && typeof contextOverride !== 'string') fail('invalid_prompt_override', `${contextKey} 必须是字符串。`, { field: contextKey });
    const context = typeof contextOverride === 'string' && contextOverride.trim() ? contextOverride : getDefaultPromptText(contextKey);
    add('rules.context', '资料与处理要求', 'system', context, !contextOverride);
    const formatContract = splitPromptContract(ruleTemplate).fixed;
    if (formatContract) add('format.contract', '固定格式要求', 'system', formatContract);
    const freeze = task === 'quality_stage_c'
        ? '正文与关键词已冻结，只能生成 detailAliases。每个 draftId 恰好返回一项。'
        : ['fast', 'quality_stage_b'].includes(task) ? '先生成关键词，再冻结关键词，然后生成检索简称。禁止为生成简称增删或改写关键词与正文。' : '';
    const aliasContract = ['fast', 'quality_stage_b', 'quality_stage_c'].includes(task)
        ? 'parentDetail 必须原样引用该候选已有 detailKeywords；alias 为父词中的连续纯汉字片段，至少两字且不能等于完整父词。没有合法简称返回空数组。' : '';
    add('format.output', '输出结构', 'user', freeze + '\n' + aliasContract + '\n只返回符合以下 JSON Schema 的裸 JSON，不输出解释。\n' + JSON.stringify(schema, null, 2));
    const messages = blocks.map(({role,content}) => ({role,content}));


    return {task,messages,previewParts:blocks,jsonSchema:schema,meta:{
        profile:task,bundleRevision:'summary-ordered-v2-editable-identity-context',
        moduleIds:blocks.map(x=>x.id), moduleHashes:Object.fromEntries(blocks.map(x=>[x.id,sha256Hex(x.content)])),
        systemMessageSources:blocks.map(x=>({id:x.id,source:x.fixed?'plugin':'user'})),
        promptMaterial:{id:profile.promptMaterialId,key:promptOverrideKey(task,generationMode),source:override?'user':'plugin',hash:override?sha256Hex(override.text):null},
        contractId:contract.id,contractHash:contract.sha256,schemaId:profile.schemaId,schemaHash:sha256Hex(JSON.stringify(schema)),
        eventLibraryHash:profile.contentSlotNames.includes('AVAILABLE_EVENT_KEYWORDS_JSON')?sha256Hex(JSON.stringify(eventKeywords)):null,
    }};
}
export const PROMPT_ASSEMBLER_TASKS=Object.freeze(Object.keys(PROMPT_CALL_TASKS));
