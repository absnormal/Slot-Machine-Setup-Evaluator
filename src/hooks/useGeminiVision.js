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
    visionCanvasRef,
    isPhase3Minimized
}) {
    const [visionImages, setVisionImages] = useState([]);
    const [activeVisionId, setActiveVisionId] = useState(null);

    const [visionP1, setVisionP1] = useState({ x: 10, y: 10, w: 80, h: 80 });
    const [visionP1Mult, setVisionP1Mult] = useState({ x: 92, y: 45, w: 6, h: 10 });
    const [visionP1Bet, setVisionP1Bet] = useState({ x: 80, y: 92, w: 15, h: 5 });
    const [isVisionProcessing, setIsVisionProcessing] = useState(false);
    const isVisionCanceled = useRef(false);
    const [isVisionStopping, setIsVisionStopping] = useState(false);
    const [visionBatchProgress, setVisionBatchProgress] = useState({ current: 0, total: 0 });
    const [hasBetBox, setHasBetBox] = useState(false);
    const [visionDragState, setVisionDragState] = useState(null);

    const activeVisionImg = visionImages.find(img => img.id === activeVisionId) || null;
    const visionImageObj = activeVisionImg?.obj || null;
    const visionImageSrc = activeVisionImg?.previewUrl || null;
    const visionGrid = activeVisionImg?.grid || null;
    const visionError = activeVisionImg?.error || null;

    // Canvas drawing effect
    useEffect(() => {
        if (visionImageObj && visionCanvasRef?.current && !isPhase3Minimized) {
            const canvas = visionCanvasRef.current;
            const ctx = canvas.getContext('2d');

            const baseThickness = Math.max(2, Math.floor(visionImageObj.width / 400));
            const handleSize = Math.max(12, Math.floor(visionImageObj.width / 60));

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
                    ctx.font = `bold ${Math.floor(handleSize * 1.5)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('X', relMx + rMw / 2, relMy + rMh / 2);
                }

                if (template?.hasBetBox) {
                    const rBx = toPx(visionP1Bet.x, visionImageObj.width);
                    const rBy = toPx(visionP1Bet.y, visionImageObj.height);
                    const rBw = toPx(visionP1Bet.w, visionImageObj.width);
                    const rBh = toPx(visionP1Bet.h, visionImageObj.height);

                    const relBx = rBx - cropX;
                    const relBy = rBy - cropY;

                    ctx.strokeStyle = '#22d3ee'; // cyan-400
                    ctx.lineWidth = 2;
                    ctx.strokeRect(relBx, relBy, rBw, rBh);

                    ctx.fillStyle = '#22d3ee';
                    ctx.font = `bold ${Math.floor(rBh * 0.8)}px sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText('BET', relBx + 5, relBy + 2);
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

                if (hasBetBox) {
                    const rectBet = getRect(visionP1Bet);
                    ctx.lineWidth = baseThickness;
                    ctx.strokeStyle = '#22d3ee';
                    ctx.strokeRect(rectBet.x, rectBet.y, rectBet.w, rectBet.h);

                    ctx.fillStyle = '#22d3ee';
                    ctx.fillRect(rectBet.x + rectBet.w - handleSize, rectBet.y + rectBet.h - handleSize, handleSize, handleSize);

                    ctx.font = `bold ${Math.floor(handleSize * 1.2)}px sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText('BET', rectBet.x + 5, rectBet.y + 5);
                }
            }
        }
    }, [visionImageObj, visionP1, visionP1Mult, visionP1Bet, template, visionImages, activeVisionId, visionCanvasRef, isPhase3Minimized, hasBetBox]);

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

        const handleSizePx = Math.max(12, Math.floor(visionImageObj.width / 60));
        const isOverHandle = (x, y, r) => x >= r.x + r.w - handleSizePx * 1.5 && x <= r.x + r.w + handleSizePx * 1.5 && y >= r.y + r.h - handleSizePx * 1.5 && y <= r.y + r.h + handleSizePx * 1.5;
        const isOverRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

        // 優先判定乘倍框 (通常較小，可能在盤面框內)
        if (template?.hasMultiplierReel) {
            const rectMult = getPxRect(visionP1Mult);
            if (isOverHandle(pos.x, pos.y, rectMult)) {
                setVisionDragState({ type: 'mult', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1Mult } });
                return;
            } else if (isOverRect(pos.x, pos.y, rectMult)) {
                setVisionDragState({ type: 'mult', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1Mult } });
                return;
            }
        }

        // 其次判定盤面框
        const rectMain = getPxRect(visionP1);
        if (isOverHandle(pos.x, pos.y, rectMain)) {
            setVisionDragState({ type: 'main', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
            return;
        } else if (isOverRect(pos.x, pos.y, rectMain)) {
            setVisionDragState({ type: 'main', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
            return;
        }

        // 最後判定 BET 框
        if (hasBetBox) {
            const rectBet = getPxRect(visionP1Bet);
            if (isOverHandle(pos.x, pos.y, rectBet)) {
                setVisionDragState({ type: 'bet', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1Bet } });
                return;
            } else if (isOverRect(pos.x, pos.y, rectBet)) {
                setVisionDragState({ type: 'bet', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1Bet } });
                return;
            }
        }
    };

    const handleVisionMouseMove = (e) => {
        if (!visionDragState || !visionImageObj) return;
        const pos = getVisionMousePos(e, visionCanvasRef, visionImageObj);
        const dxPct = toPct(pos.x - visionDragState.startX, visionImageObj.width);
        const dyPct = toPct(pos.y - visionDragState.startY, visionImageObj.height);

        let updateState;
        if (visionDragState.type === 'mult') updateState = setVisionP1Mult;
        else if (visionDragState.type === 'bet') updateState = setVisionP1Bet;
        else updateState = setVisionP1;

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
            if (id === 'ALL') {
                setActiveVisionId(null);
                return [];
            }
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
            if (isPhase3Minimized) return;

            if (e.key === 'ArrowLeft') {
                goToPrevVisionImage();
            } else if (e.key === 'ArrowRight') {
                goToNextVisionImage();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrevVisionImage, goToNextVisionImage, isPhase3Minimized]);

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
        const cashRule = hasCashOrCollect
            ? "CASH/COLLECT RULES: If a cell contains a coin/token/gem with a numeric value displayed on it, you MUST identify it — do NOT leave it empty. First, check if the shape matches a COLLECT symbol from the reference images. If it matches COLLECT, return the COLLECT symbol name exactly as listed. If it does not match COLLECT but has a standalone numeric value (like 500, 1.5K, 2M), return it as CASH_{full_numeric_value} (e.g., 1.5M → CASH_1500000, 500 → CASH_500). Convert K=1000, M=1000000, B=1000000000. "
            : "Ignore small multiplier amounts on coins. Match base symbols only. (Do NOT ignore standard symbols that are numbers, e.g., '7', '10', '9'). ";

        const multiplierRule = template.hasMultiplierReel
            ? `The LAST column (Reel ${template.cols}) is a MULTIPLIER REEL. In Image 2, there might be a bar with multiple multiplier values (e.g. x1, x2, x3, x5). YOU MUST ONLY extract the "Highlighted" or "Activated" value (usually indicated by being brighter, yellow/gold color, or having a distinct frame vs the dimmed/dark green inactive ones). Output ONLY the format 'xN' (e.g., if you see '5x' or '5', output 'x5') for the center cell (Row ${Math.floor(template.rows / 2) + 1}). Top and bottom cells of this reel are empty, output "". `
            : "";

        const betRule = hasBetBox
            ? `Image 3 is identifying the BET amount. YOU MUST extract the numeric value ONLY (e.g., if you see "$1,000" or "1000", output 1000). Return it in the "bet" field of your JSON response.`
            : "";

        const pickRule = template.hasMultiplierReel
            ? `Rules: For columns 1 to ${template.cols - 1}, pick closest symbol from list only. For the LAST column, do NOT use the list, extract the raw text if any. `
            : `Rules: Pick closest symbol from list only. `;

        // 動態偵測易混淆符號對並生成警告
        const confusablePairs = [
            ['二條', '五條'], ['二筒', '五筒'],
            ['二條', '二條'], ['二筒', '五條'],
            ['WILD_元寶', 'SCATTER_錢幣'],
            ['橘子', '檸檬']
        ];
        const activeConfusables = confusablePairs.filter(
            ([a, b]) => availableSymbols.includes(a) && availableSymbols.includes(b)
        );
        const confusableWarning = activeConfusables.length > 0
            ? `CONFUSABLE PAIRS WARNING: The following symbols look very similar. You MUST compare each cell carefully against the reference images before deciding: ${activeConfusables.map(([a, b]) => `${a} vs ${b}`).join(', ')}. Count the exact number of bars/dots/strokes to distinguish them. `
            : '';

        const fixedPrefixParts = [
            { text: referenceText },
            ...referenceImages,
            { text: `Grid: ${template.rows}R x ${template.cols}C. Symbols: [${availableSymbols.join(',')}]. ${pickRule}${cashRule}${multiplierRule}${betRule}${confusableWarning}JP names as-is. Dimmed/grayed cells: identify by shape. Truly unrecognizable cells: \"\". VISUAL EFFECTS: Some cells may be partially obscured by animation effects (sparkles, fire, glow, lightning, smoke, particle trails, shine, win-line highlights). These are NOT part of the symbol. Look THROUGH the effects and identify the underlying symbol based on its visible outline, color, and shape. Winning cells are often the ones with effects, so they are important — do NOT leave them empty just because of visual noise. IMPORTANT: The image has RED grid lines drawn on it to show exact cell boundaries. Analyze each cell INDIVIDUALLY within its red-bordered area. Do NOT let adjacent cell content influence your identification. Scan Row 1 left-to-right first, then Row 2, then Row 3, etc. Always identify each cell as a WHOLE tile/symbol. Do NOT decompose a single tile into sub-parts. For complex symbols (like Mahjong tiles with multiple bars/dots), match the ENTIRE tile pattern against reference images as one unit. If a cell clearly contains a visible symbol or value, you MUST identify it — do not skip it. Return a JSON object with \"grid\" (${template.rows}x${template.cols} 2D array) and \"bet\" (number).` }
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
                    currentParts.push({ text: "Please extract the symbols from Image 1 for the main grid, and strictly extract the multiplier value for the center cell of the last column (Column " + template.cols + ") from Image 2. Output ONLY the format \"xN\", for example, \"5x\" or \"5\" should be returned as \"x5\". Empty cells in the last column should be \"\"." });
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
                    currentParts.push({ text: "Please extract the numeric BET amount from Image 3." });
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;

                const payload = {
                    contents: [{
                        role: "user",
                        parts: currentParts
                    }],
                    generationConfig: {
                        temperature: 0,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                grid: {
                                    type: "ARRAY",
                                    items: {
                                        type: "ARRAY",
                                        items: { type: "STRING" }
                                    }
                                },
                                bet: { type: "NUMBER" }
                            },
                            required: ["grid"]
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

                const responseData = JSON.parse(jsonText);
                let parsedGrid = responseData.grid;
                let recognizedBet = responseData.bet || null;

                if (!Array.isArray(parsedGrid) || parsedGrid.length === 0 || !Array.isArray(parsedGrid[0])) {
                    const possibleGrid = Object.values(responseData).find(val => Array.isArray(val) && Array.isArray(val[0]));
                    if (possibleGrid) parsedGrid = possibleGrid;
                    else throw new Error("AI 回傳的格式不正確，無法解析為二維盤面陣列。");
                }

                const safeGrid = [];
                const midRow = Math.floor(template.rows / 2);
                let detectedMultiplier = '';

                // First pass to detect multiplier if any in the last column
                if (template.hasMultiplierReel) {
                    for (let r = 0; r < template.rows; r++) {
                        const sym = parsedGrid[r]?.[template.cols - 1];
                        if (sym) {
                            const strSym = String(sym);
                            const match = strSym.match(/(\d+(?:\.\d+)?)/);
                            if (match) {
                                detectedMultiplier = "x" + match[0];
                                break;
                            }
                        }
                    }
                }

                for (let r = 0; r < template.rows; r++) {
                    const rowArr = [];
                    for (let c = 0; c < template.cols; c++) {
                        let sym = parsedGrid[r]?.[c] || '';
                        const isMultiplierCol = template.hasMultiplierReel && c === template.cols - 1;

                        if (isMultiplierCol) {
                            sym = (r === midRow) ? detectedMultiplier : '';
                        } else if (sym && !availableSymbols.includes(sym) && !isCashSymbol(sym, template?.jpConfig) && !isCollectSymbol(sym)) {
                            sym = '';
                        }
                        rowArr.push(sym);
                    }
                    safeGrid.push(rowArr);
                }

                currentVisionImages[imgIndex] = {
                    ...currentVisionImages[imgIndex],
                    grid: safeGrid,
                    bet: (hasBetBox && recognizedBet !== null) ? recognizedBet : currentVisionImages[imgIndex].bet,
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
        visionP1,
        visionP1Mult,
        visionP1Bet,
        setVisionP1,
        setVisionP1Mult,
        setVisionP1Bet,
        setActiveVisionId,
        setVisionImages,
        handleVisionMouseDown,
        handleVisionMouseMove,
        handleVisionMouseUp,
        handleVisionImageUpload,
        removeVisionImage,
        performAIVisionBatchMatching,
        cancelVisionProcessing,
        goToPrevVisionImage,
        goToNextVisionImage,
        hasBetBox,
        setHasBetBox
    };
}
