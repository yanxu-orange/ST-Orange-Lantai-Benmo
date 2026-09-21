function clampScrollTop(body, value) {
    const maximum = Math.max(0, Number(body?.scrollHeight || 0) - Number(body?.clientHeight || 0));
    return Math.min(Math.max(0, Number(value) || 0), maximum);
}

const ANCHOR_SELECTOR = '[data-api-anchor], [data-api-field], .tkm-api-source-picker, .tkm-api-actions, .tkm-api-test-row';

function anchorIdentity(element) {
    if (!element) return '';
    if (element.dataset?.apiAnchor) return element.dataset.apiAnchor;
    if (element.dataset?.apiField) return `field:${element.dataset.apiField}`;
    if (element.classList?.contains('tkm-api-source-picker')) return 'source';
    if (element.classList?.contains('tkm-api-actions')) return 'actions';
    if (element.classList?.contains('tkm-api-test-row')) return 'test';
    return '';
}

function apiAnchor(element) {
    return element?.closest?.(ANCHOR_SELECTOR) ?? null;
}

function focusIdentity(element) {
    if (!element) return null;
    const apiField = element.dataset?.apiField;
    const dialogField = element.dataset?.apiDialogField;
    const action = element.dataset?.action;
    if (!apiField && !dialogField && !action) return null;
    return {
        apiField: apiField ?? '', dialogField: dialogField ?? '', action: action ?? '',
        selectionStart: typeof element.selectionStart === 'number' ? element.selectionStart : null,
        selectionEnd: typeof element.selectionEnd === 'number' ? element.selectionEnd : null,
    };
}

function findIdentity(root, identity) {
    if (!identity) return null;
    const candidates = root?.querySelectorAll?.('[data-api-field], [data-api-dialog-field], [data-action]') ?? [];
    return [...candidates].find(element => (
        (identity.apiField && element.dataset?.apiField === identity.apiField)
        || (identity.dialogField && element.dataset?.apiDialogField === identity.dialogField)
        || (identity.action && element.dataset?.action === identity.action)
    )) ?? null;
}

function findAnchor(root, id) {
    if (!id) return null;
    const anchors = root?.querySelectorAll?.(ANCHOR_SELECTOR) ?? [];
    return [...anchors].find(element => anchorIdentity(element) === id) ?? null;
}

export function captureApiSettingsPosition(root, { target = null } = {}) {
    const body = root?.querySelector?.('[data-tkm-api-scroll]') ?? null;
    if (!body) return null;
    const bodyRect = body.getBoundingClientRect?.() ?? null;
    const anchors = [...(body.querySelectorAll?.(ANCHOR_SELECTOR) ?? [])];
    const preferred = apiAnchor(target) ?? apiAnchor(root.ownerDocument?.activeElement);
    const visible = anchors.find(element => {
        const rect = element.getBoundingClientRect?.();
        return bodyRect && rect && rect.bottom > bodyRect.top;
    });
    const anchor = preferred ?? visible ?? anchors.at(-1) ?? null;
    const anchorRect = anchor?.getBoundingClientRect?.() ?? null;
    const activeElement = root.ownerDocument?.activeElement;
    const active = body.contains?.(activeElement) ? activeElement : null;
    return {
        scrollTop: Number(body.scrollTop) || 0,
        anchorId: anchorIdentity(anchor),
        anchorOffset: bodyRect && anchorRect ? anchorRect.top - bodyRect.top : null,
        focus: focusIdentity(active),
    };
}

export function restoreApiSettingsPosition(root, position, { restoreFocus = true } = {}) {
    if (!position) return;
    const body = root?.querySelector?.('[data-tkm-api-scroll]') ?? null;
    if (!body) return;
    body.scrollTop = clampScrollTop(body, position.scrollTop);
    const anchor = findAnchor(body, position.anchorId);
    if (anchor && Number.isFinite(position.anchorOffset)) {
        const bodyRect = body.getBoundingClientRect?.();
        const anchorRect = anchor.getBoundingClientRect?.();
        if (bodyRect && anchorRect) {
            body.scrollTop = clampScrollTop(body, body.scrollTop + anchorRect.top - bodyRect.top - position.anchorOffset);
        }
    }
    if (!restoreFocus) return;
    const focusTarget = findIdentity(body, position.focus);
    if (!focusTarget || focusTarget.disabled) return;
    focusTarget.focus?.({ preventScroll: true });
    if (position.focus?.selectionStart !== null && typeof focusTarget.setSelectionRange === 'function') {
        focusTarget.setSelectionRange(position.focus.selectionStart, position.focus.selectionEnd);
    }
}
