import { useState, useCallback } from 'react';
import { parseBool } from '../utils/helpers';
import { applyDefaults } from '../utils/templateDefaults';
import useAppStore from '../stores/useAppStore';
import usePhase4Store from '../stores/usePhase4Store';

const defaultJpConfig = { "MINI": "", "MINOR": "", "MAJOR": "", "GRAND": "" };

/**
 * 統一管理模板的匯入/匯出/載入/儲存邏輯
 * 消除 loadCloudTemplate 與 handleImportLocalTemplate 中 ~90% 重複的 setState 序列
 */
export function useTemplateIO({
    // Template builder state setters
    setGridRows, setGridCols, setLineMode, setExtractResults,
    setPaytableInput, setPtResultItems, setPaytableMode,
    setJpConfig, setHasJackpot, setHasMultiplierReel,
    setRequiresCollectToWin, setHasCashCollectFeature, setHasDoubleSymbol, setHasRollingWin,
    setHasDynamicMultiplier, setMultiplierCalcType,
    setHasBidirectionalPaylines,
    setHasAdjustableLines,
    setLineImages, setActiveLineImageId, setLinesTextInput,
    setTemplateError,
    performAutoBuild, resetTemplateBuilder,
    // Cloud hook
    useCloudInstance,
    // Local state
    platformName, gameName,
    gridRows, gridCols, lineMode, extractResults,
    paytableInput, ptResultItems, jpConfig,
    hasJackpot, hasMultiplierReel, requiresCollectToWin, hasCashCollectFeature,
    hasDoubleSymbol, hasRollingWin, hasDynamicMultiplier, multiplierCalcType,
    hasBidirectionalPaylines,
    hasAdjustableLines,
    // Phase 4 偵測參數（模板持久化）
    motionCoverageMin, vLineThreshold, ocrDecimalPlaces, balDecimalPlaces,
    setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces, setBalDecimalPlaces,
    setReelROI, setWinROI, setBalanceROI, setBetROI, setOrderIdROI, setMultiplierROI,
}) {
    const setTemplateMessage = useAppStore(s => s.setTemplateMessage);
    const setShowCloudModal = useAppStore(s => s.setShowCloudModal);

    const [platformNameState, setPlatformName] = useState('');
    const [gameNameState, setGameName] = useState('');
    const [templateName, setTemplateName] = useState('');

    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
    const [pendingOverwriteData, setPendingOverwriteData] = useState(null);
    const [activeSaveAction, setActiveSaveAction] = useState(null);

    const [localUserId] = useState(() => {
        let uid = localStorage.getItem('slot_local_uid');
        if (!uid) { uid = Math.random().toString(36).substring(2, 15); localStorage.setItem('slot_local_uid', uid); }
        return uid;
    });

    /**
     * 🔑 核心共用函數：把模板資料套用到所有 state
     * 統一 loadCloudTemplate + handleImportLocalTemplate 的重複邏輯
     */
    const applyTemplateData = useCallback((data, { source = 'local' } = {}) => {
        const d = applyDefaults(data);
        if (d.platformName !== undefined) setPlatformName(d.platformName);
        if (d.gameName !== undefined) setGameName(d.gameName);
        if (d.gridRows) setGridRows(d.gridRows);
        if (d.gridCols) setGridCols(d.gridCols);

        setLineMode(d.lineMode || (!d.extractResults || d.extractResults.length === 0 ? 'allways' : 'paylines'));

        if (d.extractResults) {
            setExtractResults(d.extractResults);
            // 本地匯入時同時同步文字模式
            if (source === 'local' && setLinesTextInput) {
                setLinesTextInput(d.extractResults.map(r => r.data.join(' ')).join('\n'));
            }
        }

        if (d.paytableInput) setPaytableInput(d.paytableInput);

        // JP Config
        if (d.jpConfig) {
            setJpConfig(d.jpConfig);
        } else {
            setJpConfig(defaultJpConfig);
        }

        // Boolean flags / Config
        setHasJackpot(parseBool(d.hasJackpot));
        setHasMultiplierReel(parseBool(d.hasMultiplierReel));
        setRequiresCollectToWin(parseBool(d.requiresCollectToWin));
        setHasCashCollectFeature(parseBool(d.hasCashCollectFeature));
        setHasDoubleSymbol(parseBool(d.hasDoubleSymbol));
        setHasDynamicMultiplier(parseBool(d.hasDynamicMultiplier));
        setMultiplierCalcType(d.multiplierCalcType);
        setHasBidirectionalPaylines(parseBool(d.hasBidirectionalPaylines));
        setHasAdjustableLines(parseBool(d.hasAdjustableLines));

        // Paytable result items
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

        // Clear line images
        setLineImages([]);
        setActiveLineImageId(null);

        if (d.motionCoverageMin !== undefined) setMotionCoverageMin(d.motionCoverageMin);
        if (d.vLineThreshold !== undefined) setVLineThreshold(parseFloat(d.vLineThreshold));
        if (d.ocrDecimalPlaces !== undefined) setOcrDecimalPlaces(parseInt(d.ocrDecimalPlaces, 10));
        if (d.balDecimalPlaces !== undefined) setBalDecimalPlaces(parseInt(d.balDecimalPlaces, 10));

        // Phase 4 ROI 還原
        if (d.phase4ROIs) {
            const roiSetters = {
                reelROI: setReelROI, winROI: setWinROI, balanceROI: setBalanceROI,
                betROI: setBetROI, orderIdROI: setOrderIdROI, multiplierROI: setMultiplierROI
            };
            for (const [key, setter] of Object.entries(roiSetters)) {
                if (d.phase4ROIs[key] && setter) setter(d.phase4ROIs[key]);
            }
        }
    }, [setGridRows, setGridCols, setLineMode, setExtractResults, setPaytableInput, setPtResultItems,
        setPaytableMode, setJpConfig, setHasJackpot, setHasMultiplierReel, setRequiresCollectToWin,
        setHasCashCollectFeature, setHasDoubleSymbol, setHasRollingWin, setHasDynamicMultiplier, setMultiplierCalcType,
        setHasBidirectionalPaylines, setHasAdjustableLines, setLineImages,
        setActiveLineImageId, setLinesTextInput, setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces, setBalDecimalPlaces,
        setReelROI, setWinROI, setBalanceROI, setBetROI, setOrderIdROI, setMultiplierROI]);

    /**
     * 從雲端載入模板
     */
    const loadCloudTemplate = useCallback(async (templateMeta) => {
        try {
            const data = await useCloudInstance.getTemplateData(templateMeta.id);
            applyTemplateData(data, { source: 'cloud' });
            setShowCloudModal(false);
            setTemplateMessage('☁️ 雲端模板載入成功！已自動為您建構並進入結算畫面。');
            setTimeout(() => setTemplateMessage(''), 4000);
            performAutoBuild(data);
        } catch (err) {
            // Error mapped to cloudError automatically
        }
    }, [applyTemplateData, useCloudInstance, setShowCloudModal, setTemplateMessage, performAutoBuild]);



    /**
     * 清除模板
     */
    const handleClearTemplate = useCallback(() => {
        if (!window.confirm('確定要清除當前所有模板設定與提取結果嗎？')) return;
        setPlatformName('');
        setGameName('');
        setTemplateName('');
        resetTemplateBuilder();
    }, [resetTemplateBuilder]);

    /**
     * 儲存模板至雲端
     */
    const handleSaveToCloud = useCallback(async (forceOverwriteId = null) => {
        const isEvent = forceOverwriteId && typeof forceOverwriteId === 'object' && forceOverwriteId.nativeEvent;
        const actualForceId = isEvent ? null : forceOverwriteId;

        setActiveSaveAction(actualForceId || 'initial');
        const generatedName = [platformNameState, gameNameState].filter(Boolean).join('-');

        const result = await useCloudInstance.saveTemplateToCloud({
            templateName, generatedName,
            platformName: platformNameState, gameName: gameNameState,
            gridRows, gridCols, lineMode, extractResults,
            paytableInput, ptResultItems, jpConfig,
            hasJackpot, hasMultiplierReel, requiresCollectToWin, hasCashCollectFeature,
            hasDoubleSymbol, hasRollingWin, hasDynamicMultiplier, multiplierCalcType,
            hasBidirectionalPaylines, hasAdjustableLines,
            localUserId, actualForceId,
            motionCoverageMin, vLineThreshold, ocrDecimalPlaces, balDecimalPlaces,
            phase4ROIs: usePhase4Store.getState().getRois()
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
    }, [platformNameState, gameNameState, templateName, gridRows, gridCols, lineMode, extractResults,
        paytableInput, ptResultItems, jpConfig, hasJackpot, hasMultiplierReel, requiresCollectToWin, hasCashCollectFeature,
        hasDoubleSymbol, hasRollingWin, hasDynamicMultiplier, multiplierCalcType, hasBidirectionalPaylines, hasAdjustableLines, localUserId,
        motionCoverageMin, vLineThreshold, ocrDecimalPlaces, balDecimalPlaces,
        useCloudInstance, setTemplateError, showOverwriteConfirm]);

    const defaultSaveName = [platformNameState, gameNameState].filter(Boolean).join('-') || `模板 ${gridRows}x${gridCols}`;

    return {
        // Platform/Game name
        platformName: platformNameState, setPlatformName,
        gameName: gameNameState, setGameName,
        templateName, setTemplateName,
        defaultSaveName,
        localUserId,

        // Template IO actions
        loadCloudTemplate,
        handleClearTemplate,
        handleSaveToCloud,

        // Overwrite confirm state
        showOverwriteConfirm, setShowOverwriteConfirm,
        pendingOverwriteData, setPendingOverwriteData,
        activeSaveAction,
    };
}
