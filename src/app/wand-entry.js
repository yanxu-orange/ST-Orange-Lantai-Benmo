import { PRODUCT_NAME, productBrandMark } from './product-brand.js';

const WAND_ENTRY_ID = 'tkm-wand-entry';

function activateOnKeyboard(event, onOpen) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
}

export function mountWandEntry({ documentRef = document, onOpen } = {}) {
    const existing = documentRef.getElementById(WAND_ENTRY_ID);
    if (existing) return existing;

    const menu = documentRef.querySelector('#extensionsMenu');
    if (!menu) return null;

    const entry = documentRef.createElement('div');
    entry.id = WAND_ENTRY_ID;
    entry.className = 'list-group-item flex-container flexGap5 interactable';
    entry.tabIndex = 0;
    entry.setAttribute('role', 'button');
    entry.innerHTML = `${productBrandMark()}<span>${PRODUCT_NAME}</span>`;
    entry.addEventListener('click', onOpen);
    entry.addEventListener('keydown', event => activateOnKeyboard(event, onOpen));
    menu.append(entry);
    return entry;
}

export function installWandEntry({
    root = globalThis,
    documentRef = root.document,
    onOpen,
} = {}) {
    const mounted = mountWandEntry({ documentRef, onOpen });
    if (mounted || typeof root.MutationObserver !== 'function') return mounted;

    const observer = new root.MutationObserver(() => {
        if (mountWandEntry({ documentRef, onOpen })) observer.disconnect();
    });
    observer.observe(documentRef.body, { childList: true, subtree: true });
    return null;
}

export { WAND_ENTRY_ID };
