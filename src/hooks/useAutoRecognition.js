import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchWithRetry, resizeImageBase64 } from '../utils/helpers';
import { validateVisionResponse } from '../utils/aiValidator';
import { isCashSymbol, isCollectSymbol, isDynamicMultiplierSymbol } from '../utils/symbolUtils';
import { apiKey } from '../utils/constants';
import { computeGridResults } from '../engine/computeGridResults';
import { buildReferenceIndex, recognizeBoard } from '../engine/localBoardRecognizer';
import {
    buildCashRule, buildDynamicMultiplierRule, buildMultiplierReelRule,
    buildBetRule, buildPickRule, buildConfusableWarning,
    buildVisionSystemPrompt, buildVisionGenerationConfig,
    buildMultiplierImagePrompt, buildBetImagePrompt
} from '../config/promptTemplates';
import { recognizeROIText, createOcrWorker } from '../utils/ocrUtils';

/**
 * useAutoRecognition — 自動辨識 Pipeline
 *
 * 將候選關鍵幀自動送往 Gemini Vision 辨識盤面符號，
 * + PaddleOCR 辨識 Win/Balance/Bet 數值，
 * + computeGridResults 結算。
 *
 * 完全複用現有 Phase 3 的 prompt 模板和驗證邏輯。
 */

// ── 速率控制常數 ──
const RATE_LIMIT_INTERVAL = 1500;   // API 呼叫間隔 (ms)
const MAX_RETRIES = 3;


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
        let isMounted = true;
        (async () => {
            const ocr = await createOcrWorker();
            if (isMounted && ocr) {
                ocrWorkerRef.current = ocr;
            }
        })();
        return () => { isMounted = false; };
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

        const toProcess = candidates.filter(c =>
            (c.status === 'pending' || c.status === 'error') &&
            c.ocrData?.win && parseFloat(c.ocrData.win) > 0
        );
        if (toProcess.length === 0) {
            setTemplateMessage?.('沒有需要辨識的贏分盤面（僅辨識 WIN > 0 的幀）');
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
                const targetCanvas = kf.winPollCanvas || kf.canvas;
                const gridResult = await recognizeGrid(
                    targetCanvas, rois, template, availableSymbols, fixedPrefixParts, modelName, effectiveApiKey
                );

                // ── B. Tesseract OCR 辨識數值 (並行) ──
                const [winText, balanceText, betText] = await Promise.all([
                    recognizeROIText(targetCanvas, rois.winROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(targetCanvas, rois.balanceROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(targetCanvas, rois.betROI, ocrWorkerRef.current, ocrDecimalPlaces, false)
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

    /**
     * 本地辨識盤面（純 Canvas Template Matching，不需要 API Key）
     */
    const referenceIndexRef = useRef(null);

    // 當 template 變更時，清除快取讓下次辨識重建索引
    useEffect(() => {
        referenceIndexRef.current = null;
    }, [template?.id]);

    const recognizeLocalBatch = async (candidates, updateCandidate, rois, ocrDecimalPlaces = 2) => {
        if (!template || candidates.length === 0) {
            setTemplateMessage?.('請確認已完成 Phase 1 模板設定，且有候選幀可辨識');
            return;
        }

        // 如果是單張指定辨識（candidates.length === 1），則放寬條件強制辨識
        const toProcess = candidates.length === 1 ? candidates : candidates.filter(c =>
            (c.status === 'pending' || c.status === 'error') &&
            c.ocrData?.win && parseFloat(c.ocrData.win) > 0
        );
        
        if (toProcess.length === 0) {
            setTemplateMessage?.('沒有需要辨識的贏分盤面（僅辨識 WIN > 0 的幀）');
            return;
        }

        if (!template.symbolImagesAll || Object.keys(template.symbolImagesAll).length === 0) {
            setTemplateMessage?.('⚠️ 模板中沒有符號參考圖，無法進行本地辨識');
            return;
        }

        setIsRecognizing(true);
        setIsStopping(false);
        isCanceledRef.current = false;
        setRecognitionProgress({ current: 0, total: toProcess.length });

        // 建立參考索引（只需建一次，之後快取）
        if (!referenceIndexRef.current) {
            setTemplateMessage?.('🔧 正在建立符號參考索引...');
            referenceIndexRef.current = await buildReferenceIndex(template.symbolImagesAll);
        }
        const refIndex = referenceIndexRef.current;

        setTemplateMessage?.(`🖥️ 開始本地辨識 ${toProcess.length} 張候選幀...`);

        const { reelROI } = rois;
        const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;

        // 將百分比 ROI 轉成像素座標的輔助函式
        const toPixelROI = (canvas, pctROI) => ({
            x: Math.floor(canvas.width * (pctROI.x / 100)),
            y: Math.floor(canvas.height * (pctROI.y / 100)),
            width: Math.floor(canvas.width * (pctROI.w / 100)),
            height: Math.floor(canvas.height * (pctROI.h / 100)),
        });

        for (let i = 0; i < toProcess.length; i++) {
            if (isCanceledRef.current) {
                setTemplateMessage?.('已停止本地辨識');
                break;
            }

            const kf = toProcess[i];
            setRecognitionProgress({ current: i + 1, total: toProcess.length });
            updateCandidate(kf.id, { status: 'recognizing' });

            try {
                const targetCanvas = kf.winPollCanvas || kf.canvas;
                const pixelROI = toPixelROI(targetCanvas, reelROI);
                const { grid, details } = recognizeBoard(targetCanvas, pixelROI, template.rows, displayCols, refIndex);

                // 讀 OCR 數值（與 Gemini 流程一致）
                const [winText, balanceText, betText] = await Promise.all([
                    recognizeROIText(targetCanvas, rois.winROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(targetCanvas, rois.balanceROI, ocrWorkerRef.current, ocrDecimalPlaces, true),
                    recognizeROIText(targetCanvas, rois.betROI, ocrWorkerRef.current, ocrDecimalPlaces, false)
                ]);

                const betValue = parseFloat(betText) || 100;
                const { results: settlement } = computeGridResults(template, grid, betValue);

                // 計算平均 confidence
                const allConf = details.flat().map(d => d.confidence);
                const avgConf = allConf.reduce((s, v) => s + v, 0) / allConf.length;

                updateCandidate(kf.id, {
                    status: 'recognized',
                    recognitionResult: {
                        grid,
                        win: winText,
                        balance: balanceText,
                        bet: betText,
                        betValue,
                        settlement,
                        totalWin: settlement?.totalWin || 0,
                        localMatch: true,
                        avgConfidence: parseFloat(avgConf.toFixed(1)),
                        matchDetails: details
                    },
                    error: ''
                });

            } catch (err) {
                console.warn('本地辨識錯誤:', err);
                updateCandidate(kf.id, {
                    status: 'error',
                    error: err.message
                });
            }
        }

        setIsRecognizing(false);
        setIsStopping(false);
        setRecognitionProgress({ current: 0, total: 0 });

        if (!isCanceledRef.current) {
            setTemplateMessage?.(`✅ 本地辨識完成！共處理 ${toProcess.length} 張候選幀`);
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
        recognizeLocalBatch,
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
