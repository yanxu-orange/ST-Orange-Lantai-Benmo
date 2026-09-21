import { EXTENSION_KEY } from '../constants.js';
import { migrateGlobalSettings } from '../storage/global-settings.js';

export function getSillyTavernContext(root = globalThis) {
    const getContext = root?.SillyTavern?.getContext;
    if (typeof getContext !== 'function') {
        throw new Error('SillyTavern.getContext() is unavailable.');
    }
    return getContext.call(root.SillyTavern);
}

export function ensureGlobalSettings(context, options) {
    if (!context?.extensionSettings || typeof context.extensionSettings !== 'object') {
        throw new Error('SillyTavern extensionSettings is unavailable.');
    }

    const result = migrateGlobalSettings(context.extensionSettings[EXTENSION_KEY], options);
    context.extensionSettings[EXTENSION_KEY] = result.data;
    return result.data;
}

export function saveGlobalSettings(context, { now = () => new Date() } = {}) {
    if (typeof context?.saveSettingsDebounced !== 'function') {
        throw new Error('SillyTavern saveSettingsDebounced() is unavailable.');
    }
    const settings = context.extensionSettings?.[EXTENSION_KEY];
    if (settings && typeof settings === 'object') {
        const value = now();
        settings.updatedAt = (value instanceof Date ? value : new Date(value)).toISOString();
    }
    context.saveSettingsDebounced();
}

export function getRequestHeaders(context, options) {
    if (typeof context?.getRequestHeaders !== 'function') {
        throw new Error('SillyTavern getRequestHeaders() is unavailable.');
    }
    return context.getRequestHeaders(options);
}
