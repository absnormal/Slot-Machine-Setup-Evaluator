/**
 * ocrWorker.js — PaddleOCR Web Worker
 *
 * 在獨立線程中執行 OCR 推論，完全不阻塞主線程。
 * 使用 OffscreenCanvas polyfill 讓 @gutenye/ocr-browser 能在 Worker 中運作。
 */

// ─── 1. Polyfill DOM API（必須在 import OCR 套件之前設定）───

globalThis.document = {
    createElement: (tag) => {
        if (tag === 'canvas') return new OffscreenCanvas(1, 1);
        throw new Error(`[OCR Worker] Cannot create <${tag}> in Worker`);
    },
    body: { append: () => {} }
};

globalThis.HTMLCanvasElement = OffscreenCanvas;

// Image polyfill：用 createImageBitmap 替代瀏覽器原生 Image
globalThis.Image = class WorkerImage {
    constructor() {
        this._bitmap = null;
        this._url = '';
        this.naturalWidth = 0;
        this.naturalHeight = 0;
    }
    set src(url) { this._url = url; }
    get src() { return this._url; }
    get width() { return this._bitmap?.width ?? this.naturalWidth; }
    get height() { return this._bitmap?.height ?? this.naturalHeight; }
    async decode() {
        const res = await fetch(this._url);
        const blob = await res.blob();
        this._bitmap = await createImageBitmap(blob);
        this.naturalWidth = this._bitmap.width;
        this.naturalHeight = this._bitmap.height;
    }
};

// 攔截 drawImage 讓它能接受 WorkerImage (內部取 ImageBitmap)
const _origGetCtx = OffscreenCanvas.prototype.getContext;
OffscreenCanvas.prototype.getContext = function (...args) {
    const ctx = _origGetCtx.apply(this, args);
    if (ctx && !ctx._patched) {
        const _origDraw = ctx.drawImage.bind(ctx);
        ctx.drawImage = function (src, ...rest) {
            if (src && src._bitmap) return _origDraw(src._bitmap, ...rest);
            return _origDraw(src, ...rest);
        };
        ctx._patched = true;
    }
    return ctx;
};

// ─── 2. 訊息處理 ───

let ocrInstance = null;
let isReady = false;

self.onmessage = async (e) => {
    const { type, id } = e.data;

    if (type === 'init') {
        try {
            const { baseUrl } = e.data;
            const ort = await import('onnxruntime-web');
            ort.env.wasm.wasmPaths = baseUrl;
            ort.env.wasm.numThreads = 1;

            const { default: Ocr } = await import('@gutenye/ocr-browser');
            ocrInstance = await Ocr.create({
                models: {
                    detectionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_det_infer.onnx`,
                    recognitionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_rec_infer.onnx`,
                    dictionaryPath: `${baseUrl}ocr-models/ppocr_keys_v1.txt`
                }
            });
            isReady = true;
            self.postMessage({ type: 'ready' });
            console.log('[OCR Worker] PaddleOCR 載入完成');
        } catch (err) {
            console.error('[OCR Worker] 初始化失敗:', err);
            self.postMessage({ type: 'error', error: err.message });
        }
        return;
    }

    if (type === 'detect') {
        if (!isReady || !ocrInstance) {
            self.postMessage({ type: 'result', id, lines: [], error: 'OCR not ready' });
            return;
        }
        try {
            const lines = await ocrInstance.detect(e.data.dataURL);
            self.postMessage({ type: 'result', id, lines: lines || [] });
        } catch (err) {
            self.postMessage({ type: 'result', id, lines: [], error: err.message });
        }
    }
};
