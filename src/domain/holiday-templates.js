import { modernCalendarOverlay } from './modern-calendar-overlay.js';

const PACKS = Object.freeze([
    { id: 'traditional-cn', name: '中国传统节日', modern: true, fictional: true, defaultSelected: true },
    { id: 'solar-terms', name: '二十四节气', modern: true, fictional: false, defaultSelected: true },
    { id: 'modern-common', name: '现代常用节日', modern: true, fictional: false, defaultSelected: true },
    { id: 'western-common', name: '西方常见节日', modern: true, fictional: false, defaultSelected: false },
]);

const lunar = (id, name, month, day, fact) => ({ id, packId: 'traditional-cn', name, rule: { type: 'lunar', month, day }, fact });
const fixed = (id, packId, name, month, day, fact) => ({ id, packId, name, rule: { type: 'fixed', month, day }, fact });
const term = name => ({ id: `solar-term-${name}`, packId: 'solar-terms', name, rule: { type: 'solar-term', name }, fact: '' });

const TEMPLATES = Object.freeze([
    lunar('cn-spring-festival', '春节', 1, 1, '常见习俗包括团圆、拜年和新年祝福。'),
    lunar('cn-lantern-festival', '元宵', 1, 15, '常见习俗包括赏灯、猜灯谜和吃元宵或汤圆。'),
    { id: 'cn-qingming', packId: 'traditional-cn', name: '清明', rule: { type: 'solar-term', name: '清明' }, fact: '常见习俗包括祭扫、踏青与缅怀先人。' },
    lunar('cn-dragon-boat', '端午', 5, 5, '常见习俗包括吃粽子、赛龙舟和佩香囊。'),
    lunar('cn-qixi', '七夕', 7, 7, '与牛郎织女传说相关，常用于表达感情。'),
    lunar('cn-ghost-festival', '中元', 7, 15, '传统上常用于祭祖与追思。'),
    lunar('cn-mid-autumn', '中秋', 8, 15, '常见习俗包括赏月、吃月饼和家人团聚。'),
    lunar('cn-double-ninth', '重阳', 9, 9, '常见习俗包括登高、赏菊和敬老。'),
    lunar('cn-laba', '腊八', 12, 8, '常见习俗包括喝腊八粥。'),
    lunar('cn-little-new-year', '小年', 12, 23, '日期和习俗因地区而异，常见于腊月二十三或二十四。'),
    { id: 'cn-new-years-eve', packId: 'traditional-cn', name: '除夕', rule: { type: 'lunar-year-end' }, fact: '农历年最后一天，常见习俗包括年夜饭、守岁和迎接新年。' },
    ...['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'].map(term),
    fixed('modern-new-year', 'modern-common', '元旦', 1, 1, '公历新年第一天，宜称“元旦快乐”。'),
    fixed('modern-labour', 'modern-common', '劳动节', 5, 1, '向劳动者与劳动成果表达尊重。'),
    fixed('modern-children', 'modern-common', '儿童节', 6, 1, '关注儿童的节日。'),
    fixed('modern-teachers', 'modern-common', '教师节', 9, 10, '向教师表达感谢与尊重。'),
    fixed('modern-national', 'modern-common', '国庆节', 10, 1, '中华人民共和国国庆日。'),
    fixed('western-valentine', 'western-common', '情人节', 2, 14, '常用于表达爱意或感谢。'),
    fixed('western-halloween', 'western-common', '万圣节', 10, 31, '常见元素包括装扮、南瓜灯和糖果，不等同于中国过年。'),
    fixed('western-christmas', 'western-common', '圣诞节', 12, 25, '常见元素包括圣诞树、礼物和圣诞祝福，不套用春节习俗。'),
]);

export const HOLIDAY_DATA_NOTICE = '内置节日与习俗根据公开资料汇总整理，仅供故事创作参考。不同地区、年代及家庭习惯可能存在差异；内容可以修改，每个节日可单独选择是否提醒。';

export function holidayTemplatePacks(calendarType) {
    return PACKS.filter(pack => calendarType === 'modern' ? pack.modern : (calendarType === 'fictional' && pack.fictional));
}

export function holidayTemplates(packId, calendarType) {
    if (!holidayTemplatePacks(calendarType).some(pack => pack.id === packId)) return [];
    return TEMPLATES.filter(item => item.packId === packId).map(item => structuredClone(item));
}

export function holidayTemplate(templateId) {
    const item = TEMPLATES.find(entry => entry.id === templateId);
    return item ? structuredClone(item) : null;
}

export function traditionalHolidayTemplateIds({ includeQingming = true } = {}) {
    return TEMPLATES
        .filter(item => item.packId === 'traditional-cn')
        .filter(item => includeQingming || item.id !== 'cn-qingming')
        .map(item => item.id);
}

function nextModernDate(year, month, day) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function modernHolidayEntries(year, month, day, { visiblePacks = ['traditional-cn', 'modern-common'] } = {}) {
    const overlay = modernCalendarOverlay(year, month, day);
    const next = nextModernDate(year, month, day);
    const nextOverlay = modernCalendarOverlay(next.year, next.month, next.day);
    const builtInPacks = new Set((Array.isArray(visiblePacks) ? visiblePacks : [])
        .filter(packId => PACKS.some(pack => pack.id === packId && pack.modern && pack.id !== 'solar-terms')));
    return TEMPLATES.filter(item => builtInPacks.has(item.packId)).filter(item => {
        const rule = item.rule;
        if (rule.type === 'fixed') return Number(rule.month) === Number(month) && Number(rule.day) === Number(day);
        if (!overlay.available) return false;
        if (rule.type === 'solar-term') return overlay.solarTerm === rule.name;
        if (rule.type === 'lunar') {
            return overlay.lunar?.monthNumber === Number(rule.month)
                && overlay.lunar?.day === Number(rule.day)
                && overlay.lunar?.leap === Boolean(rule.leap);
        }
        if (rule.type === 'lunar-year-end') {
            return nextOverlay.available && nextOverlay.lunar?.monthNumber === 1
                && nextOverlay.lunar?.day === 1 && !nextOverlay.lunar?.leap;
        }
        return false;
    }).map(item => structuredClone(item));
}

export function modernHolidayLabels(year, month, day, options) {
    return modernHolidayEntries(year, month, day, options).map(item => item.name);
}
