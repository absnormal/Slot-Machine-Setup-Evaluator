import { useState, useRef, useCallback, useEffect } from 'react';
import { useNativeCapture } from './useNativeCapture';

export function useVideoSource({ showToast }) {
    const videoRef = useRef(null);
    const [videoSrc, setVideoSrc] = useState(null);
    const [isStreamMode, setIsStreamMode] = useState(false);
    const [isNativeMode, setIsNativeMode] = useState(false);

    // 視窗與螢幕選擇 Modal 狀態
    const [showNativeSourceModal, setShowNativeSourceModal] = useState(false);
    const [nativeSources, setNativeSources] = useState([]);

    // --- 本地擷取 (Python 後端) ---
    const nativeCapture = useNativeCapture(videoRef);
    const handleVideoUpload = useCallback((e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        // 如果目前是串流模式，先清掉串流
        if (isStreamMode) {
            const stream = videoRef.current?.srcObject;
            if (stream) stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
            setIsStreamMode(false);
        }
        if (videoSrc && videoSrc !== '__stream__') URL.revokeObjectURL(videoSrc);
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        showToast(`📽️ 已載入影片：${file.name}`);
        setTimeout(() => showToast(''), 3000);
    }, [videoSrc, isStreamMode, showToast]);

    const pendingStreamRef = useRef(null);
    const handleStopScreenCapture = useCallback((isTrackEnded = false) => {
        const stream = videoRef.current?.srcObject;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        pendingStreamRef.current = null;
        setVideoSrc(null);
        setIsStreamMode(false);
        if (isTrackEnded) {
            showToast('⚠️ 串流被中斷！選擇「整個螢幕」而非單一視窗，可避免原生遊戲視窗擷取不穩定的問題');
            setTimeout(() => showToast(''), 8000);
        } else {
            showToast('🖥️ 螢幕擷取已結束');
            setTimeout(() => showToast(''), 3000);
        }
    }, [showToast]);

    const handleStartScreenCapture = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 30 } },
                audio: false
            });
            const track = stream.getVideoTracks()[0];
            // 使用者按瀏覽器原生「停止分享」或 Chrome 終止視窗擷取時自動清理
            track.onended = () => {
                handleStopScreenCapture(true);
            };
            // 如果目前有影片，先清掉
            if (videoSrc && videoSrc !== '__stream__') URL.revokeObjectURL(videoSrc);
            // 先暫存 stream，等 React 渲染出 <video> 後再用 useEffect 附加
            pendingStreamRef.current = stream;
            setVideoSrc('__stream__');
            setIsStreamMode(true);
            showToast('🖥️ 螢幕擷取已開始');
            setTimeout(() => showToast(''), 3000);
        } catch (err) {
            console.log('螢幕擷取已取消', err);
        }
    }, [videoSrc, showToast, handleStopScreenCapture]);

    // 當 isStreamMode 切為 true 且 video 元素已掛載，附加 srcObject
    useEffect(() => {
        if (isStreamMode && pendingStreamRef.current && videoRef.current) {
            const video = videoRef.current;
            video.srcObject = pendingStreamRef.current;
            // 等待影片元數據就緒後再播放（應用程式視窗需要額外時間協商解析度）
            const onMeta = () => {
                video.play().catch(() => { });
                video.removeEventListener('loadedmetadata', onMeta);
            };
            if (video.readyState >= 1) {
                // 已經有 metadata（例如瀏覽器分頁），直接播放
                video.play().catch(() => { });
            } else {
                video.addEventListener('loadedmetadata', onMeta);
            }
            pendingStreamRef.current = null;
        }
    }, [isStreamMode]);

    // --- 本地擷取啟停 ---
    const handleStartNativeCapture = useCallback(async () => {
        try {
            // 如果目前有其他來源，先清掉
            if (isStreamMode) handleStopScreenCapture();
            if (videoSrc && videoSrc !== '__stream__' && videoSrc !== '__native__') URL.revokeObjectURL(videoSrc);

            const sources = await nativeCapture.fetchMonitors();
            if (!sources || sources.length === 0) {
                showToast('⚠️ 未偵測到螢幕或視窗');
                return;
            }
            setNativeSources(sources);
            setShowNativeSourceModal(true);
        } catch (err) {
            showToast(`⚠️ ${err.message}`);
            setTimeout(() => showToast(''), 8000);
        }
    }, [videoSrc, isStreamMode, handleStopScreenCapture, nativeCapture, showToast]);

    const handleSelectNativeSource = useCallback((source) => {
        setShowNativeSourceModal(false);
        try {
            nativeCapture.startCapture(source, 60, 60);
            setVideoSrc('__native__');
            setIsNativeMode(true);
            setIsStreamMode(true);
            showToast(`🖥️ 本地擷取已啟動 (${source.label})`);
            setTimeout(() => showToast(''), 3000);
        } catch (err) {
            showToast(`⚠️ ${err.message}`);
            setTimeout(() => showToast(''), 8000);
        }
    }, [nativeCapture, showToast]);

    const handleStopNativeCapture = useCallback(() => {
        nativeCapture.stopCapture();
        setVideoSrc(null);
        setIsStreamMode(false);
        setIsNativeMode(false);
        showToast('🖥️ 本地擷取已結束');
        setTimeout(() => showToast(''), 3000);
    }, [nativeCapture, showToast]);

    return {
        videoRef, videoSrc, setVideoSrc,
        isStreamMode, isNativeMode,
        showNativeSourceModal, setShowNativeSourceModal, nativeSources,
        nativeCapture,
        handleVideoUpload, handleStartScreenCapture, handleStopScreenCapture,
        handleStartNativeCapture, handleSelectNativeSource, handleStopNativeCapture
    };
}
