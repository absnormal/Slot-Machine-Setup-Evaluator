import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Settings, AlertCircle, CheckCircle2, Trophy, Coins, ChevronDown, ChevronUp, Image as ImageIcon, Upload, Cloud, Download, X, Trash2, FileText, ImagePlus, Copy, Loader2, Crop, LayoutList, MousePointer2, LayoutGrid, Save, FolderOpen, RefreshCw, Plus, Paintbrush, Keyboard, Zap, Key, Database, BrainCircuit, ListChecks, ChevronLeft, ChevronRight, StopCircle } from 'lucide-react';

// === 模組匯入 ===
import { GAS_URL, apiKey } from './utils/constants';
import { toPx, toPct, fetchWithRetry, ptFileToBase64, resizeImageBase64, parseBool } from './utils/helpers';
import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, isJpSymbol, getCashValue, getBaseSymbol } from './utils/symbolUtils';
import { computeGridResults } from './engine/computeGridResults';

import { useLightbox } from './hooks/useLightbox';
import { useCanvasDrag } from './hooks/useCanvasDrag';
import AppHeader from './components/AppHeader';
import ToastMessage from './components/ToastMessage';
import SettingsModal from './components/SettingsModal';
import CloudModal from './components/CloudModal';
import ResultView from './components/ResultView';
import { useCloud } from './hooks/useCloud';
import { useGeminiVision } from './hooks/useGeminiVision';
import { useTemplateBuilder } from './hooks/useTemplateBuilder';
import { useSlotEngine } from './hooks/useSlotEngine';
import { useVideoProcessor } from './hooks/useVideoProcessor';
import Phase1Setup from './components/Phase1Setup';
import Phase2Manual from './components/Phase2Manual';
import Phase3Vision from './components/Phase3Vision';
import Phase4Video from './components/Phase4Video';
function App() {
    // --- 預設資料清空 ---
    const defaultPaytable = "";
    const defaultJpConfig = { "MINI": "", "MINOR": "", "MAJOR": "", "GRAND": "" };

    // --- 本機金鑰設定 ---
    const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    const [localUserId] = useState(() => {
        let uid = localStorage.getItem('slot_local_uid');
        if (!uid) { uid = Math.random().toString(36).substring(2, 15); localStorage.setItem('slot_local_uid', uid); }
        return uid;
    });

    // --- 狀態管理: Phase 1 (基本資訊與模板) ---
    const [platformName, setPlatformName] = useState('');
    const [gameName, setGameName] = useState('');

    const [linesMode, setLinesMode] = useState('image');

    const [isTemplateMinimized, setIsTemplateMinimized] = useState(false);
    const [isPhase2Minimized, setIsPhase2Minimized] = useState(true);
    const [isPhase3Minimized, setIsPhase3Minimized] = useState(true);
    const [isPhase4Minimized, setIsPhase4Minimized] = useState(true);

    const [templateMessage, setTemplateMessage] = useState('');

    // --- Google Sheets 雲端狀態管理 ---
    const {
        cloudTemplates, setCloudTemplates,
        isLoadingCloud, isBackgroundSyncing,
        isSaving, deletingId, setDeletingId, downloadingId,
        cloudError, setCloudError,
        cloudMessage, setCloudMessage,
        fetchCloudTemplates, saveTemplateToCloud, getTemplateData,
        handleForceRefreshCloud, handleDeleteTemplate
    } = useCloud();

    const [showCloudModal, setShowCloudModal] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const [pendingOverwriteData, setPendingOverwriteData] = useState(null);


    const {
        lineMode, setLineMode, linesTextInput, setLinesTextInput,
        paytableMode, setPaytableMode, paytableInput, setPaytableInput,
        template, setTemplate, templateError, setTemplateError,
        buildErrorMsg, setBuildErrorMsg, jpConfig, setJpConfig,
        hasJackpot, setHasJackpot, hasMultiplierReel, setHasMultiplierReel,
        requiresCollectToWin, setRequiresCollectToWin,
        hasDoubleSymbol, setHasDoubleSymbol,
        multiplierCalcType, setMultiplierCalcType,
        lineImages, setLineImages, activeLineImageId, setActiveLineImageId,
        activeLineImage, imageSrc, imageObj,
        patternRows, setPatternRows, patternCols, setPatternCols,
        gridRows, setGridRows, gridCols, setGridCols,
        threshold, setThreshold, startIndex, setStartIndex,
        p1, setP1, pEnd, setPEnd, extractResults, setExtractResults,
        dragState, setDragState, canvasRef, containerRef, layoutStyle, canvasSize,
        linesTabMode, setLinesTabMode,
        ptImages, setPtImages, isPtProcessing, setIsPtProcessing,
        ptResultItems, setPtResultItems, ptCropState, setPtCropState,
        ptEnlargedImg, setPtEnlargedImg, ptCropImageRef,
        handleLineImageUpload, removeLineImage, analyzeImage,
        handleMouseDown, handleMouseMove, handleMouseUp, draw,
        handlePaytableTextChange, handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        handlePtFileChange, handlePtDrop, processPtFiles, removePtImage, clearPtAll, handlePtExtract,
        performAutoBuild, handleBuildTemplate, resetTemplateBuilder
    } = useTemplateBuilder({
        customApiKey,
        apiKey,
        setTemplateMessage,
        setIsPhase2Minimized,
        setIsPhase3Minimized,
        setIsTemplateMinimized,
        isTemplateMinimized,
        linesMode
    });

    const handleClearTemplate = useCallback(() => {
        if (!window.confirm('確定要清除當前所有模板設定與提取結果嗎？')) return;
        setPlatformName('');
        setGameName('');
        setTemplateName('');
        resetTemplateBuilder();
    }, [resetTemplateBuilder]);


    const { lightboxState, handleLbDragStart, handleLbResizeStart } = useLightbox(ptEnlargedImg);


    const {
        panelGrid, setPanelGrid, betInput, setBetInput,
        calcResults, setCalcResults, calculateError, setCalculateError,
        hoveredLineId, setHoveredLineId, showAllLines, setShowAllLines,
        panelInputMode, setPanelInputMode, activeBrush, setActiveBrush,
        showPtModal, setShowPtModal, availableSymbols,
        generateRandomPanelGrid, handleRandomizePanel, handleClearPanel,
        getSafeGrid, handleGridPaste, handleCellChange, computeGridResultsCb
    } = useSlotEngine({ template });


    // --- 狀態管理: Phase 3 (AI 視覺批次辨識結算) ---
    const visionCanvasRef = useRef(null);
    const visionContainerRef = useRef(null);

    const {
        visionImages, activeVisionId, activeVisionImg, visionImageObj, visionImageSrc, visionGrid, visionError,
        isVisionProcessing, isVisionStopping, visionBatchProgress,
        setActiveVisionId, setVisionImages, handleVisionMouseDown, handleVisionMouseMove, handleVisionMouseUp,
        handleVisionImageUpload, removeVisionImage, performAIVisionBatchMatching, cancelVisionProcessing,
        goToPrevVisionImage, goToNextVisionImage,
        hasBetBox, setHasBetBox
    } = useGeminiVision({
        template,
        availableSymbols,
        customApiKey,
        setTemplateMessage,
        setTemplateError,
        visionCanvasRef,
        isPhase3Minimized
    });

    // --- 狀態管理: Phase 4 (影片自動辨識截圖) ---
    const {
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
    } = useVideoProcessor({ setTemplateMessage, template });

    const handleTransferPhase4ToPhase3 = useCallback(async () => {
        if (capturedImages.length === 0) return;
        
        // 轉換為 Phase 3 需要的格式 (需帶有 HTML Image 對象)
        const transformed = await Promise.all(capturedImages.map(imgData => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        id: imgData.id,
                        file: imgData.file,
                        previewUrl: imgData.previewUrl,
                        obj: img, // Phase 3 畫 canvas 需要原始對象
                        grid: null,
                        error: ''
                    });
                };
                img.src = imgData.previewUrl;
            });
        }));
        
        setVisionImages(prev => [...prev, ...transformed]);
        setIsPhase4Minimized(true);
        setIsPhase3Minimized(false);
        setTemplateMessage(`✅ 已成功從影片匯入 ${capturedImages.length} 張截圖至 Phase 3`);
        clearAllCaptures();
    }, [capturedImages, setVisionImages, setTemplateMessage, clearAllCaptures]);



    const defaultSaveName = [platformName, gameName].filter(Boolean).join('-') || `模板 ${gridRows}x${gridCols}`;

    useEffect(() => {
        if (showCloudModal) fetchCloudTemplates();
    }, [showCloudModal, fetchCloudTemplates]);

    const [activeSaveAction, setActiveSaveAction] = useState(null); // 'initial', 'FORCE_NEW', or ID

    const handleSaveToCloud = async (forceOverwriteId = null) => {
        const isEvent = forceOverwriteId && typeof forceOverwriteId === 'object' && forceOverwriteId.nativeEvent;
        const actualForceId = isEvent ? null : forceOverwriteId;

        setActiveSaveAction(actualForceId || 'initial');
        const generatedName = [platformName, gameName].filter(Boolean).join('-');

        const result = await saveTemplateToCloud({
            templateName, generatedName, platformName, gameName, gridRows, gridCols, lineMode, extractResults,
            paytableInput, ptResultItems, jpConfig, hasJackpot, hasMultiplierReel, requiresCollectToWin, hasDoubleSymbol, multiplierCalcType,
            localUserId, actualForceId
        });

        if (result && result.conflict) {
            setPendingOverwriteData({ existing: result.existing, newName: result.newName });
            setShowOverwriteConfirm(true);
        } else if (result && result.success) {
            setTemplateName('');
            setTemplateError('');
            if (showOverwriteConfirm) setShowOverwriteConfirm(false);
        }
        setActiveSaveAction(null);
    };









    const loadCloudTemplate = async (templateMeta) => {
        try {
            const data = await getTemplateData(templateMeta.id);

            if (data.platformName !== undefined) setPlatformName(data.platformName);
            if (data.gameName !== undefined) setGameName(data.gameName);
            if (data.gridRows) setGridRows(data.gridRows);
            if (data.gridCols) setGridCols(data.gridCols);
            setLineMode(data.lineMode || (!data.extractResults || data.extractResults.length === 0 ? 'allways' : 'paylines'));
            if (data.extractResults) setExtractResults(data.extractResults);
            if (data.paytableInput) setPaytableInput(data.paytableInput);
            if (data.jpConfig) {
                setJpConfig(data.jpConfig);
                setHasJackpot(Object.keys(data.jpConfig).some(k => data.jpConfig[k] !== ''));
            } else {
                setJpConfig(defaultJpConfig);
                setHasJackpot(false);
            }
            if (data.hasMultiplierReel !== undefined) setHasMultiplierReel(parseBool(data.hasMultiplierReel));
            else setHasMultiplierReel(false);

            if (data.requiresCollectToWin !== undefined) setRequiresCollectToWin(parseBool(data.requiresCollectToWin));
            else setRequiresCollectToWin(true);

            if (data.hasDoubleSymbol !== undefined) setHasDoubleSymbol(parseBool(data.hasDoubleSymbol));
            else setHasDoubleSymbol(false);
            if (data.multiplierCalcType !== undefined) setMultiplierCalcType(data.multiplierCalcType);
            else setMultiplierCalcType('product');

            if (data.ptResultItems) {
                const processedItems = data.ptResultItems.map(item => {
                    const newItem = {
                        ...item,
                        thumbUrls: item.thumbUrls || (item.thumbUrl ? [item.thumbUrl] : []),
                        doubleThumbUrls: item.doubleThumbUrls || []
                    };
                    // 確保 match6~10 存在，避免儲存回雲端時遺失
                    for (let i = 6; i <= 10; i++) {
                        if (newItem[`match${i}`] === undefined) newItem[`match${i}`] = 0;
                    }
                    return newItem;
                });
                setPtResultItems(processedItems);
                setPaytableMode('image');
            } else {
                setPaytableMode('text');
            }

            setLineImages([]);
            setActiveLineImageId(null);
            setShowCloudModal(false);

            setTemplateMessage('☁️ 雲端模板載入成功！已自動為您建構並進入結算畫面。');
            setTimeout(() => setTemplateMessage(''), 4000);

            performAutoBuild(data);
        } catch (err) {
            // Error mapped to cloudError automatically
        }
    };
    const handleExportLocalTemplate = () => {
        setTemplateMessage('');
        if (extractResults.length === 0 && !paytableInput) {
            setTemplateError('沒有可匯出的資料！');
            return;
        }

        const data = {
            version: "1.2",
            platformName,
            gameName,
            gridRows,
            gridCols,
            extractResults,
            paytableInput,
            ptResultItems,
            jpConfig,
            hasMultiplierReel,
            requiresCollectToWin,
            hasDoubleSymbol,
            multiplierCalcType
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const prefix = [platformName, gameName].filter(Boolean).join('-');
        const safePrefix = prefix.replace(/[\/\\:*?"<>|]/g, '_');
        a.download = safePrefix ? `${safePrefix}.json` : `slot_template_${gridRows}x${gridCols}_${extractResults.length}lines.json`;

        a.click();
        URL.revokeObjectURL(url);
        setTemplateError('');
        setTemplateMessage('✅ 本地模板已成功下載！');
        setTimeout(() => setTemplateMessage(''), 3000);
    };

    const handleImportLocalTemplate = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);

                if (data.platformName !== undefined) setPlatformName(data.platformName);
                if (data.gameName !== undefined) setGameName(data.gameName);

                if (data.gridRows) setGridRows(data.gridRows);
                if (data.gridCols) setGridCols(data.gridCols);

                if (data.extractResults) {
                    setExtractResults(data.extractResults);
                    setLinesTextInput(data.extractResults.map(r => r.data.join(' ')).join('\n'));
                }

                if (data.jpConfig) {
                    setJpConfig(data.jpConfig);
                    setHasJackpot(Object.keys(data.jpConfig).some(k => data.jpConfig[k] !== ''));
                } else {
                    setJpConfig(defaultJpConfig);
                    setHasJackpot(false);
                }

                if (data.paytableInput) setPaytableInput(data.paytableInput);
                if (data.ptResultItems) {
                    const processedItems = data.ptResultItems.map(item => {
                        const newItem = {
                            ...item,
                            thumbUrls: item.thumbUrls || (item.thumbUrl ? [item.thumbUrl] : []),
                            doubleThumbUrls: item.doubleThumbUrls || []
                        };
                        for (let i = 6; i <= 10; i++) {
                            if (newItem[`match${i}`] === undefined) newItem[`match${i}`] = 0;
                        }
                        return newItem;
                    });
                    setPtResultItems(processedItems);
                    setPaytableMode('image');
                } else {
                    setPaytableMode('text');
                }

                if (data.hasMultiplierReel !== undefined) setHasMultiplierReel(parseBool(data.hasMultiplierReel));
                else setHasMultiplierReel(false);

                if (data.requiresCollectToWin !== undefined) setRequiresCollectToWin(parseBool(data.requiresCollectToWin));
                else setRequiresCollectToWin(true);

                if (data.hasDoubleSymbol !== undefined) setHasDoubleSymbol(parseBool(data.hasDoubleSymbol));
                else setHasDoubleSymbol(false);
                if (data.multiplierCalcType !== undefined) setMultiplierCalcType(data.multiplierCalcType);
                else setMultiplierCalcType('product');

                setLineImages([]);
                setActiveLineImageId(null);

                setTemplateMessage('✅ 本地模板載入成功！已自動為您建構並進入結算畫面。');
                setTimeout(() => setTemplateMessage(''), 4000);

                performAutoBuild(data);
            } catch (err) {
                setTemplateError("匯入失敗：檔案格式錯誤，請確定是有效的 JSON 模板檔案。");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };


    const [visionCalcResults, setVisionCalcResults] = useState(null);
    const [visionCalculateError, setVisionCalculateError] = useState('');
    const [visionBetInput, setVisionBetInput] = useState(100);

    // 同步當前圖片的辨識 BET
    useEffect(() => {
        if (activeVisionImg && typeof activeVisionImg.bet === 'number') {
            setVisionBetInput(activeVisionImg.bet);
        }
    }, [activeVisionId, activeVisionImg]);

    // 排程更新圖片內的 BET (避免在渲染期間更新)
    const handleVisionBetInputChange = (newBet) => {
        setVisionBetInput(newBet);
        if (activeVisionId) {
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, bet: newBet } : img
            ));
        }
    };

    useEffect(() => {
        if (!visionGrid) {
            setVisionCalcResults(null);
            setVisionCalculateError('');
            return;
        }
        const { results, error } = computeGridResultsCb(visionGrid, visionBetInput);
        setVisionCalcResults(results);
        setVisionCalculateError(error);
    }, [visionGrid, visionBetInput, computeGridResultsCb]);

    // --- 盤面傳遞功能 (Phase 3 -> Phase 2) ---
    const handleTransferVisionToManual = useCallback(() => {
        if (!visionGrid) return;
        setPanelGrid(JSON.parse(JSON.stringify(visionGrid)));
        setBetInput(visionBetInput); // 同步押注金額到 Phase 2
        setIsPhase3Minimized(true);
        setIsPhase2Minimized(false);
        setTemplateMessage('✅ 已將 AI 辨識盤面及押注傳送到 Phase 2');
        setTimeout(() => setTemplateMessage(''), 3000);
    }, [visionGrid, visionBetInput, setPanelGrid, setBetInput, setIsPhase3Minimized, setIsPhase2Minimized, setTemplateMessage]);
    /* ... handleReturnToVision ... */
    const handleReturnToVision = useCallback(() => {
        if (activeVisionId) {
            setVisionImages(prev => prev.map(img =>
                img.id === activeVisionId ? { ...img, grid: JSON.parse(JSON.stringify(panelGrid)) } : img
            ));
            setVisionBetInput(betInput);
        }
        setIsPhase2Minimized(true);
        setIsPhase3Minimized(false);
    }, [activeVisionId, panelGrid, betInput, setVisionImages, setVisionBetInput, setIsPhase2Minimized, setIsPhase3Minimized]);

    // 快捷鍵監聽 (方向鍵上: 傳送, 方向鍵下: 返回, Enter: 執行各階段主動作)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

            if (e.key === 'ArrowUp') {
                if (!isPhase3Minimized && visionGrid) {
                    e.preventDefault();
                    handleTransferVisionToManual();
                }
            } else if (e.key === 'ArrowDown') {
                if (!isPhase2Minimized) {
                    e.preventDefault();
                    handleReturnToVision();
                }
            } else if (e.key === 'Enter') {
                // Phase 1: 建立模板
                if (!isTemplateMinimized) {
                    e.preventDefault();
                    handleBuildTemplate();
                }
                // Phase 2: 更新資產
                else if (!isPhase2Minimized) {
                    e.preventDefault();
                    const winAmount = calcResults?.totalWin || 0;
                    setTotalBalance(prev => prev + winAmount);
                    setTemplateMessage(`💰 已將贏分 ${winAmount.toLocaleString()} 加入總資產`);
                    setTimeout(() => setTemplateMessage(''), 3000);
                }
                // Phase 3: 更新資產
                else if (!isPhase3Minimized) {
                    e.preventDefault();
                    const winAmount = visionCalcResults?.totalWin || 0;
                    setTotalBalance(prev => prev + winAmount);
                    setTemplateMessage(`💰 已將 AI 辨識贏分 ${winAmount.toLocaleString()} 加入總資產`);
                    setTimeout(() => setTemplateMessage(''), 3000);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTemplateMinimized, isPhase2Minimized, isPhase3Minimized, visionGrid, calcResults, visionCalcResults, handleTransferVisionToManual, handleReturnToVision, handleBuildTemplate]);

    const [totalBalance, setTotalBalance] = useState(() => {
        const saved = localStorage.getItem('slot_total_balance');
        return saved ? parseFloat(saved) : 0;
    });

    const [isBalanceExpanded, setIsBalanceExpanded] = useState(false);

    useEffect(() => {
        localStorage.setItem('slot_total_balance', totalBalance.toString());
    }, [totalBalance]);

    const hasApiKey = !!(customApiKey.trim() || apiKey);

    useEffect(() => {
        if (cloudError) {
            const timer = setTimeout(() => setCloudError(''), 4000);
            return () => clearTimeout(timer);
        }
    }, [cloudError, setCloudError]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans relative">

            <ToastMessage message={templateMessage} />
            <ToastMessage message={cloudMessage} />
            <ToastMessage message={cloudError} type="error" />

            <div className="max-w-7xl mx-auto space-y-6">

                <AppHeader onOpenSettings={() => setShowSettingsModal(true)} />

                <Phase1Setup
                    handleClearTemplate={handleClearTemplate}
                    templateMessage={templateMessage}
                    isTemplateMinimized={isTemplateMinimized} setIsTemplateMinimized={setIsTemplateMinimized}
                    template={template} templateError={templateError}
                    showCloudModal={showCloudModal} setShowCloudModal={setShowCloudModal}
                    handleImportLocalTemplate={handleImportLocalTemplate} handleExportLocalTemplate={handleExportLocalTemplate}
                    templateName={templateName} setTemplateName={setTemplateName} defaultSaveName={defaultSaveName}
                    handleSaveToCloud={handleSaveToCloud} isSaving={isSaving} activeSaveAction={activeSaveAction}
                    platformName={platformName} setPlatformName={setPlatformName}
                    gameName={gameName} setGameName={setGameName}
                    lineMode={lineMode} setLineMode={setLineMode}
                    linesMode={linesMode} setLinesMode={setLinesMode}
                    linesTextInput={linesTextInput} setLinesTextInput={setLinesTextInput}
                    extractResults={extractResults} setExtractResults={setExtractResults}
                    gridRows={gridRows} setGridRows={setGridRows}
                    gridCols={gridCols} setGridCols={setGridCols}
                    hasMultiplierReel={hasMultiplierReel} setHasMultiplierReel={setHasMultiplierReel}
                    requiresCollectToWin={requiresCollectToWin} setRequiresCollectToWin={setRequiresCollectToWin}
                    hasDoubleSymbol={hasDoubleSymbol} setHasDoubleSymbol={setHasDoubleSymbol}
                    multiplierCalcType={multiplierCalcType} setMultiplierCalcType={setMultiplierCalcType}
                    lineImages={lineImages} removeLineImage={removeLineImage} activeLineImageId={activeLineImageId} setActiveLineImageId={setActiveLineImageId} handleLineImageUpload={handleLineImageUpload}
                    isPtProcessing={isPtProcessing} handlePtExtract={handlePtExtract} ptImages={ptImages} removePtImage={removePtImage} clearPtAll={clearPtAll} handlePtFileChange={handlePtFileChange} handlePtDrop={handlePtDrop}
                    dragState={dragState} setDragState={setDragState} containerRef={containerRef} layoutStyle={layoutStyle} handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove} handleMouseUp={handleMouseUp}
                    canvasRef={canvasRef} draw={draw} canvasSize={canvasSize} p1={p1} pEnd={pEnd} analyzeImage={analyzeImage} startIndex={startIndex} setStartIndex={setStartIndex} threshold={threshold} setThreshold={setThreshold}
                    patternRows={patternRows} setPatternRows={setPatternRows} patternCols={patternCols} setPatternCols={setPatternCols} linesTabMode={linesTabMode} setLinesTabMode={setLinesTabMode}
                    activeLineImage={activeLineImage} imageSrc={imageSrc} imageObj={imageObj}
                    paytableMode={paytableMode} setPaytableMode={setPaytableMode} paytableInput={paytableInput} setPaytableInput={setPaytableInput} handlePaytableTextChange={handlePaytableTextChange}
                    ptResultItems={ptResultItems} setPtResultItems={setPtResultItems} ptCropState={ptCropState} setPtCropState={setPtCropState} ptCropImageRef={ptCropImageRef} ptEnlargedImg={ptEnlargedImg} setPtEnlargedImg={setPtEnlargedImg}
                    handlePtTableChange={handlePtTableChange} handlePtTableDelete={handlePtTableDelete} handleAddPtRow={handleAddPtRow} handleRemoveThumb={handleRemoveThumb}
                    hasJackpot={hasJackpot} setHasJackpot={setHasJackpot} jpConfig={jpConfig} setJpConfig={setJpConfig} buildErrorMsg={buildErrorMsg} handleBuildTemplate={handleBuildTemplate}
                    showPtModal={showPtModal} setShowPtModal={setShowPtModal}
                    hasApiKey={hasApiKey}
                />

                <Phase2Manual
                    template={template}
                    isPhase2Minimized={isPhase2Minimized} setIsPhase2Minimized={setIsPhase2Minimized}
                    handleRandomizePanel={handleRandomizePanel}
                    panelInputMode={panelInputMode} setPanelInputMode={setPanelInputMode}
                    activeBrush={activeBrush} setActiveBrush={setActiveBrush}
                    availableSymbols={availableSymbols}
                    handleClearPanel={handleClearPanel}
                    hoveredLineId={hoveredLineId} setHoveredLineId={setHoveredLineId}
                    calcResults={calcResults} calculateError={calculateError}
                    showAllLines={showAllLines} setShowAllLines={setShowAllLines}
                    betInput={betInput} setBetInput={setBetInput}
                    panelGrid={panelGrid} handleCellChange={handleCellChange}
                    getSafeGrid={getSafeGrid}
                    onReturn={handleReturnToVision}
                    totalBalance={totalBalance} setTotalBalance={setTotalBalance}
                    setTemplateMessage={setTemplateMessage}
                    isBalanceExpanded={isBalanceExpanded}                    setIsBalanceExpanded={setIsBalanceExpanded}
                />

            <Phase3Vision
                    template={template}
                    isPhase3Minimized={isPhase3Minimized} setIsPhase3Minimized={setIsPhase3Minimized}
                    visionImages={visionImages} activeVisionId={activeVisionId} setActiveVisionId={setActiveVisionId}
                    removeVisionImage={removeVisionImage} handleVisionImageUpload={handleVisionImageUpload}
                    activeVisionImg={activeVisionImg} visionContainerRef={visionContainerRef} visionCanvasRef={visionCanvasRef}
                    handleVisionMouseDown={handleVisionMouseDown} handleVisionMouseMove={handleVisionMouseMove} handleVisionMouseUp={handleVisionMouseUp}
                    goToPrevVisionImage={goToPrevVisionImage} goToNextVisionImage={goToNextVisionImage}
                    isVisionProcessing={isVisionProcessing} performAIVisionBatchMatching={performAIVisionBatchMatching}
                    isVisionStopping={isVisionStopping} visionBatchProgress={visionBatchProgress} cancelVisionProcessing={cancelVisionProcessing}
                    visionError={visionError} visionGrid={visionGrid} visionCalcResults={visionCalcResults} visionCalculateError={visionCalculateError}
                    getSafeGrid={getSafeGrid} betInput={visionBetInput} setBetInput={handleVisionBetInputChange}
                    hasBetBox={hasBetBox} setHasBetBox={setHasBetBox}
                    onTransfer={handleTransferVisionToManual}
                    hasApiKey={hasApiKey}
                    totalBalance={totalBalance} setTotalBalance={setTotalBalance}
                    setTemplateMessage={setTemplateMessage}
                    isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded}
                />

            <Phase4Video
                    isPhase4Minimized={isPhase4Minimized} setIsPhase4Minimized={setIsPhase4Minimized}
                    videoSrc={videoSrc} videoRef={videoRef} handleVideoUpload={handleVideoUpload}
                    isAutoDetecting={isAutoDetecting} setIsAutoDetecting={setIsAutoDetecting}
                    sensitivity={sensitivity} setSensitivity={setSensitivity}
                    motionCoverageMin={motionCoverageMin} setMotionCoverageMin={setMotionCoverageMin}
                    motionDelay={motionDelay} setMotionDelay={setMotionDelay}
                    vLineThreshold={vLineThreshold} setVLineThreshold={setVLineThreshold}
                    capturedImages={capturedImages} removeCapturedImage={removeCapturedImage} clearAllCaptures={clearAllCaptures}
                    reelROI={reelROI} setReelROI={setReelROI}
                    winROI={winROI} setWinROI={setWinROI}
                    balanceROI={balanceROI} setBalanceROI={setBalanceROI}
                    captureCurrentFrame={captureCurrentFrame}
                    onTransferToPhase3={handleTransferPhase4ToPhase3}
                    setTemplateMessage={setTemplateMessage}
                    template={template}
                    debugData={debugData}
                />

            </div>

            {/* 確認 Modal */}
            {
                showPtModal && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-5 border-b flex items-center gap-2 bg-slate-50"><AlertCircle className="text-amber-500" /><h2 className="text-xl font-bold">AI 分析前確認事項</h2></div>
                            <div className="p-6 text-sm text-slate-700 space-y-4">
                                <ol className="list-decimal pl-5 space-y-2">
                                    <li>確認賠率圖<strong className="text-rose-600">預設BET為 1</strong>。</li>
                                    <li>AI 分析可能有誤，完成後請<strong className="text-indigo-600">人工比對表格</strong>並修正。<br /><span className="text-slate-500 text-xs mt-1 inline-block">【點開上傳圖片ICON可以方便人工比對表格】</span></li>
                                    <li>(可選) 手動擷取縮圖供動畫預覽使用。</li>
                                </ol>
                            </div>
                            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                                <button onClick={() => setShowPtModal(false)} className="px-4 py-2 text-slate-600">取消</button>
                                <button onClick={() => { setShowPtModal(false); handlePtExtract(); }} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md">確認並分析</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 新增：建構資料不足/錯誤 提示 Modal */}
            {
                buildErrorMsg && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="p-5 border-b flex items-center gap-2 bg-rose-50">
                                <AlertCircle className="text-rose-500" size={24} />
                                <h2 className="text-xl font-bold text-slate-800">資料不足或格式錯誤</h2>
                            </div>
                            <div className="p-6 text-slate-700 leading-relaxed font-medium">
                                {buildErrorMsg}
                            </div>
                            <div className="p-4 border-t bg-slate-50 flex justify-end">
                                <button onClick={() => setBuildErrorMsg('')} className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-md transition-colors">
                                    我知道了
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 擷取 Modal */}
            {
                ptCropState.active && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" style={{ zIndex: 99999 }}>
                        <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col border border-slate-700 h-[80vh]">
                            <div className="flex flex-col border-b border-slate-700 shrink-0">
                                <div className="flex items-center justify-between p-4">
                                    <h3 className="text-white font-bold flex items-center gap-2">
                                        手動擷取: <span className="text-indigo-400">{ptCropState.isDouble ? '雙重 ' : ''}{ptResultItems[ptCropState.itemIndex]?.name}</span>
                                    </h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => {
                                            const img = ptCropImageRef.current;
                                            const rect = img.getBoundingClientRect();
                                            const sX = img.naturalWidth / rect.width, sY = img.naturalHeight / rect.height;

                                            const startX = Math.min(ptCropState.startX, ptCropState.endX);
                                            const startY = Math.min(ptCropState.startY, ptCropState.endY);
                                            const cW = Math.abs(ptCropState.startX - ptCropState.endX) * sX;
                                            const cH = Math.abs(ptCropState.startY - ptCropState.endY) * sY;

                                            // 防呆：如果只有點一下沒有拖曳寬高，則不進行擷取
                                            if (cW <= 0 || cH <= 0) {
                                                setPtCropState(p => ({ ...p, active: false }));
                                                return;
                                            }

                                            const canvas = document.createElement('canvas');

                                            // 壓縮補強：限制最大尺寸並使用 JPEG 0.7
                                            const MAX_THUMB_SIZE = 128;
                                            let targetW = cW;
                                            let targetH = cH;
                                            if (cW > MAX_THUMB_SIZE || cH > MAX_THUMB_SIZE) {
                                                if (cW > cH) {
                                                    targetW = MAX_THUMB_SIZE;
                                                    targetH = (cH / cW) * MAX_THUMB_SIZE;
                                                } else {
                                                    targetH = MAX_THUMB_SIZE;
                                                    targetW = (cW / cH) * MAX_THUMB_SIZE;
                                                }
                                            }

                                            canvas.width = targetW;
                                            canvas.height = targetH;
                                            const ctx = canvas.getContext('2d');
                                            // 使用複寫方式繪製並縮放
                                            ctx.drawImage(img, startX * sX, startY * sY, cW, cH, 0, 0, targetW, targetH);

                                            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

                                            // 修改：將擷取到的圖片推入 thumbUrls 陣列中
                                            setPtResultItems(prev => {
                                                const arr = [...prev];
                                                const targetField = ptCropState.isDouble ? 'doubleThumbUrls' : 'thumbUrls';
                                                if (!arr[ptCropState.itemIndex][targetField]) {
                                                    arr[ptCropState.itemIndex][targetField] = [];
                                                }
                                                arr[ptCropState.itemIndex][targetField].push(compressedDataUrl);
                                                return arr;
                                            });
                                            setPtCropState(p => ({ ...p, active: false }));
                                        }} className="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white px-4 py-1.5 rounded font-bold shadow-md flex items-center gap-1">
                                            <Plus size={16} /> 增加特徵圖
                                        </button>
                                        <button onClick={() => setPtCropState(p => ({ ...p, active: false }))} className="text-slate-400 hover:text-white p-1 transition-colors ml-2"><X /></button>
                                    </div>
                                </div>

                                {/* 多圖切換區塊 */}
                                {ptImages.length > 1 && (
                                    <div className="flex gap-2 px-4 pb-3 overflow-x-auto custom-scrollbar">
                                        {ptImages.map((img, idx) => (
                                            <button
                                                key={img.id}
                                                onClick={() => setPtCropState(p => ({ ...p, selectedImageId: img.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false }))}
                                                className={`relative w-14 h-14 shrink-0 rounded-lg border-2 overflow-hidden transition-all ${ptCropState.selectedImageId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-slate-700 opacity-50 hover:opacity-100 hover:border-slate-500'}`}
                                                title={`切換至圖片 ${idx + 1}`}
                                            >
                                                <img src={img.previewUrl} className="w-full h-full object-cover" />
                                                <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 font-bold rounded-tl-md">{idx + 1}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 移除 items-center justify-center，改為在內層使用 m-auto，防止頂部被切斷 */}
                            <div className="flex-1 bg-black overflow-auto flex p-4">
                                <div className="relative inline-block m-auto shrink-0">
                                    <img
                                        ref={ptCropImageRef}
                                        src={ptImages.find(img => img.id === ptCropState.selectedImageId)?.previewUrl}
                                        draggable={false}
                                        className="max-h-[70vh] max-w-full block cursor-crosshair shadow-2xl"
                                        onMouseDown={(e) => {
                                            const r = e.target.getBoundingClientRect();
                                            setPtCropState(p => ({ ...p, startX: e.clientX - r.left, startY: e.clientY - r.top, endX: e.clientX - r.left, endY: e.clientY - r.top, isDragging: true }));
                                        }}
                                        onMouseMove={(e) => {
                                            if (!ptCropState.isDragging) return;
                                            const r = e.target.getBoundingClientRect();
                                            setPtCropState(p => ({ ...p, endX: e.clientX - r.left, endY: e.clientY - r.top }));
                                        }}
                                        onMouseUp={() => setPtCropState(p => ({ ...p, isDragging: false }))}
                                        onMouseLeave={() => setPtCropState(p => ({ ...p, isDragging: false }))}
                                    />
                                    {(ptCropState.isDragging || (Math.abs(ptCropState.startX - ptCropState.endX) > 0 && Math.abs(ptCropState.startY - ptCropState.endY) > 0)) && (
                                        <div className="absolute border-2 border-indigo-500 bg-indigo-500/30 pointer-events-none" style={{ left: Math.min(ptCropState.startX, ptCropState.endX), top: Math.min(ptCropState.startY, ptCropState.endY), width: Math.abs(ptCropState.startX - ptCropState.endX), height: Math.abs(ptCropState.startY - ptCropState.endY) }} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 放大檢視 (Lightbox) */}
            {
                ptEnlargedImg && (
                    <div
                        className="fixed flex flex-col bg-slate-900/95 backdrop-blur-md rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] border border-slate-700"
                        style={{ zIndex: 9999, left: `${lightboxState.x}px`, top: `${lightboxState.y}px`, width: `${lightboxState.w}px`, height: `${lightboxState.h}px` }}
                    >
                        <div className="flex justify-between items-center p-3 pb-2 cursor-move border-b border-slate-800 hover:bg-slate-800/50 rounded-t-xl transition-colors" onMouseDown={handleLbDragStart}>
                            <span className="text-white/80 text-sm font-bold flex items-center gap-1.5 select-none pointer-events-none"><ImageIcon size={16} className="text-indigo-400" /> 原圖預覽對照</span>
                            <button className="text-white/60 hover:text-white p-1 transition-colors hover:bg-rose-500 rounded-lg cursor-pointer z-[101]" onClick={(e) => { e.stopPropagation(); setPtEnlargedImg(null); }} onMouseDown={e => e.stopPropagation()}><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-hidden flex items-center justify-center p-2 relative bg-black/40">
                            <img src={ptEnlargedImg} alt="Enlarged" className="max-w-full max-h-full object-contain drop-shadow-md pointer-events-none select-none" draggable={false} />
                        </div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex justify-end items-end p-2 text-slate-500 hover:text-indigo-400" onMouseDown={handleLbResizeStart} title="拖曳以縮放視窗">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 24 24 24 24 16"></polyline><line x1="14" y1="14" x2="24" y2="24"></line></svg>
                        </div>
                    </div>
                )
            }

            <CloudModal
                show={showCloudModal}
                onClose={() => setShowCloudModal(false)}
                cloudTemplates={cloudTemplates}
                isLoadingCloud={isLoadingCloud}
                isBackgroundSyncing={isBackgroundSyncing}
                downloadingId={downloadingId}
                deletingId={deletingId}
                localUserId={localUserId}
                onForceRefresh={handleForceRefreshCloud}
                onLoadTemplate={loadCloudTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                setDeletingId={setDeletingId}
                currentPlatformName={platformName}
            />

            {/* 覆蓋確認 Modal */}
            {showOverwriteConfirm && pendingOverwriteData && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Cloud size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">偵測到重複模板</h3>
                            <p className="text-slate-500 mb-6">
                                雲端已存在 <span className="font-bold text-indigo-600">[{platformName} - {gameName}]</span> 的模板資料。<br />
                                您要覆蓋既有模板，還是另存為新模板？
                            </p>
                            <div className="space-y-3">
                                <button
                                    onClick={() => handleSaveToCloud(pendingOverwriteData.existing.id)}
                                    disabled={isSaving}
                                    className={`w-full py-3 text-white font-bold rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 ${isSaving ? 'bg-indigo-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
                                >
                                    {isSaving && activeSaveAction === pendingOverwriteData.existing.id ? <Loader2 className="animate-spin" size={20} /> : null}
                                    {isSaving && activeSaveAction === pendingOverwriteData.existing.id ? '處理中...' : '覆蓋更新 (取代舊有)'}
                                </button>
                                <button
                                    onClick={() => handleSaveToCloud('FORCE_NEW')}
                                    disabled={isSaving}
                                    className={`w-full py-3 font-bold rounded-xl border transition-colors flex items-center justify-center gap-2 ${isSaving ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {isSaving && activeSaveAction === 'FORCE_NEW' ? <Loader2 className="animate-spin" size={20} /> : null}
                                    {isSaving && activeSaveAction === 'FORCE_NEW' ? '另存中...' : '另存為新模板'}
                                </button>
                                <button
                                    onClick={() => setShowOverwriteConfirm(false)}
                                    disabled={isSaving}
                                    className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SettingsModal
                show={showSettingsModal}
                customApiKey={customApiKey}
                setCustomApiKey={setCustomApiKey}
                onClose={() => setShowSettingsModal(false)}
                onSave={() => {
                    localStorage.setItem('gemini_api_key', customApiKey);
                    setShowSettingsModal(false);
                    setTemplateMessage('✅ 設定已安全儲存至您的瀏覽器！');
                    setTimeout(() => setTemplateMessage(''), 3000);
                }}
            />
        </div>
    );
}

export default App;

