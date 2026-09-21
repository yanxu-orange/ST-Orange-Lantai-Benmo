import { assemblePromptTask } from '../prompts/prompt-assembler.js';
import { PROMPT_TEXT_DEFINITIONS } from '../prompts/prompt-customization.js';

// Reuse the actual assembler, without reading chat content or requesting AI.
// Input is deliberately illustrative; fixed task/rule/format text is real.
export function summaryPromptStructure(summary, key) {
    const definition = PROMPT_TEXT_DEFINITIONS[key];
    if (!definition) return [];
    const assembled = assemblePromptTask({
        task: definition.task,
        generationMode: summary.generationMode,
        promptOverrides: summary.promptOverrides,
        source: '所选楼层的清洗后内容',
        drafts: [{ draftId: 'input-placeholder', body: '上一阶段已生成并冻结的正文与关键词' }],
        eventKeywords: [],
    });
    return assembled.previewParts.map(part => ({ ...part,
        content: ['content.input', 'content.drafts', 'content.event_library'].includes(part.id)
            ? (['quality_stage_a', 'fast', 'merge'].includes(definition.task)
                ? '执行时填入所选来源的实际内容。'
                : part.id === 'content.event_library' ? '执行时填入当前启用的事件词表。' : '执行时填入第一轮已经完成的事件摘要。')
            : part.content,
        readOnly: !part.editorKey && !part.id.startsWith('prompt.custom.') && !['task.identity', 'rules.generation', 'rules.context', 'prompt.aliases'].includes(part.id),
    }));
}
