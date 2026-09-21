export const STORY_STATUS_OUTER_TAG = 'scene';
export const STORY_STATUS_BAR_MODULE_ID = 'builtin-story-status-bar';
export const STORY_STATUS_TIME_MODES = Object.freeze({
    modern: 'modern',
    ancient: 'ancient',
    fictional: 'fictional',
});

function timeLineInstruction(mode) {
    if (mode === STORY_STATUS_TIME_MODES.ancient) {
        return '{{使用当前故事已有的纪年、日期与时辰，写出本轮起止时间}}';
    }
    if (mode === STORY_STATUS_TIME_MODES.fictional) {
        return '{{使用当前世界观已有的历法、纪年与计时方式，写出本轮起止时间}}';
    }
    return '{{YYYY年MM月DD日 星期X HH:MM-HH:MM}}';
}

export function storyStatusBarInstruction({ mode = STORY_STATUS_TIME_MODES.modern } = {}) {
    const timeInstruction = timeLineInstruction(mode);
    return [
        '<状态栏>',
        '在<content>正文之前生成本轮状态栏，每一轮新正文都需更新。',
        '',
        '状态栏包含：',
        '章节号与符合本轮剧情的章节标题；',
        '本轮故事发生的起止时间；',
        '本轮故事涉及的全部完整地点；',
        '本轮天气。',
        '',
        '格式：',
        `<${STORY_STATUS_OUTER_TAG}>`,
        '{{第X章}} · {{符合本轮剧情的章节标题，不超过8个字}}',
        timeInstruction,
        '{{本轮全部完整地点}}',
        '{{天气}}',
        `<\/${STORY_STATUS_OUTER_TAG}>`,
        '',
        '每轮新正文，章节号在上一章基础上+1。',
        '</状态栏>',
    ].join('\n');
}

export function createStoryStatusBarPreset() {
    return {
        id: STORY_STATUS_BAR_MODULE_ID,
        name: '剧情状态栏',
        enabled: false,
        content: storyStatusBarInstruction(),
        scope: 'global',
        role: 'system',
        depth: 0,
        lifecycle: 'prompt',
        captureTag: null,
        createdAt: '2026-09-13T00:00:00.000Z',
        updatedAt: '2026-09-13T00:00:00.000Z',
    };
}
