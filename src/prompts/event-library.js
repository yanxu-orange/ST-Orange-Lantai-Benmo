import { EVENT_KEYWORDS_V0_2 } from './event-keywords-v0.2.js';

function cloneLibrary(library) {
    return library.map(item => ({ name: item.name, definition: item.definition, ...(item.enabled === false ? { enabled: false } : {}) }));
}

export function normalizeEventLibrary(value) {
    if (!Array.isArray(value)) throw new TypeError('事件词库必须是数组。');
    const names = new Set();
    return value.map((item, index) => {
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        const definition = typeof item?.definition === 'string' ? item.definition.trim() : '';
        if (!name || !definition) throw new Error(`第 ${index + 1} 个事件词需要填写名称和解释。`);
        if (names.has(name)) throw new Error(`事件词名称重复：${name}`);
        names.add(name);
        return { name, definition, ...(item.enabled === false ? { enabled: false } : {}) };
    });
}

export function normalizeEventLibraryOverride(value) {
    return value === null || value === undefined ? null : normalizeEventLibrary(value);
}

export function effectiveEventLibrary(summary) {
    return configuredEventLibrary(summary).filter(item => item.enabled !== false).map(({ name, definition }) => ({ name, definition }));
}

export function configuredEventLibrary(summary) {
    const override = normalizeEventLibraryOverride(summary?.eventLibraryOverride);
    return override === null ? cloneLibrary(EVENT_KEYWORDS_V0_2) : cloneLibrary(override);
}

export function eventLibraryStatus(summary) {
    const custom = summary?.eventLibraryOverride !== null && summary?.eventLibraryOverride !== undefined;
    return { source: custom ? 'custom' : 'default', count: effectiveEventLibrary(summary).length };
}

export function defaultEventLibrary() {
    return cloneLibrary(EVENT_KEYWORDS_V0_2);
}
