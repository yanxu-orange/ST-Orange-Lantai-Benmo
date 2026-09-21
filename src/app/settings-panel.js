import { PRODUCT_FULL_NAME, PRODUCT_NAME, productBrandMark } from './product-brand.js';

const PANEL_ID = 'tkm-settings-panel';

function findSettingsHost(documentRef) {
    return documentRef.querySelector('#extensions_settings2')
        ?? documentRef.querySelector('#extensions_settings')
        ?? documentRef.body;
}

export function mountSettingsPanel({
    documentRef = document,
    openPanel = () => {},
} = {}) {
    if (documentRef.getElementById(PANEL_ID)) {
        return documentRef.getElementById(PANEL_ID);
    }

    const panel = documentRef.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'tkm-panel';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <span class="tkm-panel-brand">${productBrandMark()}<strong>${PRODUCT_NAME}</strong></span>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="tkm-settings-group tkm-probe-row">
                    <div class="tkm-probe-row__text">
                        <strong>打开${PRODUCT_NAME}</strong>
                        <small>${PRODUCT_FULL_NAME} · 进入记忆、时间、模块与设置。</small>
                    </div>
                    <button type="button" class="menu_button" data-tkm-action="open-panel">打开</button>
                </div>
            </div>
        </div>
    `;
    panel.querySelector('[data-tkm-action="open-panel"]')?.addEventListener('click', openPanel);
    findSettingsHost(documentRef).append(panel);
    return panel;
}
