import { recallByStructuredKeywords, STAGE_ONE_RECALL_CALIBRATION } from './structured-keyword-recall.js';
import { recallByStoryTime } from './time-recall.js';

export const STAGE_TWO_RECALL_CALIBRATION = Object.freeze({
    status: 'candidate',
    version: 'stage2-candidate-1',
    minimumScore: 45,
    jointFactor: 0.35,
});

export function recallByKeywordsAndTime({
    memories = [], input = '', recentTexts = [], currentStoryTime = null,
    fictionalCalendar = {}, keywordConfig = STAGE_ONE_RECALL_CALIBRATION,
    config = STAGE_TWO_RECALL_CALIBRATION,
} = {}) {
    const keyword = recallByStructuredKeywords({ memories, input, recentTexts, config: keywordConfig });
    const time = recallByStoryTime({ memories, input, recentTexts, currentStoryTime, fictionalCalendar });
    const keywordById = new Map(keyword.candidates.map(item => [item.memory.id, item]));
    const timeById = new Map(time.candidates.map(item => [item.memory.id, item]));
    const trigger = memories.filter(memory => memory?.mode === 'trigger');
    const candidates = trigger.map(memory => {
        const keywordItem = keywordById.get(memory.id);
        const timeItem = timeById.get(memory.id);
        if (!keywordItem && !timeItem) return null;
        const keywordScore = keywordItem?.keywordScore ?? 0;
        const timeScore = timeItem?.timeScore ?? 0;
        const score = Math.max(keywordScore, timeScore) + (config.jointFactor * Math.min(keywordScore, timeScore));
        const reasons = [keywordItem?.reason, timeItem?.reason].filter(Boolean);
        return {
            memory,
            score: Number(score.toFixed(2)),
            keywordScore,
            timeScore,
            keywordEvidence: keywordItem?.evidence ?? [],
            timeEvidence: timeItem?.evidence ?? null,
            reason: reasons.join('；'),
            passed: score >= config.minimumScore,
        };
    }).filter(Boolean).sort((a, b) => b.score - a.score
        || b.timeScore - a.timeScore
        || b.keywordEvidence.length - a.keywordEvidence.length
        || String(a.memory.id).localeCompare(String(b.memory.id)));
    return {
        calibration: { status: config.status, version: config.version },
        resident: memories.filter(memory => memory?.mode === 'resident'),
        timeTargets: time.targets,
        candidates,
        passed: candidates.filter(item => item.passed),
        minimumScore: config.minimumScore,
    };
}
