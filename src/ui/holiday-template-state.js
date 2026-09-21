import { holidayTemplate } from '../domain/holiday-templates.js';

export function holidayTemplateChanged(item) {
    const template = holidayTemplate(item?.templateId);
    if (!template) return false;
    const rule = item.dateRule ?? {};
    return item.name !== template.name || item.fact !== template.fact
        || [...new Set([...Object.keys(rule), ...Object.keys(template.rule)])]
            .some(key => String(rule[key] ?? '') !== String(template.rule[key] ?? ''));
}
