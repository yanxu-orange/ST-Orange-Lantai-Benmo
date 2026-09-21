export const RECALL_CALIBRATION_EVALUATOR_VERSION = 'recall-calibration-v1';

function unique(values, label) {
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new TypeError(`${label} must be string[]`);
    if (new Set(values).size !== values.length) throw new TypeError(`${label} must contain unique ids`);
    return values;
}

function ratio(numerator, denominator) {
    return denominator === 0 ? 1 : numerator / denominator;
}

function binaryCounts(expected, actual) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    return {
        tp: actual.filter(id => expectedSet.has(id)).length,
        fp: actual.filter(id => !expectedSet.has(id)).length,
        fn: expected.filter(id => !actualSet.has(id)).length,
    };
}

function binaryMetrics(counts) {
    const precision = ratio(counts.tp, counts.tp + counts.fp);
    const recall = ratio(counts.tp, counts.tp + counts.fn);
    return { ...counts, precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) };
}

function orderedPairs(ids) {
    const pairs = [];
    for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) pairs.push([ids[left], ids[right]]);
    }
    return pairs;
}

function rankingCounts(expected, actual) {
    const positions = new Map(actual.map((id, index) => [id, index]));
    const pairs = orderedPairs(expected);
    const correctPairs = pairs.filter(([left, right]) => positions.has(left) && positions.has(right)
        && positions.get(left) < positions.get(right)).length;
    const firstRelevant = expected.length ? actual.indexOf(expected[0]) : -1;
    return {
        exact: JSON.stringify(expected) === JSON.stringify(actual),
        pairCorrect: correctPairs,
        pairTotal: pairs.length,
        reciprocalRank: expected.length === 0 ? 1 : firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
    };
}

function samePools(expected, actual) {
    const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]);
    return [...keys].every(key => JSON.stringify(expected?.[key] ?? []) === JSON.stringify(actual?.[key] ?? []));
}

export function validateCalibrationSplit(calibrationCases, holdoutCases = []) {
    const validate = (cases, label) => {
        if (!Array.isArray(cases)) throw new TypeError(`${label} cases must be an array`);
        const ids = new Set();
        for (const item of cases) {
            if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError(`${label} case ids must be unique`);
            if (typeof item.groupId !== 'string' || !item.groupId) throw new TypeError(`${item.id}: groupId is required`);
            ids.add(item.id);
        }
        return ids;
    };
    const calibrationIds = validate(calibrationCases, 'calibration');
    const holdoutIds = validate(holdoutCases, 'holdout');
    const calibrationGroups = new Set(calibrationCases.map(item => item.groupId));
    const holdoutGroups = new Set(holdoutCases.map(item => item.groupId));
    const overlappingIds = [...holdoutIds].filter(id => calibrationIds.has(id));
    const overlappingGroups = [...holdoutGroups].filter(group => calibrationGroups.has(group));
    if (overlappingIds.length || overlappingGroups.length) {
        throw new TypeError(`calibration/holdout leakage: ids=${overlappingIds.join(',')} groups=${overlappingGroups.join(',')}`);
    }
    return { calibrationCaseCount: calibrationCases.length, holdoutCaseCount: holdoutCases.length,
        calibrationGroupCount: calibrationGroups.size, holdoutGroupCount: holdoutGroups.size };
}

export function parseCalibrationDataset(text, { label = 'dataset' } = {}) {
    if (typeof text !== 'string') throw new TypeError(`${label} dataset must be JSON text`);
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new TypeError(`${label} dataset must be valid JSON: ${error.message}`);
    }
    if (!Array.isArray(parsed)) throw new TypeError(`${label} dataset root must be an array`);
    validateCalibrationSplit(label === 'holdout' ? [] : parsed, label === 'holdout' ? parsed : []);
    return parsed;
}

export function evaluateRecallCalibration(cases) {
    validateCalibrationSplit(cases, []);
    const totals = {
        candidate: { tp: 0, fp: 0, fn: 0 }, qualification: { tp: 0, fp: 0, fn: 0 },
        selection: { tp: 0, fp: 0, fn: 0 }, ranking: { exact: 0, cases: 0, pairCorrect: 0, pairTotal: 0, reciprocalRank: 0 },
        pool: { exact: 0, cases: 0 }, injection: { exact: 0, cases: 0 },
    };
    const failures = { highCostFalsePositive: [], falseNegative: [], ranking: [], contract: [] };
    const results = cases.map(item => {
        const labels = item.labels ?? {};
        const prediction = item.prediction ?? {};
        const result = { id: item.id, groupId: item.groupId, stage: item.stage, producer: prediction.producer ?? null };
        for (const [metric, labelKey, predictionKey] of [
            ['candidate', 'candidateIds', 'candidateIds'],
            ['qualification', 'qualifiedIds', 'qualifiedIds'],
            ['selection', 'selectedIds', 'selectedIds'],
        ]) {
            if (!Array.isArray(labels[labelKey])) continue;
            const expected = unique(labels[labelKey], `${item.id}.${labelKey}`);
            const actual = unique(prediction[predictionKey] ?? [], `${item.id}.prediction.${predictionKey}`);
            const counts = binaryCounts(expected, actual);
            Object.keys(counts).forEach(key => { totals[metric][key] += counts[key]; });
            result[metric] = binaryMetrics(counts);
            if (counts.fp && item.errorClasses?.falsePositive === 'high-cost') failures.highCostFalsePositive.push(item.id);
            if (counts.fn && item.errorClasses?.falseNegative) failures.falseNegative.push(item.id);
        }
        if (Array.isArray(labels.orderedIds)) {
            const expected = unique(labels.orderedIds, `${item.id}.orderedIds`);
            const actual = unique(prediction.orderedIds ?? [], `${item.id}.prediction.orderedIds`);
            const ranking = rankingCounts(expected, actual);
            totals.ranking.exact += Number(ranking.exact);
            totals.ranking.cases += 1;
            totals.ranking.pairCorrect += ranking.pairCorrect;
            totals.ranking.pairTotal += ranking.pairTotal;
            totals.ranking.reciprocalRank += ranking.reciprocalRank;
            result.ranking = ranking;
            if (!ranking.exact) failures.ranking.push(item.id);
        }
        if (labels.poolAssignments) {
            const exact = samePools(labels.poolAssignments, prediction.poolAssignments);
            totals.pool.exact += Number(exact); totals.pool.cases += 1; result.poolExact = exact;
            if (!exact) failures.contract.push(item.id);
        }
        if (labels.injectionContract === true) {
            const exact = result.ranking?.exact ?? false;
            totals.injection.exact += Number(exact); totals.injection.cases += 1;
        }
        return result;
    });
    const ranking = {
        exactOrderedPrefixAccuracy: ratio(totals.ranking.exact, totals.ranking.cases),
        pairwiseOrderAccuracy: ratio(totals.ranking.pairCorrect, totals.ranking.pairTotal),
        mrr: ratio(totals.ranking.reciprocalRank, totals.ranking.cases),
        cases: totals.ranking.cases,
    };
    return {
        version: RECALL_CALIBRATION_EVALUATOR_VERSION,
        zeroDenominatorPolicy: 'return-one-for-vacuously-perfect-empty-comparisons',
        caseCount: cases.length,
        groupCount: new Set(cases.map(item => item.groupId)).size,
        metrics: {
            candidateRecall: binaryMetrics(totals.candidate).recall,
            candidate: binaryMetrics(totals.candidate),
            ordinaryQualification: binaryMetrics(totals.qualification),
            selectedTopK: binaryMetrics(totals.selection),
            ranking,
            poolMembershipAccuracy: ratio(totals.pool.exact, totals.pool.cases),
            poolCases: totals.pool.cases,
            injectionOrderContractAccuracy: ratio(totals.injection.exact, totals.injection.cases),
            injectionCases: totals.injection.cases,
        },
        errors: {
            falsePositiveCount: totals.qualification.fp + totals.selection.fp,
            falseNegativeCount: totals.candidate.fn + totals.qualification.fn + totals.selection.fn,
            rankingErrorCount: failures.ranking.length,
            byClass: Object.fromEntries(Object.entries(failures).map(([key, ids]) => [key, [...new Set(ids)]])),
        },
        results,
    };
}
