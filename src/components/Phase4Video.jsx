import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, Scan, Play, Pause, Trash2, Send, Sparkles, ChevronDown, ChevronUp, X, Clock, Download, BarChart3, ImageIcon, RefreshCw, Square, Camera, Link2, AlertCircle, Star, Monitor, StopCircle, FolderOpen, CheckCircle2 } from 'lucide-react';
import CandidateCard from './phase4/CandidateCard';
import ActionPanel from './phase4/ActionPanel';
import DiagnosticDashboard from './phase4/DiagnosticDashboard';
import usePhase4Store from '../stores/usePhase4Store';
const Phase4Video = ({
    isPhase4Minimized,
    onToggle,
    // Keyframe Extractor
    candidates,
    startLiveDetection, stopLiveDetection,
    removeCandidate, clearCandidates, addManualCandidate, smartDedup, confirmDedup, healBreaks, setManualBestCandidate,
    updateCandidateOcr, updateCandidate,
    // Auto Recognition
    isRecognizing, isStopping, recognitionProgress,
    recognizeBatch, recognizeLocalBatch, cancelRecognition,
    // Report
    stats, exportHTMLReport,
    // Video
    videoSrc, videoRef, handleVideoUpload,
    isStreamMode, handleStartScreenCapture, handleStopScreenCapture,
    onTransferToPhase3,
    onImportSession,
    setTemplateMessage,
    template,
    gameName,
    gridRows: propGridRows, gridCols: propGridCols,
}) => {
    // ── 從 Zustand Store 取得 ROI 與偵測參數 ──
    const reelROI = usePhase4Store(s => s.reelROI);
    const setReelROI = usePhase4Store(s => s.setReelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const setWinROI = usePhase4Store(s => s.setWinROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const setBalanceROI = usePhase4Store(s => s.setBalanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const setBetROI = usePhase4Store(s => s.setBetROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const setOrderIdROI = usePhase4Store(s => s.setOrderIdROI);
    const ocrDecimalPlaces = usePhase4Store(s => s.ocrDecimalPlaces);
    const enableBidirectional = usePhase4Store(s => s.enableBidirectional);
    const setEnableBidirectional = usePhase4Store(s => s.setEnableBidirectional);
    // ── 本地狀態 ──
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [roiMode, setRoiMode] = useState('reel');
    const [dragState, setDragState] = useState(null);
    const [isLiveActive, setIsLiveActive] = useState(false);
    const containerRef = useRef(null);
    const listEndRef = useRef(null);
    const [lastAddedManualId, setLastAddedManualId] = useState(null);
    const [previewImage, setPreviewImage] = useState(null); // { url, url2?, time, time2? }
    const [enableOrderId, setEnableOrderId] = useState(true); // 是否啟用注單號 OCR
    const [editingOcr, setEditingOcr] = useState(null); // { id: string, field: 'win'|'bet'|'balance', value: string }
    const [fgType, setFgType] = useState('A'); // 'A' = 贏分延續型, 'B' = 贏分歸零型, 'none' = 無FG
    const [useWinFrame, setUseWinFrame] = useState(true); // true = 用 WIN 截圖辨識, false = 用停輪截圖辨識

    // ── 卡片點擊：影片模式=跳轉時間點，串流模式/無影片=開圖片預覽 ──
    const handleCardClick = useCallback((kf) => {
        if (isStreamMode || !videoSrc) {
            // 串流模式或無影片來源時：開全幀截圖預覽
            const reelUrl = kf.canvas ? kf.canvas.toDataURL('image/jpeg', 0.9) : kf.thumbUrl;
            const winUrl = kf.winPollCanvas ? kf.winPollCanvas.toDataURL('image/jpeg', 0.9) : (kf.winPollThumbUrl || null);
            setPreviewImage({
                url: reelUrl,
                url2: winUrl,
                time: kf.reelStopTime || kf.time,
                time2: kf.winPollTime || null
            });
        } else {
            // 影片模式：根據當前顯示的截圖類型跳到對應時間點
            if (videoRef.current) {
                const showingWin = kf.useWinFrame !== false;
                videoRef.current.currentTime = (showingWin && kf.winPollTime) ? kf.winPollTime : kf.time;
            }
        }
    }, [isStreamMode, videoSrc, videoRef]);

    // ── 串流計時器 ──
    const [streamElapsed, setStreamElapsed] = useState(0);
    const streamTimerRef = useRef(null);
    useEffect(() => {
        if (isStreamMode) {
            setStreamElapsed(0);
            streamTimerRef.current = setInterval(() => setStreamElapsed(prev => prev + 1), 1000);
        } else {
            if (streamTimerRef.current) clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
        }
        return () => { if (streamTimerRef.current) clearInterval(streamTimerRef.current); };
    }, [isStreamMode]);

    // ── 截圖存檔狀態 (自動存入磁碟) ──
    const [rootSaveDirHandle, setRootSaveDirHandle] = useState(null);
    const [saveDirHandle, setSaveDirHandle] = useState(null);
    const [saveCount, setSaveCount] = useState(0);
    const [saveFormat, setSaveFormat] = useState('jpeg'); // 'jpeg' | 'png'
    const savedIdsRef = useRef(new Set());

    const handlePickSaveDir = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setRootSaveDirHandle(handle);
            setSaveDirHandle(null); // 換了 root 就清除原本的 saveDir
            setSaveCount(0);
            savedIdsRef.current.clear();
        } catch (e) {
            console.log("使用者取消選取目錄", e);
        }
    };

    // 自動存檔 useEffect
    useEffect(() => {
        if (!saveDirHandle) return;
        candidates.forEach(async (kf) => {
            // ── 存盤面截圖 ──
            if (!savedIdsRef.current.has(kf.id) && kf.canvas) {
                savedIdsRef.current.add(kf.id);
                try {
                    const mimeType = saveFormat === 'png' ? 'image/png' : 'image/jpeg';
                    const ext = saveFormat === 'png' ? 'png' : 'jpg';
                    const blob = await new Promise(r => kf.canvas.toBlob(r, mimeType, 0.92));
                    const prefix = kf.id.startsWith('win-') ? 'win_' : 'spin_';
                    const fileName = `${prefix}${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    kf.canvas = null; // 釋放記憶體
                    setSaveCount(prev => prev + 1);
                } catch (e) {
                    console.error('自動存檔失敗:', e);
                }
            }
            // ── 存 WIN 特工截圖 ──
            const wpKey = `wp_${kf.id}`;
            if (!savedIdsRef.current.has(wpKey) && kf.winPollCanvas) {
                savedIdsRef.current.add(wpKey);
                try {
                    const mimeType = saveFormat === 'png' ? 'image/png' : 'image/jpeg';
                    const ext = saveFormat === 'png' ? 'png' : 'jpg';
                    const blob = await new Promise(r => kf.winPollCanvas.toBlob(r, mimeType, 0.92));
                    const fileName = `winpoll_${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    // 不釋放 winPollCanvas，報表匯出時還需要
                    setSaveCount(prev => prev + 1);
                } catch (e) {
                    console.error('WIN 特工截圖存檔失敗:', e);
                }
            }
        });
    }, [candidates, saveDirHandle, saveFormat]);

    // ── 卡片渲染已抽離至 CandidateCard 元件 ──

    // ── 影片事件 ──
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
        const onDuration = () => setDuration(video.duration);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => { setIsPlaying(false); setIsLiveActive(false); stopLiveDetection(); };

        video.addEventListener('timeupdate', onTime);
        video.addEventListener('loadedmetadata', onDuration);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('ended', onEnded);
        return () => {
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('loadedmetadata', onDuration);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('ended', onEnded);
        };
    }, [videoSrc, videoRef]);

    // ── 新卡片滾動邏輯 ──
    const prevLengthRef = useRef(candidates.length);
    useEffect(() => {
        // 只有當陣列長度增加（有新卡片加入）時才執行
        if (candidates.length > prevLengthRef.current) {
            if (lastAddedManualId) {
                // 情境 1：手動截圖。滾動到指定卡片，不要滾到底部
                setTimeout(() => {
                    const el = document.getElementById(`kf-card-${lastAddedManualId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'auto', block: 'center' });
                        el.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2', 'transition-all', 'duration-500');
                        setTimeout(() => el.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2'), 1500);
                    }
                    setLastAddedManualId(null);
                }, 100);
            } else if (isLiveActive && listEndRef.current) {
                // 情境 2：即時偵測。自動追加到底部，視角平滑跟蹤到底部
                listEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
        }
        prevLengthRef.current = candidates.length;
    }, [candidates.length, isLiveActive, lastAddedManualId]);

    // ── 播放控制 ──
    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
    };
    const handleSeek = (e) => {
        const t = parseFloat(e.target.value);
        if (videoRef.current) videoRef.current.currentTime = t;
        setCurrentTime(t);
    };
    const formatTime = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

    // ── ROI 拖曳 (從舊 Phase 4 搬來) ──
    const getMousePos = (e) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
    };

    const handleMouseDown = (e) => {
        const pos = getMousePos(e);
        const handleSize = 5;
        let targetROI, setTargetROI;
        if (roiMode === 'win') { targetROI = winROI; setTargetROI = setWinROI; }
        else if (roiMode === 'balance') { targetROI = balanceROI; setTargetROI = setBalanceROI; }
        else if (roiMode === 'bet') { targetROI = betROI; setTargetROI = setBetROI; }
        else if (roiMode === 'orderId') { targetROI = orderIdROI; setTargetROI = setOrderIdROI; }
        else { targetROI = reelROI; setTargetROI = setReelROI; }

        const isOverHandle = pos.x >= targetROI.x + targetROI.w - handleSize && pos.x <= targetROI.x + targetROI.w &&
            pos.y >= targetROI.y + targetROI.h - handleSize && pos.y <= targetROI.y + targetROI.h;

        setDragState({
            action: isOverHandle ? 'resize' : 'move',
            startX: pos.x, startY: pos.y,
            initObj: { ...targetROI }, setter: setTargetROI
        });
    };

    const handleMouseMove = (e) => {
        if (!dragState) return;
        const pos = getMousePos(e);
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;
        if (dragState.action === 'move') {
            dragState.setter({
                ...dragState.initObj,
                x: Math.max(0, Math.min(100 - dragState.initObj.w, dragState.initObj.x + dx)),
                y: Math.max(0, Math.min(100 - dragState.initObj.h, dragState.initObj.y + dy))
            });
        } else {
            dragState.setter({
                ...dragState.initObj,
                w: Math.max(0.5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dx)),
                h: Math.max(0.5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dy))
            });
        }
    };

    const handleMouseUp = () => setDragState(null);

    // ── 格線繪製 ──
    const renderGridLines = () => {
        const rows = template?.rows || propGridRows || 3;
        const cols = template?.cols || propGridCols || 5;
        const lines = [];
        for (let i = 1; i < cols; i++) {
            lines.push(<div key={`v-${i}`} className="absolute h-full border-r-2 border-amber-400/60" style={{ left: `${(i / cols) * 100}%` }} />);
        }
        for (let i = 1; i < rows; i++) {
            lines.push(<div key={`h-${i}`} className="absolute w-full border-b-2 border-amber-400/60" style={{ top: `${(i / rows) * 100}%` }} />);
        }
        return lines;
    };

    // ── 分局與連續性計算 ──
    const groupsWithMath = useMemo(() => {
        const hasSpinData = candidates.some(c => c.spinGroupId !== undefined);
        if (!hasSpinData) return null;

        const sortedCandidates = [...candidates].sort((a, b) => a.time - b.time);

        const blocksByGid = new Map();
        
        sortedCandidates.forEach((kf, idx) => {
            const gid = kf.spinGroupId !== undefined ? kf.spinGroupId : `ungrouped_${kf.id}`;
            if (!blocksByGid.has(gid)) {
                blocksByGid.set(gid, []);
            }
            blocksByGid.get(gid).push({ kf, idx });
        });

        const blocksArray = Array.from(blocksByGid.entries()).map(([gid, group]) => ({
            gid,
            group
        }));

        // 依據每個群組的【第一張卡片出現時間】進行排序，讓 UI 邏輯與時間線保持自然
        blocksArray.sort((a, b) => a.group[0].kf.time - b.group[0].kf.time);

        let currentBase = null;
        return blocksArray.map((block) => {
            const { gid, group } = block;
            const bestFrame = group.find(g => g.kf.isSpinBest)?.kf || group[0].kf;
            const parse = v => parseFloat(v) || 0;
            const bal = parse(bestFrame.ocrData?.balance);
            const win = parse(bestFrame.ocrData?.win);
            const bet = parse(bestFrame.ocrData?.bet);
            
            let mathValid = true;
            let mathState = 0; 
            let mathDiff = 0;
            let expectedBase = currentBase;

            const hasData = bestFrame.ocrData && typeof bestFrame.ocrData.balance !== 'undefined' && typeof bestFrame.ocrData.bet !== 'undefined';

            // 由底層 smartDedup 引擎的 isFGSequence 標記驅動，不再用 UI 層啟發式猜測
            const isFGSequence = group.some(c => c.kf?.isFGSequence);

            if (hasData && bet > 0) { 
                if (currentBase === null) {
                    mathState = win > 0 ? 2 : 1;
                    currentBase = bal + win; 
                } else if (isFGSequence) {
                    // FG 模式：不檢查 BAL+BET=上局結餘（因為不扣 BET），直接視為連續
                    mathState = 4; // FG 模式
                    mathValid = true;
                    currentBase = bal + win; // 追蹤 FG 結束後的結餘
                } else {
                    const eps = 0.5;
                    if (Math.abs(bal + bet - currentBase) < eps) {
                        mathState = win > 0 ? 2 : 1;
                        currentBase = bal + win;
                    } else if (Math.abs(bal + bet - win - currentBase) < eps) {
                        mathState = 3;
                        currentBase = bal;
                    } else {
                        mathValid = false;
                        mathDiff = (bal + bet) - currentBase;
                        currentBase = bal + win; 
                    }
                }
            }

            return { gid, group, mathValid, mathState, mathDiff, expectedBase, nextBase: currentBase, isFGSequence };
        });
    }, [candidates]);

    const brokenGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => !g.mathValid).map(g => parseInt(g.gid));
    }, [groupsWithMath]);

    const diagnosticStats = useMemo(() => {
        if (!groupsWithMath) return null;
        let total = groupsWithMath.length;
        let unbroken = groupsWithMath.filter(g => g.mathValid).length;
        let broken = groupsWithMath.filter(g => !g.mathValid).length;
        return { total, unbroken, broken };
    }, [groupsWithMath]);

    const wrongWinGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => {
            return g.group.some(c => {
                const kf = c.kf;
                const hasResult = kf.status === 'recognized' && kf.recognitionResult;
                if (!hasResult) return false;
                const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                const aiWin = Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0);
                return ocrWin !== aiWin;
            });
        }).map(g => g.gid);
    }, [groupsWithMath]);

    const nonZeroWinGroupIds = useMemo(() => {
        if (!groupsWithMath) return [];
        return groupsWithMath.filter(g => {
            return g.group.some(c => {
                const kf = c.kf;
                const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                const aiWin = (kf.status === 'recognized' && kf.recognitionResult) ? Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0) : 0;
                return Math.max(ocrWin, aiWin) > 0;
            });
        }).map(g => g.gid);
    }, [groupsWithMath]);

    const [lastBreakId, setLastBreakId] = useState(null);
    const currentBreakIndex = useMemo(() => {
        if (!lastBreakId || brokenGroupIds.length === 0) return 0;
        const idx = brokenGroupIds.indexOf(lastBreakId);
        return idx >= 0 ? idx : 0;
    }, [lastBreakId, brokenGroupIds]);

    /** 通用：找出清單中「目前可視區域之後」的下一個項目 index */
    const findNextVisibleIndex = useCallback((ids, lastId, idPrefix = 'spin-group-') => {
        if (ids.length === 0) return -1;
        // 如果有上次記錄，直接循環到下一個
        if (lastId !== null) {
            const lastIdx = ids.indexOf(lastId);
            if (lastIdx >= 0) return (lastIdx + 1) % ids.length;
        }
        // 首次或 lastId 無效：找出第一個在可視區域下方的項目
        const listContainer = document.querySelector('.custom-scrollbar');
        if (listContainer) {
            const containerRect = listContainer.getBoundingClientRect();
            const viewportMid = containerRect.top + containerRect.height / 2;
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(`${idPrefix}${ids[i]}`)
                    || document.getElementById(`kf-card-${String(ids[i]).replace('ungrouped_', '')}`);
                if (el) {
                    const elRect = el.getBoundingClientRect();
                    if (elRect.top >= viewportMid) return i;
                }
            }
        }
        return 0; // fallback：從頭開始
    }, []);

    const highlightAndScroll = useCallback((el, ringColor) => {
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', ringColor, 'ring-offset-2', 'transition-all', 'duration-500');
        setTimeout(() => el.classList.remove('ring-4', ringColor, 'ring-offset-2'), 1500);
    }, []);

    const scrollToNextBreak = useCallback(() => {
        if (brokenGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(brokenGroupIds, lastBreakId);
        const gid = brokenGroupIds[nextIdx];
        highlightAndScroll(document.getElementById(`spin-group-${gid}`), 'ring-rose-400');
        setLastBreakId(gid);
    }, [brokenGroupIds, lastBreakId, findNextVisibleIndex, highlightAndScroll]);

    const [lastWrongWinId, setLastWrongWinId] = useState(null);
    const currentWrongWinIndex = useMemo(() => {
        if (!lastWrongWinId || wrongWinGroupIds.length === 0) return 0;
        const idx = wrongWinGroupIds.indexOf(lastWrongWinId);
        return idx >= 0 ? idx : 0;
    }, [lastWrongWinId, wrongWinGroupIds]);

    const scrollToNextWrongWin = useCallback(() => {
        if (wrongWinGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(wrongWinGroupIds, lastWrongWinId);
        const gid = wrongWinGroupIds[nextIdx];
        const el = document.getElementById(`spin-group-${gid}`)
            || document.getElementById(`kf-card-${String(gid).replace('ungrouped_', '')}`);
        highlightAndScroll(el, 'ring-amber-400');
        setLastWrongWinId(gid);
    }, [wrongWinGroupIds, lastWrongWinId, findNextVisibleIndex, highlightAndScroll]);

    const [lastNonZeroWinId, setLastNonZeroWinId] = useState(null);
    const currentNonZeroWinIndex = useMemo(() => {
        if (!lastNonZeroWinId || nonZeroWinGroupIds.length === 0) return 0;
        const idx = nonZeroWinGroupIds.indexOf(lastNonZeroWinId);
        return idx >= 0 ? idx : 0;
    }, [lastNonZeroWinId, nonZeroWinGroupIds]);

    const scrollToNextNonZeroWin = useCallback(() => {
        if (nonZeroWinGroupIds.length === 0) return;
        const nextIdx = findNextVisibleIndex(nonZeroWinGroupIds, lastNonZeroWinId);
        const gid = nonZeroWinGroupIds[nextIdx];
        const el = document.getElementById(`spin-group-${gid}`)
            || document.getElementById(`kf-card-${String(gid).replace('ungrouped_', '')}`);
        highlightAndScroll(el, 'ring-emerald-400');
        setLastNonZeroWinId(gid);
    }, [nonZeroWinGroupIds, lastNonZeroWinId, findNextVisibleIndex, highlightAndScroll]);

    // ── 操作處理 ──
    const scanOpts = { winROI, balanceROI, betROI, orderIdROI: enableOrderId ? orderIdROI : null, ocrDecimalPlaces, requireStableWin: false, sliceCols: template?.cols || propGridCols || 5 };

    const handleHealBreaksGlobally = () => {
        if (brokenGroupIds.length === 0) return;
        healBreaks(brokenGroupIds, scanOpts);
    };

    const handleHealSingleBreak = (gid) => {
        healBreaks([parseInt(gid)], scanOpts);
    };



    const handleStartLive = async () => {
        if (!videoRef.current || !reelROI) return;
        
        // 如果有綁定根目錄，每次偵測都自動建一個 Timestamp 的子資料夾
        if (rootSaveDirHandle) {
            try {
                const now = new Date();
                const ts = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
                const gameSuffix = (gameName || template?.name) ? `_${gameName || template.name}` : '';
                const folderName = `Session_${ts}${gameSuffix}`;
                const newSaveHandle = await rootSaveDirHandle.getDirectoryHandle(folderName, { create: true });
                setSaveDirHandle(newSaveHandle);
                setSaveCount(0);
                savedIdsRef.current.clear();
                setTemplateMessage?.(`📁 已自動建立存檔資料夾：${folderName}`);
            } catch (err) {
                console.error("無法建立子資料夾", err);
            }
        }

        setIsLiveActive(true);
        if (videoRef.current.paused) videoRef.current.play();
        startLiveDetection(videoRef.current, reelROI, (candidate) => {
            setTemplateMessage?.(`📸 即時偵測到停輪 @ ${candidate.time.toFixed(1)}s`);
        }, { ...scanOpts });
    };

    const handleStopLive = () => {
        setIsLiveActive(false);
        stopLiveDetection();
    };

    // ── 智慧刪除（含資料夾圖片清理）──
    const handleConfirmDedup = async () => {
        // 先找出即將被刪除的候選幀（isSpinBest === false）
        const toRemove = candidates.filter(c => c.isSpinBest === false);

        // 如果有選擇資料夾，嘗試刪除對應的截圖檔
        if (saveDirHandle && toRemove.length > 0) {
            const exts = ['jpg', 'jpeg', 'png'];
            let deletedCount = 0;
            for (const kf of toRemove) {
                for (const ext of exts) {
                    const prefix = kf.id.startsWith('win-') ? 'win_' : 'spin_';
                    const fileName = `${prefix}${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    try {
                        await saveDirHandle.removeEntry(fileName);
                        deletedCount++;
                    } catch (e) {
                        // 檔案不存在或無權限，靜默跳過
                    }
                }
            }
            if (deletedCount > 0) {
                console.log(`🗑️ 已從資料夾刪除 ${deletedCount} 張被淘汰的截圖`);
            }
        }

        // 再執行原本的 confirmDedup（從 state 中移除非最佳候選幀）
        confirmDedup();
    };

    // ── 統計數據 ──
    const recognizedCount = candidates.filter(c => c.status === 'recognized').length;
    const pendingCount = candidates.filter(c => c.status === 'pending').length;
    const errorCount = candidates.filter(c => c.status === 'error').length;
    const winPendingCount = candidates.filter(c =>
        (c.status === 'pending' || c.status === 'error') &&
        c.ocrData?.win && parseFloat(c.ocrData.win) > 0
    ).length;

    // ══════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors bg-white" onClick={onToggle}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                        {isPhase4Minimized ? <Video size={20} /> : <Scan size={20} />}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Phase 4: 影片智慧分析</h2>
                        <p className="text-xs text-slate-500">
                            {isPhase4Minimized ? '自適應關鍵幀提取 + AI 辨識 (已最小化)' : '零參數動態掃描 · 三種操作模式'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isPhase4Minimized && candidates.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {candidates.length} 幀
                        </span>
                    )}
                    <div className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                        {isPhase4Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {/* Main */}
            <div className={`${isPhase4Minimized ? 'hidden' : ''}`}>

                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* ══ 左側：影片預覽 ══ */}
                    <div className="lg:col-span-8 space-y-4">
                        {!videoSrc ? (
                            <div className="aspect-video bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-12 transition-all hover:bg-slate-50 hover:border-indigo-300 group">
                                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md mb-6 group-hover:scale-110 transition-transform">
                                    <Video size={32} className="text-indigo-500" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-700 mb-2">選擇影像來源開始分析</h3>
                                <p className="text-sm text-slate-400 mb-6">上傳影片檔案或即時擷取螢幕畫面</p>
                                <div className="flex gap-3">
                                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 cursor-pointer transition-all active:scale-95 flex items-center gap-2">
                                        <Video size={18} /> 選擇影片檔案
                                        <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                                    </label>
                                    <button onClick={handleStartScreenCapture}
                                        className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-violet-500/20 cursor-pointer transition-all active:scale-95 flex items-center gap-2">
                                        <Monitor size={18} /> 螢幕擷取
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* 影片 + ROI */}
                                <div className="relative rounded-2xl shadow-2xl bg-black flex flex-col items-center overflow-hidden no-invert">
                                    {/* ROI 切換器 */}
                                    <div className="absolute top-4 right-4 z-40 bg-slate-900/80 backdrop-blur-md p-1 rounded-lg border border-white/20 shadow-xl flex gap-1">
                                        {[
                                            { key: 'reel', label: 'REEL', hex: '#f59e0b' },
                                            { key: 'win', label: 'WIN', hex: '#10b981' },
                                            { key: 'balance', label: 'BAL', hex: '#38bdf8' },
                                            { key: 'bet', label: 'BET', hex: '#22d3ee' },
                                            { key: 'orderId', label: 'ID', hex: '#a855f7' }
                                        ].map(r => (
                                            <button key={r.key} onClick={() => setRoiMode(r.key)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${roiMode === r.key
                                                    ? 'text-white ring-2 ring-offset-2'
                                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                                    } ${r.key === 'orderId' && !enableOrderId ? 'opacity-50 grayscale' : ''}`}
                                                style={roiMode === r.key ? { backgroundColor: r.hex, ringColor: r.hex, boxShadow: `0 0 0 2px white, 0 0 0 4px ${r.hex}` } : {}}
                                            >
                                                {r.key === 'orderId' && (
                                                    <input 
                                                        type="checkbox" 
                                                        checked={enableOrderId} 
                                                        onChange={(e) => { e.stopPropagation(); setEnableOrderId(e.target.checked); }} 
                                                        className="cursor-pointer h-3 w-3 rounded accent-purple-500" 
                                                        title="勾選以進行注單號擷取與 OCR"
                                                    />
                                                )}
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: roiMode === r.key ? 'white' : r.hex }} />
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>




                                    {/* 即時模式指示器 */}
                                    {isLiveActive && (
                                        <div className="absolute top-4 left-4 z-40 bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 animate-pulse shadow-lg">
                                            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                                            LIVE 偵測中
                                        </div>
                                    )}

                                    <div className="relative inline-block" ref={containerRef}
                                        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onMouseDown={handleMouseDown}>
                                        <video ref={videoRef} src={isStreamMode ? undefined : videoSrc} autoPlay={isStreamMode} muted={isStreamMode} className="max-w-full max-h-[70vh] block" />

                                        {/* ROI 框 */}
                                        {[
                                            { roi: reelROI, mode: 'reel', hex: '#f59e0b', label: '盤面', showGrid: true },
                                            { roi: winROI, mode: 'win', hex: '#10b981', label: '贏分' },
                                            { roi: balanceROI, mode: 'balance', hex: '#38bdf8', label: '總分' },
                                            { roi: betROI, mode: 'bet', hex: '#22d3ee', label: '押分' },
                                            { roi: orderIdROI, mode: 'orderId', hex: '#a855f7', label: '單號' }
                                        ].map(r => {
                                            const isActive = roiMode === r.mode;
                                            return (
                                            <div key={r.mode}
                                                className={`absolute transition-opacity ${isActive ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
                                                style={{
                                                    left: `${r.roi.x}%`, top: `${r.roi.y}%`, width: `${r.roi.w}%`, height: `${r.roi.h}%`,
                                                    zIndex: isActive ? 20 : 10,
                                                    border: `3px solid ${r.hex}`,
                                                    backgroundColor: isActive ? `${r.hex}15` : 'transparent',
                                                    opacity: isActive ? 1 : 0.5,
                                                    boxShadow: isActive ? `0 0 12px ${r.hex}60, inset 0 0 20px ${r.hex}10` : 'none'
                                                }}
                                                onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e); }}
                                            >
                                                {r.showGrid && renderGridLines()}
                                                {isActive && (
                                                    <div className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full border-2 border-white pointer-events-auto cursor-nwse-resize shadow-lg"
                                                        style={{ backgroundColor: r.hex }} />
                                                )}
                                                <div className="absolute left-0 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-md"
                                                    style={{ backgroundColor: r.hex, top: '-22px' }}>{r.label}</div>
                                            </div>
                                            );
                                        })}
                                    </div>

                                    {/* 播放控制列 */}
                                    {isStreamMode ? (
                                        /* 串流模式：簡化狀態列 */
                                        <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
                                                <span className="text-xs font-bold text-rose-400">串流中</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <Clock size={12} />
                                                <span className="text-xs font-mono">{formatTime(streamElapsed)}</span>
                                            </div>
                                            <div className="flex-1" />
                                            <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/*'; input.onchange = handleVideoUpload; input.click(); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold transition-all border border-slate-600 active:scale-95">
                                                <RefreshCw size={12} /> 切換影片
                                            </button>
                                            <button onClick={handleStopScreenCapture}
                                                className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95 shadow-sm">
                                                <StopCircle size={14} /> 結束串流
                                            </button>
                                        </div>
                                    ) : (
                                        /* 影片模式：正常播放控制 */
                                        <div className="w-full bg-slate-900/90 backdrop-blur p-3 px-5 flex items-center gap-4 border-t border-white/10">
                                            <button onClick={togglePlay} className="text-white hover:text-amber-400 transition-colors">
                                                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                            </button>
                                            <button onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/*'; input.onchange = handleVideoUpload; input.click(); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-200 active:scale-95">
                                                <RefreshCw size={12} /> 換片
                                            </button>
                                            <button onClick={handleStartScreenCapture}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg text-xs font-bold transition-all border border-violet-200 active:scale-95">
                                                <Monitor size={12} /> 螢幕
                                            </button>
                                            <div className="flex-1 flex items-center gap-3">
                                                <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                                                <input type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={handleSeek}
                                                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                                                <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                                {/* 影片主控與參數欄 — 始終顯示 */}
                                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm">
                                    <button onClick={isLiveActive ? handleStopLive : handleStartLive}
                                        disabled={!videoSrc}
                                        className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${isLiveActive ? 'bg-rose-600 text-white animate-pulse shadow-rose-200' : !videoSrc ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95'}`}>
                                        {isLiveActive ? (
                                            <><Square size={16} fill="currentColor" /> 停止偵測</>
                                        ) : (
                                            <><Play size={18} fill="currentColor" /> 開始即時偵測</>
                                        )}
                                    </button>

                                    <button onClick={() => {
                                        const newId = addManualCandidate(videoRef.current, reelROI, scanOpts);
                                        if (newId) setLastAddedManualId(newId);
                                    }}
                                        disabled={!videoSrc}
                                        className="h-full px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200 active:scale-95 shadow-sm">
                                        <Camera size={16} className="text-amber-500" /> 手動截圖
                                    </button>

                                    <div className="flex flex-wrap items-center gap-3 ml-auto border-l border-slate-200 pl-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-400">辨識來源</span>
                                            <button onClick={() => {
                                                const val = !useWinFrame;
                                                setUseWinFrame(val);
                                                candidates.forEach(kf => updateCandidate(kf.id, { useWinFrame: val }));
                                            }}
                                                className={`h-7 flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 ${
                                                    useWinFrame
                                                        ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
                                                        : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                                                }`}>
                                                {useWinFrame ? '🏆 WIN截圖' : '🎰 停輪截圖'}
                                            </button>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[10px] font-bold text-slate-400">FG 模式</span>
                                            <select value={fgType} onChange={e => setFgType(e.target.value)}
                                                className="h-7 px-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold shadow-sm cursor-pointer outline-none">
                                                <option value="A">A 贏分延續</option>
                                                <option value="B">B 贏分歸零</option>
                                                <option value="none">無 FG</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                    </div>

                    {/* ══ 右側面板 ══ */}
                    <div className="lg:col-span-4 flex flex-col">
                        <div className="bg-slate-50 rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden shadow-sm">

                            <DiagnosticDashboard
                                stats={stats}
                                diagnosticStats={diagnosticStats}
                                wrongWinGroupIds={wrongWinGroupIds}
                                nonZeroWinGroupIds={nonZeroWinGroupIds}
                                scrollToNextBreak={scrollToNextBreak}
                                scrollToNextWrongWin={scrollToNextWrongWin}
                                scrollToNextNonZeroWin={scrollToNextNonZeroWin}
                                currentBreakIndex={currentBreakIndex}
                                currentWrongWinIndex={currentWrongWinIndex}
                                currentNonZeroWinIndex={currentNonZeroWinIndex}
                            />

                            {/* 候選幀列表 Header */}
                            <div className="px-4 py-2 border-b bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs">
                                    <Scan size={14} className="text-indigo-500" /> 候選關鍵幀
                                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px]">{candidates.length}</span>
                                    {recognizedCount > 0 && <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px]">✓{recognizedCount}</span>}
                                    {errorCount > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px]">✗{errorCount}</span>}
                                </h3>
                                {candidates.length > 0 && (
                                    <button onClick={clearCandidates} className="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="清除全部">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>

                            {/* 候選幀列表 */}
                            <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar" style={{ height: '450px' }}>
                                {candidates.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                                        <Scan size={48} className="mb-4 stroke-[1px]" />
                                        <p className="text-xs text-center">
                                            點擊「開始即時偵測」
                                        </p>
                                    </div>
                                ) : (
                                    (() => {
                                        const groupColorPalette = [
                                            { border: '#818cf8', bg: 'rgba(238,242,255,0.6)' },
                                            { border: '#fbbf24', bg: 'rgba(255,251,235,0.6)' },
                                            { border: '#22d3ee', bg: 'rgba(236,254,255,0.6)' },
                                            { border: '#f472b6', bg: 'rgba(253,242,248,0.6)' },
                                            { border: '#a3e635', bg: 'rgba(247,254,231,0.6)' },
                                        ];

                                        // groupsWithMath 和 brokenGroupIds 已在元件頂層用 useMemo 計算

                                        if (!groupsWithMath) {
                                            return candidates.map((kf, idx) => (
                                                <CandidateCard
                                                    key={kf.id} kf={kf} idx={idx}
                                                    editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                                    updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                                    handleCardClick={handleCardClick}
                                                    onTransferToPhase3={onTransferToPhase3}
                                                    removeCandidate={removeCandidate}
                                                />
                                            ));
                                        }

                                        return groupsWithMath.map(({ gid, group, mathValid, mathDiff, expectedBase, nextBase, isFGSequence }, listIndex) => {
                                            const isMulti = group.length > 1;
                                            const parsedGid = parseInt(gid);
                                            const palette = isNaN(parsedGid) 
                                                ? { border: '#cbd5e1', bg: 'rgba(248,250,252,0.6)' } 
                                                : groupColorPalette[parsedGid % groupColorPalette.length];
                                            return (
                                                <div id={`spin-group-${gid}`} key={`spin-${gid}-${listIndex}`}
                                                    className="rounded-xl p-1.5 space-y-1.5"
                                                    style={{ borderLeft: `4px solid ${palette.border}`, backgroundColor: palette.bg }}
                                                >
                                                    <div className="text-[13px] font-bold px-1 flex flex-wrap items-center gap-2 mb-1 pb-1 border-b border-slate-200/50">
                                                        {isFGSequence ? (
                                                            <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">🔥 免遊序列</span>
                                                        ) : (
                                                            <span className="text-slate-500 opacity-60 bg-slate-100 px-2 py-0.5 rounded shadow-sm">{isMulti ? '同局' : '單局'}</span>
                                                        )}
                                                        
                                                        {expectedBase !== null && (
                                                            mathValid ? (
                                                                <span className="text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`與上局符合 (推算本局結餘 = ${nextBase?.toFixed(2)})`}>
                                                                    <Link2 size={14} /> 連續
                                                                </span>
                                                            ) : (
                                                                <div className="flex items-center gap-1.5 group/break">
                                                                    <span className="text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`預期起始: ${expectedBase.toFixed(2)}`}>
                                                                        <AlertCircle size={14} /> 斷層 {mathDiff !== 0 && `(${mathDiff > 0 ? '+' : ''}${mathDiff.toFixed(2)})`}
                                                                    </span>
                                                                </div>
                                                            )
                                                        )}
                                                        
                                                        <span className="ml-auto text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{group.length} 張</span>
                                                        <button onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                                            recognizeLocalBatch(ocrDecimalPlaces, [bestKf]); 
                                                        }}
                                                            title="本地辨識這局最佳結果"
                                                            className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full text-[10px] font-bold border border-indigo-200 transition-all active:scale-95 shadow-sm">
                                                            <Monitor size={10} /> 本地
                                                        </button>
                                                        <button onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                                            onTransferToPhase3([bestKf]); 
                                                        }}
                                                            title="送這局最佳結果到 Phase 3"
                                                            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full text-[10px] font-bold border border-emerald-200 transition-all active:scale-95 shadow-sm">
                                                            <Send size={10} /> P3
                                                        </button>
                                                    </div>
                                                    {group.map(({ kf, idx }) => {
                                                        const isBest = kf.isSpinBest;
                                                        const hasBeenGrouped = kf.isSpinBest !== undefined; // smartDedup 有跑過
                                                        const isDimmed = isMulti && !isBest;
                                                        return (
                                                            <CandidateCard
                                                                key={kf.id} kf={kf} idx={idx}
                                                                editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                                                updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                                                handleCardClick={handleCardClick}
                                                                onTransferToPhase3={onTransferToPhase3}
                                                                removeCandidate={removeCandidate}
                                                                isBest={isBest}
                                                                hasBeenGrouped={hasBeenGrouped}
                                                                isDimmed={isDimmed}
                                                                setManualBestCandidate={setManualBestCandidate}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            );
                                        });
                                    })()
                                )}
                                <div ref={listEndRef} />
                            </div>

                                <ActionPanel
                                    candidates={candidates}
                                    smartDedup={smartDedup}
                                    fgType={fgType}
                                    handleConfirmDedup={handleConfirmDedup}
                                    template={template}
                                    enableBidirectional={enableBidirectional}
                                    setEnableBidirectional={setEnableBidirectional}
                                    isRecognizing={isRecognizing}
                                    isStopping={isStopping}
                                    recognitionProgress={recognitionProgress}
                                    recognizeBatch={recognizeBatch}
                                    recognizeLocalBatch={recognizeLocalBatch}
                                    cancelRecognition={cancelRecognition}
                                    ocrDecimalPlaces={ocrDecimalPlaces}
                                    winPendingCount={winPendingCount}
                                    rootSaveDirHandle={rootSaveDirHandle}
                                    saveDirHandle={saveDirHandle}
                                    saveCount={saveCount}
                                    saveFormat={saveFormat}
                                    setSaveFormat={setSaveFormat}
                                    handlePickSaveDir={handlePickSaveDir}
                                    setRootSaveDirHandle={setRootSaveDirHandle}
                                    setSaveDirHandle={setSaveDirHandle}
                                    exportHTMLReport={exportHTMLReport}
                                    onImportSession={onImportSession}
                                    brokenGroupIds={brokenGroupIds}
                                    handleHealBreaksGlobally={handleHealBreaksGlobally}
                                />

            {/* 全幀截圖預覽 Lightbox */}
            {previewImage && (
                <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}>
                    <div className="relative flex gap-4 max-w-[95vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                            <img src={previewImage.url} alt="reel-stop" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border border-white/10" />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-xl">
                                <span className="text-white text-sm font-mono">🎰 盤面 @ {previewImage.time.toFixed(2)}s</span>
                            </div>
                        </div>
                        {previewImage.url2 && (
                            <div className="relative">
                                <img src={previewImage.url2} alt="win-poll" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border-2 border-amber-400/60" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-xl">
                                    <span className="text-amber-300 text-sm font-mono">🕵️ WIN 特工 @ {previewImage.time2?.toFixed(2) || '?'}s</span>
                                </div>
                            </div>
                        )}
                        <button onClick={() => setPreviewImage(null)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors">
                            <X size={16} className="text-slate-700" />
                        </button>
                    </div>
                </div>
            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Phase4Video;
