import { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { fetchWithRetry, resizeImageBase64 } from '../utils/helpers';
import { validateVisionResponse } from '../utils/aiValidator';
import { isCashSymbol, isCollectSymbol, isDynamicMultiplierSymbol } from '../utils/symbolUtils';
import { apiKey } from '../utils/constants';
import { computeGridResults } from '../engine/computeGridResults';
import {
    buildCashRule, buildDynamicMultiplierRule, buildMultiplierReelRule,
    buildBetRule, buildPickRule, buildConfusableWarning,
    buildVisionSystemPrompt, buildVisionGenerationConfig,
    buildMultiplierImagePrompt, buildBetImagePrompt
} from '../config/promptTemplates';

/**
 * useAutoRecognition — 自動辨識 Pipeline
 *
 * 將候選關鍵幀自動送往 Gemini Vision 辨識盤面符號，
 * + Tesseract.js 辨識 Win/Balance/Bet 數值，
 * + computeGridResults 結算。
 *
 * 完全複用現有 Phase 3 的 prompt 模板和驗證邏輯。
 */

// ── 速率控制常數 ──
const RATE_LIMIT_INTERVAL = 1500;   // API 呼叫間隔 (ms)
const MAX_RETRIES = 3;

// ── OCR 工具函式 (從 useVideoProcessor 搬入) ──

/**
 * 裁切 ROI → 放大 → 二值化 → 侵蝕 → Tesseract OCR
 */
async function recognizeROIText(fullCanvas, roi, ocrWorker, ocrDecimalPlaces, useFixedDecimal = true) {
    if (!roi || !ocrWorker) return '';
    try {
        const cropCanvas = document.createElement('canvas');
        const cw = Math.floor(fullCanvas.width * (roi.w / 100));
        const ch = Math.floor(fullCanvas.height * (roi.h / 100));
        const cx = Math.floor(fullCanvas.width * (roi.x / 100));
        const cy = Math.floor(fullCanvas.height * (roi.y / 100));

        const scale = 3;
        cropCanvas.width = cw * scale;
        cropCanvas.height = ch * scale;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(fullCanvas, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);

        // 影像增強：自適應二值化
        const imgData = ctx.getImageData(0, 0, cw * scale, ch * scale);
        const data = imgData.data;
        let totalGray = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalGray += (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11);
        }
        const avgGray = totalGray / (cw * scale * ch * scale);
        const thresholdOffset = useFixedDecimal ? 30 : 15;
        const threshold = Math.max(100, Math.min(180, avgGray + thresholdOffset));

        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
            const v = gray > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);

        // 形態學侵蝕
        const kernelSize = useFixedDecimal ? 1 : 0;
        if (kernelSize > 0) {
            const w = cw * scale, h = ch * scale;
            const eroded = ctx.getImageData(0, 0, w, h);
            const eData = eroded.data;
            const src = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) src[i] = data[i * 4];

            for (let y = kernelSize; y < h - kernelSize; y++) {
                for (let x = kernelSize; x < w - kernelSize; x++) {
                    let minVal = 255;
                    for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                        for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                            minVal = Math.min(minVal, src[(y + ky) * w + (x + kx)]);
                        }
                    }
                    const idx = (y * w + x) * 4;
                    eData[idx] = eData[idx + 1] = eData[idx + 2] = minVal;
                }
            }
            ctx.putImageData(eroded, 0, 0);
        }

        const { data: { text } } = await ocrWorker.recognize(cropCanvas);

        // 後處理：取最後一組數字
        let validText = text;
        const numberBlocks = text.match(/[0-9.,]+/g);
        if (numberBlocks && numberBlocks.length > 0) {
            validText = numberBlocks[numberBlocks.length - 1];
        } else {
            validText = '';
        }

        if (useFixedDecimal) {
            let digits = validText.replace(/[^0-9]/g, '');
            let cleaned = '0';
            if (digits) {
                if (ocrDecimalPlaces > 0) {
                    if (digits.length <= ocrDecimalPlaces) {
                        digits = digits.padStart(ocrDecimalPlaces + 1, '0');
                    }
                    const intPart = digits.slice(0, -ocrDecimalPlaces);
                    const decPart = digits.slice(-ocrDecimalPlaces);
                    cleaned = `${intPart}.${decPart}`;
                } else {
                    cleaned = digits;
                }
            }
            return cleaned || '0';
        } else {
            const cleaned = validText
                .replace(/,/g, '')
                .replace(/^\.+|\.+$/g, '')
                .replace(/\.{2,}/g, '.');
            return cleaned || '0';
        }
    } catch (err) {
        console.error('OCR Error:', err);
        return 'Err';
    }
}


// ══════════════════════════════════════════════
// Hook 本體
// ══════════════════════════════════════════════

export function useAutoRecognition({
    template,
    availableSymbols,
    customApiKey,
    setTemplateMessage,
    setTemplateError
}) {
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [recognitionProgress, setRecognitionProgress] = useState({ current: 0, total: 0 });
    const isCanceledRef = useRef(false);
    const [isStopping, setIsStopping] = useState(false);

    // OCR Worker (持久化)
    const ocrWorkerRef = useRef(null);

    useEffect(() => {
        let worker = null;
        (async () => {
            worker = await createWorker('eng');
            await worker.setParameters({ tessedit_pageseg_mode: '7' });
            ocrWorkerRef.current = worker;
        })();
        return () => { if (worker) worker.terminate(); };
    }, []);

    /**
     * 批次辨識候選幀
     * @param {Array} candidates - 來自 useKeyframeExtractor
     * @param {Function} updateCandidate - 更新候選幀狀態的回呼
     * @param {Object} rois - { reelROI, winROI, balanceROI, betROI }
     * @param {number} ocrDecimalPlaces
     */
    const recognizeBatch = async (candidates, updateCandidate, rois, ocrDecimalPlaces = 2) => {
        if (!template || candidates.length === 0) {
            setTemplateError?.('請確認已完成 Phase 1 模板設定，且有候選幀可辨識');
            return;
        }

        const toProcess = candidates.filter(c => c.status === 'pending' || c.status === 'error');
        if (toProcess.length === 0) {
            setTemplateMessage?.('所有候選幀已辨識完成');
            return;
        }

        const effectiveApiKey = (customApiKey || '').trim() || apiKey;
        if (!effectiveApiKey) {
            setTemplateError?.('請先設定 Gemini API Key');
            return;
        }

        setIsRecognizing(true);
        setIsStopping(false);
        isCanceledRef.current = false;
        setRecognitionProgress({ current: 0, total: toProcess.length });
        setTemplateMessage?.(`🤖 開始辨識 ${toProcess.length} 張候選幀...`);

        // 組裝符號參考圖（與 useVisionBatchProcessor 相同邏輯）
        const referenceImages = [];
        let referenceText = 'Symbol references:\n';
        let partIndex = 1;

        if (template.symbolImagesAll) {
            for (const symbol in template.symbolImagesAll) {
                const urls = template.symbolImagesAll[symbol];
                if (urls && urls.length > 0) {
                    referenceText += `- ${symbol}: img ${urls.map((_, i) => partIndex + i).join(',')}\n`;
                    for (const url of urls) {
                        try {
                            const resized = await resizeImageBase64(url, 256, 0.7);
                            referenceImages.push({ inlineData: { mimeType: resized.mimeType, data: resized.base64 } });
                        } catch {
                            const b64 = url.split(',')[1];
                            if (b64) referenceImages.push({ inlineData: { mimeType: 'image/png', data: b64 } });
                        }
                        partIndex++;
                    }
                }
            }
        }

        // 組裝 prompt 規則
        const hasCashOrCollect = (availableSymbols || []).some(sym =>
            isCashSymbol(sym, template.jpConfig) || isCollectSymbol(sym)
        );
        const cashRule = buildCashRule(hasCashOrCollect, false);
        const dynamicMultiplierRule = buildDynamicMultiplierRule(template?.hasDynamicMultiplier);
        const multiplierRule = buildMultiplierReelRule(template);
        const betRule = buildBetRule(!!rois.betROI);
        const pickRule = buildPickRule(template);
        const confusableWarning = buildConfusableWarning(availableSymbols || []);

        const fixedPrefixParts = [
            { text: referenceText },
            ...referenceImages,
            { text: buildVisionSystemPrompt(template, availableSymbols || [], pickRule, cashRule, multiplierRule, dynamicMultiplierRule, betRule, confusableWarning) }
        ];

        const modelName = 'gemini-3.1-flash-lite-preview';

        // 逐張辨識
        for (let i = 0; i < toProcess.length; i++) {
            if (isCanceledRef.current) {
                setTemplateMessage?.('已停止批次辨識');
                break;
            }

            const kf = toProcess[i];
            setRecognitionProgress({ current: i + 1, total: toProcess.length });
            updateCandidate(kf.id, { status: 'recognizing' });

            try {
                // ── A. Gemini Vision 辨識盤面符號 ──
                const gridResult = await recognizeGrid(
                    kf.canvas, rois, template, availableSymbols, fixedPrefixParts, modelName, effectiveApiKey
                );

                // ── B. Tesseract OCR 辨識數值 (並行) ──
                const [winText, balanceText, betText] = await Promise.all([
                    recognizeROIText(kf.canvas, rois.winROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(kf.canvas, rois.balanceROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(kf.canvas, rois.betROI, ocrWorkerRef.current, ocrDecimalPlaces, false)
                ]);

                // ── C. 結算 ──
                const betValue = gridResult.bet || parseFloat(betText) || 100;
                const { results: settlement } = computeGridResults(template, gridResult.grid, betValue);

                updateCandidate(kf.id, {
                    status: 'recognized',
                    recognitionResult: {
                        grid: gridResult.grid,
                        win: winText,
                        balance: balanceText,
                        bet: betText,
                        betValue,
                        settlement,
                        totalWin: settlement?.totalWin || 0
                    },
                    error: ''
                });

            } catch (err) {
                console.warn('辨識錯誤:', err);
                updateCandidate(kf.id, {
                    status: 'error',
                    error: err.message
                });
            }

            // 速率控制
            if (i < toProcess.length - 1 && !isCanceledRef.current) {
                await new Promise(r => setTimeout(r, RATE_LIMIT_INTERVAL));
            }
        }

        setIsRecognizing(false);
        setIsStopping(false);
        setRecognitionProgress({ current: 0, total: 0 });

        if (!isCanceledRef.current) {
            const recognized = toProcess.filter((_, idx) => idx <= toProcess.length);
            setTemplateMessage?.(`✅ 辨識完成！共處理 ${toProcess.length} 張候選幀`);
        }
    };

    const cancelRecognition = () => {
        isCanceledRef.current = true;
        setIsStopping(true);
    };

    return {
        isRecognizing, isStopping,
        recognitionProgress,
        recognizeBatch,
        cancelRecognition
    };
}


// ══════════════════════════════════════════════
// Gemini Vision 辨識（複用 Phase 3 邏輯）
// ══════════════════════════════════════════════

async function recognizeGrid(canvas, rois, template, availableSymbols, fixedPrefixParts, modelName, effectiveApiKey) {
    const { reelROI } = rois;

    // 裁切盤面 ROI + 繪製紅色格線
    const offCanvas = document.createElement('canvas');
    const rx = Math.floor(canvas.width * (reelROI.x / 100));
    const ry = Math.floor(canvas.height * (reelROI.y / 100));
    const rw = Math.floor(canvas.width * (reelROI.w / 100));
    const rh = Math.floor(canvas.height * (reelROI.h / 100));
    offCanvas.width = rw;
    offCanvas.height = rh;
    const ctx = offCanvas.getContext('2d');
    ctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

    // 繪製紅色格線
    const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;
    const cellW = rw / displayCols;
    const cellH = rh / template.rows;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(rw, rh) / 200));
    for (let c = 1; c < displayCols; c++) {
        ctx.beginPath(); ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, rh); ctx.stroke();
    }
    for (let r = 1; r < template.rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * cellH); ctx.lineTo(rw, r * cellH); ctx.stroke();
    }

    const raw = offCanvas.toDataURL('image/jpeg', 0.75).split(',')[1];
    const resized = await resizeImageBase64(`data:image/jpeg;base64,${raw}`, 768, 0.75);

    const currentParts = [
        ...fixedPrefixParts,
        { text: 'ANALYZE NOW:\n' },
        { text: `Image 1: Main Grid (Columns 1 to ${displayCols})\n` },
        { inlineData: { mimeType: resized.mimeType, data: resized.base64 } }
    ];

    // 乘倍列
    if (template.hasMultiplierReel && rois.multiplierROI) {
        const mRoi = rois.multiplierROI;
        const mCanvas = document.createElement('canvas');
        const mx = Math.floor(canvas.width * (mRoi.x / 100));
        const my = Math.floor(canvas.height * (mRoi.y / 100));
        const mw = Math.floor(canvas.width * (mRoi.w / 100));
        const mh = Math.floor(canvas.height * (mRoi.h / 100));
        mCanvas.width = mw; mCanvas.height = mh;
        mCanvas.getContext('2d').drawImage(canvas, mx, my, mw, mh, 0, 0, mw, mh);

        const mRaw = mCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        const mResized = await resizeImageBase64(`data:image/jpeg;base64,${mRaw}`, 320, 0.5);
        currentParts.push({ text: 'Image 2: Multiplier Cell\n' });
        currentParts.push({ inlineData: { mimeType: mResized.mimeType, data: mResized.base64 } });
        currentParts.push({ text: buildMultiplierImagePrompt(template) });
    }

    // BET 區
    if (rois.betROI) {
        const bRoi = rois.betROI;
        const bCanvas = document.createElement('canvas');
        const bx = Math.floor(canvas.width * (bRoi.x / 100));
        const by = Math.floor(canvas.height * (bRoi.y / 100));
        const bw = Math.floor(canvas.width * (bRoi.w / 100));
        const bh = Math.floor(canvas.height * (bRoi.h / 100));
        bCanvas.width = bw; bCanvas.height = bh;
        bCanvas.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);

        const bRaw = bCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        const bResized = await resizeImageBase64(`data:image/jpeg;base64,${bRaw}`, 320, 0.5);
        currentParts.push({ text: 'Image 3: BET Area\n' });
        currentParts.push({ inlineData: { mimeType: bResized.mimeType, data: bResized.base64 } });
        currentParts.push({ text: buildBetImagePrompt() });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;
    const payload = {
        contents: [{ role: 'user', parts: currentParts }],
        generationConfig: buildVisionGenerationConfig()
    };

    const result = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) throw new Error('AI 無回應，請確認 API Key');

    const responseData = JSON.parse(jsonText);
    const { grid, bet } = validateVisionResponse(responseData, template, availableSymbols || []);

    return { grid, bet };
}
