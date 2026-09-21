import { EXTENSION_KEY } from '../constants.js';

export const METADATA_PROBE_KEY = '_stageMinusOneProbe';

function assertMetadataContext(context) {
    if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') {
        throw new Error('SillyTavern chatMetadata is unavailable.');
    }
    if (typeof context.updateChatMetadata !== 'function') {
        throw new Error('SillyTavern updateChatMetadata() is unavailable.');
    }
    if (typeof context.saveMetadata !== 'function') {
        throw new Error('SillyTavern saveMetadata() is unavailable.');
    }
}

function createMarker() {
    const suffix = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `tkm-${suffix}`;
}

export function readChatMetadataProbe(context) {
    const probe = context?.chatMetadata?.[EXTENSION_KEY]?.[METADATA_PROBE_KEY];
    if (!probe || typeof probe !== 'object') return null;
    return {
        marker: typeof probe.marker === 'string' ? probe.marker : null,
        writtenAt: typeof probe.writtenAt === 'string' ? probe.writtenAt : null,
    };
}

export async function writeChatMetadataProbe(context, {
    marker = createMarker(),
    now = () => new Date().toISOString(),
} = {}) {
    assertMetadataContext(context);
    const namespace = context.chatMetadata[EXTENSION_KEY];
    const nextNamespace = namespace && typeof namespace === 'object' && !Array.isArray(namespace)
        ? { ...namespace }
        : {};
    const probe = { marker, writtenAt: now() };
    nextNamespace[METADATA_PROBE_KEY] = probe;
    context.updateChatMetadata({ [EXTENSION_KEY]: nextNamespace }, false);
    await context.saveMetadata();
    return probe;
}

export async function clearChatMetadataProbe(context) {
    assertMetadataContext(context);
    const namespace = context.chatMetadata[EXTENSION_KEY];
    if (!namespace || typeof namespace !== 'object' || !(METADATA_PROBE_KEY in namespace)) {
        return false;
    }

    const nextNamespace = { ...namespace };
    delete nextNamespace[METADATA_PROBE_KEY];
    context.updateChatMetadata({ [EXTENSION_KEY]: nextNamespace }, false);
    await context.saveMetadata();
    return true;
}
