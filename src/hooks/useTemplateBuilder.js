import { useState, useCallback, useEffect, useRef } from 'react';
import { toPx, toPct, fetchWithRetry, ptFileToBase64, resizeImageBase64 } from '../utils/helpers';
import { isCashSymbol, isCollectSymbol, isWildSymbol } from '../utils/symbolUtils';
const defaultPaytable = "";
const defaultJpConfig = { "MINI": "", "MINOR": "", "MAJOR": "", "GRAND": "" };

// Hook definition for Phase 1 Template Builder logic
export function useTemplateBuilder({
    customApiKey,
    apiKey,
    setTemplateMessage,
    setIsPhase2Minimized,
    setIsPhase3Minimized,
    setIsTemplateMinimized,
    isTemplateMinimized,
    linesMode, // from App.jsx if needed, or we manage it here? Wait, App.jsx uses linesMode = 'image' | 'text' but wait, App.jsx has linesMode? 
    // Ah, wait, linesMode vs lineMode! App.jsx has lineMode='paylines'|'allways', and linesMode was used in the UI for tabs. 
}) {
    // 1-0. Basic Template State
    const [lineMode, setLineMode] = useState('paylines');
    const [linesTextInput, setLinesTextInput] = useState('');
    const [paytableMode, setPaytableMode] = useState('image');
    const [paytableInput, setPaytableInput] = useState(defaultPaytable);

    // Core Output Template
    const [template, setTemplate] = useState(null);
    const [templateError, setTemplateError] = useState('');
    const [buildErrorMsg, setBuildErrorMsg] = useState('');

    // Config State
    const [jpConfig, setJpConfig] = useState(defaultJpConfig);
    const [hasJackpot, setHasJackpot] = useState(false);
    const [hasMultiplierReel, setHasMultiplierReel] = useState(false);

    // 1-1. Panel Line Image Recognition State
    const [lineImages, setLineImages] = useState([]);
    const [activeLineImageId, setActiveLineImageId] = useState(null);
    const activeLineImage = lineImages.find(img => img.id === activeLineImageId);
    const imageSrc = activeLineImage?.previewUrl || null;
    const imageObj = activeLineImage?.obj || null;

    const [patternRows, setPatternRows] = useState(6);
    const [patternCols, setPatternCols] = useState(5);
    const [gridRows, setGridRows] = useState(3);
    const [gridCols, setGridCols] = useState(5);
    const [threshold, setThreshold] = useState(100);
    const [startIndex, setStartIndex] = useState(1);
    const [p1, setP1] = useState({ x: 8, y: 2, w: 16, h: 8 });
    const [pEnd, setPEnd] = useState({ x: 82, y: 90, w: 16, h: 8 });
    const [extractResults, setExtractResults] = useState([]);
    const [dragState, setDragState] = useState(null);

    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [layoutStyle, setLayoutStyle] = useState({ leftHeight: '400px', wrapperHeight: 'auto' });
    const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });
    const [linesTabMode, setLinesTabMode] = useState('image'); // local renamed from linesMode to avoid conflict

    // 1-2. Paytable AI Vision State
    const [ptImages, setPtImages] = useState([]);
    const [isPtProcessing, setIsPtProcessing] = useState(false);
    const [ptResultItems, setPtResultItems] = useState([]);
    const [ptCropState, setPtCropState] = useState({ active: false, itemIndex: null, selectedImageId: null, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false });
    const [ptEnlargedImg, setPtEnlargedImg] = useState(null);
    const ptCropImageRef = useRef(null);

    // Methods for 1-1
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

    // Canvas drawing for 1-1
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

    useEffect(() => {
        if (!isTemplateMinimized && linesTabMode === 'image') requestAnimationFrame(draw);
    }, [draw, isTemplateMinimized, linesTabMode]);

    // Methods for 1-2 (Paytable)
    const handlePaytableTextChange = (newText) => {
        setPaytableInput(newText);
        const validLines = newText.split('\n').filter(l => l.trim() !== '');

        setPtResultItems(prevItems => {
            return validLines.map((line, index) => {
                const parts = line.trim().split(/\s+/);
                const name = parts[0] || '';
                const m1 = parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
                const m2 = parts.length > 2 ? parseFloat(parts[2]) || 0 : 0;
                const m3 = parts.length > 3 ? parseFloat(parts[3]) || 0 : 0;
                const m4 = parts.length > 4 ? parseFloat(parts[4]) || 0 : 0;
                const m5 = parts.length > 5 ? parseFloat(parts[5]) || 0 : 0;

                let thumbUrls = [];
                const existingByName = prevItems.find(p => p.name === name);
                if (existingByName && existingByName.thumbUrls && existingByName.thumbUrls.length > 0) {
                    thumbUrls = existingByName.thumbUrls;
                } else if (prevItems[index] && prevItems[index].thumbUrls && prevItems[index].thumbUrls.length > 0) {
                    thumbUrls = prevItems[index].thumbUrls;
                }
                return { name, match1: m1, match2: m2, match3: m3, match4: m4, match5: m5, thumbUrls };
            });
        });
    };

    const handlePtTableChange = (index, field, value) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handlePtTableDelete = (index) => {
        setPtResultItems(prev => {
            const newItems = prev.filter((_, i) => i !== index);
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handleAddPtRow = () => {
        setPtResultItems(prev => {
            const newItems = [...prev, { name: '新符號', match1: 0, match2: 0, match3: 0, match4: 0, match5: 0, thumbUrls: [] }];
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handleRemoveThumb = (itemIndex, thumbIndex) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            newItems[itemIndex].thumbUrls.splice(thumbIndex, 1);
            return newItems;
        });
    };

    const processPtFiles = async (files) => {
        setTemplateError("");
        const newImages = [];
        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const base64 = await ptFileToBase64(file);
                newImages.push({
                    id: Math.random().toString(36).substring(7),
                    file,
                    previewUrl: URL.createObjectURL(file),
                    base64: base64
                });
            } catch (err) {
                console.warn("Error reading pt file:", err);
            }
        }
        setPtImages(prev => [...prev, ...newImages]);
    };

    const handlePtFileChange = (e) => {
        const files = Array.from(e.target.files);
        processPtFiles(files);
        e.target.value = '';
    };

    const handlePtDrop = (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        processPtFiles(files);
    };

    const removePtImage = (id) => {
        setPtImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            const removed = prev.find(img => img.id === id);
            if (removed) URL.revokeObjectURL(removed.previewUrl);
            return filtered;
        });
    };

    const clearPtAll = () => {
        ptImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setPtImages([]);
        setPtResultItems([]);
        setTemplateError("");
    };

    const handlePtExtract = async () => {
        if (ptImages.length === 0) {
            setTemplateError("請先上傳至少一張賠率表圖片");
            return;
        }

        const effectiveApiKey = customApiKey.trim() || apiKey;
        const modelName = customApiKey.trim() ? "gemini-2.5-flash" : "gemini-2.5-flash-preview-09-2025";

        setIsPtProcessing(true);
        setTemplateError("");
        if (setTemplateMessage) setTemplateMessage("AI 正在分析賠率表中...");

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;
            const imageParts = ptImages.map(img => ({
                inlineData: { mimeType: img.file.type, data: img.base64 }
            }));

            const promptText = `
            請仔細分析圖片中的「老虎機賠率表 (Paytable)」。
            任務目標：辨識出圖片中【每一個】圖案符號，以及它對應的連線數量(通常為 5, 4, 3, 2連線)所獲得的「賠率分數」。

            命名規則：
            1. 若符號上有寫 "WILD"、"百搭"、或取代其他圖案的功能，請統一命名為 "WILD"。
            2. 若符號上有寫 "SCATTER" 字樣，請統一在名稱中包含 "SCATTER" (例如: 星星SCATTER)。
            3. 若符號有「收集」其他符號分數的功能(如漁夫)，請在名稱中包含 "COLLECT" (若同時也是百搭，請命名為 WILD_COLLECT)。
            4. 若符號是帶有數字的現金/金幣，請統一命名為 "CASH" (不用加上數字，這裡是賠率表提取)。
            5. 若為英文字母或數字，請直接使用：A, K, Q, J, 10, 9。
            6. 若為一般圖案，請根據外觀用「繁體中文」直觀命名 (例如: 金龍, 西瓜, 皇冠)。
            7. 符號名稱 (name) 必須是連續字串，不可包含空白或特殊符號。

            數值規則：
            1. 提取對應的賠率數字。如果某個連線數量(例如 2 連線)沒有標示數字，請補 0。
            2. match1 (1連線) 的賠率請一律填寫 0。

            請嚴格按照 JSON Schema 回傳陣列 (Array)，包含所有辨識到的符號，絕對不可回傳空陣列或忽略任何圖案！
          `;

            const payload = {
                contents: [{ role: "user", parts: [{ text: promptText }, ...imageParts] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING", description: "符號名稱" },
                                match1: { type: "NUMBER", description: "1連線賠率" },
                                match2: { type: "NUMBER", description: "2連線賠率" },
                                match3: { type: "NUMBER", description: "3連線賠率" },
                                match4: { type: "NUMBER", description: "4連線賠率" },
                                match5: { type: "NUMBER", description: "5連線賠率" }
                            },
                            required: ["name", "match1", "match2", "match3", "match4", "match5"]
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

            let parsedData = JSON.parse(jsonText);

            if (parsedData && !Array.isArray(parsedData)) {
                const possibleArray = Object.values(parsedData).find(val => Array.isArray(val));
                if (possibleArray) {
                    parsedData = possibleArray;
                } else {
                    parsedData = [parsedData];
                }
            }

            if (!parsedData || parsedData.length === 0) {
                throw new Error("AI 無法從圖片中辨識出賠率資料。請確認圖片清晰且包含完整的賠率數字。");
            }

            parsedData = parsedData.map(item => ({
                ...item,
                name: String(item.name || '未命名').replace(/\s+/g, ''),
                match1: Number(item.match1) || 0,
                match2: Number(item.match2) || 0,
                match3: Number(item.match3) || 0,
                match4: Number(item.match4) || 0,
                match5: Number(item.match5) || 0
            }));

            const hasWild = parsedData.some(item => isWildSymbol(item.name));
            if (!hasWild) {
                parsedData.push({ name: 'WILD', match1: 0, match2: 0, match3: 0, match4: 0, match5: 0 });
            }

            setPtResultItems(parsedData.map(item => ({ ...item, thumbUrls: [] })));

            const formattedLines = parsedData.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            if (setTemplateMessage) setTemplateMessage("✅ 賠率表提取完成！可點擊清單手動擷取特徵縮圖。");

        } catch (err) {
            console.warn(err);
            setTemplateError(`賠率分析失敗：${err.message || '未知錯誤'}`);
            if (setTemplateMessage) setTemplateMessage("");
        } finally {
            setIsPtProcessing(false);
        }
    };

    const performAutoBuild = useCallback((data) => {
        try {
            const loadedLineMode = data.lineMode || (!data.extractResults || data.extractResults.length === 0 ? 'allways' : 'paylines');

            const lines = {};
            if (loadedLineMode === 'paylines') {
                (data.extractResults || []).forEach(r => {
                    lines[r.id] = r.data;
                });
            }

            const ptLines = (data.paytableInput || '').trim().split('\n').map(l => l.trim()).filter(l => l);
            const paytable = {};
            ptLines.forEach((line) => {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const symbol = parts[0];
                    const pays = parts.slice(1).map(Number);
                    paytable[symbol] = pays;
                }
            });

            const symbolImages = {};
            const symbolImagesAll = {};
            (data.ptResultItems || []).forEach(item => {
                if (item.thumbUrls && item.thumbUrls.length > 0) {
                    symbolImages[item.name] = item.thumbUrls[0];
                    symbolImagesAll[item.name] = item.thumbUrls;
                } else if (item.thumbUrl) {
                    symbolImages[item.name] = item.thumbUrl;
                    symbolImagesAll[item.name] = [item.thumbUrl];
                }
            });

            const targetRows = data.gridRows || gridRows;
            const targetCols = data.gridCols || gridCols;

            const tpl = {
                rows: targetRows,
                cols: targetCols,
                lineMode: loadedLineMode,
                linesCount: loadedLineMode === 'allways' ? Math.pow(targetRows, targetCols) : (data.extractResults?.length || 0),
                lines,
                paytable,
                symbolImages,
                symbolImagesAll,
                jpConfig: { ...defaultJpConfig, ...(data.jpConfig || jpConfig) },
                hasMultiplierReel: data.hasMultiplierReel || false
            };

            setTemplate(tpl);
            setHasMultiplierReel(data.hasMultiplierReel || false);

            if (setIsPhase2Minimized) setIsPhase2Minimized(false);
            if (setIsPhase3Minimized) setIsPhase3Minimized(true);
            if (setIsTemplateMinimized) setIsTemplateMinimized(true);

            setTemplateError('');
            setBuildErrorMsg('');
            return tpl;
        } catch (err) {
            console.warn("Auto build failed", err);
            setTemplateError('自動建構失敗：' + err.message);
            return null;
        }
    }, [gridRows, gridCols, jpConfig, setIsPhase2Minimized, setIsPhase3Minimized, setIsTemplateMinimized]);

    const handleBuildTemplate = () => {
        setTemplateError('');
        setBuildErrorMsg('');
        try {
            if (lineMode === 'paylines') {
                if (extractResults.length === 0) {
                    throw new Error('請先設定「線獎資料」（可透過純文字輸入、圖片提取，或從雲端模板庫載入）。');
                }
                const hasMissingData = extractResults.some(res => res.data.includes(0));
                if (hasMissingData) {
                    throw new Error('線獎資料中包含 0 (未辨識到線段的格子)。請嘗試調整圖片提取框，或切換至純文字模式手動修正。');
                }
                const isOutOfBounds = extractResults.some(res => res.data.some(r => r < 1 || r > gridRows));
                if (isOutOfBounds) {
                    throw new Error(`「線獎資料」中包含了無效的列數 (必須介於 1 到 ${gridRows} 之間)。請修正您的純文字內容。`);
                }
            }

            const lines = {};
            if (lineMode === 'paylines') {
                extractResults.forEach(r => {
                    lines[r.id] = r.data;
                });
            }

            const ptLines = paytableInput.trim().split('\n').map(l => l.trim()).filter(l => l);
            if (ptLines.length === 0) throw new Error('「賠付表資料」不能為空，請先設定賠率。');

            const paytable = {};
            ptLines.forEach((line, index) => {
                const parts = line.split(/\s+/);
                if (parts.length < 2) throw new Error(`賠付表第 ${index + 1} 行格式錯誤：資料不足`);
                const symbol = parts[0];
                const pays = parts.slice(1).map(Number);
                if (pays.some(isNaN)) throw new Error(`賠付表第 ${index + 1} 行 (${symbol}) 格式錯誤：賠率必須為數字`);
                paytable[symbol] = pays;
            });

            const symbolImages = {};
            const symbolImagesAll = {};
            ptResultItems.forEach(item => {
                if (item.thumbUrls && item.thumbUrls.length > 0) {
                    symbolImages[item.name] = item.thumbUrls[0];
                    symbolImagesAll[item.name] = item.thumbUrls;
                } else if (item.thumbUrl) {
                    symbolImages[item.name] = item.thumbUrl;
                    symbolImagesAll[item.name] = [item.thumbUrl];
                }
            });

            const tpl = {
                rows: gridRows,
                cols: hasMultiplierReel ? gridCols + 1 : gridCols,
                lineMode,
                linesCount: lineMode === 'allways' ? Math.pow(gridRows, gridCols) : extractResults.length,
                lines,
                paytable,
                symbolImages,
                symbolImagesAll,
                jpConfig: hasJackpot ? Object.fromEntries(Object.entries(jpConfig).filter(([_, v]) => v !== '')) : {},
                hasMultiplierReel
            };

            setTemplate(tpl);

            if (setIsPhase2Minimized) setIsPhase2Minimized(false);
            if (setIsPhase3Minimized) setIsPhase3Minimized(true);
            if (setIsTemplateMinimized) setIsTemplateMinimized(true);
            return tpl;
        } catch (err) {
            setTemplateError(err.message);
            setBuildErrorMsg(err.message);
            setTemplate(null);
            return null;
        }
    };

    // Derived states
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
        lineMode, setLineMode,
        linesTextInput, setLinesTextInput,
        paytableMode, setPaytableMode,
        paytableInput, setPaytableInput,
        template, setTemplate,
        templateError, setTemplateError,
        buildErrorMsg, setBuildErrorMsg,
        jpConfig, setJpConfig,
        hasJackpot, setHasJackpot,
        hasMultiplierReel, setHasMultiplierReel,
        lineImages, setLineImages,
        activeLineImageId, setActiveLineImageId,
        activeLineImage, imageSrc, imageObj,
        patternRows, setPatternRows,
        patternCols, setPatternCols,
        gridRows, setGridRows,
        gridCols, setGridCols,
        threshold, setThreshold,
        startIndex, setStartIndex,
        p1, setP1, pEnd, setPEnd,
        extractResults, setExtractResults,
        dragState, setDragState,
        canvasRef, containerRef, layoutStyle, canvasSize,
        linesTabMode, setLinesTabMode,
        ptImages, setPtImages,
        isPtProcessing, setIsPtProcessing,
        ptResultItems, setPtResultItems,
        ptCropState, setPtCropState,
        ptEnlargedImg, setPtEnlargedImg,
        ptCropImageRef,
        handleLineImageUpload, removeLineImage, analyzeImage,
        handleMouseDown, handleMouseMove, handleMouseUp, draw,
        handlePaytableTextChange, handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        handlePtFileChange, handlePtDrop, processPtFiles, removePtImage, clearPtAll, handlePtExtract,
        performAutoBuild, handleBuildTemplate
    };
}
