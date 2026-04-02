import { useState, useCallback } from 'react';
import { parseBool } from '../utils/helpers';
import useAppStore from '../stores/useAppStore';

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
    setRequiresCollectToWin, setHasDoubleSymbol,
    setHasDynamicMultiplier, setMultiplierCalcType,
    setLineImages, setActiveLineImageId, setLinesTextInput,
    setTemplateError,
    performAutoBuild, resetTemplateBuilder,
    // Cloud hook
    useCloudInstance,
    // Local state
    platformName, gameName,
    gridRows, gridCols, lineMode, extractResults,
    paytableInput, ptResultItems, jpConfig,
    hasJackpot, hasMultiplierReel, requiresCollectToWin,
    hasDoubleSymbol, hasDynamicMultiplier, multiplierCalcType,
    // Phase 4 偵測參數（模板持久化）
    motionCoverageMin, vLineThreshold, ocrDecimalPlaces,
    setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces,
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
        if (data.platformName !== undefined) setPlatformName(data.platformName);
        if (data.gameName !== undefined) setGameName(data.gameName);
        if (data.gridRows) setGridRows(data.gridRows);
        if (data.gridCols) setGridCols(data.gridCols);

        setLineMode(data.lineMode || (!data.extractResults || data.extractResults.length === 0 ? 'allways' : 'paylines'));

        if (data.extractResults) {
            setExtractResults(data.extractResults);
            // 本地匯入時同時同步文字模式
            if (source === 'local' && setLinesTextInput) {
                setLinesTextInput(data.extractResults.map(r => r.data.join(' ')).join('\n'));
            }
        }

        if (data.paytableInput) setPaytableInput(data.paytableInput);

        // JP Config
        if (data.jpConfig) {
            setJpConfig(data.jpConfig);
            setHasJackpot(Object.keys(data.jpConfig).some(k => data.jpConfig[k] !== ''));
        } else {
            setJpConfig(defaultJpConfig);
            setHasJackpot(false);
        }

        // Boolean flags
        if (data.hasMultiplierReel !== undefined) setHasMultiplierReel(parseBool(data.hasMultiplierReel));
        else setHasMultiplierReel(false);

        if (data.requiresCollectToWin !== undefined) setRequiresCollectToWin(parseBool(data.requiresCollectToWin));
        else setRequiresCollectToWin(true);

        if (data.hasDoubleSymbol !== undefined) setHasDoubleSymbol(parseBool(data.hasDoubleSymbol));
        else setHasDoubleSymbol(false);

        if (data.hasDynamicMultiplier !== undefined) setHasDynamicMultiplier(parseBool(data.hasDynamicMultiplier));
        else setHasDynamicMultiplier(false);

        if (data.multiplierCalcType !== undefined) setMultiplierCalcType(data.multiplierCalcType);
        else setMultiplierCalcType('product');

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

        // Phase 4 偵測參數（向後兼容：舊模板無此欄位則保持預設）
        if (data.motionCoverageMin !== undefined) setMotionCoverageMin(data.motionCoverageMin);
        if (data.vLineThreshold !== undefined) setVLineThreshold(parseFloat(data.vLineThreshold));
        if (data.ocrDecimalPlaces !== undefined) setOcrDecimalPlaces(parseInt(data.ocrDecimalPlaces, 10));
    }, [setGridRows, setGridCols, setLineMode, setExtractResults, setPaytableInput, setPtResultItems,
        setPaytableMode, setJpConfig, setHasJackpot, setHasMultiplierReel, setRequiresCollectToWin,
        setHasDoubleSymbol, setHasDynamicMultiplier, setMultiplierCalcType, setLineImages,
        setActiveLineImageId, setLinesTextInput, setMotionCoverageMin, setVLineThreshold, setOcrDecimalPlaces]);

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
     * 從本地 JSON 匯入模板
     */
    const handleImportLocalTemplate = useCallback((e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                applyTemplateData(data, { source: 'local' });
                setTemplateMessage('✅ 本地模板載入成功！已自動為您建構並進入結算畫面。');
                setTimeout(() => setTemplateMessage(''), 4000);
                performAutoBuild(data);
            } catch (err) {
                setTemplateError("匯入失敗：檔案格式錯誤，請確定是有效的 JSON 模板檔案。");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [applyTemplateData, setTemplateMessage, setTemplateError, performAutoBuild]);

    /**
     * 匯出本地 JSON 模板
     */
    const handleExportLocalTemplate = useCallback(() => {
        setTemplateMessage('');
        if (extractResults.length === 0 && !paytableInput) {
            setTemplateError('沒有可匯出的資料！');
            return;
        }

        const data = {
            version: "1.2",
            platformName: platformNameState,
            gameName: gameNameState,
            gridRows, gridCols, extractResults,
            paytableInput, ptResultItems,
            jpConfig, hasMultiplierReel, requiresCollectToWin,
            hasDoubleSymbol, hasDynamicMultiplier, multiplierCalcType,
            motionCoverageMin, vLineThreshold, ocrDecimalPlaces
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const prefix = [platformNameState, gameNameState].filter(Boolean).join('-');
        const safePrefix = prefix.replace(/[\/\\:*?"<>|]/g, '_');
        a.download = safePrefix ? `${safePrefix}.json` : `slot_template_${gridRows}x${gridCols}_${extractResults.length}lines.json`;

        a.click();
        URL.revokeObjectURL(url);
        setTemplateError('');
        setTemplateMessage('✅ 本地模板已成功下載！');
        setTimeout(() => setTemplateMessage(''), 3000);
    }, [platformNameState, gameNameState, gridRows, gridCols, extractResults, paytableInput, ptResultItems,
        jpConfig, hasMultiplierReel, requiresCollectToWin, hasDoubleSymbol, hasDynamicMultiplier,
        multiplierCalcType, motionCoverageMin, vLineThreshold, ocrDecimalPlaces, setTemplateMessage, setTemplateError]);

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
            hasJackpot, hasMultiplierReel, requiresCollectToWin,
            hasDoubleSymbol, hasDynamicMultiplier, multiplierCalcType,
            localUserId, actualForceId,
            motionCoverageMin, vLineThreshold, ocrDecimalPlaces
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
        paytableInput, ptResultItems, jpConfig, hasJackpot, hasMultiplierReel, requiresCollectToWin,
        hasDoubleSymbol, hasDynamicMultiplier, multiplierCalcType, localUserId,
        motionCoverageMin, vLineThreshold, ocrDecimalPlaces,
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
        handleImportLocalTemplate,
        handleExportLocalTemplate,
        handleClearTemplate,
        handleSaveToCloud,

        // Overwrite confirm state
        showOverwriteConfirm, setShowOverwriteConfirm,
        pendingOverwriteData, setPendingOverwriteData,
        activeSaveAction,
    };
}
