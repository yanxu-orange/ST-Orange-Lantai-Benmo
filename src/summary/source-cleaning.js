import { SummaryDomainError } from './errors.js';

export const DEFAULT_SUMMARY_CLEANING_RULES = Object.freeze([
    Object.freeze({
        id: 'summary-clean-html-comments',
        enabled: true,
        action: 'exclude',
        pattern: '<!--[\\s\\S]*?-->',
        flags: 'u',
        replacement: '',
        captureGroup: 0,
    }),
    Object.freeze({
        id: 'summary-extract-content-context',
        enabled: true,
        action: 'extract',
        pattern: '<(content|context)\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>',
        flags: 'iu',
        replacement: '',
        captureGroup: 2,
    }),
]);

const VALID_ACTIONS = new Set(['extract', 'exclude', 'replace']);
const SUPPORTED_FLAGS = new Set(['i', 'm', 's', 'u']);

function normalizeFlags(value) {
    const source = String(value ?? 'su').trim();
    const seen = new Set();
    for (const flag of source) {
        if (!SUPPORTED_FLAGS.has(flag) || seen.has(flag)) {
            throw new SummaryDomainError('invalid_cleaning_rule', '总结清洗规则的正则标志无效。');
        }
        seen.add(flag);
    }
    return [...seen].join('');
}

export function normalizeSummaryCleaningRule(rule = {}) {
    const action = VALID_ACTIONS.has(rule.action) ? rule.action : 'exclude';
    const pattern = String(rule.pattern ?? '');
    if (!pattern) throw new SummaryDomainError('invalid_cleaning_rule', '总结清洗规则的正则表达式不能为空。');
    const flags = normalizeFlags(rule.flags);
    new RegExp(pattern, flags);
    const captureGroup = action === 'extract' && Number.isSafeInteger(Number(rule.captureGroup))
        ? Math.max(0, Number(rule.captureGroup))
        : 0;
    return {
        id: String(rule.id ?? '').trim(),
        enabled: rule.enabled !== false,
        action,
        pattern,
        flags,
        replacement: action === 'replace' ? String(rule.replacement ?? '') : '',
        captureGroup,
    };
}

function globalExpression(rule) {
    return new RegExp(rule.pattern, `${rule.flags}g`);
}

export function applySummaryCleaningRules(source, rules = DEFAULT_SUMMARY_CLEANING_RULES) {
    let text = String(source ?? '');
    const results = [];
    for (const candidate of Array.isArray(rules) ? rules : []) {
        if (candidate?.enabled === false) {
            results.push({ id: String(candidate?.id ?? ''), action: candidate?.action ?? '', status: 'disabled', matches: 0 });
            continue;
        }
        let rule;
        try {
            rule = normalizeSummaryCleaningRule(candidate);
        } catch (error) {
            results.push({ id: String(candidate?.id ?? ''), action: candidate?.action ?? '', status: 'invalid', error: error.message });
            continue;
        }
        const expression = globalExpression(rule);
        if (rule.action === 'extract') {
            const matches = [...text.matchAll(expression)];
            if (matches.length) {
                text = matches.map(match => match[rule.captureGroup] ?? '').join('\n');
            }
            results.push({ id: rule.id, action: rule.action, status: matches.length ? 'applied' : 'unmatched', matches: matches.length });
            continue;
        }
        let matches = 0;
        text = text.replace(expression, () => {
            matches += 1;
            return rule.action === 'replace' ? rule.replacement : '';
        });
        results.push({ id: rule.id, action: rule.action, status: matches ? 'applied' : 'unmatched', matches });
    }
    return { text: text.trim(), results };
}

export function cleanSummaryFloors(floors, {
    rules = DEFAULT_SUMMARY_CLEANING_RULES,
    skipUserMessages = false,
} = {}) {
    const cleaned = [];
    for (const floor of Array.isArray(floors) ? floors : []) {
        if (skipUserMessages && floor?.role === 'user') continue;
        const result = applySummaryCleaningRules(floor?.text, rules);
        if (!result.text) continue;
        cleaned.push({
            index: floor.index,
            role: floor.role,
            text: result.text,
            cleaningResults: result.results,
        });
    }
    return cleaned;
}
