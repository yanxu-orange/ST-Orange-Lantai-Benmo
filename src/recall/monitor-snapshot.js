function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function list(value) {
    return Array.isArray(value) ? value : [];
}

export function createRecallMonitorRecord({
    result, promptHistory = null, generationType = null, at = null, channels = {}, status = 'applied', message = '',
} = {}) {
    if (!record(result?.matching) || !record(result?.estimated) || !record(result?.prompts)) {
        throw new TypeError('formal recall result is required');
    }
    return {
        matching: { ...result.matching, promptHistory, generationType, at },
        estimated: { ...result.estimated, generationType, at },
        actual: {
            status: status === 'failed' ? 'failed' : 'applied',
            ordinary: list(result.estimated.ordinary),
            anniversary: list(result.estimated.anniversary),
            anniversaryReminders: list(result.estimated.anniversaryReminders),
            holidayReminders: list(result.estimated.holidayReminders),
            ordering: result.matching.ordering ?? null,
            routing: result.matching.routing ?? null,
            generationType,
            at,
            channels,
            prompts: result.prompts,
            message,
        },
    };
}

export function normalizeMonitorSnapshot(monitor) {
    const root = record(monitor) ?? {};
    const matching = record(root.matching);
    const estimated = record(root.estimated);
    const actual = record(root.actual);
    if (!matching && !estimated && !actual) {
        return { empty: true, matching: null, estimated: null, actual: null, generationType: null, at: null };
    }
    return {
        empty: false,
        generationType: actual?.generationType ?? estimated?.generationType ?? matching?.generationType ?? null,
        at: actual?.at ?? estimated?.at ?? matching?.at ?? null,
        matching: matching ? {
            input: String(matching.input ?? ''),
            recentTexts: list(matching.recentTexts).map(value => String(value ?? '')),
            recentHistory: list(matching.recentHistory),
            storyTime: matching.storyTime ? String(matching.storyTime) : null,
            cleaning: record(matching.cleaning),
            routing: record(matching.routing),
            ordering: record(matching.ordering),
            ...(Object.hasOwn(matching, 'aliasDiagnostics')
                ? { aliasDiagnostics: list(matching.aliasDiagnostics) }
                : {}),
            promptHistory: record(matching.promptHistory),
        } : null,
        estimated: estimated ? {
            storyTime: record(estimated.storyTime),
            ordinary: list(estimated.ordinary),
            candidates: list(estimated.candidates),
            anniversary: list(estimated.anniversary),
            anniversaryReminders: list(estimated.anniversaryReminders),
            holidayReminders: list(estimated.holidayReminders),
            excluded: list(estimated.excluded),
        } : null,
        actual: actual ? {
            status: actual.status === 'failed' ? 'failed' : 'applied',
            ordinary: list(actual.ordinary),
            anniversary: list(actual.anniversary),
            anniversaryReminders: list(actual.anniversaryReminders),
            holidayReminders: list(actual.holidayReminders),
            ordering: record(actual.ordering),
            routing: record(actual.routing),
            channels: {
                storyTime: {
                    present: Boolean(actual.channels?.storyTime?.present),
                    depth: Number.isFinite(Number(actual.channels?.storyTime?.depth)) ? Number(actual.channels.storyTime.depth) : null,
                },
                memory: {
                    present: Boolean(actual.channels?.memory?.present),
                    depth: Number.isFinite(Number(actual.channels?.memory?.depth)) ? Number(actual.channels.memory.depth) : null,
                },
                specialDate: {
                    present: Boolean(actual.channels?.specialDate?.present),
                    depth: Number.isFinite(Number(actual.channels?.specialDate?.depth)) ? Number(actual.channels.specialDate.depth) : null,
                },
                holiday: {
                    present: Boolean(actual.channels?.holiday?.present),
                    depth: Number.isFinite(Number(actual.channels?.holiday?.depth)) ? Number(actual.channels.holiday.depth) : null,
                },
            },
            prompts: {
                storyTime: String(actual.prompts?.storyTime ?? ''),
                memory: String(actual.prompts?.memory ?? ''),
                specialDate: String(actual.prompts?.specialDate ?? ''),
                holiday: String(actual.prompts?.holiday ?? ''),
            },
            message: actual.message ? String(actual.message) : '',
        } : null,
    };
}
