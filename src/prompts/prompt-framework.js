function freezeMaterial(id, zone, definition) {
    return Object.freeze({ id, zone, ...definition });
}

export const PROMPT_MATERIAL_ZONES = Object.freeze({
    jailbreak: Object.freeze({
        id: 'jailbreak',
        label: '破限区',
        materials: Object.freeze({
            summaryAiIdentity: freezeMaterial('jailbreak.summary_ai_identity', 'jailbreak', {
                moduleIds: Object.freeze(['summary.a1.task_identity']),
                editable: true,
            }),
            keywordAiIdentity: freezeMaterial('jailbreak.keyword_ai_identity', 'jailbreak', {
                moduleIds: Object.freeze(['index.b1.scope']),
                editable: true,
            }),
            mergeAiIdentity: freezeMaterial('jailbreak.merge_ai_identity', 'jailbreak', {
                moduleIds: Object.freeze(['merge.m1.identity']),
                editable: true,
            }),
        }),
    }),
    summaryContent: Object.freeze({
        id: 'summary_content',
        label: '总结内容区',
        materials: Object.freeze({
            cleanedSource: freezeMaterial('content.cleaned_source', 'summary_content', {
                slotNames: Object.freeze(['SUMMARY_SOURCE_JSON']),
                editable: false,
            }),
            frozenDrafts: freezeMaterial('content.frozen_drafts', 'summary_content', {
                slotNames: Object.freeze(['SUMMARY_DRAFTS_JSON']),
                editable: false,
            }),
            eventLibrary: freezeMaterial('content.event_library', 'summary_content', {
                slotNames: Object.freeze(['AVAILABLE_EVENT_KEYWORDS_JSON']),
                editable: false,
            }),
            mergeSource: freezeMaterial('content.merge_source', 'summary_content', {
                slotNames: Object.freeze(['MEMORY_MERGE_SOURCE_JSON']),
                editable: false,
            }),
        }),
    }),
    prompts: Object.freeze({
        id: 'prompts',
        label: '提示词区',
        materials: Object.freeze({
            aliases: freezeMaterial('prompt.aliases', 'prompts', { moduleIds: Object.freeze(['alias.c1.frozen_keywords']), editable: true }),
            qualitySummary: freezeMaterial('prompt.quality_summary', 'prompts', {
                moduleIds: Object.freeze([
                    'summary.a2.fact_boundary',
                    'summary.a3.event_boundary',
                    'summary.a4.memory_fields',
                ]),
                editable: true,
                editableAsWhole: true,
                derivedFrom: null,
            }),
            qualityKeywords: freezeMaterial('prompt.quality_keywords', 'prompts', {
                moduleIds: Object.freeze([
                    'index.b2.event_keywords',
                    'index.b3.detail_candidates',
                    'index.b4.detail_selection',
                    'index.b5.cross_field',
                ]),
                editable: true,
                editableAsWhole: true,
                derivedFrom: null,
            }),
            fast: freezeMaterial('prompt.fast', 'prompts', {
                // The default is stored in legacy modules so existing messages stay byte-for-byte
                // stable. This explicit list is the Fast prompt's own material definition; it is
                // never derived at runtime from the two quality prompt definitions.
                moduleIds: Object.freeze([
                    'summary.a2.fact_boundary',
                    'summary.a3.event_boundary',
                    'summary.a4.memory_fields',
                    'index.b2.event_keywords',
                    'index.b3.detail_candidates',
                    'index.b4.detail_selection',
                    'index.b5.cross_field',
                ]),
                editable: true,
                editableAsWhole: true,
                derivedFrom: null,
            }),
            merge: freezeMaterial('prompt.merge', 'prompts', {
                moduleIds: Object.freeze(['merge.m2.content']),
                editable: true,
                editableAsWhole: true,
                derivedFrom: null,
            }),
        }),
    }),
    format: Object.freeze({
        id: 'format',
        label: '格式区',
        materials: Object.freeze({
            aliases: freezeMaterial('format.aliases', 'format', { contractId: 'contract.quality_c', schemaId: 'schema.quality_c', editable: false }),
            keywordsOnly: freezeMaterial('format.keywords_only', 'format', { contractId: 'contract.quality_b', schemaId: 'schema.quality_keywords_only', editable: false }),
            qualitySummary: freezeMaterial('format.quality_summary', 'format', {
                contractId: 'contract.quality_a',
                schemaId: 'schema.quality_a',
                editable: false,
            }),
            qualityKeywords: freezeMaterial('format.quality_keywords', 'format', {
                contractId: 'contract.quality_b',
                schemaId: 'schema.quality_b',
                editable: false,
            }),
            fast: freezeMaterial('format.fast', 'format', {
                contractId: 'contract.fast_f1',
                schemaId: 'schema.fast',
                editable: false,
            }),
            merge: freezeMaterial('format.merge', 'format', {
                contractId: 'contract.merge',
                schemaId: 'schema.merge',
                editable: false,
            }),
        }),
    }),
});

const MATERIALS_BY_ID = Object.freeze(Object.fromEntries(
    Object.values(PROMPT_MATERIAL_ZONES).flatMap(zone => (
        Object.values(zone.materials).map(material => [material.id, material])
    )),
));

function material(id) {
    const result = MATERIALS_BY_ID[id];
    if (!result) throw new Error(`Unknown prompt material: ${id}`);
    return result;
}

function callTask(id, assembly, systemModuleIds = null) {
    const materials = assembly.map(material);
    const format = materials.find(item => item.zone === 'format');
    if (!format) throw new Error(`Prompt call task has no format material: ${id}`);
    return Object.freeze({
        id,
        assembly: Object.freeze([...assembly]),
        systemModuleIds: Object.freeze(systemModuleIds ?? materials.flatMap(item => item.moduleIds ?? [])),
        contentSlotNames: Object.freeze(materials.flatMap(item => item.slotNames ?? [])),
        contractId: format.contractId,
        schemaId: format.schemaId,
        promptMaterialId: materials.find(item => item.zone === 'prompts')?.id ?? null,
        identityModuleIds: Object.freeze(materials.filter(item => item.zone === 'jailbreak').flatMap(item => item.moduleIds ?? [])),
    });
}

export const PROMPT_CALL_TASKS = Object.freeze({
    quality_stage_a: callTask('quality_stage_a', [
        'jailbreak.summary_ai_identity',
        'content.cleaned_source',
        'prompt.quality_summary',
        'format.quality_summary',
    ]),
    quality_stage_b: callTask('quality_stage_b', [
        'jailbreak.keyword_ai_identity',
        'content.frozen_drafts',
        'content.event_library',
        'prompt.quality_keywords',
        'format.quality_keywords',
    ]),
    quality_keywords_only: callTask('quality_keywords_only', [
        'jailbreak.keyword_ai_identity', 'content.frozen_drafts', 'content.event_library',
        'prompt.quality_keywords', 'format.keywords_only',
    ]),
    quality_stage_c: callTask('quality_stage_c', [
        'content.frozen_drafts', 'prompt.aliases', 'format.aliases',
    ]),
    fast: callTask('fast', [
        'jailbreak.summary_ai_identity',
        'content.cleaned_source',
        'jailbreak.keyword_ai_identity',
        'content.event_library',
        'prompt.fast',
        'format.fast',
    ], [
        'summary.a1.task_identity',
        'summary.a2.fact_boundary',
        'summary.a3.event_boundary',
        'summary.a4.memory_fields',
        'index.b1.scope',
        'index.b2.event_keywords',
        'index.b3.detail_candidates',
        'index.b4.detail_selection',
        'index.b5.cross_field',
    ]),
    merge: callTask('merge', [
        'jailbreak.merge_ai_identity',
        'content.merge_source',
        'prompt.merge',
        'format.merge',
    ]),
});

export const PROMPT_MODE_ASSEMBLY_PLANS = Object.freeze({
    quality: Object.freeze(['quality_stage_a', 'quality_stage_b']),
    enhanced: Object.freeze(['quality_stage_a', 'quality_keywords_only', 'quality_stage_c']),
    fast: Object.freeze(['fast']),
});

export function getPromptCallTask(id) {
    const task = PROMPT_CALL_TASKS[id];
    if (!task) throw new Error(`Unknown prompt call task: ${id}`);
    return task;
}

export function getPromptMaterial(id) {
    return material(id);
}
