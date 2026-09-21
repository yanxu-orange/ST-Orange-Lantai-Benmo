export const FEATURE_IDS = Object.freeze({
    eventMemory: 'eventMemory',
    calendar: 'calendar',
    promptModules: 'promptModules',
    contentCollection: 'contentCollection',
    longTermTracking: 'longTermTracking',
});

export const FEATURE_DEFINITIONS = Object.freeze([
    { id: FEATURE_IDS.eventMemory, label: '事件记忆', domain: 'memory' },
    { id: FEATURE_IDS.calendar, label: '日历', domain: 'time' },
    { id: FEATURE_IDS.promptModules, label: '提示词注入', domain: 'modules', lifecycle: 'prompt' },
    { id: FEATURE_IDS.contentCollection, label: '内容收集', domain: 'modules', lifecycle: 'collect' },
    { id: FEATURE_IDS.longTermTracking, label: '长期追踪', domain: 'modules', lifecycle: 'sync' },
]);

const ROUTE_FEATURES = Object.freeze({
    'memory.library': FEATURE_IDS.eventMemory,
    'memory.create': FEATURE_IDS.eventMemory,
    'memory.summary.manual': FEATURE_IDS.eventMemory,
    'memory.summary.auto': FEATURE_IDS.eventMemory,
    'memory.summary.coverage': FEATURE_IDS.eventMemory,
    'memory.summary.review': FEATURE_IDS.eventMemory,
    'memory.record': FEATURE_IDS.eventMemory,
    'memory.keywords.review': FEATURE_IDS.eventMemory,
    'memory.merge.source': FEATURE_IDS.eventMemory,
    'memory.merge.body': FEATURE_IDS.eventMemory,
    'memory.merge.final': FEATURE_IDS.eventMemory,
    'recall.monitor': FEATURE_IDS.eventMemory,
    'recall.settings': FEATURE_IDS.eventMemory,
    'settings.regex': FEATURE_IDS.eventMemory,
    'settings.summary': FEATURE_IDS.eventMemory,
    'settings.summary.prompt': FEATURE_IDS.eventMemory,
    'settings.summary.events': FEATURE_IDS.eventMemory,
    'settings.summary.cleaning': FEATURE_IDS.eventMemory,
    'time.story': FEATURE_IDS.calendar,
    'time.anniversaries': FEATURE_IDS.calendar,
    'time.calendar': FEATURE_IDS.calendar,
    'time.schedule': FEATURE_IDS.calendar,
    'time.holidays': FEATURE_IDS.calendar,
    'settings.time.story': FEATURE_IDS.calendar,
    'settings.time.holiday': FEATURE_IDS.calendar,
    'settings.special-date-defaults': FEATURE_IDS.calendar,
});

const LIFECYCLE_FEATURES = Object.freeze({
    prompt: FEATURE_IDS.promptModules,
    collect: FEATURE_IDS.contentCollection,
    sync: FEATURE_IDS.longTermTracking,
});

export function createFeatureSnapshot(globalSettings = {}, chatData = null) {
    const globallyEnabled = globalSettings?.plugin?.enabled !== false;
    const chatEnabled = chatData ? chatData?.plugin?.enabled !== false : true;
    const pluginEnabled = globallyEnabled && chatEnabled;
    const features = Object.fromEntries(FEATURE_DEFINITIONS.map(feature => [
        feature.id,
        pluginEnabled && globalSettings?.plugin?.features?.[feature.id] !== false,
    ]));
    return { globallyEnabled, chatEnabled, pluginEnabled, features, hasChat: Boolean(chatData) };
}

export function isFeatureEnabled(snapshot, featureId) {
    return snapshot?.features?.[featureId] === true;
}

export function isDomainEnabled(snapshot, domainId) {
    if (domainId === 'settings') return true;
    if (domainId === 'memory') return isFeatureEnabled(snapshot, FEATURE_IDS.eventMemory);
    if (domainId === 'time') return isFeatureEnabled(snapshot, FEATURE_IDS.calendar);
    if (domainId === 'modules') return [FEATURE_IDS.promptModules, FEATURE_IDS.contentCollection, FEATURE_IDS.longTermTracking]
        .some(id => isFeatureEnabled(snapshot, id));
    return false;
}

export function isRouteEnabled(snapshot, routeId) {
    if (routeId === 'settings.index' || routeId === 'settings.ai' || routeId === 'settings.features') return true;
    if (routeId === 'modules.index' || routeId === 'modules.record' || routeId === 'modules.result') {
        return isDomainEnabled(snapshot, 'modules');
    }
    const featureId = ROUTE_FEATURES[routeId];
    return featureId ? isFeatureEnabled(snapshot, featureId) : true;
}

export function featureForLifecycle(lifecycle) {
    return LIFECYCLE_FEATURES[lifecycle] ?? null;
}

export function isModuleLifecycleEnabled(snapshot, lifecycle) {
    const featureId = featureForLifecycle(lifecycle);
    return featureId ? isFeatureEnabled(snapshot, featureId) : false;
}

export function filterModulesByFeature(snapshot, modules = []) {
    return (Array.isArray(modules) ? modules : []).filter(module => isModuleLifecycleEnabled(snapshot, module?.lifecycle));
}
