export const ROUTE_REGISTRY = Object.freeze({
    'memory.library': { id: 'memory.library', domain: 'memory', title: '记忆库', requiresChat: true },
    'memory.create': { id: 'memory.create', domain: 'memory', title: '添加记忆', requiresChat: true },
    'memory.summary.manual': { id: 'memory.summary.manual', domain: 'memory', title: '手动总结', requiresChat: true, fullScreen: true },
    'memory.summary.auto': { id: 'memory.summary.auto', domain: 'memory', title: '自动总结', requiresChat: true, fullScreen: true },
    'memory.summary.coverage': { id: 'memory.summary.coverage', domain: 'memory', title: '总结范围', requiresChat: true, fullScreen: true },
    'memory.summary.review': { id: 'memory.summary.review', domain: 'memory', title: '检查总结结果', requiresChat: true, fullScreen: true },
    'memory.record': { id: 'memory.record', domain: 'memory', title: '记忆', requiresChat: true, fullScreen: true },
    'memory.keywords.review': { id: 'memory.keywords.review', domain: 'memory', title: '检查关键词与检索简称', requiresChat: true, fullScreen: true },
    'memory.merge.source': { id: 'memory.merge.source', domain: 'memory', title: '选择正文来源', requiresChat: true, fullScreen: true },
    'memory.merge.body': { id: 'memory.merge.body', domain: 'memory', title: '检查融合正文', requiresChat: true, fullScreen: true },
    'memory.merge.final': { id: 'memory.merge.final', domain: 'memory', title: '确认合并', requiresChat: true, fullScreen: true },
    'recall.monitor': { id: 'recall.monitor', domain: 'memory', title: '召回监控', requiresChat: true },
    'modules.index': { id: 'modules.index', domain: 'modules', title: '模块', requiresChat: true },
    'modules.record': { id: 'modules.record', domain: 'modules', title: '模块', requiresChat: true, fullScreen: true },
    'modules.result': { id: 'modules.result', domain: 'modules', title: '模块结果', requiresChat: true, fullScreen: true },
    'recall.settings': { id: 'recall.settings', domain: 'memory', title: '召回设置', requiresChat: false, fullScreen: true },
    'time.story': { id: 'time.story', domain: 'time', title: '当前故事日期', requiresChat: true, fullScreen: true },
    'time.anniversaries': { id: 'time.anniversaries', domain: 'time', title: '纪念日', requiresChat: true, fullScreen: true },
    'time.calendar': { id: 'time.calendar', domain: 'time', title: '日历', requiresChat: true },
    'time.schedule': { id: 'time.schedule', domain: 'time', title: '日程', requiresChat: true, fullScreen: true },
    'time.holidays': { id: 'time.holidays', domain: 'time', title: '节日与习俗', requiresChat: true, fullScreen: true },
    'settings.index': { id: 'settings.index', domain: 'settings', title: '设置', requiresChat: false },
    'settings.features': { id: 'settings.features', domain: 'settings', title: '功能管理', requiresChat: false, fullScreen: true },
    'settings.ai': { id: 'settings.ai', domain: 'settings', title: 'API 设置', requiresChat: false, fullScreen: true },
    'settings.regex': { id: 'settings.regex', domain: 'memory', title: '召回文本清洗', requiresChat: false, fullScreen: true },
    'settings.time.story': { id: 'settings.time.story', domain: 'time', title: '当前日期提醒', requiresChat: false, fullScreen: true },
    'settings.time.holiday': { id: 'settings.time.holiday', domain: 'time', title: '节日习俗提醒', requiresChat: false, fullScreen: true },
    'settings.special-date-defaults': { id: 'settings.special-date-defaults', domain: 'time', title: '纪念日提醒', requiresChat: false, fullScreen: true },
    'settings.summary': { id: 'settings.summary', domain: 'memory', title: '事件总结设置', requiresChat: false, fullScreen: true },
    'settings.summary.prompt': { id: 'settings.summary.prompt', domain: 'memory', title: '总结提示词', requiresChat: false, fullScreen: true },
    'settings.summary.events': { id: 'settings.summary.events', domain: 'memory', title: '事件词库', requiresChat: false, fullScreen: true },
    'settings.summary.cleaning': { id: 'settings.summary.cleaning', domain: 'memory', title: '总结文本清洗', requiresChat: false, fullScreen: true },
});

export const DOMAIN_NAVIGATION = Object.freeze([
    { id: 'memory', label: '记忆', title: '记忆管理', defaultRoute: 'memory.library' },
    { id: 'time', label: '时间', title: '时间管理', defaultRoute: 'time.calendar' },
    { id: 'modules', label: '模块', title: '模块管理', defaultRoute: 'modules.index' },
    { id: 'settings', label: '设置', title: '设置', defaultRoute: 'settings.index' },
]);

export const TIME_WORKFACE_NAVIGATION = Object.freeze([
    { routeId: 'time.calendar', label: '日历' },
]);

export function getRoute(routeId) {
    const route = ROUTE_REGISTRY[routeId];
    if (!route) throw new Error(`未知页面路由：${routeId}`);
    return route;
}

export function getDomain(domainId) {
    const domain = DOMAIN_NAVIGATION.find(item => item.id === domainId);
    if (!domain) throw new Error(`未知一级领域：${domainId}`);
    return domain;
}

export function createRouter({ initialRoute = 'memory.library' } = {}) {
    getRoute(initialRoute);
    let current = { routeId: initialRoute, returnTo: null };
    const stack = [];
    return {
        current: () => ({ ...current }),
        go(routeId, { returnTo = current.routeId, replace = false } = {}) {
            getRoute(routeId);
            if (!replace) stack.push({ ...current });
            current = { routeId, returnTo };
            return this.current();
        },
        switchDomain(domainId) {
            const domain = getDomain(domainId);
            stack.length = 0;
            current = { routeId: domain.defaultRoute, returnTo: null };
            return this.current();
        },
        activateDomain(domainId) {
            const domain = getDomain(domainId);
            const route = getRoute(current.routeId);
            if (route.domain !== domainId) return this.switchDomain(domainId);
            if (current.routeId === domain.defaultRoute) return this.current();
            return this.switchDomain(domainId);
        },
        back(fallback = 'memory.library') {
            const previous = stack.pop();
            if (previous) current = previous;
            else if (current.returnTo && ROUTE_REGISTRY[current.returnTo]) current = { routeId: current.returnTo, returnTo: null };
            else current = { routeId: fallback, returnTo: null };
            return this.current();
        },
        reset(routeId = initialRoute) {
            getRoute(routeId);
            stack.length = 0;
            current = { routeId, returnTo: null };
            return this.current();
        },
    };
}
