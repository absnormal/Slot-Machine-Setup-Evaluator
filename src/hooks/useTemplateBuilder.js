import { useState, useCallback, useEffect, useRef } from 'react';
import { parseBool } from '../utils/helpers';
import { isCashSymbol, isCollectSymbol, isWildSymbol } from '../utils/symbolUtils';
import { useCanvasLineExtractor } from './useCanvasLineExtractor';
import { usePaytableProcessor } from './usePaytableProcessor';

const defaultPaytable = "";
const defaultJpConfig = { "MINI": "", "MINOR": "", "MAJOR": "", "GRAND": "" };

/**
 * Phase 1 模板建構核心 Hook（組合版）
 * 組合 useCanvasLineExtractor + usePaytableProcessor，
 * 本身只保留：config state、build 邏輯、reset 邏輯
 */
export function useTemplateBuilder({
    customApiKey,
    apiKey,
    setTemplateMessage,
    setIsPhase2Minimized,
    setIsPhase3Minimized,
    setIsTemplateMinimized,
    isTemplateMinimized,
    linesMode,
}) {
    // === Basic Template State ===
    const [lineMode, setLineMode] = useState('paylines');
    const [linesTextInput, setLinesTextInput] = useState('');
    const [paytableMode, setPaytableMode] = useState('image');
    const [paytableInput, setPaytableInput] = useState(defaultPaytable);

    // Core Output Template
    const [template, setTemplate] = useState(null);
    const [templateError, setTemplateError] = useState('');
    const [buildErrorMsg, setBuildErrorMsg] = useState('');

    // Config State
    const [jpConfig, setJpConfig] = useState(defaultJpConfig);
    const [hasJackpot, setHasJackpot] = useState(false);
    const [hasMultiplierReel, setHasMultiplierReel] = useState(false);
    const [requiresCollectToWin, setRequiresCollectToWin] = useState(true);
    const [hasCashCollectFeature, setHasCashCollectFeature] = useState(false);
    const [hasDoubleSymbol, setHasDoubleSymbol] = useState(false);
    const [hasDynamicMultiplier, setHasDynamicMultiplier] = useState(false);
    const [multiplierCalcType, setMultiplierCalcType] = useState('sum');
    const [hasBidirectionalPaylines, setHasBidirectionalPaylines] = useState(false);
    const [hasAdjustableLines, setHasAdjustableLines] = useState(false);
    const prevHasDoubleSymbol = useRef(hasDoubleSymbol);

    // Grid dimensions
    const [patternRows, setPatternRows] = useState(6);
    const [patternCols, setPatternCols] = useState(5);
    const [gridRows, setGridRows] = useState(3);
    const [gridCols, setGridCols] = useState(5);
    const [threshold, setThreshold] = useState(100);
    const [startIndex, setStartIndex] = useState(1);
    const [extractResults, setExtractResults] = useState([]);
    const [linesTabMode, setLinesTabMode] = useState('image');

    // === Sub-Hook: Canvas Line Extractor ===
    const canvasExtractor = useCanvasLineExtractor({
        gridRows, gridCols, patternRows, patternCols, startIndex,
        isTemplateMinimized, linesTabMode,
        setExtractResults, setTemplateError, setTemplateMessage,
    });

    // === Sub-Hook: Paytable Processor ===
    const paytableProcessor = usePaytableProcessor({
        customApiKey, apiKey, hasDoubleSymbol,
        setTemplateMessage, setTemplateError,
    });

    // Auto-reformat paytable input when doubling is toggled
    useEffect(() => {
        if (prevHasDoubleSymbol.current !== hasDoubleSymbol) {
            paytableProcessor.setPtResultItems(prev => {
                const formattedLines = prev.map(item => {
                    const base = `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`;
                    if (hasDoubleSymbol) {
                        return `${base} ${item.match6 || 0} ${item.match7 || 0} ${item.match8 || 0} ${item.match9 || 0} ${item.match10 || 0}`;
                    }
                    return base;
                });
                setPaytableInput(formattedLines.join('\n'));
                return prev;
            });
            prevHasDoubleSymbol.current = hasDoubleSymbol;
        }
    }, [hasDoubleSymbol]);

    // ═══════════════════════════════════════════════════════════
    // 共用建構核心（消除 performAutoBuild / handleBuildTemplate 重複）
    // ═══════════════════════════════════════════════════════════

    /**
     * 模板建構核心函數（純邏輯，無副作用）
     * @param {Object} p - 統一化的參數物件
     * @param {boolean} p.validateStrict - true=手動建構（嚴格驗證），false=匯入建構（寬容）
     * @returns {import('../types').SlotTemplate}
     */
    const buildTemplateCore = (p) => {
        const {
            lineMode: lm, extractResults: er, paytableInput: ptInput, ptResultItems: ptItems,
            gridRows: rows, gridCols: cols, gameName,
            jpConfig: jp, hasJackpot: hasJP,
            hasMultiplierReel: hasMR, requiresCollectToWin: reqCollect,
            hasDoubleSymbol: hasDS, hasDynamicMultiplier: hasDM,
            multiplierCalcType: mCalcType,
            hasBidirectionalPaylines: hasBDP, hasAdjustableLines: hasAL,
            validateStrict = false
        } = p;

        // ── 1. Lines 解析 ──
        if (validateStrict && lm === 'paylines') {
            if (!er || er.length === 0) {
                throw new Error('請先設定「線獎資料」（可透過純文字輸入、圖片提取，或從雲端模板庫載入）。');
            }
            const hasMissingData = er.some(res => res.data.includes(0));
            if (hasMissingData) {
                throw new Error('線獎資料中包含 0 (未辨識到線段的格子)。請嘗試調整圖片提取框，或切換至純文字模式手動修正。');
            }
            const isOutOfBounds = er.some(res => res.data.some(r => r < 1 || r > rows));
            if (isOutOfBounds) {
                throw new Error(`「線獎資料」中包含了無效的列數 (必須介於 1 到 ${rows} 之間)。請修正您的純文字內容。`);
            }
        }

        const lines = {};
        if (lm === 'paylines') {
            (er || []).forEach(r => { lines[r.id] = r.data; });
        }

        // ── 2. Paytable 解析 ──
        const ptLines = (ptInput || '').trim().split('\n').map(l => l.trim()).filter(l => l);
        if (validateStrict && ptLines.length === 0) {
            throw new Error('「賠付表資料」不能為空，請先設定賠率。');
        }

        const paytable = {};
        ptLines.forEach((line, index) => {
            const parts = line.split(/\s+/);
            if (validateStrict && parts.length < 2) {
                throw new Error(`賠付表第 ${index + 1} 行格式錯誤：資料不足`);
            }
            if (parts.length >= 2) {
                const symbol = parts[0];
                const pays = parts.slice(1).map(Number);
                if (validateStrict && pays.some(isNaN)) {
                    throw new Error(`賠付表第 ${index + 1} 行 (${symbol}) 格式錯誤：賠率必須為數字`);
                }
                paytable[symbol] = pays;
            }
        });

        // ── 3. 特殊符號注入（xN / JP / WILD）──
        const maxCols = Math.max(...Object.values(paytable).map(p2 => p2.length), 5);
        const zeroPays = Array(maxCols).fill(0);

        if (hasDM) {
            if (!paytable['xN']) paytable['xN'] = [...zeroPays];
            const existingKeys = Object.keys(paytable);
            existingKeys.forEach(sym => {
                const isSpecial = sym.toUpperCase().includes('SCATTER') || sym.toUpperCase().includes('COLLECT') ||
                                  Object.keys(jp).includes(sym.toUpperCase()) ||
                                  sym.toUpperCase().startsWith('CASH_');
                if (sym !== 'xN' && !sym.endsWith('_xN') && !isSpecial) {
                    const xnName = `${sym}_xN`;
                    if (!paytable[xnName]) {
                        paytable[xnName] = [...paytable[sym]];
                    }
                }
            });
        }
        if (hasJP || Object.values(jp).some(v => v !== '')) {
            Object.keys(jp).forEach(jpKey => {
                if (jpKey.trim() !== '' && jp[jpKey] !== '' && !paytable[jpKey.toUpperCase()]) {
                    paytable[jpKey.toUpperCase()] = [...zeroPays];
                }
            });
        }
        if (!Object.keys(paytable).some(k => isWildSymbol(k))) {
            paytable['WILD'] = [...zeroPays];
        }

        // ── 4. symbolImages 收集 ──
        const symbolImages = {};
        const symbolImagesAll = {};
        (ptItems || []).forEach(item => {
            if (item.thumbUrls && item.thumbUrls.length > 0) {
                symbolImages[item.name] = item.thumbUrls[0];
                symbolImagesAll[item.name] = item.thumbUrls;
            } else if (item.thumbUrl) {
                symbolImages[item.name] = item.thumbUrl;
                symbolImagesAll[item.name] = [item.thumbUrl];
            }
            if (hasDS) {
                const doubleName = `${item.name}_double`;
                if (item.doubleThumbUrls && item.doubleThumbUrls.length > 0) {
                    symbolImages[doubleName] = item.doubleThumbUrls[0];
                    symbolImagesAll[doubleName] = item.doubleThumbUrls;
                }
            }
        });

        // ── 5. tpl 物件組裝 ──
        const finalCols = hasMR ? cols + 1 : cols;
        return {
            name: gameName || '',
            rows,
            cols: finalCols,
            lineMode: lm,
            linesCount: lm === 'allways' ? Math.pow(rows, cols) : (er?.length || 0),
            lines,
            paytable,
            symbolImages,
            symbolImagesAll,
            jpConfig: hasJP ? Object.fromEntries(Object.entries(jp).filter(([_, v]) => v !== '')) : { ...defaultJpConfig, ...jp },
            hasMultiplierReel: hasMR,
            requiresCollectToWin: reqCollect,
            hasDoubleSymbol: hasDS,
            hasDynamicMultiplier: hasDM,
            multiplierCalcType: mCalcType,
            hasBidirectionalPaylines: hasBDP,
            hasAdjustableLines: hasAL
        };
    };

    // === performAutoBuild：從匯入的 data 建構（寬容模式）===
    const performAutoBuild = useCallback((data) => {
        try {
            const tpl = buildTemplateCore({
                lineMode: data.lineMode || (!data.extractResults || data.extractResults.length === 0 ? 'allways' : 'paylines'),
                extractResults: data.extractResults,
                paytableInput: data.paytableInput,
                ptResultItems: data.ptResultItems || [],
                gridRows: data.gridRows || gridRows,
                gridCols: data.gridCols || gridCols,
                gameName: data.gameName || data.name || '',
                jpConfig: data.jpConfig || jpConfig || defaultJpConfig,
                hasJackpot: data.hasJackpot || Object.values(data.jpConfig || {}).some(v => v !== ''),
                hasMultiplierReel: data.hasMultiplierReel || false,
                requiresCollectToWin: data.requiresCollectToWin !== undefined ? data.requiresCollectToWin : true,
                hasDoubleSymbol: data.hasDoubleSymbol || false,
                hasDynamicMultiplier: data.hasDynamicMultiplier || false,
                multiplierCalcType: data.multiplierCalcType || 'product',
                hasBidirectionalPaylines: data.hasBidirectionalPaylines || false,
                hasAdjustableLines: false, // Q6 可調線數：載入時一律預設「無」
                validateStrict: false
            });

            setTemplate(tpl);

            // 同步 UI state（讓下次手動 build 也能用到匯入的設定）
            setHasMultiplierReel(parseBool(data.hasMultiplierReel || false));
            setRequiresCollectToWin(parseBool(data.requiresCollectToWin !== undefined ? data.requiresCollectToWin : true));
            setHasDoubleSymbol(parseBool(data.hasDoubleSymbol || false));
            setHasDynamicMultiplier(parseBool(data.hasDynamicMultiplier || false));
            setMultiplierCalcType(data.multiplierCalcType || 'product');
            setHasBidirectionalPaylines(parseBool(data.hasBidirectionalPaylines || false));
            setHasAdjustableLines(false); // Q6 載入時一律預設「無」

            if (setIsPhase2Minimized) setIsPhase2Minimized(false);
            if (setIsPhase3Minimized) setIsPhase3Minimized(true);
            if (setIsTemplateMinimized) setIsTemplateMinimized(true);

            setTemplateError('');
            setBuildErrorMsg('');
            return tpl;
        } catch (err) {
            console.warn("Auto build failed", err);
            setTemplateError('自動建構失敗：' + err.message);
            return null;
        }
    }, [gridRows, gridCols, jpConfig, setIsPhase2Minimized, setIsPhase3Minimized, setIsTemplateMinimized]);

    // === handleBuildTemplate：從 UI state 建構（嚴格驗證模式）===
    const handleBuildTemplate = () => {
        setTemplateError('');
        setBuildErrorMsg('');
        try {
            const tpl = buildTemplateCore({
                lineMode,
                extractResults,
                paytableInput,
                ptResultItems: paytableProcessor.ptResultItems,
                gridRows,
                gridCols,
                gameName: '',
                jpConfig,
                hasJackpot,
                hasMultiplierReel,
                requiresCollectToWin,
                hasDoubleSymbol,
                hasDynamicMultiplier,
                multiplierCalcType,
                hasBidirectionalPaylines,
                hasAdjustableLines,
                validateStrict: true
            });

            setTemplate(tpl);

            if (setIsPhase2Minimized) setIsPhase2Minimized(false);
            if (setIsPhase3Minimized) setIsPhase3Minimized(true);
            if (setIsTemplateMinimized) setIsTemplateMinimized(true);
            return tpl;
        } catch (err) {
            setTemplateError(err.message);
            setBuildErrorMsg(err.message);
            setTemplate(null);
            return null;
        }
    };

    // === Reset ===
    const resetTemplateBuilder = useCallback(() => {
        setLineMode('paylines');
        setLinesTextInput('');
        setPaytableMode('image');
        setPaytableInput(defaultPaytable);
        setTemplate(null);
        setTemplateError('');
        setBuildErrorMsg('');
        setJpConfig(defaultJpConfig);
        setHasJackpot(false);
        setHasMultiplierReel(false);
        setRequiresCollectToWin(true);
        setHasDoubleSymbol(false);
        setHasDynamicMultiplier(false);
        setMultiplierCalcType('product');
        setHasBidirectionalPaylines(false);
        setHasAdjustableLines(false);
        setPatternRows(6);
        setPatternCols(5);
        setGridRows(3);
        setGridCols(5);
        setThreshold(100);
        setStartIndex(1);
        setExtractResults([]);
        setLinesTabMode('image');

        // Reset sub-hooks
        canvasExtractor.setLineImages([]);
        canvasExtractor.setActiveLineImageId(null);
        canvasExtractor.setP1({ x: 8, y: 2, w: 16, h: 8 });
        canvasExtractor.setPEnd({ x: 82, y: 90, w: 16, h: 8 });

        paytableProcessor.setPtImages([]);
        paytableProcessor.setIsPtProcessing(false);
        paytableProcessor.setPtResultItems([]);
        paytableProcessor.setPtCropState({ active: false, itemIndex: null, selectedImageId: null, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false });
        paytableProcessor.setPtEnlargedImg(null);

        if (setTemplateMessage) setTemplateMessage('✅ 已清除當前所有模板設定');
        if (setTemplateMessage) setTimeout(() => setTemplateMessage(''), 3000);
    }, [setTemplateMessage]);

    // === Wrapper functions that bind setPaytableInput ===
    const wrappedHandlePaytableTextChange = (newText) => paytableProcessor.handlePaytableTextChange(newText, setPaytableInput);
    const wrappedHandlePtTableChange = (index, field, value) => paytableProcessor.handlePtTableChange(index, field, value, setPaytableInput);
    const wrappedHandlePtTableDelete = (index) => paytableProcessor.handlePtTableDelete(index, setPaytableInput);
    const wrappedHandleAddPtRow = () => paytableProcessor.handleAddPtRow(setPaytableInput);
    const wrappedHandlePtExtract = () => paytableProcessor.handlePtExtract(setPaytableInput);

    // === Return: 對外介面保持不變 ===
    return {
        // Config state
        lineMode, setLineMode,
        linesTextInput, setLinesTextInput,
        paytableMode, setPaytableMode,
        paytableInput, setPaytableInput,
        template, setTemplate,
        templateError, setTemplateError,
        buildErrorMsg, setBuildErrorMsg,
        multiplierCalcType, setMultiplierCalcType,
        jpConfig, setJpConfig,
        hasJackpot, setHasJackpot,
        hasMultiplierReel, setHasMultiplierReel,
        requiresCollectToWin, setRequiresCollectToWin,
        hasCashCollectFeature, setHasCashCollectFeature,
        hasDoubleSymbol, setHasDoubleSymbol,
        hasDynamicMultiplier, setHasDynamicMultiplier,
        hasBidirectionalPaylines, setHasBidirectionalPaylines,
        hasAdjustableLines, setHasAdjustableLines,

        // Grid dimensions
        patternRows, setPatternRows,
        patternCols, setPatternCols,
        gridRows, setGridRows,
        gridCols, setGridCols,
        threshold, setThreshold,
        startIndex, setStartIndex,
        extractResults, setExtractResults,
        linesTabMode, setLinesTabMode,

        // Canvas extractor (forwarded)
        lineImages: canvasExtractor.lineImages, setLineImages: canvasExtractor.setLineImages,
        activeLineImageId: canvasExtractor.activeLineImageId, setActiveLineImageId: canvasExtractor.setActiveLineImageId,
        activeLineImage: canvasExtractor.activeLineImage,
        imageSrc: canvasExtractor.imageSrc,
        imageObj: canvasExtractor.imageObj,
        p1: canvasExtractor.p1, setP1: canvasExtractor.setP1,
        pEnd: canvasExtractor.pEnd, setPEnd: canvasExtractor.setPEnd,
        dragState: canvasExtractor.dragState, setDragState: canvasExtractor.setDragState,
        canvasRef: canvasExtractor.canvasRef, containerRef: canvasExtractor.containerRef,
        layoutStyle: canvasExtractor.layoutStyle, canvasSize: canvasExtractor.canvasSize,
        handleLineImageUpload: canvasExtractor.handleLineImageUpload,
        removeLineImage: canvasExtractor.removeLineImage,
        analyzeImage: canvasExtractor.analyzeImage,
        handleMouseDown: canvasExtractor.handleMouseDown,
        handleMouseMove: canvasExtractor.handleMouseMove,
        handleMouseUp: canvasExtractor.handleMouseUp,
        draw: canvasExtractor.draw,

        // Paytable processor (forwarded)
        ptImages: paytableProcessor.ptImages, setPtImages: paytableProcessor.setPtImages,
        isPtProcessing: paytableProcessor.isPtProcessing, setIsPtProcessing: paytableProcessor.setIsPtProcessing,
        ptResultItems: paytableProcessor.ptResultItems, setPtResultItems: paytableProcessor.setPtResultItems,
        ptCropState: paytableProcessor.ptCropState, setPtCropState: paytableProcessor.setPtCropState,
        ptEnlargedImg: paytableProcessor.ptEnlargedImg, setPtEnlargedImg: paytableProcessor.setPtEnlargedImg,
        ptCropImageRef: paytableProcessor.ptCropImageRef,
        handlePaytableTextChange: wrappedHandlePaytableTextChange,
        handlePtTableChange: wrappedHandlePtTableChange,
        handlePtTableDelete: wrappedHandlePtTableDelete,
        handleAddPtRow: wrappedHandleAddPtRow,
        handleRemoveThumb: paytableProcessor.handleRemoveThumb,
        handlePtFileChange: paytableProcessor.handlePtFileChange,
        handlePtDrop: paytableProcessor.handlePtDrop,
        processPtFiles: paytableProcessor.processPtFiles,
        removePtImage: paytableProcessor.removePtImage,
        clearPtAll: paytableProcessor.clearPtAll,
        handlePtExtract: wrappedHandlePtExtract,

        // Build
        performAutoBuild, handleBuildTemplate, resetTemplateBuilder
    };
}
