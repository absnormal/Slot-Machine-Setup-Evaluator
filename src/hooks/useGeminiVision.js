import { useState, useEffect, useCallback } from 'react';
import { toPx, toPct } from '../utils/helpers';
import { useVisionImageManager } from './useVisionImageManager';
import { useVisionBatchProcessor } from './useVisionBatchProcessor';

const CACHE_KEYS = {
    MAIN: 'SLOT_P3_CACHE_MAIN',
    MULT: 'SLOT_P3_CACHE_MULT',
    BET: 'SLOT_P3_CACHE_BET'
};

const loadCache = (key, defaultValue) => {
    try {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : defaultValue;
    } catch (e) {
        console.warn(`Failed to load cache for ${key}:`, e);
        return defaultValue;
    }
};

export function useGeminiVision({
    template,
    availableSymbols,
    customApiKey,
    setTemplateMessage,
    setTemplateError,
    visionCanvasRef,
    isPhase3Minimized
}) {
    const imageManager = useVisionImageManager(isPhase3Minimized);
    const {
        visionImages, setVisionImages,
        activeVisionId, setActiveVisionId,
        activeVisionImg, visionImageObj, visionImageSrc, visionGrid, visionError,
        handleVisionImageUpload, addVisionImageFromFile, removeVisionImage, resetVisionImage, goToPrevVisionImage, goToNextVisionImage
    } = imageManager;

    const [visionP1, setVisionP1] = useState(() => loadCache(CACHE_KEYS.MAIN, { x: 10, y: 10, w: 80, h: 80 }));
    const [visionP1Mult, setVisionP1Mult] = useState(() => loadCache(CACHE_KEYS.MULT, { x: 92, y: 45, w: 6, h: 10 }));
    const [visionP1Bet, setVisionP1Bet] = useState(() => loadCache(CACHE_KEYS.BET, { x: 80, y: 92, w: 15, h: 5 }));
    const [hasBetBox, setHasBetBox] = useState(false);
    const [collectShowsTotalWin, setCollectShowsTotalWin] = useState(false);
    const [visionDragState, setVisionDragState] = useState(null);

    const batchProcessor = useVisionBatchProcessor({
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
    });

    const {
        isVisionProcessing,
        isVisionStopping,
        visionBatchProgress,
        performAIVisionBatchMatching,
        performLocalVisionBatchMatching,
        cancelVisionProcessing
    } = batchProcessor;

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

    // ── 剪貼簿圖片貼上功能 ──

    // 按鈕主動貼上
    const pasteFromClipboard = useCallback(async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                const imageTypes = item.types.filter(type => type.startsWith('image/'));
                if (imageTypes.length > 0) {
                    const blob = await item.getType(imageTypes[0]);
                    const file = new File([blob], `剪貼簿截圖-${new Date().toLocaleTimeString().replace(/:/g, '')}.png`, { type: blob.type });
                    
                    // 將選取框設定為全螢幕，因為貼上的通常是已經精準框選好的盤面
                    setVisionP1({ x: 0, y: 0, w: 100, h: 100 });
                    
                    await addVisionImageFromFile(file);
                    setTemplateMessage('📋 已從剪貼簿讀取圖片，正在自動辨識...');
                    
                    setTimeout(() => {
                        performLocalVisionBatchMatching();
                    }, 50);
                    return;
                }
            }
            setTemplateError('剪貼簿中沒有找到圖片！');
        } catch (err) {
            console.error('讀取剪貼簿失敗:', err);
            setTemplateError('無法讀取剪貼簿，請確認瀏覽器權限，或直接在畫面按 Ctrl+V 貼上。');
        }
    }, [addVisionImageFromFile, performLocalVisionBatchMatching, setTemplateMessage, setTemplateError, setVisionP1]);

    // 全域 Ctrl+V 監聽
    useEffect(() => {
        const handleGlobalPaste = async (e) => {
            console.log('Paste event triggered!', e.clipboardData);
            
            // 如果焦點在輸入框，不攔截貼上行為
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            // 如果 P3 最小化，不處理
            if (isPhase3Minimized) return;

            const files = e.clipboardData?.files;
            const items = e.clipboardData?.items;
            let targetFile = null;

            // 優先嘗試從 files 中找圖片
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    if (files[i].type.startsWith('image/')) {
                        targetFile = files[i];
                        break;
                    }
                }
            }

            // 如果 files 找不到，嘗試從 items 中找
            if (!targetFile && items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        targetFile = items[i].getAsFile();
                        break;
                    }
                }
            }

            if (targetFile) {
                console.log('Image found in clipboard:', targetFile);
                e.preventDefault();
                // 重新命名檔案以避免檔名衝突或無意義檔名
                const renamedFile = new File([targetFile], `剪貼簿貼上-${new Date().toLocaleTimeString().replace(/:/g, '')}.png`, { type: targetFile.type });
                
                // 將選取框設定為全螢幕，因為貼上的通常是已經精準框選好的盤面
                setVisionP1({ x: 0, y: 0, w: 100, h: 100 });

                await addVisionImageFromFile(renamedFile);
                setTemplateMessage('📋 已接收貼上圖片，自動開始辨識...');
                
                setTimeout(() => {
                    performLocalVisionBatchMatching();
                }, 50);
            } else {
                console.log('No image found in clipboard paste event.');
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [addVisionImageFromFile, performLocalVisionBatchMatching, setTemplateMessage, isPhase3Minimized, setVisionP1]);

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
        resetVisionImage,
        performAIVisionBatchMatching,
        performLocalVisionBatchMatching,
        cancelVisionProcessing,
        goToPrevVisionImage,
        goToNextVisionImage,
        hasBetBox,
        setHasBetBox,
        collectShowsTotalWin,
        setCollectShowsTotalWin,
        pasteFromClipboard
    };
}
