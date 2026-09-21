function timeOfDay(value) {
    if (!value || value.hour === null || value.hour === undefined) return '';
    if (value.shichen) return `${value.shichen}时`;
    if (value.precision === 'hour' || value.minute === null || value.minute === undefined) return `${value.hour}时`;
    return `${value.hour}:${String(value.minute).padStart(2, '0')}`;
}

function rangeLabel(start, end) {
    const startLabel = timeOfDay(start);
    const endLabel = timeOfDay(end);
    if (!startLabel) return endLabel;
    if (!endLabel || endLabel === startLabel) return startLabel;
    return `${startLabel}–${endLabel}`;
}

export function timelineMemoryMetadata(memory) {
    return rangeLabel(memory?.time?.start?.value, memory?.time?.end?.value);
}

