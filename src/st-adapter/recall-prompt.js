export const MEMORY_PROMPT_KEY = 'tkm_memory_context';
export const SPECIAL_DATE_PROMPT_KEY = 'tkm_special_date_reminder';
export const HOLIDAY_PROMPT_KEY = 'tkm_holiday_context';
export const STORY_TIME_PROMPT_KEY = 'tkm_story_time_context';

const IN_CHAT = 1;
const SYSTEM_ROLE = 0;

function requirePromptApi(context) {
    if (typeof context?.setExtensionPrompt !== 'function') {
        throw new Error('SillyTavern setExtensionPrompt() is unavailable.');
    }
}

function write(context, key, value, depth) {
    requirePromptApi(context);
    context.setExtensionPrompt(key, String(value ?? ''), IN_CHAT, depth, false, SYSTEM_ROLE);
}

function normalizeDepth(value) {
    return Number.isInteger(Number(value)) ? Math.max(0, Math.min(10000, Number(value))) : 9999;
}

export function writeRecallPrompts(context, {
    storyTime = '', memory = '', specialDate = '', holiday = '',
    depths = { storyTime: 9999, memory: 9999, specialDate: 9999, holiday: 9999 },
} = {}) {
    const normalizedDepths = {
        storyTime: normalizeDepth(depths?.storyTime ?? depths?.specialDate),
        memory: normalizeDepth(depths?.memory),
        specialDate: normalizeDepth(depths?.specialDate),
        holiday: normalizeDepth(depths?.holiday ?? depths?.specialDate),
    };
    write(context, STORY_TIME_PROMPT_KEY, storyTime, normalizedDepths.storyTime);
    write(context, MEMORY_PROMPT_KEY, memory, normalizedDepths.memory);
    write(context, SPECIAL_DATE_PROMPT_KEY, specialDate, normalizedDepths.specialDate);
    write(context, HOLIDAY_PROMPT_KEY, holiday, normalizedDepths.holiday);
    return {
        storyTime: { present: Boolean(storyTime), depth: normalizedDepths.storyTime },
        memory: { present: Boolean(memory), depth: normalizedDepths.memory },
        specialDate: { present: Boolean(specialDate), depth: normalizedDepths.specialDate },
        holiday: { present: Boolean(holiday), depth: normalizedDepths.holiday },
    };
}

export function clearRecallPrompts(context, depths) {
    return writeRecallPrompts(context, { memory: '', specialDate: '', holiday: '', depths });
}

export function installRecallPromptLifecycle(context) {
    if (!context?.eventSource || typeof context.eventSource.on !== 'function') return false;
    const clear = () => {
        try { clearRecallPrompts(context); } catch { /* The next interceptor clears again. */ }
    };
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
        const eventType = context.eventTypes?.[name];
        if (eventType) context.eventSource.on(eventType, clear);
    }
    return true;
}
