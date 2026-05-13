/**
 * waitAction.js — 等待原子動作
 *
 * 簡單的延遲等待，支援取消。
 */

/**
 * 等待指定毫秒數
 * @param {number} ms - 等待時間（毫秒）
 * @param {Object} [options]
 * @param {{ current: boolean }} [options.cancelRef] - 取消旗標
 * @returns {Promise<void>}
 */
export function wait(ms, options = {}) {
    const { cancelRef } = options;

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(), ms);

        // 如果有取消機制，定期檢查
        if (cancelRef) {
            const checkCancel = setInterval(() => {
                if (cancelRef.current) {
                    clearTimeout(timer);
                    clearInterval(checkCancel);
                    reject(new Error('cancelled'));
                }
            }, 100);

            // 正常完成時也要清理
            setTimeout(() => clearInterval(checkCancel), ms + 100);
        }
    });
}
