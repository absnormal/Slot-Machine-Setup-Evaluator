/**
 * ocrWorkerBridge.js — OCR Worker 橋接層
 *
 * 封裝 Web Worker 通訊，對外提供與原本 Ocr 實例相同的 .detect(dataURL) API。
 * 使用方式：
 *   const bridge = new OcrWorkerBridge();
 *   await bridge.init();
 *   const lines = await bridge.detect(dataURL);
 */

export class OcrWorkerBridge {
    constructor() {
        this._worker = null;
        this._ready = false;
        this._readyPromise = null;
        this._pendingRequests = new Map(); // id → { resolve, reject }
        this._nextId = 0;
    }

    /**
     * 初始化 Worker 並載入 OCR 模型
     * @returns {Promise<void>} resolve 時表示 Worker 已就緒
     */
    init() {
        if (this._readyPromise) return this._readyPromise;

        this._readyPromise = new Promise((resolve, reject) => {
            try {
                this._worker = new Worker(
                    new URL('../workers/ocrWorker.js', import.meta.url),
                    { type: 'module' }
                );
            } catch (err) {
                console.error('[OCR Bridge] 無法建立 Worker:', err);
                reject(err);
                return;
            }

            this._worker.onmessage = (e) => {
                const { type, id, lines, error } = e.data;

                if (type === 'ready') {
                    this._ready = true;
                    console.log('[OCR Bridge] Worker 已就緒');
                    resolve();
                    return;
                }

                if (type === 'error' && !this._ready) {
                    reject(new Error(error));
                    return;
                }

                if (type === 'result') {
                    const pending = this._pendingRequests.get(id);
                    if (pending) {
                        this._pendingRequests.delete(id);
                        if (error) {
                            pending.reject(new Error(error));
                        } else {
                            pending.resolve(lines);
                        }
                    }
                }
            };

            this._worker.onerror = (err) => {
                console.error('[OCR Bridge] Worker 錯誤:', err);
                if (!this._ready) reject(err);
            };

            // 啟動初始化
            const baseUrl = import.meta.env.BASE_URL;
            this._worker.postMessage({ type: 'init', baseUrl });
        });

        return this._readyPromise;
    }

    /**
     * 執行 OCR 辨識（非同步，不阻塞主線程）
     * @param {string} dataURL - 圖片的 data URL
     * @returns {Promise<Array<{text: string}>>} 辨識結果
     */
    detect(dataURL) {
        if (!this._ready || !this._worker) {
            return Promise.resolve([]);
        }

        const id = this._nextId++;
        return new Promise((resolve, reject) => {
            this._pendingRequests.set(id, { resolve, reject });
            this._worker.postMessage({ type: 'detect', id, dataURL });
        });
    }

    /**
     * 銷毀 Worker
     */
    destroy() {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._ready = false;
        this._readyPromise = null;
        // 拒絕所有待處理的請求
        for (const [, pending] of this._pendingRequests) {
            pending.reject(new Error('Worker destroyed'));
        }
        this._pendingRequests.clear();
    }
}
