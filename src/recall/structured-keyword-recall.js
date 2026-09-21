const clamp = (min, value, max) => Math.max(min, Math.min(max, value));

export const STAGE_ONE_RECALL_CALIBRATION = Object.freeze({
    status: 'candidate',
    version: 'stage1-candidate-1',
    fieldWeights: { title: 1.3, primary: 1, people: 0.35, locations: 0.35, auxiliary: 0.3 },
    recentStartWeight: 0.65,
    recentDecay: 0.85,
    coreDecay: [1, 0.7, 0.5, 0.35, 0.25],
    auxiliaryCap: 18,
    coreScale: 42,
    coreCombinationBonus: 8,
    auxiliaryCombinationBonus: 3,
    minimumScore: 45,
});

export function normalizeForMatch(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\p{P}\p{S}\p{Z}\s]+/gu, '');
}

function containsTerm(text, term) {
    const normalizedTerm = normalizeForMatch(term);
    return Boolean(normalizedTerm) && normalizeForMatch(text).includes(normalizedTerm);
}

function textSources(input, recentTexts, config) {
    const sources = [{ label: '当前输入', text: input, weight: 1 }];
    for (let index = 0; index < recentTexts.length; index += 1) {
        sources.push({
            label: `最近第 ${index + 1} 楼`,
            text: recentTexts[index],
            weight: config.recentStartWeight * (config.recentDecay ** index),
        });
    }
    return sources;
}

function strongestSourceMatch(term, sources) {
    return sources.find(source => containsTerm(source.text, term)) ?? null;
}

function termDocumentFrequencies(memories) {
    const result = new Map();
    for (const memory of memories) {
        const terms = new Set([
            memory.title,
            ...(memory.keywords?.primary ?? []),
            ...(memory.people ?? []),
            ...(memory.locations ?? []),
            ...(memory.keywords?.auxiliary ?? []),
        ].map(normalizeForMatch).filter(Boolean));
        for (const term of terms) result.set(term, (result.get(term) ?? 0) + 1);
    }
    return result;
}

function rarityWeight(term, frequencies, memoryCount) {
    if (memoryCount <= 1) return 1.4;
    const frequency = frequencies.get(normalizeForMatch(term)) ?? 1;
    const ratio = (frequency - 1) / (memoryCount - 1);
    return clamp(0.6, 1.4 - (0.8 * ratio), 1.4);
}

const EVIDENCE_FIELDS = Object.freeze([
    { field: 'title', label: '标题', core: true },
    { field: 'primary', label: '主关键词', core: true },
    { field: 'people', label: '人物', core: false },
    { field: 'locations', label: '地点', core: false },
    { field: 'auxiliary', label: '辅助关键词', core: false },
]);

const EVIDENCE_FIELD_PRIORITY = new Map(
    EVIDENCE_FIELDS.map((descriptor, index) => [descriptor.field, index]),
);

function memoryTermsByField(memory) {
    return {
        title: memory.title ? [memory.title] : [],
        primary: memory.keywords?.primary ?? [],
        people: memory.people ?? [],
        locations: memory.locations ?? [],
        auxiliary: memory.keywords?.auxiliary ?? [],
    };
}

function compareScoringFields(left, right, config) {
    const byWeight = (config.fieldWeights[right.field] ?? 0) - (config.fieldWeights[left.field] ?? 0);
    if (byWeight) return byWeight;
    const byFieldPriority = EVIDENCE_FIELD_PRIORITY.get(left.field) - EVIDENCE_FIELD_PRIORITY.get(right.field);
    if (byFieldPriority) return byFieldPriority;
    return String(left.term).localeCompare(String(right.term), 'zh-Hans-CN');
}

function collectEvidence(memory, sources, frequencies, memoryCount, config) {
    const termsByField = memoryTermsByField(memory);
    const terms = new Map();
    for (const descriptor of EVIDENCE_FIELDS) {
        for (const term of termsByField[descriptor.field]) {
            const normalizedTerm = normalizeForMatch(term);
            if (!normalizedTerm) continue;
            const aggregate = terms.get(normalizedTerm) ?? { normalizedTerm, occurrences: [] };
            aggregate.occurrences.push({ term, ...descriptor });
            terms.set(normalizedTerm, aggregate);
        }
    }

    const evidence = [];
    for (const aggregate of terms.values()) {
        const source = strongestSourceMatch(aggregate.normalizedTerm, sources);
        if (!source) continue;
        const sourceFields = EVIDENCE_FIELDS
            .filter(descriptor => aggregate.occurrences.some(item => item.field === descriptor.field))
            .map(descriptor => descriptor.field);
        const scoringDescriptor = [...aggregate.occurrences].sort(
            (left, right) => compareScoringFields(left, right, config),
        )[0];
        const rarity = rarityWeight(aggregate.normalizedTerm, frequencies, memoryCount);
        evidence.push({
            term: scoringDescriptor.term,
            field: scoringDescriptor.field,
            fieldLabel: scoringDescriptor.label,
            scoringField: scoringDescriptor.field,
            scoringFieldLabel: scoringDescriptor.label,
            sourceFields,
            core: sourceFields.includes('title') || sourceFields.includes('primary'),
            source: source.label,
            strength: config.fieldWeights[scoringDescriptor.field] * source.weight * rarity,
        });
    }
    return evidence;
}

function scoreCandidate(memory, evidence, config) {
    const core = evidence.filter(item => item.core).sort((a, b) => b.strength - a.strength);
    if (!core.length) return null;
    const auxiliary = evidence.filter(item => !item.core).sort((a, b) => b.strength - a.strength);
    const coreScore = core.slice(0, config.coreDecay.length).reduce(
        (sum, item, index) => sum + item.strength * config.coreScale * config.coreDecay[index],
        0,
    );
    const coreBonus = core.length >= 2 ? config.coreCombinationBonus : 0;
    const auxiliaryRaw = auxiliary.reduce((sum, item, index) => {
        const decay = config.coreDecay[index] ?? 0.2;
        return sum + item.strength * config.coreScale * decay;
    }, 0) + (auxiliary.length && core.length ? config.auxiliaryCombinationBonus : 0);
    const auxiliaryScore = Math.min(config.auxiliaryCap, auxiliaryRaw);
    const score = clamp(0, coreScore + coreBonus + auxiliaryScore, 100);
    const reasonParts = [];
    if (core.length) reasonParts.push(`核心命中：${core.map(item => `“${item.term}”`).join('、')}`);
    if (auxiliary.length) reasonParts.push(`辅助证据：${auxiliary.map(item => `“${item.term}”`).join('、')}`);
    return {
        memory,
        score: Number(score.toFixed(2)),
        keywordScore: Number(score.toFixed(2)),
        evidence,
        reason: reasonParts.join('；'),
        passed: score >= config.minimumScore,
    };
}

export function recallByStructuredKeywords({
    memories,
    input,
    recentTexts = [],
    config = STAGE_ONE_RECALL_CALIBRATION,
} = {}) {
    const library = Array.isArray(memories) ? memories : [];
    const triggerMemories = library.filter(memory => memory?.mode === 'trigger');
    const sources = textSources(input, recentTexts, config);
    const frequencies = termDocumentFrequencies(triggerMemories);
    const candidates = triggerMemories
        .map(memory => scoreCandidate(
            memory,
            collectEvidence(memory, sources, frequencies, triggerMemories.length, config),
            config,
        ))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score
            || b.evidence.length - a.evidence.length
            || String(a.memory.id).localeCompare(String(b.memory.id)));
    return {
        calibration: { status: config.status, version: config.version },
        resident: library.filter(memory => memory?.mode === 'resident'),
        candidates,
        passed: candidates.filter(candidate => candidate.passed),
        minimumScore: config.minimumScore,
    };
}

export async function applyRecallBudget({
    result,
    countEnabled = true,
    maxCount = 5,
    tokenEnabled = false,
    maxTokens = null,
    countTokens = async text => String(text ?? '').length,
} = {}) {
    if (!countEnabled && !tokenEnabled) throw new Error('条数上限与 Token 上限不能同时关闭。');
    const selected = [];
    const excluded = [];
    let totalTokens = 0;
    for (const candidate of result?.passed ?? []) {
        if (countEnabled && selected.length >= maxCount) {
            excluded.push({ ...candidate, excludedReason: '超过条数上限' });
            continue;
        }
        const tokens = await countTokens(candidate.memory.body);
        selected.push({ ...candidate, tokens });
        totalTokens += tokens;
        if (tokenEnabled && Number.isFinite(maxTokens) && totalTokens >= maxTokens) {
            const remaining = result.passed.slice(result.passed.indexOf(candidate) + 1);
            excluded.push(...remaining.map(item => ({ ...item, excludedReason: '达到 Token 上限' })));
            break;
        }
    }
    return { selected, excluded, totalTokens };
}

export async function residentPoolStats(memories, countTokens = async text => String(text ?? '').length) {
    const resident = (memories ?? []).filter(memory => memory?.mode === 'resident');
    let tokens = 0;
    for (const memory of resident) tokens += await countTokens(memory.body);
    return { count: resident.length, tokens };
}
