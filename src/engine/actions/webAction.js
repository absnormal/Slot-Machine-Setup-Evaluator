/**
 * webAction.js — 網頁自動化原子動作
 *
 * 透過 WebSocket 向 Python 後端發送 Selenium 指令。
 * 支援：開啟網頁、操作 DOM 元素、下拉選單。
 */

/**
 * 發送 web 指令並等待回應（通用）
 * @param {WebSocket} ws
 * @param {Object} cmd - 指令物件
 * @param {number} [timeoutMs=30000] - 超時（Selenium 操作較慢，預設 30 秒）
 * @returns {Promise<{success: boolean, message: string, text?: string}>}
 */
function sendWebCommand(ws, cmd, timeoutMs = 60000) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('[webAction] WebSocket 未連線'));
    }

    const requestId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    cmd.requestId = requestId;

    return new Promise((resolve, reject) => {
        const onMessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'control_result' && msg.requestId === requestId) {
                        ws.removeEventListener('message', onMessage);
                        if (msg.success) resolve(msg);
                        else reject(new Error(msg.message || 'web command failed'));
                    }
                } catch { /* 非 JSON (binary frame) */ }
            }
        };

        ws.addEventListener('message', onMessage);
        ws.send(JSON.stringify(cmd));

        // 超時保護（Selenium 操作可能需要較長時間）
        setTimeout(() => {
            ws.removeEventListener('message', onMessage);
            reject(new Error(`[webAction] 超時 ${timeoutMs / 1000}s — Python 未回應`));
        }, timeoutMs);
    });
}

/**
 * 開啟/導航網頁
 * @param {WebSocket} ws
 * @param {Object} params
 * @param {string} params.browser - 瀏覽器實例名稱（如 'labby', 'admin'）
 * @param {string} params.url - 目標網址
 * @param {string} [params.waitSelector] - 等待此元素出現才算載入完成
 * @param {string} [params.selectorType='xpath'] - 'xpath' 或 'css'
 * @param {number} [params.timeout=30] - 超時秒數
 * @param {number} [params.debugPort] - Chrome debug port（可選）
 */
export async function webNavigate(ws, params) {
    const timeout = (params.timeout ?? 30) * 1000;
    return sendWebCommand(ws, {
        action: 'web_navigate',
        browser: params.browser || 'default',
        url: params.url,
        waitSelector: params.waitSelector || '',
        selectorType: params.selectorType || 'xpath',
        timeout: params.timeout ?? 30,
        debugPort: params.debugPort || null,
    }, timeout + 30000); // 留 30 秒緩衝（首次啟動 Chrome 需要 15-20 秒）
}

/**
 * 操作網頁 DOM 元素
 * @param {WebSocket} ws
 * @param {Object} params
 * @param {string} params.browser - 瀏覽器實例名稱
 * @param {string} params.subAction - 'click'|'input'|'clear_input'|'read_text'|'read_attr'|'wait_visible'|'switch_frame'|'switch_tab'
 * @param {string} [params.selector] - XPath 或 CSS 選擇器
 * @param {string} [params.selectorType='xpath'] - 'xpath' 或 'css'
 * @param {string} [params.value] - input 時的輸入值 / read_attr 時的屬性名
 * @param {number} [params.timeout=10] - 超時秒數
 */
export async function webAction(ws, params) {
    const timeout = (params.timeout ?? 10) * 1000;
    return sendWebCommand(ws, {
        action: 'web_action',
        browser: params.browser || 'default',
        subAction: params.subAction || params.action || 'click',
        selector: params.selector || '',
        selectorType: params.selectorType || 'xpath',
        value: params.value || '',
        timeout: params.timeout ?? 10,
        debugPort: params.debugPort || null,
    }, timeout + 30000);
}

/**
 * 操作下拉選單
 * @param {WebSocket} ws
 * @param {Object} params
 * @param {string} params.browser - 瀏覽器實例名稱
 * @param {string} params.selector - 下拉選單的選擇器
 * @param {string} [params.selectorType='xpath']
 * @param {string} params.option - 選項值
 * @param {string} [params.selectBy='text'] - 'text'|'value'|'index'
 * @param {number} [params.timeout=10]
 */
export async function webSelect(ws, params) {
    const timeout = (params.timeout ?? 10) * 1000;
    return sendWebCommand(ws, {
        action: 'web_select',
        browser: params.browser || 'default',
        selector: params.selector || '',
        selectorType: params.selectorType || 'xpath',
        option: params.option || '',
        selectBy: params.selectBy || 'text',
        timeout: params.timeout ?? 10,
        debugPort: params.debugPort || null,
    }, timeout + 30000);
}
