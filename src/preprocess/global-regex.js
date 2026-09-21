const VALID_ACTIONS = new Set(['extract', 'exclude', 'replace']);
const SUPPORTED_FLAGS = new Set(['i', 'm', 's', 'u']);

function normalizedFlags(value) {
    const flags = String(value ?? 'su').trim();
    const seen = new Set();
    for (const flag of flags) {
        if (!SUPPORTED_FLAGS.has(flag)) throw new Error(`不支持正则标志“${flag}”。仅支持 i、m、s、u。`);
        if (seen.has(flag)) throw new Error(`正则标志“${flag}”重复。`);
        seen.add(flag);
    }
    return [...seen].join('');
}

export function normalizeGlobalRegexRule(rule = {}) {
    const action = VALID_ACTIONS.has(rule.action) ? rule.action : 'exclude';
    const pattern = String(rule.pattern ?? '');
    if (!pattern) throw new Error('正则表达式不能为空。');
    const flags = normalizedFlags(rule.flags);
    new RegExp(pattern, flags);
    return {
        id: String(rule.id ?? ''),
        action,
        pattern,
        flags,
        replacement: action === 'replace' ? String(rule.replacement ?? '') : '',
    };
}

function globalExpression(rule) {
    const flags = rule.flags.includes('g') ? rule.flags : `${rule.flags}g`;
    return new RegExp(rule.pattern, flags);
}

export function inspectGlobalRegexRule(rule) {
    try {
        return { valid: true, rule: normalizeGlobalRegexRule(rule), error: '' };
    } catch (error) {
        return { valid: false, rule: null, error: error?.message || '正则规则无效。' };
    }
}

export function applyGlobalRegexRules(source, rules = []) {
    let text = String(source ?? '');
    const results = [];
    for (const candidate of Array.isArray(rules) ? rules : []) {
        const inspected = inspectGlobalRegexRule(candidate);
        if (!inspected.valid) {
            results.push({ id: String(candidate?.id ?? ''), action: candidate?.action ?? '', status: 'invalid', error: inspected.error });
            continue;
        }
        const rule = inspected.rule;
        try {
            const expression = globalExpression(rule);
            if (rule.action === 'extract') {
                const matches = [...text.matchAll(expression)].map(match => match[0]);
                if (matches.length) text = matches.join('\n');
                results.push({ id: rule.id, action: rule.action, status: matches.length ? 'applied' : 'unmatched', matches: matches.length });
                continue;
            }
            let matches = 0;
            text = text.replace(expression, () => {
                matches += 1;
                return rule.action === 'replace' ? rule.replacement : '';
            });
            results.push({ id: rule.id, action: rule.action, status: matches ? 'applied' : 'unmatched', matches });
        } catch (error) {
            results.push({ id: rule.id, action: rule.action, status: 'invalid', error: error?.message || '执行失败。' });
        }
    }
    return { text: text.trim(), results };
}
