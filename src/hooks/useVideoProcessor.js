import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

/**
 * Phase 4 影片處理核心：Grid Motion Detection Version
 * 移除 OCR，改用格點化位移覆蓋率 (Coverage) 判定轉動。
 */
export function useVideoProcessor({ setTemplateMessage, template }) {
    // --- 狀態管理 ---
    const [videoSrc, setVideoSrc] = useState(null);
    const [isAutoDetecting, setIsAutoDetecting] = useState(false);
    const [sensitivity, setSensitivity] = useState(15);
    const [motionCoverageMin, setMotionCoverageMin] = useState(60); // 預設 60% 區塊有位移才算轉動
    const [motionDelay, setMotionDelay] = useState(400); // 穩定判定時間 (ms)，預設 400ms
    const [vLineThreshold, setVLineThreshold] = useState(0.25); // 網格線消失判定比值 (VLine/Coverage)

    const [capturedImages, setCapturedImages] = useState([]);
    const [reelROI, setReelROI] = useState(() => {
        const saved = localStorage.getItem('slot_phase4_roi');
        try {
            return saved ? JSON.parse(saved) : { x: 15, y: 15, w: 70, h: 55 };
        } catch (e) {
            return { x: 15, y: 15, w: 70, h: 55 };
        }
    });

    const [winROI, setWinROI] = useState(() => {
        const saved = localStorage.getItem('slot_phase4_win_roi');
        try {
            return saved ? JSON.parse(saved) : { x: 40, y: 75, w: 20, h: 10 };
        } catch (e) { return { x: 40, y: 75, w: 20, h: 10 }; }
    });

    const [balanceROI, setBalanceROI] = useState(() => {
        const saved = localStorage.getItem('slot_phase4_balance_roi');
        try {
            return saved ? JSON.parse(saved) : { x: 10, y: 85, w: 25, h: 8 };
        } catch (e) { return { x: 10, y: 85, w: 25, h: 8 }; }
    });

    // 持久化儲存 ROI 區域 (僅在啟動偵測時同步)
    useEffect(() => {
        if (isAutoDetecting) {
            if (reelROI) localStorage.setItem('slot_phase4_roi', JSON.stringify(reelROI));
            if (winROI) localStorage.setItem('slot_phase4_win_roi', JSON.stringify(winROI));
            if (balanceROI) localStorage.setItem('slot_phase4_balance_roi', JSON.stringify(balanceROI));
        }
    }, [isAutoDetecting]);

    // 除錯資料
    const [debugData, setDebugData] = useState({
        diff: 0,
        coverage: 0,
        vLineRate: 0,
        ratio: 0,
        isBigWin: false,
        status: 'idle',
        lastTrigger: '',
        error: null
    });

    // --- 核心引用 ---
    const videoRef = useRef(null);
    const lastFrameRef = useRef(null);
    const isProcessingRef = useRef(false);
    const requestRef = useRef(null);

    // 狀態機控制
    const spinStateRef = useRef('IDLE'); // IDLE, SPINNING, STABILIZING
    const stateStartTimeRef = useRef(0);
    const firstMotionTimeRef = useRef(null); // 上升斜率判定起始時間
    const lastBigWinTimeRef = useRef(0); // 最後一次 BIGWIN 偵測時間

    // Canvas 緩存
    const scanCanvasRef = useRef(null);
    const lastROIValuesRef = useRef(null); // 用於偵測 ROI 是否變動

    // 上傳影片
    const handleVideoUpload = useCallback((e) => {
        const file = e.target.files[0];
        if (file) {
            if (videoSrc) URL.revokeObjectURL(videoSrc);
            setVideoSrc(URL.createObjectURL(file));
            setCapturedImages([]);
            spinStateRef.current = 'IDLE';
            setTemplateMessage("📽️ 影片已就緒。");
        }
    }, [videoSrc, setTemplateMessage]);

    // 核心辨識函式：使用 Tesseract.js 本地辨識
    const recognizeData = async (fullCanvas, roi) => {
        if (!roi) return "";
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

            // 影像增強：轉為灰階並二值化
            const imgData = ctx.getImageData(0, 0, cw * scale, ch * scale);
            for (let i = 0; i < imgData.data.length; i += 4) {
                const gray = imgData.data[i] * 0.3 + imgData.data[i + 1] * 0.59 + imgData.data[i + 2] * 0.11;
                const v = gray > 140 ? 255 : 0; // 調高門檻，讓背景更乾淨
                imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v;
            }
            ctx.putImageData(imgData, 0, 0);

            const worker = await createWorker('eng');
            await worker.setParameters({
                tessedit_char_whitelist: '0123456789.',
                tessedit_pageseg_mode: '7', // 加強單行辨識
            });
            const { data: { text } } = await worker.recognize(cropCanvas);
            await worker.terminate();

            // 後處理：只保留數字與小數點，移除所有英文字母或雜訊
            const cleaned = text.trim()
                .replace(/[^0-9.,]/g, '') // 移除英文字母
                .replace(/,/g, '');      // 移除千分位逗號，統一數據格式

            return cleaned || "0";
        } catch (err) {
            console.error("OCR Error:", err);
            return "Err";
        }
    };

    // 擷取目前畫面
    const captureCurrentFrame = useCallback(async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
        const captureId = Date.now();
        const newImg = {
            id: captureId,
            file: { name: `Auto-Capture-${video.currentTime.toFixed(1)}s` },
            previewUrl,
            timestamp: video.currentTime.toFixed(2),
            extractedWin: "...",
            extractedBalance: "..."
        };

        setCapturedImages(prev => [...prev, newImg]);

        // 異步執行本地 OCR
        (async () => {
            const winText = await recognizeData(canvas, winROI);
            const balanceText = await recognizeData(canvas, balanceROI);
            setCapturedImages(prev => prev.map(img =>
                img.id === captureId ? { ...img, extractedWin: winText, extractedBalance: balanceText } : img
            ));
        })();

        return newImg;
    }, [winROI, balanceROI]);

    const removeCapturedImage = (id) => setCapturedImages(prev => prev.filter(img => img.id !== id));
    const clearAllCaptures = () => setCapturedImages([]);

    // 核心循環：格點位移偵測
    const processFrame = useCallback(() => {
        if (!isAutoDetecting || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
            requestRef.current = requestAnimationFrame(processFrame);
            return;
        }

        if (isProcessingRef.current) {
            requestRef.current = requestAnimationFrame(processFrame);
            return;
        }

        isProcessingRef.current = true;

        try {
            const video = videoRef.current;
            const rows = template?.GridRows || 3;
            const cols = template?.GridCols || 5;

            // 1. 初始化掃描 Canvas (效能優化)
            if (!scanCanvasRef.current) {
                scanCanvasRef.current = document.createElement('canvas');
            }
            const scanCanvas = scanCanvasRef.current;
            const targetW = 320; // 降低解析度提升效率
            const targetH = Math.round(targetW * (reelROI.h / reelROI.w));

            if (scanCanvas.width !== targetW || scanCanvas.height !== targetH) {
                scanCanvas.width = targetW;
                scanCanvas.height = targetH;
            }
            const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });

            // 2. 獲取 ROI 影像
            const sourceX = (reelROI.x / 100) * video.videoWidth;
            const sourceY = (reelROI.y / 100) * video.videoHeight;
            const sourceW = (reelROI.w / 100) * video.videoWidth;
            const sourceH = (reelROI.h / 100) * video.videoHeight;

            if (sourceW <= 1 || sourceH <= 1) throw new Error("ROI 範圍過小");

            ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const data = imageData.data;

            // 3. 轉為灰階二值化 (還原為二值化比對)
            const binarized = new Uint8Array(targetW * targetH);
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                binarized[i / 4] = avg > 120 ? 255 : 0;
            }

            // 4. 格點位移比對
            if (lastFrameRef.current && lastFrameRef.current.length === binarized.length) {
                const cols = template?.GridCols || template?.grid?.cols || 5;
                const rows = template?.GridRows || template?.grid?.rows || 3;
                const cellW = Math.floor(targetW / cols);
                const cellH = Math.floor(targetH / rows);

                let vLineMotionCount = 0;
                let vLineTotalPixels = 0;

                // 4.1 垂直網格線位移抽樣 (V-Line Check)
                for (let i = 1; i < cols; i++) {
                    const vx = Math.floor(i * (targetW / cols));
                    for (let vy = 0; vy < targetH; vy += 2) {
                        vLineTotalPixels++;
                        const idx = vy * targetW + vx;
                        if (binarized[idx] !== lastFrameRef.current[idx]) {
                            vLineMotionCount++;
                        }
                    }
                }
                const vLineMotionRate = vLineTotalPixels > 0 ? (vLineMotionCount / vLineTotalPixels) * 100 : 0;

                let motionCells = 0;
                let totalDiff = 0;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        let cellDiff = 0;
                        const startX = c * cellW;
                        const startY = r * cellH;

                        // 採樣比對
                        for (let y = startY; y < startY + cellH; y += 4) {
                            for (let x = startX; x < startX + cellW; x += 4) {
                                const idx = y * targetW + x;
                                if (binarized[idx] !== lastFrameRef.current[idx]) {
                                    cellDiff++;
                                }
                            }
                        }

                        const sampleCount = (cellW / 4) * (cellH / 4);
                        const cellDiffRate = (cellDiff / sampleCount) * 100;

                        if (cellDiffRate > sensitivity) {
                            motionCells++;
                        }
                        totalDiff += cellDiffRate;
                    }
                }

                const coverage = (motionCells / (rows * cols)) * 100;
                const avgDiff = totalDiff / (rows * cols);
                const motionRatio = coverage > 0 ? (vLineMotionRate / coverage) : 0;
                const isLineHidden = motionRatio > vLineThreshold;
                const now = Date.now();

                // 紀錄 BIGWIN 時間用於冷卻
                if (isLineHidden) {
                    lastBigWinTimeRef.current = now;
                }

                // 5. 狀態機邏輯
                let nextStatus = spinStateRef.current;

                // 只有位移完全消失才重置起始時間
                if (coverage < 5) {
                    firstMotionTimeRef.current = null;
                }

                if (spinStateRef.current === 'IDLE') {
                    if (coverage > 5) {
                        if (firstMotionTimeRef.current === null) {
                            firstMotionTimeRef.current = now;
                        }

                        // 若正在 BIGWIN 冷卻期 (0.5s)，禁止啟動
                        if (now - lastBigWinTimeRef.current < 500) {
                            nextStatus = 'IDLE';
                        } 
                        // [靈敏度優化] 調降啟動覆蓋率門檻 (80% -> 40%) 並放寬偵測窗口 (150ms -> 200ms)
                        else if (coverage > 40) {
                            const timeDiff = now - firstMotionTimeRef.current;
                            if (timeDiff < 200 && !isLineHidden) {
                                nextStatus = 'SPINNING';
                                stateStartTimeRef.current = now;
                            }
                        }
                    }
                }
                else if (spinStateRef.current === 'SPINNING') {
                    if (coverage < 10) { 
                        nextStatus = 'STABILIZING';
                        stateStartTimeRef.current = now;
                    }
                }
                else if (spinStateRef.current === 'STABILIZING') {
                    // [穩定調優] 只有位移很高 (30%+) 且「不是中獎線特效」時，才判定為重新動起來回到 SPINNING
                    if (coverage > 30 && !isLineHidden) { 
                        nextStatus = 'SPINNING';
                        stateStartTimeRef.current = now;
                    } else if (now - stateStartTimeRef.current > motionDelay) {
                        captureCurrentFrame();
                        setTemplateMessage("✅ 自動擷取成功");
                        nextStatus = 'IDLE';
                    }
                }

                spinStateRef.current = nextStatus;

                // 強制更新除錯面板
                setDebugData({
                    diff: avgDiff.toFixed(1),
                    coverage: coverage.toFixed(1),
                    vLineRate: vLineMotionRate.toFixed(1),
                    ratio: motionRatio.toFixed(2),
                    isBigWin: isLineHidden,
                    status: nextStatus,
                    error: null
                });
            }

            lastFrameRef.current = binarized;
        } catch (err) {
            setDebugData(prev => ({ ...prev, error: err.message }));
        } finally {
            isProcessingRef.current = false;
        }

        requestRef.current = requestAnimationFrame(processFrame);
    }, [isAutoDetecting, reelROI, template, sensitivity, motionCoverageMin, motionDelay, vLineThreshold, captureCurrentFrame, setTemplateMessage]);

    useEffect(() => {
        if (isAutoDetecting) {
            // [Startup Optimization] 全面狀態重置：直接跳過斜率判定，進入 SPINNING 模式等待停輪
            spinStateRef.current = 'SPINNING';
            stateStartTimeRef.current = Date.now();
            firstMotionTimeRef.current = null;
            lastBigWinTimeRef.current = 0;
            lastFrameRef.current = null;

            // 啟動瞬間立即擷取一幀並二值化作為參考基底，消除首次循環跳過
            if (videoRef.current && videoRef.current.readyState >= 2) {
                const video = videoRef.current;
                const canvas = document.createElement('canvas');
                const targetW = 320;
                const targetH = Math.round(targetW * (reelROI.h / reelROI.w));
                canvas.width = targetW;
                canvas.height = targetH;

                const sourceX = (reelROI.x / 100) * video.videoWidth;
                const sourceY = (reelROI.y / 100) * video.videoHeight;
                const sourceW = (reelROI.w / 100) * video.videoWidth;
                const sourceH = (reelROI.h / 100) * video.videoHeight;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);
                const data = ctx.getImageData(0, 0, targetW, targetH).data;
                const binarized = new Uint8Array(targetW * targetH);
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    binarized[i / 4] = avg > 120 ? 255 : 0;
                }
                lastFrameRef.current = binarized;
            }
            requestRef.current = requestAnimationFrame(processFrame);
        } else {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isAutoDetecting, processFrame]);

    return {
        videoSrc, videoRef, handleVideoUpload,
        isAutoDetecting, setIsAutoDetecting,
        sensitivity, setSensitivity,
        motionCoverageMin, setMotionCoverageMin,
        motionDelay, setMotionDelay,
        vLineThreshold, setVLineThreshold,
        capturedImages, removeCapturedImage, clearAllCaptures,
        reelROI, setReelROI,
        winROI, setWinROI,
        balanceROI, setBalanceROI,
        captureCurrentFrame,
        debugData
    };
}
