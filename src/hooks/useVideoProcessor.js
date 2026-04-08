import { useState, useRef, useCallback, useEffect } from 'react';
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

/**
 * Phase 4 影片處理核心：Grid Motion Detection Version
 * 移除 OCR，改用格點化位移覆蓋率 (Coverage) 判定轉動。
 */
export function useVideoProcessor({ setTemplateMessage, template, motionCoverageMin, setMotionCoverageMin, vLineThreshold, setVLineThreshold, ocrDecimalPlaces, setOcrDecimalPlaces }) {
    // --- 狀態管理 ---
    const [videoSrc, setVideoSrc] = useState(null);
    const [isAutoDetecting, setIsAutoDetecting] = useState(false);
    const [sensitivity, setSensitivity] = useState(15);
    const [motionDelay, setMotionDelay] = useState(2000); // 穩定判定保底時間 (ms)


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
    
    const [betROI, setBetROI] = useState(() => {
        const saved = localStorage.getItem('slot_phase4_bet_roi');
        try {
            return saved ? JSON.parse(saved) : { x: 75, y: 85, w: 20, h: 8 };
        } catch (e) { return { x: 75, y: 85, w: 20, h: 8 }; }
    });

    // 持久化儲存 ROI 區域 (僅在啟動偵測時同步)
    useEffect(() => {
        if (isAutoDetecting) {
            if (reelROI) localStorage.setItem('slot_phase4_roi', JSON.stringify(reelROI));
            if (winROI) localStorage.setItem('slot_phase4_win_roi', JSON.stringify(winROI));
            if (balanceROI) localStorage.setItem('slot_phase4_balance_roi', JSON.stringify(balanceROI));
            if (betROI) localStorage.setItem('slot_phase4_bet_roi', JSON.stringify(betROI));
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
    const debugThrottleRef = useRef(0); // 節流 debug setState

    // --- 核心引用 ---
    const videoRef = useRef(null);
    const frameRawHistory = useRef([]); // Ground Truth 背景紀錄
    const lastFrameRef = useRef(null);
    const isProcessingRef = useRef(false);
    const requestRef = useRef(null);
    const ocrWorkerRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                console.log("[OCR] 啟動 PaddleOCR WebAssembly 引擎中...");
                const baseUrl = import.meta.env.BASE_URL;
                ort.env.wasm.wasmPaths = baseUrl;
                ort.env.wasm.numThreads = 1; // 關閉多執行緒，避免 SharedArrayBuffer 安全性警告
                
                const ocr = await Ocr.create({
                    models: {
                        detectionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_det_infer.onnx`,
                        recognitionPath: `${baseUrl}ocr-models/ch_PP-OCRv4_rec_infer.onnx`,
                        dictionaryPath: `${baseUrl}ocr-models/ppocr_keys_v1.txt`
                    }
                });
                if (isMounted) {
                    ocrWorkerRef.current = ocr;
                    console.log("[OCR] PaddleOCR 載入完成！");
                }
            } catch (err) {
                console.error("[OCR] 初始化 PaddleOCR 失敗:", err);
            }
        })();
        return () => {
            isMounted = false;
        };
    }, []);

    // 狀態機控制
    const spinStateRef = useRef('IDLE'); // IDLE, SPINNING, STABILIZING
    const stateStartTimeRef = useRef(0);
    const firstMotionTimeRef = useRef(null); // 上升斜率判定起始時間
    const lastBigWinTimeRef = useRef(0); // 最後一次 BIGWIN 偵測時間
    const lastWinFrameRef = useRef(null);    // WIN ROI 前一幀 RGB 像素
    const lastBalanceFrameRef = useRef(null); // BALANCE ROI 前一幀 RGB 像素
    const winConfirmTimeRef = useRef(null);   // WIN 訊號確認窗口時間戳
    const winBalCanvasRef = useRef(null);     // WIN ROI 取樣用 canvas
    const balCanvasRef = useRef(null);         // BALANCE ROI 取樣用 canvas
    const lastWinTriggerRef = useRef(0);       // WIN 訊號最後觸發時間（debug 黏滞用）
    const lastBalTriggerRef = useRef(0);       // BAL 訊號最後觸發時間（debug 黏滞用）
    const stableCanvasRef = useRef(null);      // STABILIZING 期間的穩定幀快照
    const lastSnapshotTimeRef = useRef(0);     // 上次快照時間
    const lastCaptureTimeRef = useRef(0);      // 上次截圖時間（防止派彩入帳觸發重複截圖）


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

    // 核心辨識函式：使用 PaddleOCR 本地辨識
    const recognizeData = async (fullCanvas, roi, useFixedDecimal = true) => {
        if (!roi) return "";
        try {
            const cropCanvas = document.createElement('canvas');
            const cw = Math.floor(fullCanvas.width * (roi.w / 100));
            const ch = Math.floor(fullCanvas.height * (roi.h / 100));
            const cx = Math.floor(fullCanvas.width * (roi.x / 100));
            const cy = Math.floor(fullCanvas.height * (roi.y / 100));

            // PaddleOCR 容忍度高，降回 2x 即可保留清晰度且縮減運算成本
            let scale = 2;
            if (roi === window.winROI || (roi.w > 10 && roi.h > 3)) { // 簡單推斷
                scale = 40 / ch;
                if (scale < 1) scale = 1;
            }

            // [關鍵修復] 加上 Padding: DBNet 如果文字太貼齊邊緣，會辨識不到
            const PADDING = 30;
            cropCanvas.width = Math.floor(cw * scale) + (PADDING * 2);
            cropCanvas.height = Math.floor(ch * scale) + (PADDING * 2);
            const ctx = cropCanvas.getContext('2d');
            
            // 填入常見的暗色背景防呆
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

            ctx.drawImage(fullCanvas, cx, cy, cw, ch, PADDING, PADDING, cw * scale, ch * scale);

            // ⚠️ 已經完全移除以前 Tesseract 時代需要的「灰階轉換、二值化、侵蝕膨脹」
            // 因為 PaddleOCR 的神經網路設計本身就是接受彩色物件，破壞色彩反而會減損特徵判斷！

            if (!ocrWorkerRef.current) return "...";
            // 轉換為 Base64 Data URL 傳遞給 Paddle
            const detectedLines = await ocrWorkerRef.current.detect(cropCanvas.toDataURL('image/png'));

            // 將 Paddle 多行捕捉結果以空白連接起來
            const text = (detectedLines || []).map(t => t.text).join(' ').trim();

            // 在控制台輸出原始 OCR 辨識結果與二值化原圖 (雖然現在是彩圖)
            console.log(`[PaddleOCR Raw] ROI:`, roi, `=> "${text}"`);
            // 後處理：PaddleOCR 偶爾會誤認背景裝飾為字母 (例如 $ 或 WIN)，
            // 這裡設定嚴密屏障，只保留純數字 (0-9)、小數點 (.) 與千分位逗號 (,)
            const validText = text.replace(/[^0-9.,]/g, '');
            // 最後移除逗號以便後續 JavaScript 解析，並清掉頭尾不小心沾到的孤立小數點
            const cleaned = validText.replace(/,/g, '').replace(/^\.+|\.+$/g, '') || "0";
            return cleaned;
        } catch (err) {
            console.error("OCR Error:", err);
            return "Err";
        }
    };

    // 擷取目前畫面（可接受預存的 canvas 作為來源，triggerSource 標記觸發來源）
    const captureCurrentFrame = useCallback(async (sourceCanvas = null, triggerSource = '手動') => {
        let canvas;
        if (sourceCanvas) {
            // 使用預存的穩定幀快照
            canvas = sourceCanvas;
        } else {
            // 從 live 影片擷取
            if (!videoRef.current) return;
            const video = videoRef.current;
            canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
        }

        const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // 產生專用於列表顯示的裁切縮圖 (盤面範圍)
        let thumbUrl = previewUrl;
        if (reelROI) {
            try {
                const thumbCanvas = document.createElement('canvas');
                const cw = Math.floor(canvas.width * (reelROI.w / 100));
                const ch = Math.floor(canvas.height * (reelROI.h / 100));
                const cx = Math.floor(canvas.width * (reelROI.x / 100));
                const cy = Math.floor(canvas.height * (reelROI.y / 100));
                thumbCanvas.width = cw;
                thumbCanvas.height = ch;
                const tCtx = thumbCanvas.getContext('2d');
                tCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
                thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);
            } catch(e) {
                console.error("Failed to generate thumb", e);
            }
        }

        const currentTime = videoRef.current ? videoRef.current.currentTime : 0;
        const captureId = Date.now();
        const newImg = {
            id: captureId,
            file: { name: `Auto-Capture-${currentTime.toFixed(1)}s` },
            previewUrl,
            thumbUrl,
            timestamp: currentTime.toFixed(2),
            triggerSource,
            extractedWin: "...",
            extractedBalance: "...",
            extractedBet: "..."
        };

        setCapturedImages(prev => [...prev, newImg]);

        // 異步執行本地 OCR (並行辨識以提升速度)
        (async () => {
            try {
                const [winText, balanceText, betText] = await Promise.all([
                    recognizeData(canvas, winROI, true),
                    recognizeData(canvas, balanceROI, true),
                    recognizeData(canvas, betROI, false) // 押注不強制使用固定小數點，保留原本的靈活解析
                ]);
                
                setCapturedImages(prev => prev.map(img =>
                    img.id === captureId ? { 
                        ...img, 
                        extractedWin: winText, 
                        extractedBalance: balanceText, 
                        extractedBet: betText 
                    } : img
                ));
            } catch (err) {
                console.error("OCR Batch Error:", err);
                setCapturedImages(prev => prev.map(img =>
                    img.id === captureId ? { ...img, extractedWin: "Err", extractedBalance: "Err", extractedBet: "Err" } : img
                ));
            }
        })();

        return newImg;
    }, [winROI, balanceROI, betROI, reelROI, ocrDecimalPlaces]);

    const removeCapturedImage = (id) => setCapturedImages(prev => prev.filter(img => img.id !== id));
    const clearAllCaptures = () => setCapturedImages([]);

    // 核心循環：格點位移偵測
    const processFrame = useCallback(() => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
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
            const rows = template?.rows || 3;
            const cols = template?.cols || 5;

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

            // 3b. WIN/BALANCE ROI 高對比差異檢測（獨立於盤面，作為主訊號）
            const computeHighContrastDiff = (roiDef, lastRef, canvasRef) => {
                if (!roiDef || !video) return { diffCount: 0, changed: false };
                if (!canvasRef.current) {
                    canvasRef.current = document.createElement('canvas');
                }
                const c = canvasRef.current;
                const roiW = 80;
                const roiH = Math.max(1, Math.round(roiW * (roiDef.h / roiDef.w)));

                // 只在尺寸變動時才重設（避免每幀重建 context）
                if (c.width !== roiW || c.height !== roiH) {
                    c.width = roiW;
                    c.height = roiH;
                }
                const rCtx = c.getContext('2d', { willReadFrequently: true });
                const sx = (roiDef.x / 100) * video.videoWidth;
                const sy = (roiDef.y / 100) * video.videoHeight;
                const sw = (roiDef.w / 100) * video.videoWidth;
                const sh = (roiDef.h / 100) * video.videoHeight;
                if (sw <= 1 || sh <= 1) return { diffCount: 0, changed: false };

                rCtx.drawImage(video, sx, sy, sw, sh, 0, 0, roiW, roiH);
                const roiData = rCtx.getImageData(0, 0, roiW, roiH).data;

                let highContrastCount = 0;
                const pixelCount = roiW * roiH;
                const currentRGB = new Uint8Array(pixelCount * 3);

                for (let i = 0; i < pixelCount; i++) {
                    const ri = i * 4;
                    currentRGB[i * 3] = roiData[ri];
                    currentRGB[i * 3 + 1] = roiData[ri + 1];
                    currentRGB[i * 3 + 2] = roiData[ri + 2];

                    if (lastRef.current && lastRef.current.length === currentRGB.length) {
                        const dr = Math.abs(roiData[ri] - lastRef.current[i * 3]);
                        const dg = Math.abs(roiData[ri + 1] - lastRef.current[i * 3 + 1]);
                        const db = Math.abs(roiData[ri + 2] - lastRef.current[i * 3 + 2]);
                        if (Math.max(dr, dg, db) > 25) highContrastCount++;
                    }
                }

                lastRef.current = currentRGB;
                return { diffCount: highContrastCount, changed: highContrastCount >= 2 };
            };

            const winDiffResult = computeHighContrastDiff(winROI, lastWinFrameRef, winBalCanvasRef);
            const balDiffResult = computeHighContrastDiff(balanceROI, lastBalanceFrameRef, balCanvasRef);
            let isWinChanged = winDiffResult.changed;
            let isBalanceChanged = balDiffResult.changed;

            // ---- 開機暖機機制 (200ms) ----
            // 影片剛播放或改變進度時，解碼器與緩衝會產生破圖或光影跳動 (造成巨大的 ROI 假差異)
            // 暖機期間強制過濾這些雜訊，不觸發狀態跳轉，也不解鎖截圖防護
            // (縮短至 200ms，足以濾除前 6~12 幀的解碼異常，且不會錯過使用者的快手操作)
            if (isAutoDetecting && (Date.now() - stateStartTimeRef.current < 200)) {
                isWinChanged = false;
                isBalanceChanged = false;
            }



            // 4. 格點位移比對（盤面覆蓋率，作為輔助/保底訊號）
            if (lastFrameRef.current && lastFrameRef.current.length === binarized.length) {
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
                // [B-1] 逐列變化率追蹤
                const colDiffSums = new Array(cols).fill(0);

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
                        colDiffSums[c] += cellDiffRate; // 累計到該列
                    }
                }

                const coverage = (motionCells / (rows * cols)) * 100;
                const avgDiff = totalDiff / (rows * cols);
                const motionRatio = coverage > 0 ? (vLineMotionRate / coverage) : 0;
                const isLineHidden = motionRatio > vLineThreshold;
                const now = Date.now();
                // 逐列平均 diffRate
                const colDiffs = colDiffSums.map(s => s / rows);

                // ---- [Ground Truth 背景紀錄] ----
                frameRawHistory.current.push({
                    time: video.currentTime || 0,
                    coverage,
                    ratio: motionRatio,
                    colDiffs,
                    winDiff: winDiffResult.diffCount,
                    balDiff: balDiffResult.diffCount
                });
                if (frameRawHistory.current.length > 6000) frameRawHistory.current.shift();
                // ---------------------------------

                // 紀錄 BIGWIN 時間用於冷卻
                if (isLineHidden) {
                    lastBigWinTimeRef.current = now;
                    lastCaptureTimeRef.current = now; // 大獎期間也刷新截圖冷卻，忽略派彩 BAL 變化
                }

                // 5. 狀態機邏輯（以 WIN/BALANCE 訊號為主，盤面覆蓋率為輔）
                let nextStatus = spinStateRef.current;

                if (isAutoDetecting) {
                    // BIG WIN 冷卻：僅用於 coverage 保底路徑的 IDLE→SPINNING
                    const inBigWinCooldown = isLineHidden || (now - lastBigWinTimeRef.current < 500);

                    // 只有位移完全消失才重置起始時間
                    if (coverage < motionCoverageMin * 0.15) {
                        firstMotionTimeRef.current = null;
                    }

                    if (spinStateRef.current === 'IDLE') {
                        // 主訊號：BALANCE 變化（押注扣款）→ 直接鎖定發車
                        // 截圖後 2 秒內忽略（避免「派彩入帳」的 BAL 變化觸發重複循環）
                        if (isBalanceChanged && now - lastCaptureTimeRef.current > 2000) {
                            nextStatus = 'SPINNING';
                            stateStartTimeRef.current = now;
                            winConfirmTimeRef.current = null;
                        }
                        // 保底：盤面覆蓋率上升
                        else if (coverage > motionCoverageMin * 0.15) {
                            if (firstMotionTimeRef.current === null) {
                                firstMotionTimeRef.current = now;
                            }
                            if (now - lastBigWinTimeRef.current < 500) {
                                nextStatus = 'IDLE'; // BIG WIN 冷卻期禁止啟動
                            } else if (coverage > motionCoverageMin * 0.6) {
                                const timeDiff = now - firstMotionTimeRef.current;
                                if (timeDiff < 200 && !isLineHidden) {
                                    nextStatus = 'SPINNING';
                                    stateStartTimeRef.current = now;
                                    winConfirmTimeRef.current = null;
                                }
                            }
                        }
                    }
                    else if (spinStateRef.current === 'SPINNING') {
                        // 提前偵測：如果 WIN 已經開始跳字，直接進入確認窗口（跳過等待 STABILIZING）
                        if (isWinChanged && winConfirmTimeRef.current === null) {
                            winConfirmTimeRef.current = now;
                            nextStatus = 'STABILIZING';
                            stateStartTimeRef.current = now;
                            stableCanvasRef.current = null;
                            lastSnapshotTimeRef.current = 0;
                        }
                        else if (coverage < motionCoverageMin * 0.4) {
                            nextStatus = 'STABILIZING';
                            stateStartTimeRef.current = now;
                            winConfirmTimeRef.current = null;
                            stableCanvasRef.current = null; // 進入穩定階段，重置快照
                            lastSnapshotTimeRef.current = 0;
                        }
                    }
                    else if (spinStateRef.current === 'STABILIZING') {
                        // 持續更新穩定幀快照（每 200ms 存一張，用於 BAL 觸發時回溯）
                        if (coverage < motionCoverageMin * 0.5 && now - lastSnapshotTimeRef.current > 200) {
                            lastSnapshotTimeRef.current = now;
                            const video = videoRef.current;
                            if (video) {
                                const snapCanvas = document.createElement('canvas');
                                snapCanvas.width = video.videoWidth;
                                snapCanvas.height = video.videoHeight;
                                const snapCtx = snapCanvas.getContext('2d');
                                snapCtx.drawImage(video, 0, 0);
                                stableCanvasRef.current = snapCanvas;
                            }
                        }

                        // 主訊號 1：WIN 變化（派彩跳字）→ 啟動確認窗口（不受冷却限制）
                        if (isWinChanged && winConfirmTimeRef.current === null) {
                            winConfirmTimeRef.current = now;
                        }

                        // 確認窗口完成：150ms 後立刻截圖（讓WIN數字動畫有時間穩定顯示）
                        // WIN 訊號來自 OCR ROI，與盤面覆蓋率無關
                        // 移除 coverage 門檻，避免線獎閃燈動畫把截圖永遠擋住
                        if (winConfirmTimeRef.current !== null &&
                            now - winConfirmTimeRef.current > 150) {
                            captureCurrentFrame(null, '💰 WIN');
                            lastCaptureTimeRef.current = now;
                            setTemplateMessage("✅ 自動擷取成功（贏分觸發）");
                            nextStatus = 'IDLE';
                            winConfirmTimeRef.current = null;
                        }
                        // 主訊號 2：BALANCE 變化 → 用「快照」截圖（扣款前的盤面）
                        // 注意：如果正處於 WIN 的 50ms 等待確認期間，忽略 BAL 的跳動（防止贏分和餘額同時跳動時被 BAL 搶走）
                        else if (isBalanceChanged && winConfirmTimeRef.current === null) {
                            const snapshotToUse = stableCanvasRef.current || null;
                            captureCurrentFrame(snapshotToUse, '💳 BAL');
                            lastCaptureTimeRef.current = now;
                            if (coverage > motionCoverageMin * 0.3) {
                                setTemplateMessage("✅ 自動擷取成功（扣款前快照）");
                                nextStatus = 'SPINNING';
                                stateStartTimeRef.current = now;
                            } else {
                                setTemplateMessage("✅ 自動擷取成功（扣款前快照）");
                                nextStatus = 'IDLE';
                            }
                            winConfirmTimeRef.current = null;
                            stableCanvasRef.current = null;
                        }

                        // 假停輪偵測：盤面重新動起來
                        // 注意：如果正在確認 WIN 訊號，忽略 coverage 上升（線獎閃燈會誤觸發此條件）
                        else if (coverage > motionCoverageMin * 0.7 && !isLineHidden && winConfirmTimeRef.current === null) {
                            nextStatus = 'SPINNING';
                            stateStartTimeRef.current = now;
                            winConfirmTimeRef.current = null;
                        }
                    }

                    spinStateRef.current = nextStatus;
                }

                // 節流更新除錯面板 (每 100ms 最多更新一次，減少 re-render)
                // 黏滯觸發記錄：瞬間訊號持續顯示 500ms
                if (isWinChanged) lastWinTriggerRef.current = now;
                if (isBalanceChanged) lastBalTriggerRef.current = now;

                if (now - debugThrottleRef.current > 100) {
                    debugThrottleRef.current = now;
                    setDebugData({
                        diff: avgDiff.toFixed(1),
                        coverage: coverage.toFixed(1),
                        vLineRate: vLineMotionRate.toFixed(1),
                        ratio: motionRatio.toFixed(2),
                        isBigWin: isLineHidden,
                        status: nextStatus,
                        winDiff: winDiffResult.diffCount,
                        balDiff: balDiffResult.diffCount,
                        isWinChanged: now - lastWinTriggerRef.current < 500,  // 黏滯 500ms
                        isBalChanged: now - lastBalTriggerRef.current < 500,   // 黏滯 500ms
                        error: null
                    });
                }
            }

            lastFrameRef.current = binarized;
        } catch (err) {
            setDebugData(prev => ({ ...prev, error: err.message }));
        } finally {
            isProcessingRef.current = false;
        }

        requestRef.current = requestAnimationFrame(processFrame);
    }, [isAutoDetecting, reelROI, winROI, balanceROI, template, sensitivity, motionCoverageMin, motionDelay, vLineThreshold, captureCurrentFrame, setTemplateMessage]);

    // 背景紀錄迴圈：只要有影片就啟動 processFrame（內部狀態機由 isAutoDetecting 控制）
    useEffect(() => {
        if (!videoSrc) return;

        if (isAutoDetecting) {
            // [Startup] 重置狀態機，從 IDLE 開始等待真正的轉動訊號
            spinStateRef.current = 'IDLE';
            stateStartTimeRef.current = Date.now();
            firstMotionTimeRef.current = null;

            lastBigWinTimeRef.current = 0;
            winConfirmTimeRef.current = null;
            lastFrameRef.current = null; // 強制清除參考幀，避免與舊數據比較導致誤觸發
            lastWinFrameRef.current = null;
            lastBalanceFrameRef.current = null;


        }

        // 無論 isAutoDetecting 是否開啟，都啟動 processFrame 迴圈（背景紀錄用）
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(processFrame);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isAutoDetecting, processFrame, videoSrc]);

    // --- 🧪 從手動截圖反推最佳參數 (Ground Truth) ---
    const runCalibration = useCallback(() => {
        if (!capturedImages || capturedImages.length === 0) {
            setTemplateMessage("⚠️ 請先手動擷取至少一張截圖作為基準");
            return;
        }

        const log = frameRawHistory.current;
        if (log.length === 0) {
            setTemplateMessage("⚠️ 背景數據不足，請播放影片以收集動態軌跡");
            return;
        }

        // ====== B-2: 裂谷切分 + P95 統計推導 ======
        const derivedCoverages = [];
        const allSpinningRatios = [];
        let validCaptures = 0;

        capturedImages.forEach(img => {
            const t = parseFloat(img.timestamp);
            if (isNaN(t)) return;

            // 取出 [t - 3s, t + 0.1s] 的歷史軌跡
            const slice = log.filter(d => d.time >= t - 3 && d.time <= t + 0.1);
            if (slice.length < 3) return;

            validCaptures++;

            // 山峰：前 3 秒內的最高 coverage
            const spinningPeak = Math.max(...slice.map(d => d.coverage));

            // 平地：截圖當下（±0.15s）的 coverage
            const nearCapture = slice.filter(d => Math.abs(d.time - t) <= 0.15);
            const stoppedLevel = nearCapture.length > 0
                ? nearCapture.reduce((s, d) => s + d.coverage, 0) / nearCapture.length
                : slice[slice.length - 1].coverage;

            // 裂谷切分：取落差的 30% 處作為門檻
            const derived = stoppedLevel + (spinningPeak - stoppedLevel) * 0.3;
            derivedCoverages.push(derived);

            // 收集轉動期的 ratio（用於 vLineThreshold 推導）
            // 暫用 spinningPeak * 0.5 作為粗略判斷「正在轉動」的標準
            const spinThreshold = spinningPeak * 0.5;
            slice.forEach(d => {
                if (d.coverage > spinThreshold) {
                    allSpinningRatios.push(d.ratio);
                }
            });
        });

        if (derivedCoverages.length === 0) {
            setTemplateMessage("⚠️ 無法找到對應影片時間的軌跡紀錄（需至少 3 幀數據）");
            return;
        }

        // === motionCoverageMin：取中位數（抗極端值）===
        derivedCoverages.sort((a, b) => a - b);
        const mid = Math.floor(derivedCoverages.length / 2);
        const medianCoverage = derivedCoverages.length % 2 === 0
            ? (derivedCoverages[mid - 1] + derivedCoverages[mid]) / 2
            : derivedCoverages[mid];
        const proposedCoverage = Math.max(5, Math.min(90, Math.round(medianCoverage)));

        // === vLineThreshold：取 P95 × 1.3 安全係數 ===
        let proposedVLine = 0.25; // 預設
        if (allSpinningRatios.length > 5) {
            allSpinningRatios.sort((a, b) => a - b);
            const p95Idx = Math.floor(allSpinningRatios.length * 0.95);
            const p95Ratio = allSpinningRatios[p95Idx];
            proposedVLine = Math.max(0.05, Math.min(1.0, Number((p95Ratio * 1.3).toFixed(2))));
        }

        // 應用參數（只動域值，不碰 sensitivity 和 motionDelay）
        setMotionCoverageMin(proposedCoverage);
        setVLineThreshold(proposedVLine);

        setTemplateMessage(
            `🧪 推導完成 (${validCaptures} 張有效)｜` +
            `Coverage門檻: ${proposedCoverage}%｜` +
            `VLine門檻: ${proposedVLine}`
        );

    }, [capturedImages, setTemplateMessage]);

    return {
        videoSrc, videoRef, handleVideoUpload,
        isAutoDetecting, setIsAutoDetecting,
        sensitivity, setSensitivity,
        motionDelay, setMotionDelay,
        capturedImages, removeCapturedImage, clearAllCaptures,
        reelROI, setReelROI,
        winROI, setWinROI,
        balanceROI, setBalanceROI,
        betROI, setBetROI,
        captureCurrentFrame,
        debugData,
        runCalibration
    };
}
