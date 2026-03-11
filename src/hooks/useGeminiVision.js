import { useState, useCallback, useEffect, useRef } from 'react';
import { toPx, toPct, fetchWithRetry, resizeImageBase64 } from '../utils/helpers';
import { isCashSymbol, isCollectSymbol } from '../utils/symbolUtils';
import { apiKey } from '../utils/constants';

export function useGeminiVision({
    template,
    availableSymbols,
    customApiKey,
    setTemplateMessage,
    setTemplateError,
    visionCanvasRef
}) {
    const [visionImages, setVisionImages] = useState([]);
    const [activeVisionId, setActiveVisionId] = useState(null);

    const [visionP1, setVisionP1] = useState({ x: 10, y: 10, w: 80, h: 80 });
    const [visionP1Mult, setVisionP1Mult] = useState({ x: 92, y: 45, w: 6, h: 10 });
    const [isVisionProcessing, setIsVisionProcessing] = useState(false);
    const isVisionCanceled = useRef(false);
    const [isVisionStopping, setIsVisionStopping] = useState(false);
    const [visionBatchProgress, setVisionBatchProgress] = useState({ current: 0, total: 0 });
    const [visionDragState, setVisionDragState] = useState(null);

    const activeVisionImg = visionImages.find(img => img.id === activeVisionId) || null;
    const visionImageObj = activeVisionImg?.obj || null;
    const visionImageSrc = activeVisionImg?.previewUrl || null;
    const visionGrid = activeVisionImg?.grid || null;
    const visionError = activeVisionImg?.error || null;
    
    // Canvas drawing effect
    useEffect(() => {
        if (visionImageObj && visionCanvasRef?.current) {
            const canvas = visionCanvasRef.current;
            const ctx = canvas.getContext('2d');

            if (activeVisionImg?.grid) {
                // 已辨識完成：僅顯示框選範圍 (裁切)
                const rx = toPx(visionP1.x, visionImageObj.width);
                const ry = toPx(visionP1.y, visionImageObj.height);
                const rw = toPx(visionP1.w, visionImageObj.width);
                const rh = toPx(visionP1.h, visionImageObj.height);

                let cropRx = rx, cropRy = ry, cropRw = rw, cropRh = rh;

                if (template?.hasMultiplierReel) {
                    const rMx = toPx(visionP1Mult.x, visionImageObj.width);
                    const rMy = toPx(visionP1Mult.y, visionImageObj.height);
                    const rMw = toPx(visionP1Mult.w, visionImageObj.width);
                    const rMh = toPx(visionP1Mult.h, visionImageObj.height);

                    const minX = Math.min(rx, rMx);
                    const minY = Math.min(ry, rMy);
                    const maxX = Math.max(rx + rw, rMx + rMw);
                    const maxY = Math.max(ry + rh, rMy + rMh);

                    cropRx = minX;
                    cropRy = minY;
                    cropRw = maxX - minX;
                    cropRh = maxY - minY;
                }

                const paddingX = cropRw * 0.05;
                const paddingY = cropRh * 0.05;
                const bottomPadding = paddingY + 150;

                const cropX = Math.max(0, cropRx - paddingX);
                const cropY = Math.max(0, cropRy - paddingY);
                const cropW = Math.min(visionImageObj.width - cropX, cropRw + paddingX * 2);
                const cropH = Math.min(visionImageObj.height - cropY, cropRh + paddingY + bottomPadding);

                canvas.width = cropW;
                canvas.height = cropH;
                ctx.drawImage(visionImageObj, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

                const relativeRx = rx - cropX;
                const relativeRy = ry - cropY;

                if (template && template.rows > 0 && template.cols > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
                    const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;
                    const cellW = rw / displayCols;
                    const cellH = rh / template.rows;

                    for (let c = 1; c < displayCols; c++) {
                        const lx = relativeRx + c * cellW;
                        ctx.moveTo(lx, relativeRy);
                        ctx.lineTo(lx, relativeRy + rh);
                    }
                    for (let r = 1; r < template.rows; r++) {
                        const ly = relativeRy + r * cellH;
                        ctx.moveTo(relativeRx, ly);
                        ctx.lineTo(relativeRx + rw, ly);
                    }
                    ctx.stroke();

                    ctx.strokeStyle = '#10b981';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(relativeRx, relativeRy, rw, rh);
                }

                if (template?.hasMultiplierReel) {
                    const rMx = toPx(visionP1Mult.x, visionImageObj.width);
                    const rMy = toPx(visionP1Mult.y, visionImageObj.height);
                    const rMw = toPx(visionP1Mult.w, visionImageObj.width);
                    const rMh = toPx(visionP1Mult.h, visionImageObj.height);

                    const relMx = rMx - cropX;
                    const relMy = rMy - cropY;

                    ctx.strokeStyle = '#fbbf24';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(relMx, relMy, rMw, rMh);

                    ctx.fillStyle = '#fbbf24';
                    ctx.font = `bold ${Math.floor(rMw * 0.4)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText('X', relMx + rMw / 2, relMy + rMh / 2 + (rMh * 0.15));
                }
            } else {
                // 尚未辨識：顯示全圖與操控框
                canvas.width = visionImageObj.width;
                canvas.height = visionImageObj.height;
                ctx.drawImage(visionImageObj, 0, 0);

                const getRect = (obj) => ({
                    x: toPx(obj.x, visionImageObj.width),
                    y: toPx(obj.y, visionImageObj.height),
                    w: toPx(obj.w, visionImageObj.width),
                    h: toPx(obj.h, visionImageObj.height)
                });

                const baseThickness = Math.max(2, Math.floor(visionImageObj.width / 400));
                const handleSize = Math.max(12, Math.floor(visionImageObj.width / 60));

                const rect = getRect(visionP1);
                ctx.lineWidth = baseThickness;
                ctx.strokeStyle = '#10b981';
                ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

                ctx.fillStyle = '#10b981';
                ctx.fillRect(rect.x + rect.w - handleSize, rect.y + rect.h - handleSize, handleSize, handleSize);

                if (template && template.rows > 0 && template.cols > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';

                    const displayCols = template.hasMultiplierReel ? template.cols - 1 : template.cols;
                    const cellW = rect.w / displayCols;
                    const cellH = rect.h / template.rows;

                    for (let c = 1; c < displayCols; c++) {
                        const lx = rect.x + c * cellW;
                        ctx.moveTo(lx, rect.y);
                        ctx.lineTo(lx, rect.y + rect.h);
                    }
                    for (let r = 1; r < template.rows; r++) {
                        const ly = rect.y + r * cellH;
                        ctx.moveTo(rect.x, ly);
                        ctx.lineTo(rect.x + rect.w, ly);
                    }
                    ctx.stroke();
                }

                if (template?.hasMultiplierReel) {
                    const rectMult = getRect(visionP1Mult);
                    ctx.lineWidth = baseThickness;
                    ctx.strokeStyle = '#fbbf24';
                    ctx.strokeRect(rectMult.x, rectMult.y, rectMult.w, rectMult.h);

                    ctx.fillStyle = '#fbbf24';
                    ctx.fillRect(rectMult.x + rectMult.w - handleSize, rectMult.y + rectMult.h - handleSize, handleSize, handleSize);

                    ctx.font = `bold ${Math.floor(handleSize * 1.5)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('X', rectMult.x + rectMult.w / 2, rectMult.y + rectMult.h / 2);
                }
            }
        }
    }, [visionImageObj, visionP1, visionP1Mult, template, visionImages, activeVisionId, visionCanvasRef]);

    const getVisionMousePos = (e, ref, activeImgObj) => {
        if (!ref.current || !activeImgObj) return { x: 0, y: 0 };
        const canvas = ref.current;
        const rect = canvas.getBoundingClientRect();

        const scaleX = activeImgObj.width / rect.width;
        const scaleY = activeImgObj.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handleVisionMouseDown = (e) => {
        if (!visionImageObj) return;
        const pos = getVisionMousePos(e, visionCanvasRef, visionImageObj);

        const getPxRect = (obj) => ({
            x: toPx(obj.x, visionImageObj.width),
            y: toPx(obj.y, visionImageObj.height),
            w: toPx(obj.w, visionImageObj.width),
            h: toPx(obj.h, visionImageObj.height)
        });

        const rectMain = getPxRect(visionP1);
        const handleSizePx = Math.max(12, Math.floor(visionImageObj.width / 60));

        const isOverHandle = (x, y, r) => x >= r.x + r.w - handleSizePx * 1.5 && x <= r.x + r.w + handleSizePx * 1.5 && y >= r.y + r.h - handleSizePx * 1.5 && y <= r.y + r.h + handleSizePx * 1.5;
        const isOverRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

        if (isOverHandle(pos.x, pos.y, rectMain)) {
            setVisionDragState({ type: 'main', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
            return;
        } else if (isOverRect(pos.x, pos.y, rectMain)) {
            setVisionDragState({ type: 'main', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
            return;
        }

        if (template?.hasMultiplierReel) {
            const rectMult = getPxRect(visionP1Mult);
            if (isOverHandle(pos.x, pos.y, rectMult)) {
                setVisionDragState({ type: 'mult', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1Mult } });
            } else if (isOverRect(pos.x, pos.y, rectMult)) {
                setVisionDragState({ type: 'mult', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1Mult } });
            }
        }
    };

    const handleVisionMouseMove = (e) => {
        if (!visionDragState || !visionImageObj) return;
        const pos = getVisionMousePos(e, visionCanvasRef, visionImageObj);
        const dxPct = toPct(pos.x - visionDragState.startX, visionImageObj.width);
        const dyPct = toPct(pos.y - visionDragState.startY, visionImageObj.height);

        const updateState = visionDragState.type === 'mult' ? setVisionP1Mult : setVisionP1;

        if (visionDragState.action === 'move') {
            updateState({
                ...visionDragState.initObj,
                x: Math.max(0, Math.min(100 - visionDragState.initObj.w, visionDragState.initObj.x + dxPct)),
                y: Math.max(0, Math.min(100 - visionDragState.initObj.h, visionDragState.initObj.y + dyPct))
            });
        } else if (visionDragState.action === 'resize') {
            updateState({
                ...visionDragState.initObj,
                w: Math.max(2, Math.min(100 - visionDragState.initObj.x, visionDragState.initObj.w + dxPct)),
                h: Math.max(2, Math.min(100 - visionDragState.initObj.y, visionDragState.initObj.h + dyPct))
            });
        }
    };

    const handleVisionMouseUp = () => setVisionDragState(null);

    const handleVisionImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let loadedCount = 0;
        const newImgs = [];

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    newImgs.push({
                        id: Math.random().toString(36).substring(7),
                        file,
                        previewUrl: evt.target.result,
                        obj: img,
                        grid: null,
                        error: ''
                    });
                    loadedCount++;
                    if (loadedCount === files.length) {
                        setVisionImages(prev => {
                            const updated = [...prev, ...newImgs];
                            if (!activeVisionId && updated.length > 0) {
                                setActiveVisionId(updated[0].id);
                            }
                            return updated;
                        });
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeVisionImage = (id) => {
        setVisionImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            if (activeVisionId === id) {
                setActiveVisionId(filtered.length > 0 ? filtered[0].id : null);
            }
            return filtered;
        });
    };

    const goToPrevVisionImage = useCallback(() => {
        if (!activeVisionId || visionImages.length === 0) return;
        const curIdx = visionImages.findIndex(img => img.id === activeVisionId);
        if (curIdx > 0) {
            setActiveVisionId(visionImages[curIdx - 1].id);
        }
    }, [activeVisionId, visionImages]);

    const goToNextVisionImage = useCallback(() => {
        if (!activeVisionId || visionImages.length === 0) return;
        const curIdx = visionImages.findIndex(img => img.id === activeVisionId);
        if (curIdx >= 0 && curIdx < visionImages.length - 1) {
            setActiveVisionId(visionImages[curIdx + 1].id);
        }
    }, [activeVisionId, visionImages]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

            if (e.key === 'ArrowLeft') {
                goToPrevVisionImage();
            } else if (e.key === 'ArrowRight') {
                goToNextVisionImage();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrevVisionImage, goToNextVisionImage]);

    const performAIVisionBatchMatching = async () => {
        if (visionImages.length === 0 || !template) {
            setTemplateError("請先上傳截圖，並確保已經完成 Phase 1 模板設定！");
            return;
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
                        const resized = await resizeImageBase64(url, 64, 0.6);
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
        const cashRule = hasCashOrCollect
            ? "If a symbol has a number, ALWAYS prioritize matching it to other non-cash symbols (like COLLECT) based on its shape first. Only classify as CASH_N (e.g. CASH_0.5) if it definitely does not match any other defined symbol. "
            : "Ignore small multiplier amounts on coins. Match base symbols only. (Do NOT ignore standard symbols that are numbers, e.g., '7', '10', '9'). ";

        const multiplierRule = template.hasMultiplierReel
            ? `The LAST column (Reel ${template.cols}) is a MULTIPLIER REEL. ONLY the center cell (Row ${Math.floor(template.rows / 2) + 1}) has a multiplier value (e.g. "x2", "x5", "x10", "MULT_5"). YOU MUST EXTRACT THIS MULTIPLIER TEXT EXACTLY. Top and bottom cells of this reel are empty, output "". `
            : "";

        const pickRule = template.hasMultiplierReel
            ? `Rules: For columns 1 to ${template.cols - 1}, pick closest symbol from list only. For the LAST column, do NOT use the list, extract the raw text if any. `
            : `Rules: Pick closest symbol from list only. `;

        const fixedPrefixParts = [
            { text: referenceText },
            ...referenceImages,
            { text: `Grid: ${template.rows}R x ${template.cols}C. Symbols: [${availableSymbols.join(',')}]. ${pickRule}${cashRule}${multiplierRule}JP names as-is. Dimmed/grayed cells: identify by shape. Unrecognizable: "". Return ${template.rows}x${template.cols} 2D array.` }
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

                const raw1 = offCanvas1.toDataURL('image/jpeg', 0.5).split(',')[1];
                const resized1 = await resizeImageBase64(`data:image/jpeg;base64,${raw1}`, 512, 0.5);

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
                    currentParts.push({ text: "Please extract the symbols from Image 1 for the main grid, and strictly extract the multiplier value (e.g., x2, x5) for the center cell of the last column (Column " + template.cols + ") from Image 2. Empty cells in the last column should be \"\"." });
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;

                const payload = {
                    contents: [{
                        role: "user",
                        parts: currentParts
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "ARRAY",
                            items: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                            }
                        }
                    }
                };

                const result = await fetchWithRetry(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonText) throw new Error("無法從 AI 取得有效回應，請確認 API Key 是否正確。");

                let parsedGrid = JSON.parse(jsonText);

                if (!Array.isArray(parsedGrid) || parsedGrid.length === 0 || !Array.isArray(parsedGrid[0])) {
                    const possibleGrid = Object.values(parsedGrid).find(val => Array.isArray(val) && Array.isArray(val[0]));
                    if (possibleGrid) parsedGrid = possibleGrid;
                    else throw new Error("AI 回傳的格式不正確，無法解析為二維盤面陣列。");
                }

                const safeGrid = [];
                for (let r = 0; r < template.rows; r++) {
                    const rowArr = [];
                    for (let c = 0; c < template.cols; c++) {
                        let sym = parsedGrid[r]?.[c] || '';
                        const isMultiplierCol = template.hasMultiplierReel && c === template.cols - 1;
                        if (!isMultiplierCol && sym && !availableSymbols.includes(sym) && !isCashSymbol(sym, template?.jpConfig)) {
                            sym = '';
                        }
                        rowArr.push(sym);
                    }
                    safeGrid.push(rowArr);
                }

                currentVisionImages[imgIndex] = { ...currentVisionImages[imgIndex], grid: safeGrid, error: '' };
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
        visionImages,
        activeVisionId,
        activeVisionImg,
        visionImageObj,
        visionImageSrc,
        visionGrid,
        visionError,
        isVisionProcessing,
        isVisionStopping,
        visionBatchProgress,
        setActiveVisionId,
        handleVisionMouseDown,
        handleVisionMouseMove,
        handleVisionMouseUp,
        handleVisionImageUpload,
        removeVisionImage,
        performAIVisionBatchMatching,
        cancelVisionProcessing,
        goToPrevVisionImage,
        goToNextVisionImage
    };
}
