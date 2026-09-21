import { DEFAULT_GLOBAL_SETTINGS } from '../constants.js';
import { formatStoryTimeValue, parseStoryTimePoint } from '../domain/story-time.js';

export const STORY_DATE_PLACEHOLDER = '{当前故事日期}';

export function storyTimePromptContext(data, {
    enabled = false,
    template = DEFAULT_GLOBAL_SETTINGS.templates.storyTimeInstruction,
} = {}) {
    const current = data?.storyTime?.current;
    const parsed = current?.value ? current : parseStoryTimePoint(current?.raw, { fictionalCalendar: data?.storyTime?.fictionalCalendar ?? {} });
    const value = parsed?.value;
    const raw = value ? formatStoryTimeValue({ ...value, hour: null, minute: null, shichen: null, precision: value.day !== null ? 'day' : (value.month !== null ? 'month' : 'year') }) : String(current?.raw ?? '').trim();
    if (!enabled || !raw) return { prompt: '', item: null };
    const source = String(template ?? '').trim() || DEFAULT_GLOBAL_SETTINGS.templates.storyTimeInstruction;
    const prompt = source.replaceAll(STORY_DATE_PLACEHOLDER, raw).trim();
    if (!prompt) return { prompt: '', item: null };
    return {
        prompt,
        item: {
            raw,
            source: current?.source ?? null,
        },
    };
}
