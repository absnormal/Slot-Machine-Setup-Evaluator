/**
 * ocrUtils.js — 通用的數字 OCR 工具函式（基於 PaddleOCR）
 */

import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

/**
 * 初始化 OCR Worker
 */
export const createOcrWorker = async () => {
    try {
        console.log("[OCR] 啟動 PaddleOCR 引擎中...");
        const baseUrl = import.meta.env.BASE_URL;
        ort.env.wasm.wasmPaths = baseUrl;
        ort.env.wasm.numThreads = 1;

        const ocr = await Ocr.create({
            models: {
                detectionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_det_infer.onnx`,
                recognitionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_rec_infer.onnx`,
                dictionaryPath: `${baseUrl}ocr-models/ppocr_keys_v1.txt`
            }
        });
        return ocr;
    } catch (err) {
        console.error("[OCR] 初始化 PaddleOCR 失敗:", err);
        return null;
    }
};

/**
 * 裁切 ROI → 放大 → PaddleOCR 辨識
 * 
 * @param {HTMLCanvasElement} fullCanvas - 完整的原始截圖
 * @param {Object} roi - 要辨識的區域範圍 {x, y, w, h} (皆為百分比)
 * @param {Object} ocrWorker - 初始化的 @gutenye/ocr-browser worker
 * @param {number} ocrDecimalPlaces - 小數位數設定（目前保留傳入但不強迫處理尾段小數，可保留擴充性）
 * @param {boolean} useFixedDecimal - 是否使用固定小數（保留參數）
 * @returns {Promise<string>} 辨識出的數字字串
 */
export const recognizeROIText = async (fullCanvas, roi, ocrWorker, ocrDecimalPlaces, useFixedDecimal = true) => {
    if (!roi || !ocrWorker) return '';
    try {
        const cropCanvas = document.createElement('canvas');
        const cw = Math.floor(fullCanvas.width * (roi.w / 100));
        const ch = Math.floor(fullCanvas.height * (roi.h / 100));
        const cx = Math.floor(fullCanvas.width * (roi.x / 100));
        const cy = Math.floor(fullCanvas.height * (roi.y / 100));

        // PaddleOCR 容忍度高，降回 2x 即可保留清晰度且縮減運算成本
        let scale = 2;
        if (roi.w > 10 && roi.h > 3) { // 簡單推斷
            scale = 40 / ch;
            if (scale < 1) scale = 1;
        }

        // [關鍵修復] 加上 Padding: DBNet 如果文字太貼齊邊緣，會辨識不到
        const PADDING = 30;
        cropCanvas.width = Math.floor(cw * scale) + (PADDING * 2);
        cropCanvas.height = Math.floor(ch * scale) + (PADDING * 2);
        const ctx = cropCanvas.getContext('2d');
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

        ctx.drawImage(fullCanvas, cx, cy, cw, ch, PADDING, PADDING, cw * scale, ch * scale);

        // 已移除舊有的 Tesseract 取向二值化、侵蝕等灰階轉換。
        // 保留原彩 Canvas 給 PaddleOCR 神經網路處理！

        // 轉換為 Base64 Data URL 傳遞給 Paddle
        const detectedLines = await ocrWorker.detect(cropCanvas.toDataURL('image/png'));

        // 串連多行辨識結果
        const text = (detectedLines || []).map(t => t.text).join(' ').trim();

        // 後處理：PaddleOCR 偶爾會誤認背景裝飾為字母 (例如 $ 或 WIN)，
        // 這裡設定嚴密屏障，只保留純數字 (0-9)、小數點 (.) 與千分位逗號 (,)
        const validText = text.replace(/[^0-9.,]/g, '');
        // 最後移除逗號以便後續 JavaScript 解析，並清掉頭尾不小心沾到的孤立小數點
        const cleaned = validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || "0";
        return cleaned;
    } catch (err) {
        console.error('OCR Error:', err);
        return 'Err';
    }
};
