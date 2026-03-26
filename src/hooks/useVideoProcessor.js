import { useState, useRef, useCallback, useEffect } from 'react';

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
    const [motionDelay, setMotionDelay] = useState(1000); // 穩定判定時間 (ms)，調升至 1000ms 確保所有盤面完全靜止
    
    const [capturedImages, setCapturedImages] = useState([]);
    const [reelROI, setReelROI] = useState(() => {
        const saved = localStorage.getItem('slot_phase4_roi');
        try {
            return saved ? JSON.parse(saved) : { x: 15, y: 15, w: 70, h: 55 };
        } catch (e) {
            return { x: 15, y: 15, w: 70, h: 55 };
        }
    });

    // 當切換為「開始偵測」時，才進行 ROI 持久化 (減少頻繁寫入快取的資源消耗)
    useEffect(() => {
        if (isAutoDetecting && reelROI) {
            localStorage.setItem('slot_phase4_roi', JSON.stringify(reelROI));
        }
    }, [isAutoDetecting]); 
    
    // 除錯資料
    const [debugData, setDebugData] = useState({ 
        diff: 0, 
        coverage: 0, 
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

    // 擷取目前畫面
    const captureCurrentFrame = useCallback(() => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        const previewUrl = canvas.toDataURL('image/jpeg', 0.8);
        const newImg = {
            id: Date.now(),
            file: { name: `Auto-Capture-${video.currentTime.toFixed(1)}s` },
            previewUrl,
            timestamp: video.currentTime.toFixed(2)
        };
        
        setCapturedImages(prev => [newImg, ...prev]);
        return newImg;
    }, []);

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

            // 3. 轉為灰階 (不再進行二值化，直接保留灰階值以提升比對精度)
            const grayscale = new Uint8Array(targetW * targetH);
            for (let i = 0; i < data.length; i += 4) {
                grayscale[i/4] = (data[i] + data[i+1] + data[i+2]) / 3;
            }

            // 4. 格點位移比對
            if (lastFrameRef.current && lastFrameRef.current.length === binarized.length) {
                const cellW = Math.floor(targetW / cols);
                const cellH = Math.floor(targetH / rows);
                let motionCells = 0;
                let totalDiff = 0;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        let cellDiff = 0;
                        const startX = c * cellW;
                        const startY = r * cellH;

                        // 採樣比對：使用灰階亮度差 (閾值 10) 判定像素級位移
                        for (let y = startY; y < startY + cellH; y += 4) {
                            for (let x = startX; x < startX + cellW; x += 4) {
                                const idx = y * targetW + x;
                                if (Math.abs(grayscale[idx] - lastFrameRef.current[idx]) > 10) {
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
                const now = Date.now();

                // 5. 狀態機邏輯
                let nextStatus = spinStateRef.current;

                if (spinStateRef.current === 'IDLE') {
                    if (coverage > motionCoverageMin && avgDiff > sensitivity) {
                        nextStatus = 'SPINNING';
                        stateStartTimeRef.current = now;
                    }
                } 
                else if (spinStateRef.current === 'SPINNING') {
                    if (coverage < 10) { // 門檻降至 10%，確保最後一輪也接近停止
                        nextStatus = 'STABILIZING';
                        stateStartTimeRef.current = now;
                    }
                }
                else if (spinStateRef.current === 'STABILIZING') {
                    if (coverage > 15) { // 如果位移回升 (如最後一輪又動了或是中獎動畫開始)，回到 SPINNING 重新計時
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
    }, [isAutoDetecting, reelROI, template, sensitivity, motionCoverageMin, motionDelay, captureCurrentFrame, setTemplateMessage]);

    useEffect(() => {
        if (isAutoDetecting) {
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
        capturedImages, removeCapturedImage, clearAllCaptures,
        reelROI, setReelROI,
        captureCurrentFrame,
        debugData
    };
}
