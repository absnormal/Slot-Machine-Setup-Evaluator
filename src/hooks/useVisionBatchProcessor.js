import { useState, useRef } from 'react';
import { fetchWithRetry, resizeImageBase64 } from '../utils/helpers';
import { validateVisionResponse } from '../utils/aiValidator';
import { isCashSymbol, isCollectSymbol, isDynamicMultiplierSymbol } from '../utils/symbolUtils';
import { apiKey } from '../utils/constants';
import {
    buildCashRule, buildDynamicMultiplierRule, buildMultiplierReelRule,
    buildBetRule, buildPickRule, buildConfusableWarning,
    buildVisionSystemPrompt, buildVisionGenerationConfig,
    buildMultiplierImagePrompt, buildBetImagePrompt
} from '../config/promptTemplates';

const CACHE_KEYS = {
    MAIN: 'SLOT_P3_CACHE_MAIN',
    MULT: 'SLOT_P3_CACHE_MULT',
    BET: 'SLOT_P3_CACHE_BET'
};

export function useVisionBatchProcessor({
    visionImages,
    setVisionImages,
    setActiveVisionId,
    template,
    availableSymbols,
    customApiKey,
    visionP1,
    visionP1Mult,
    visionP1Bet,
    hasBetBox,
    collectShowsTotalWin,
    setTemplateMessage,
    setTemplateError
}) {
    const [isVisionProcessing, setIsVisionProcessing] = useState(false);
    const isVisionCanceled = useRef(false);
    const [isVisionStopping, setIsVisionStopping] = useState(false);
    const [visionBatchProgress, setVisionBatchProgress] = useState({ current: 0, total: 0 });

    const performAIVisionBatchMatching = async () => {
        if (visionImages.length === 0 || !template) {
            setTemplateError("請先上傳截圖，並確保已經完成 Phase 1 模板設定！");
            return;
        }

        // 儲存選取框位置到快取
        try {
            localStorage.setItem(CACHE_KEYS.MAIN, JSON.stringify(visionP1));
            localStorage.setItem(CACHE_KEYS.MULT, JSON.stringify(visionP1Mult));
            localStorage.setItem(CACHE_KEYS.BET, JSON.stringify(visionP1Bet));
        } catch (e) {
            console.warn("Failed to save vision box cache:", e);
        }

        const effectiveApiKey = customApiKey.trim() || apiKey;
        const modelName = "gemini-3.1-flash-lite-preview";

        let toProcess = visionImages.filter(img => !img.grid);
        if (toProcess.length === 0) {
            toProcess = visionImages;
        }

        setIsVisionProcessing(true);
        setIsVisionStopping(false);
        isVisionCanceled.current = false;
        setVisionBatchProgress({ current: 0, total: toProcess.length });
        setTemplateMessage(`AI 準備批次處理 ${toProcess.length} 張盤面中...`);

        let currentVisionImages = [...visionImages];

        const referenceImages = [];
        let referenceText = "Symbol references:\n";
        let partIndex = 1;

        for (const symbol in template.symbolImagesAll) {
            const urls = template.symbolImagesAll[symbol];
            if (urls && urls.length > 0) {
                referenceText += `- ${symbol}: img ${urls.map((_, i) => partIndex + i).join(',')}\n`;
                for (const url of urls) {
                    try {
                        const resized = await resizeImageBase64(url, 256, 0.7);
                        referenceImages.push({
                            inlineData: { mimeType: resized.mimeType, data: resized.base64 }
                        });
                    } catch {
                        const b64 = url.split(',')[1];
                        if (b64) referenceImages.push({ inlineData: { mimeType: "image/png", data: b64 } });
                    }
                    partIndex++;
                }
            }
        }

        const hasCashOrCollect = availableSymbols.some(sym => isCashSymbol(sym, template.jpConfig) || isCollectSymbol(sym));
        const cashRule = buildCashRule(hasCashOrCollect, collectShowsTotalWin);
        const dynamicMultiplierRule = buildDynamicMultiplierRule(template?.hasDynamicMultiplier);
        const multiplierRule = buildMultiplierReelRule(template);
        const betRule = buildBetRule(hasBetBox);
        const pickRule = buildPickRule(template);
        const confusableWarning = buildConfusableWarning(availableSymbols);

        const fixedPrefixParts = [
            { text: referenceText },
            ...referenceImages,
            { text: buildVisionSystemPrompt(template, availableSymbols, pickRule, cashRule, multiplierRule, dynamicMultiplierRule, betRule, confusableWarning) }
        ];

        for (let i = 0; i < toProcess.length; i++) {
            if (isVisionCanceled.current) {
                setTemplateMessage("已停止批量辨識");
                break;
            }

            const targetImg = toProcess[i];
            const imgIndex = currentVisionImages.findIndex(img => img.id === targetImg.id);

            setActiveVisionId(targetImg.id);
            setVisionBatchProgress({ current: i + 1, total: toProcess.length });

            try {
                const offCanvas1 = document.createElement('canvas');
                const rx1 = (visionP1.x / 100) * targetImg.obj.width;
                const ry1 = (visionP1.y / 100) * targetImg.obj.height;
                const rw1 = (visionP1.w / 100) * targetImg.obj.width;
                const rh1 = (visionP1.h / 100) * targetImg.obj.height;
                offCanvas1.width = rw1;
                offCanvas1.height = rh1;
                const ctx1 = offCanvas1.getContext('2d');
                ctx1.drawImage(targetImg.obj, rx1, ry1, rw1, rh1, 0, 0, rw1, rh1);

                // 繪製紅色格線標記，幫助 AI 識別格子邊界
                const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;
                const cellW = rw1 / displayCols;
                const cellH = rh1 / template.rows;
                ctx1.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                ctx1.lineWidth = Math.max(2, Math.floor(Math.min(rw1, rh1) / 200));
                for (let c = 1; c < displayCols; c++) {
                    ctx1.beginPath();
                    ctx1.moveTo(c * cellW, 0);
                    ctx1.lineTo(c * cellW, rh1);
                    ctx1.stroke();
                }
                for (let r = 1; r < template.rows; r++) {
                    ctx1.beginPath();
                    ctx1.moveTo(0, r * cellH);
                    ctx1.lineTo(rw1, r * cellH);
                    ctx1.stroke();
                }

                const raw1 = offCanvas1.toDataURL('image/jpeg', 0.75).split(',')[1];
                const resized1 = await resizeImageBase64(`data:image/jpeg;base64,${raw1}`, 768, 0.75);

                const currentParts = [
                    ...fixedPrefixParts,
                    { text: "ANALYZE NOW:\n" },
                    { text: "Image 1: Main Grid (Columns 1 to " + (template.hasMultiplierReel ? template.cols - 1 : template.cols) + ")\n" },
                    { inlineData: { mimeType: resized1.mimeType, data: resized1.base64 } }
                ];

                if (template.hasMultiplierReel) {
                    const offCanvas2 = document.createElement('canvas');
                    const rx2 = (visionP1Mult.x / 100) * targetImg.obj.width;
                    const ry2 = (visionP1Mult.y / 100) * targetImg.obj.height;
                    const rw2 = (visionP1Mult.w / 100) * targetImg.obj.width;
                    const rh2 = (visionP1Mult.h / 100) * targetImg.obj.height;
                    offCanvas2.width = rw2;
                    offCanvas2.height = rh2;
                    const ctx2 = offCanvas2.getContext('2d');
                    ctx2.drawImage(targetImg.obj, rx2, ry2, rw2, rh2, 0, 0, rw2, rh2);

                    const raw2 = offCanvas2.toDataURL('image/jpeg', 0.5).split(',')[1];
                    const resized2 = await resizeImageBase64(`data:image/jpeg;base64,${raw2}`, 320, 0.5);

                    currentParts.push({ text: "Image 2: Multiplier Cell (Center cell of the last column)\n" });
                    currentParts.push({ inlineData: { mimeType: resized2.mimeType, data: resized2.base64 } });
                    currentParts.push({ text: buildMultiplierImagePrompt(template) });
                }

                if (hasBetBox) {
                    const offCanvas3 = document.createElement('canvas');
                    const rx3 = (visionP1Bet.x / 100) * targetImg.obj.width;
                    const ry3 = (visionP1Bet.y / 100) * targetImg.obj.height;
                    const rw3 = (visionP1Bet.w / 100) * targetImg.obj.width;
                    const rh3 = (visionP1Bet.h / 100) * targetImg.obj.height;
                    offCanvas3.width = rw3;
                    offCanvas3.height = rh3;
                    const ctx3 = offCanvas3.getContext('2d');
                    ctx3.drawImage(targetImg.obj, rx3, ry3, rw3, rh3, 0, 0, rw3, rh3);

                    const raw3 = offCanvas3.toDataURL('image/jpeg', 0.5).split(',')[1];
                    const resized3 = await resizeImageBase64(`data:image/jpeg;base64,${raw3}`, 320, 0.5);

                    currentParts.push({ text: "Image 3: BET Area\n" });
                    currentParts.push({ inlineData: { mimeType: resized3.mimeType, data: resized3.base64 } });
                    currentParts.push({ text: buildBetImagePrompt() });
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;

                const payload = {
                    contents: [{
                        role: "user",
                        parts: currentParts
                    }],
                    generationConfig: buildVisionGenerationConfig()
                };

                const result = await fetchWithRetry(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonText) throw new Error("無法從 AI 取得有效回應，請確認 API Key 是否正確。");

                const responseData = JSON.parse(jsonText);
                
                // 套用全新的結構校驗機制 (若失敗會在內部拋出 Error 藉此標示發生幻覺)
                const { grid: safeGrid, bet: validatedBet } = validateVisionResponse(responseData, template, availableSymbols);
                const finalBet = (hasBetBox && validatedBet !== null) ? validatedBet : currentVisionImages[imgIndex].bet;

                console.log(`%c=== AI 辨識結果 (圖片: ${targetImg.file?.name || '未知'}) ===`, 'color: #4f46e5; font-weight: bold; font-size: 14px;');
                if (hasBetBox && validatedBet !== null) {
                    console.log(`%c👉 辨識押注: ${validatedBet}`, 'color: #10b981; font-weight: bold;');
                }
                console.table(safeGrid);

                currentVisionImages[imgIndex] = {
                    ...currentVisionImages[imgIndex],
                    grid: safeGrid,
                    bet: finalBet,
                    error: ''
                };
                setVisionImages([...currentVisionImages]);

            } catch (err) {
                console.warn("AI 辨識錯誤:", err);
                currentVisionImages[imgIndex] = { ...currentVisionImages[imgIndex], error: "辨識失敗：" + err.message };
                setVisionImages([...currentVisionImages]);
            }

            if (i < toProcess.length - 1) {
                if (isVisionCanceled.current) {
                    setTemplateMessage("已停止批量辨識");
                    break;
                }
                await new Promise(res => setTimeout(res, 1500));
            }
        }

        setIsVisionProcessing(false);
        setIsVisionStopping(false);
        setVisionBatchProgress({ current: 0, total: 0 });

        if (!isVisionCanceled.current) {
            setTemplateMessage(`✅ 批次辨識完成！共處理 ${toProcess.length} 張圖片。`);
            setTimeout(() => setTemplateMessage(''), 5000);
        } else {
            setTimeout(() => setTemplateMessage(''), 5000);
        }
    };

    const cancelVisionProcessing = () => {
        isVisionCanceled.current = true;
        setIsVisionStopping(true);
    };

    return {
        isVisionProcessing,
        isVisionStopping,
        visionBatchProgress,
        performAIVisionBatchMatching,
        cancelVisionProcessing
    };
}
