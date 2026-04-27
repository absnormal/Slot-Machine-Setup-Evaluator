import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useNativeCapture — 本地螢幕擷取 Hook
 *
 * 透過 WebSocket 連線到本地 Python 後端 (screen-capture-server)，
 * 接收 JPEG 幀並繪製到指定的 Canvas 上。
 * 完全繞過 Chrome 的 getDisplayMedia API，不受瀏覽器安全政策限制。
 *
 * @param {React.RefObject} videoRef - 與現有系統共用的 video ref（本模式下改用內部 canvas）
 */
export function useNativeCapture(videoRef) {
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [monitors, setMonitors] = useState([]);
    const [error, setError] = useState(null);
    const [frameCount, setFrameCount] = useState(0);

    // 內部 canvas 用於繪製收到的幀（模擬 video 元素的行為）
    const nativeCanvasRef = useRef(null);
    // 暫存最新一幀的 Image 物件，供 processFrame 讀取
    const latestImageRef = useRef(null);
    // 記錄畫面尺寸
    const dimensionsRef = useRef({ width: 0, height: 0 });

    /**
     * 查詢可用螢幕列表
     */
    const fetchMonitors = useCallback(async () => {
        setError(null);
        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket('ws://localhost:8765');
                ws.onopen = () => {
                    ws.send(JSON.stringify({ action: 'list_monitors' }));
                };
                ws.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'monitors') {
                        setMonitors(msg.data);
                        ws.close();
                        resolve(msg.data);
                    }
                };
                ws.onerror = () => {
                    const err = '無法連線到擷取伺服器 (ws://localhost:8765)。請先啟動 screen-capture-server/start.bat';
                    setError(err);
                    reject(new Error(err));
                };
                ws.onclose = () => {};
            } catch (e) {
                setError(e.message);
                reject(e);
            }
        });
    }, []);

    /**
     * 開始串流
     * @param {object} source - 來源物件 (type, index, hwnd)
     * @param {number} fps - 目標幀率 (預設 15)
     * @param {number} quality - JPEG 品質 (預設 60)
     */
    const startCapture = useCallback((source, fps = 15, quality = 60) => {
        setError(null);
        setFrameCount(0);

        const ws = new WebSocket('ws://localhost:8765');
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({
                action: 'start',
                source: source,
                fps,
                quality
            }));
            setIsConnected(true);
        };

        ws.binaryType = 'blob';
        ws.onmessage = (event) => {
            if (event.data instanceof Blob) {
                setFrameCount(prev => prev + 1);

                // 建立 Image 物件並繪製到 canvas (直接使用 Blob URL 避免 Base64 轉換)
                const img = new window.Image();
                const url = URL.createObjectURL(event.data);
                img.onload = () => {
                    latestImageRef.current = img;

                    // 確保 canvas 存在
                    if (!nativeCanvasRef.current) {
                        nativeCanvasRef.current = document.createElement('canvas');
                        
                        // 建立 canvas 串流並交給 video 元素顯示 (60 FPS)
                        if (videoRef?.current) {
                            const stream = nativeCanvasRef.current.captureStream(60);
                            videoRef.current.srcObject = stream;
                            videoRef.current.play().catch(() => {});
                        }
                    }
                    const canvas = nativeCanvasRef.current;
                    if (canvas.width !== img.width || canvas.height !== img.height) {
                        canvas.width = img.width;
                        canvas.height = img.height;
                    }
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // 同步更新 videoRef 的尺寸屬性（讓 processFrame 能讀取）
                    if (videoRef?.current) {
                        videoRef.current.__nativeCanvas = canvas;
                        videoRef.current.__nativeWidth = img.width;
                        videoRef.current.__nativeHeight = img.height;
                    }
                    
                    URL.revokeObjectURL(url); // 釋放記憶體
                };
                img.src = url;

            } else {
                const msg = JSON.parse(event.data);
                if (msg.type === 'error') {
                    setError(msg.message);
                }
            }
        };

        ws.onerror = () => {
            setError('WebSocket 連線錯誤，請確認伺服器是否正在運行');
            setIsConnected(false);
        };

        ws.onclose = () => {
            setIsConnected(false);
        };
    }, [videoRef]);

    /**
     * 停止串流
     */
    const stopCapture = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try {
                wsRef.current.send(JSON.stringify({ action: 'stop' }));
            } catch { /* ignore */ }
            wsRef.current.close();
        }
        wsRef.current = null;
        nativeCanvasRef.current = null;
        setIsConnected(false);
        setFrameCount(0);

        // 清理 videoRef 上的自訂屬性
        if (videoRef?.current) {
            delete videoRef.current.__nativeCanvas;
            delete videoRef.current.__nativeWidth;
            delete videoRef.current.__nativeHeight;
        }
    }, [videoRef]);

    // 元件卸載時自動清理
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                try { wsRef.current.close(); } catch { /* ignore */ }
            }
        };
    }, []);

    return {
        // 狀態
        isConnected,
        monitors,
        error,
        frameCount,
        nativeCanvasRef,
        dimensionsRef,
        // 操作
        fetchMonitors,
        startCapture,
        stopCapture,
    };
}
