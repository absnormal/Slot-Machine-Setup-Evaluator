import { useState, useRef, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

/**
 * Phase 4 影片處理核心：ULTRA REWRITE (極致穩定版)
 * 核心特色：影像 2x 縮放、雙重計時器穩定邏輯、PSM 7 模式。
 */
export function useVideoProcessor({ setTemplateMessage }) {
    // --- 狀態管理 (UI 連動) ---
    const [videoSrc, setVideoSrc] = useState(null);
    const [isAutoDetecting, setIsAutoDetecting] = useState(false);
    const [sensitivity, setSensitivity] = useState(15);
    const [capturedImages, setCapturedImages] = useState([]);
    const [reelROI, setReelROI] = useState({ x: 15, y: 15, w: 70, h: 55 });
    const [winROI, setWinROI] = useState({ x: 30, y: 75, w: 40, h: 10 });
    const [debugData, setDebugData] = useState({ diff: 0, density: 0, status: 'idle', ocrText: '', isGhost: false });

    // --- 核心引用 (控制流) ---
    const videoRef = useRef(null);
    const lastFrameRef = useRef(null);
    const isProcessingRef = useRef(false);
    const lastProcessedVideoTimeRef = useRef(-1);
    
    // --- 穩定性計時器與狀態 ---
    const lastCapturedValueRef = useRef(0);      // 上次成功擷取的數值
    const currentWatchingValueRef = useRef(0);   // 目前正在觀察的變動數值
    const watchStartTimeRef = useRef(0);          // 數值開始穩定的時間
    const unlockStartTimeRef = useRef(0);         // 開始偵測到 0 的時間 (解鎖計時)
    const isLockedRef = useRef(false);            // 擷取鎖定狀態

    // --- OCR Worker ---
    const workerRef = useRef(null);
    const isWorkerReady = useRef(false);
    const isOcrBusy = useRef(false);

    // 持久化 Canvas (效能優化)
    const scanCanvasRef = useRef(null);
    const captureCanvasRef = useRef(null);

    // 初始化 OCR
    useEffect(() => {
        let worker;
        const initOCR = async () => {
            try {
                worker = await createWorker('eng');
                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789,.- ',
                    tessedit_pageseg_mode: '7', 
                });
                workerRef.current = worker;
                isWorkerReady.current = true;
                setDebugData(p => ({ ...p, status: 'OCR Ready' }));
            } catch (err) { console.error("OCR Init Error:", err); }
        };
        initOCR();
        return () => { if (worker) worker.terminate(); };
    }, []);

    // 影片上傳
    const handleVideoUpload = useCallback((e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (videoSrc) URL.revokeObjectURL(videoSrc);
        setVideoSrc(URL.createObjectURL(file));
        setCapturedImages([]);
        lastFrameRef.current = null;
        lastProcessedVideoTimeRef.current = -1;
        setIsAutoDetecting(false); // 根據使用者要求，預設關閉
        if (setTemplateMessage) setTemplateMessage("📽️ 影片已就緒。");
    }, [videoSrc, setTemplateMessage]);

    // 捕捉影格
    const captureFrameAsObject = useCallback((roi = null) => {
        return new Promise((resolve) => {
            const video = videoRef.current;
            if (!video) return resolve(null);
            
            if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement('canvas');
            const canvas = captureCanvasRef.current;
            const targetROI = roi || { x: 0, y: 0, w: 100, h: 100 };
            
            const realX = (targetROI.x / 100) * video.videoWidth;
            const realY = (targetROI.y / 100) * video.videoHeight;
            const realW = (targetROI.w / 100) * video.videoWidth;
            const realH = (targetROI.h / 100) * video.videoHeight;

            canvas.width = realW;
            canvas.height = realH;
            const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
            ctx.drawImage(video, realX, realY, realW, realH, 0, 0, realW, realH);

            const timestamp = video.currentTime.toFixed(2);
            canvas.toBlob((blob) => {
                if (!blob) return resolve(null);
                resolve({
                    id: Math.random().toString(36).substring(7),
                    previewUrl: URL.createObjectURL(blob),
                    timestamp,
                    blob,
                    file: { name: `capture_${timestamp}s.jpg` }
                });
            }, 'image/jpeg', 0.95);
        });
    }, []);

    // --- 核心偵測步驟 ---
    const runDetectionStep = useCallback(async (video) => {
        if (!video || !isWorkerReady.current) return { captureResult: null };

        const { x, y, w, h } = winROI;
        const sampleX = (x / 100) * video.videoWidth;
        const sampleY = (y / 100) * video.videoHeight;
        const sampleW = (w / 100) * video.videoWidth;
        const sampleH = (h / 100) * video.videoHeight;

        if (!scanCanvasRef.current) scanCanvasRef.current = document.createElement('canvas');
        const canvas = scanCanvasRef.current;
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        ctx.drawImage(video, sampleX, sampleY, sampleW, sampleH, 0, 0, sampleW, sampleH);

        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        const data = imgData.data;
        let whitePixelCount = 0;
        const binarizedData = new Uint8Array(sampleW * sampleH);

        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            const val = avg > (255 - sensitivity * 5) ? 255 : 0;
            if (val === 255) whitePixelCount++;
            binarizedData[i/4] = val;
            data[i] = data[i+1] = data[i+2] = val;
        }
        ctx.putImageData(imgData, 0, 0);

        const currentDensity = (whitePixelCount / (sampleW * sampleH)) * 100;
        let normalizedDiff = 0;
        if (lastFrameRef.current) {
            let diffCount = 0;
            for (let i = 0; i < binarizedData.length; i++) {
                if (binarizedData[i] !== lastFrameRef.current[i]) diffCount++;
            }
            normalizedDiff = (diffCount / (sampleW * sampleH)) * 100;
        }
        lastFrameRef.current = binarizedData;

        // OCR 邏輯
        if (!isOcrBusy.current && currentDensity > 0.5 && normalizedDiff > 0.01) {
            isOcrBusy.current = true;
            
            // --- OCR 影像預處理強化：確保影像不會過小 (防止 Tesseract 崩潰) ---
            const scale = 2; // 基本放大
            const minSize = 40; // Tesseract 要求的最小基本高度/寬度穩定區
            
            const targetW = Math.max(sampleW * scale, minSize);
            const targetH = Math.max(sampleH * scale, minSize);
            
            const ocrCanvas = document.createElement('canvas');
            ocrCanvas.width = targetW;
            ocrCanvas.height = targetH;
            const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
            
            // 填滿黑色背景 (因為二值化後背景是黑的)
            ocrCtx.fillStyle = 'black';
            ocrCtx.fillRect(0, 0, targetW, targetH);
            
            // 居中繪製原始二值化影像 (放大版)
            const drawX = (targetW - (sampleW * scale)) / 2;
            const drawY = (targetH - (sampleH * scale)) / 2;
            
            ocrCtx.imageSmoothingEnabled = false;
            ocrCtx.drawImage(canvas, 0, 0, sampleW, sampleH, drawX, drawY, sampleW * scale, sampleH * scale);

            try {
                const { data: { text } } = await workerRef.current.recognize(ocrCanvas);
                const cleanedText = text.replace(/[^0-9.]/g, '');
                const val = parseFloat(cleanedText) || 0;
                const now = video.currentTime;

                setDebugData(p => ({ ...p, ocrText: cleanedText, diff: normalizedDiff.toFixed(2), density: currentDensity.toFixed(2) }));

                // --- 雙態穩定機 ---
                if (val > 0) {
                    unlockStartTimeRef.current = 0; // 重置解鎖計時
                    
                    if (isLockedRef.current) {
                        // 如果數值變了，且不同於上次擷取值，則準備解鎖
                        if (Math.abs(val - lastCapturedValueRef.current) > 0.01) {
                            // 這裡可以處理連發中獎，但為了嚴謹，我們先要求 0.5s 空窗
                        }
                    } else {
                        // 追蹤新數值
                        if (Math.abs(val - currentWatchingValueRef.current) > 0.01) {
                            currentWatchingValueRef.current = val;
                            watchStartTimeRef.current = now;
                        } else if (now - watchStartTimeRef.current >= 0.5) {
                            // 穩定超過 0.5s -> 擷取！ (改為全螢幕擷取以相容 Phase 3)
                            const captureResult = await captureFrameAsObject(); 
                            lastCapturedValueRef.current = val;
                            isLockedRef.current = true;
                            isOcrBusy.current = false;
                            return { captureResult, diff: normalizedDiff };
                        }
                    }
                } else {
                    // 偵測到 0：啟動解鎖計時
                    if (unlockStartTimeRef.current === 0) unlockStartTimeRef.current = now;
                    else if (now - unlockStartTimeRef.current >= 0.5) {
                        isLockedRef.current = false;
                        lastCapturedValueRef.current = 0;
                        currentWatchingValueRef.current = 0;
                    }
                }
            } catch (err) { console.error("OCR Error:", err); }
            finally { isOcrBusy.current = false; }
        }

        return { captureResult: null, diff: normalizedDiff };
    }, [winROI, sensitivity, reelROI, captureFrameAsObject]);

    // 排程偵測
    const processFrame = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !isAutoDetecting || isProcessingRef.current) return;
        
        const now = video.currentTime;
        if (!video.paused && Math.abs(now - lastProcessedVideoTimeRef.current) < 0.1) return;
        lastProcessedVideoTimeRef.current = now;

        isProcessingRef.current = true;
        const { captureResult } = await runDetectionStep(video);
        if (captureResult) {
            setCapturedImages(prev => [...prev, captureResult]);
            if (setTemplateMessage) setTemplateMessage(`📸 自動捕捉 (${captureResult.timestamp}s)`);
        }
        isProcessingRef.current = false;
    }, [isAutoDetecting, runDetectionStep, setTemplateMessage]);

    useEffect(() => {
        let rafId;
        const loop = () => {
            if (isAutoDetecting) processFrame();
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        const v = videoRef.current;
        const onSeek = () => { if (isAutoDetecting) processFrame(); };
        if (v) v.addEventListener('seeked', onSeek);
        return () => {
            cancelAnimationFrame(rafId);
            if (v) v.removeEventListener('seeked', onSeek);
        };
    }, [isAutoDetecting, processFrame]);

    return {
        videoSrc, videoRef, handleVideoUpload,
        isAutoDetecting, setIsAutoDetecting,
        sensitivity, setSensitivity,
        capturedImages, setCapturedImages,
        removeCapturedImage: (id) => setCapturedImages(prev => prev.filter(img => img.id !== id)),
        clearAllCaptures: () => setCapturedImages([]),
        reelROI, setReelROI, winROI, setWinROI,
        captureCurrentFrame: async () => {
            const res = await captureFrameAsObject(); // 手動擷取也改為全螢幕
            if (res) setCapturedImages(p => [...p, res]);
        },
        debugData
    };
}
