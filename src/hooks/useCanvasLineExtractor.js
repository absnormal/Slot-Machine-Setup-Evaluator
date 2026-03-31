import { useState, useCallback, useEffect, useRef } from 'react';
import { toPx, toPct } from '../utils/helpers';

/**
 * Canvas 線獎圖片提取邏輯
 * 從 useTemplateBuilder.js 拆出的子 hook
 * 處理：圖片上傳、Canvas 繪圖、控制點拖拽、色彩分析提取線獎
 */
export function useCanvasLineExtractor({
    gridRows, gridCols,
    patternRows, patternCols,
    startIndex,
    isTemplateMinimized,
    linesTabMode,
    setExtractResults,
    setTemplateError,
    setTemplateMessage,
}) {
    // --- Image State ---
    const [lineImages, setLineImages] = useState([]);
    const [activeLineImageId, setActiveLineImageId] = useState(null);
    const activeLineImage = lineImages.find(img => img.id === activeLineImageId);
    const imageSrc = activeLineImage?.previewUrl || null;
    const imageObj = activeLineImage?.obj || null;

    // --- Canvas Control Points ---
    const [p1, setP1] = useState({ x: 8, y: 2, w: 16, h: 8 });
    const [pEnd, setPEnd] = useState({ x: 82, y: 90, w: 16, h: 8 });
    const [dragState, setDragState] = useState(null);

    // --- Canvas Refs & Layout ---
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [layoutStyle, setLayoutStyle] = useState({ leftHeight: '400px', wrapperHeight: 'auto' });
    const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });

    // === Image Upload ===
    const handleLineImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        let loadedCount = 0;
        const newImgs = [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    newImgs.push({ id: Math.random().toString(36).substring(7), file, previewUrl: evt.target.result, obj: img });
                    loadedCount++;
                    if (loadedCount === files.length) {
                        setLineImages(prev => {
                            const updated = [...prev, ...newImgs];
                            if (!activeLineImageId && updated.length > 0) setActiveLineImageId(updated[0].id);
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

    const removeLineImage = (id) => {
        setLineImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            if (activeLineImageId === id) setActiveLineImageId(filtered.length > 0 ? filtered[0].id : null);
            return filtered;
        });
    };

    // === Color Analysis ===
    const analyzeImage = () => {
        if (!imageObj) return;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = imageObj.width;
        offCanvas.height = imageObj.height;
        const ctx = offCanvas.getContext('2d');
        ctx.drawImage(imageObj, 0, 0);
        const imgData = ctx.getImageData(0, 0, imageObj.width, imageObj.height).data;

        const x1 = (p1.x / 100) * imageObj.width, y1 = (p1.y / 100) * imageObj.height;
        const w1 = (p1.w / 100) * imageObj.width, h1 = (p1.h / 100) * imageObj.height;
        const x2 = (pEnd.x / 100) * imageObj.width, y2 = (pEnd.y / 100) * imageObj.height;
        const w2 = (pEnd.w / 100) * imageObj.width, h2 = (pEnd.h / 100) * imageObj.height;

        const stepX = patternCols > 1 ? (x2 - x1) / (patternCols - 1) : 0;
        const stepY = patternRows > 1 ? (y2 - y1) / (patternRows - 1) : 0;
        const stepW = patternCols > 1 ? (w2 - w1) / (patternCols - 1) : 0;
        const stepH = patternRows > 1 ? (h2 - h1) / (patternRows - 1) : 0;

        const threshold = 100; // Using the default threshold
        const newResults = [];

        for (let r = 0; r < patternRows; r++) {
            for (let c = 0; c < patternCols; c++) {
                const patternIndex = r * patternCols + c + startIndex;
                const patX = x1 + c * stepX, patY = y1 + r * stepY;
                const patW = w1 + c * stepW, patH = h1 + r * stepH;

                const lineData = [];
                for (let gc = 0; gc < gridCols; gc++) {
                    let maxScore = threshold;
                    let bestRow = 0;
                    for (let gr = 0; gr < gridRows; gr++) {
                        const cellW = patW / gridCols;
                        const cellH = patH / gridRows;
                        const sampX = Math.floor(patX + gc * cellW + cellW / 2);
                        const sampY = Math.floor(patY + gr * cellH + cellH / 2);
                        if (sampX < 0 || sampX >= imageObj.width || sampY < 0 || sampY >= imageObj.height) continue;

                        const idx = (sampY * imageObj.width + sampX) * 4;
                        const R = imgData[idx], G = imgData[idx + 1], B = imgData[idx + 2];
                        const yellowScore = (R + G) - B;

                        if (yellowScore > maxScore) {
                            maxScore = yellowScore;
                            bestRow = gr + 1;
                        }
                    }
                    lineData.push(bestRow);
                }
                newResults.push({ id: patternIndex, data: lineData });
            }
        }

        setExtractResults(prev => {
            const merged = [...prev];
            newResults.forEach(nr => {
                const existingIdx = merged.findIndex(r => r.id === nr.id);
                if (existingIdx >= 0) merged[existingIdx] = nr;
                else merged.push(nr);
            });
            merged.sort((a, b) => a.id - b.id);
            return merged;
        });

        setTemplateError('');
        if (setTemplateMessage) setTemplateMessage('✅ 當前圖片連線已成功合併提取！');
        if (setTemplateMessage) setTimeout(() => setTemplateMessage(''), 3000);
    };

    // === Mouse Handlers ===
    const getMousePos = (e, ref) => {
        if (!ref.current || !imageObj) return { x: 0, y: 0 };
        const canvas = ref.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = imageObj.width / rect.width;
        const scaleY = imageObj.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const handleMouseDown = (e) => {
        if (!imageObj || linesTabMode !== 'image') return;
        const pos = getMousePos(e, canvasRef);
        const getPxRect = (obj) => ({
            x: toPx(obj.x, imageObj.width), y: toPx(obj.y, imageObj.height),
            w: toPx(obj.w, imageObj.width), h: toPx(obj.h, imageObj.height)
        });
        const r1 = getPxRect(p1);
        const rEnd = getPxRect(pEnd);
        const handleSizePx = Math.max(12, Math.floor(imageObj.width / 60));
        const isOverHandle = (x, y, rect) => x >= rect.x + rect.w - handleSizePx * 1.5 && x <= rect.x + rect.w + handleSizePx * 1.5 && y >= rect.y + rect.h - handleSizePx * 1.5 && y <= rect.y + rect.h + handleSizePx * 1.5;
        const isOverRect = (x, y, rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

        if (isOverHandle(pos.x, pos.y, r1)) setDragState({ type: 'p1', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...p1 } });
        else if (isOverHandle(pos.x, pos.y, rEnd)) setDragState({ type: 'pEnd', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...pEnd } });
        else if (isOverRect(pos.x, pos.y, r1)) setDragState({ type: 'p1', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...p1 } });
        else if (isOverRect(pos.x, pos.y, rEnd)) setDragState({ type: 'pEnd', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...pEnd } });
    };

    const handleMouseMove = (e) => {
        if (!dragState || !imageObj || linesTabMode !== 'image') return;
        const pos = getMousePos(e, canvasRef);
        const dxPct = toPct(pos.x - dragState.startX, imageObj.width);
        const dyPct = toPct(pos.y - dragState.startY, imageObj.height);

        if (dragState.action === 'move') {
            const newObj = { ...dragState.initObj, x: dragState.initObj.x + dxPct, y: dragState.initObj.y + dyPct };
            if (dragState.type === 'p1') setP1(newObj); else setPEnd(newObj);
        } else if (dragState.action === 'resize') {
            const newW = Math.max(2, dragState.initObj.w + dxPct);
            const newH = Math.max(2, dragState.initObj.h + dyPct);
            if (dragState.type === 'p1') {
                setP1({ ...dragState.initObj, w: newW, h: newH });
                setPEnd(prev => ({ ...prev, w: newW, h: newH }));
            } else {
                setPEnd({ ...dragState.initObj, w: newW, h: newH });
                setP1(prev => ({ ...prev, w: newW, h: newH }));
            }
        }
    };

    const handleMouseUp = () => setDragState(null);

    // === Canvas Drawing ===
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageObj || linesTabMode !== 'image') return;
        const ctx = canvas.getContext('2d');

        canvas.width = imageObj.width;
        canvas.height = imageObj.height;
        ctx.drawImage(imageObj, 0, 0, imageObj.width, imageObj.height);

        const getRect = (obj) => ({
            x: toPx(obj.x, imageObj.width), y: toPx(obj.y, imageObj.height),
            w: toPx(obj.w, imageObj.width), h: toPx(obj.h, imageObj.height)
        });
        const r1 = getRect(p1);
        const rEnd = getRect(pEnd);
        const baseThickness = Math.max(2, Math.floor(imageObj.width / 400));
        const handleSize = Math.max(12, Math.floor(imageObj.width / 60));
        const fontSize = Math.max(14, Math.floor(imageObj.width / 35));

        const drawInnerGrid = (context, rect, gRows, gCols, color) => {
            if (gRows <= 1 && gCols <= 1) return;
            context.strokeStyle = color;
            context.lineWidth = baseThickness;
            context.beginPath();
            const cellW = rect.w / gCols;
            const cellH = rect.h / gRows;
            for (let c = 1; c < gCols; c++) {
                const lx = rect.x + c * cellW;
                context.moveTo(lx, rect.y);
                context.lineTo(lx, rect.y + rect.h);
            }
            for (let r = 1; r < gRows; r++) {
                const ly = rect.y + r * cellH;
                context.moveTo(rect.x, ly);
                context.lineTo(rect.x + rect.w, ly);
            }
            context.stroke();
        };

        ctx.lineWidth = baseThickness;
        ctx.strokeStyle = '#6366f1';
        ctx.strokeRect(r1.x, r1.y, r1.w, r1.h);
        drawInnerGrid(ctx, r1, gridRows, gridCols, 'rgba(99, 102, 241, 0.6)');
        ctx.fillStyle = '#6366f1';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(`${startIndex.toString().padStart(2, '0')} (Start)`, r1.x, r1.y - fontSize * 0.3);
        ctx.fillRect(r1.x + r1.w - handleSize, r1.y + r1.h - handleSize, handleSize, handleSize);

        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(rEnd.x, rEnd.y, rEnd.w, rEnd.h);
        drawInnerGrid(ctx, rEnd, gridRows, gridCols, 'rgba(239, 68, 68, 0.6)');
        ctx.fillStyle = '#ef4444';
        const endIndex = startIndex + patternRows * patternCols - 1;
        ctx.fillText(`${endIndex} (End)`, rEnd.x, rEnd.y - fontSize * 0.3);
        ctx.fillRect(rEnd.x + rEnd.w - handleSize, rEnd.y + rEnd.h - handleSize, handleSize, handleSize);

        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = baseThickness;

        const stepX = patternCols > 1 ? (rEnd.x - r1.x) / (patternCols - 1) : 0;
        const stepY = patternRows > 1 ? (rEnd.y - r1.y) / (patternRows - 1) : 0;
        const stepW = patternCols > 1 ? (rEnd.w - r1.w) / (patternCols - 1) : 0;
        const stepH = patternRows > 1 ? (rEnd.h - r1.h) / (patternRows - 1) : 0;

        for (let r = 0; r < patternRows; r++) {
            for (let c = 0; c < patternCols; c++) {
                if ((r === 0 && c === 0) || (r === patternRows - 1 && c === patternCols - 1)) continue;
                const curX = r1.x + c * stepX;
                const curY = r1.y + r * stepY;
                const curW = r1.w + c * stepW;
                const curH = r1.h + r * stepH;
                const patternIndex = r * patternCols + c + startIndex;

                ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
                ctx.lineWidth = baseThickness;
                ctx.strokeRect(curX, curY, curW, curH);

                ctx.fillStyle = '#10b981';
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillText(patternIndex.toString().padStart(2, '0'), curX, curY - fontSize * 0.3);
                drawInnerGrid(ctx, { x: curX, y: curY, w: curW, h: curH }, gridRows, gridCols, 'rgba(16, 185, 129, 0.4)');
            }
        }
    }, [imageObj, p1, pEnd, patternRows, patternCols, gridRows, gridCols, startIndex, linesTabMode]);

    // Auto-draw when visible
    useEffect(() => {
        if (!isTemplateMinimized && linesTabMode === 'image') requestAnimationFrame(draw);
    }, [draw, isTemplateMinimized, linesTabMode]);

    // === Layout Effects ===
    useEffect(() => {
        const updateHeight = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width === 0) return;

            let desiredHeight = 400;
            const isDesktop = window.innerWidth >= 1280;

            if (imageObj) {
                const imgRatio = imageObj.width / imageObj.height;
                desiredHeight = rect.width / imgRatio;
                const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 1000;
                desiredHeight = Math.max(400, Math.min(desiredHeight, maxH));
            }

            if (isDesktop) {
                setLayoutStyle({ leftHeight: '100%', wrapperHeight: `${desiredHeight}px` });
            } else {
                setLayoutStyle({ leftHeight: `${desiredHeight}px`, wrapperHeight: 'auto' });
            }
        };

        if (!isTemplateMinimized && linesTabMode === 'image') {
            updateHeight();
            setTimeout(updateHeight, 50);
        }

        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [imageObj, isTemplateMinimized, linesTabMode]);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setCanvasSize(prev => {
                        if (prev.w === width && prev.h === height) return prev;
                        return { w: width, h: height };
                    });
                }
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isTemplateMinimized, linesTabMode]);

    return {
        lineImages, setLineImages,
        activeLineImageId, setActiveLineImageId,
        activeLineImage, imageSrc, imageObj,
        p1, setP1, pEnd, setPEnd,
        dragState, setDragState,
        canvasRef, containerRef, layoutStyle, canvasSize,
        handleLineImageUpload, removeLineImage, analyzeImage,
        handleMouseDown, handleMouseMove, handleMouseUp, draw,
    };
}
