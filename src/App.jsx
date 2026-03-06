import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Settings, AlertCircle, CheckCircle2, Trophy, Coins, ChevronDown, ChevronUp, Image as ImageIcon, Upload, Cloud, Download, X, Trash2, FileText, ImagePlus, Copy, Loader2, Crop, LayoutList, MousePointer2, LayoutGrid, Save, FolderOpen, RefreshCw, Plus, Paintbrush, Keyboard, Zap, Key, Database, BrainCircuit, ListChecks } from 'lucide-react';

// === 模組匯入 ===
import { GAS_URL, apiKey } from './utils/constants';
import { toPx, toPct, fetchWithRetry, ptFileToBase64, resizeImageBase64 } from './utils/helpers';
import { isScatterSymbol, isCollectSymbol, isWildSymbol, isCashSymbol, isJpSymbol, getCashValue, getBaseSymbol } from './utils/symbolUtils';
import { computeGridResults } from './engine/computeGridResults';
import { useLightbox } from './hooks/useLightbox';
import { useCanvasDrag } from './hooks/useCanvasDrag';
import AppHeader from './components/AppHeader';
import ToastMessage from './components/ToastMessage';
import SettingsModal from './components/SettingsModal';
import CloudModal from './components/CloudModal';
import ResultView from './components/ResultView';

function App() {
    // --- 預設資料清空 ---
    const defaultPaytable = "";
    const defaultPanelGrid = Array.from({ length: 3 }, () => Array(5).fill(''));
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
    const [linesTextInput, setLinesTextInput] = useState('');

    const [paytableMode, setPaytableMode] = useState('image');
    const [paytableInput, setPaytableInput] = useState(defaultPaytable);
    const [template, setTemplate] = useState(null);
    const [templateError, setTemplateError] = useState('');
    const [buildErrorMsg, setBuildErrorMsg] = useState('');
    const [jpConfig, setJpConfig] = useState(defaultJpConfig);

    const [isTemplateMinimized, setIsTemplateMinimized] = useState(false);
    const [isPhase2Minimized, setIsPhase2Minimized] = useState(true);
    const [isPhase3Minimized, setIsPhase3Minimized] = useState(true);

    // 1-1. 盤面連線影像辨識狀態
    const [lineImages, setLineImages] = useState([]);
    const [activeLineImageId, setActiveLineImageId] = useState(null);

    const activeLineImage = lineImages.find(img => img.id === activeLineImageId);
    const imageSrc = activeLineImage?.previewUrl || null;
    const imageObj = activeLineImage?.obj || null;

    const [patternRows, setPatternRows] = useState(6);
    const [patternCols, setPatternCols] = useState(5);
    const [gridRows, setGridRows] = useState(3);
    const [gridCols, setGridCols] = useState(5);
    const [threshold, setThreshold] = useState(100);
    const [startIndex, setStartIndex] = useState(1);
    const [p1, setP1] = useState({ x: 8, y: 2, w: 16, h: 8 });
    const [pEnd, setPEnd] = useState({ x: 82, y: 90, w: 16, h: 8 });
    const [extractResults, setExtractResults] = useState([]);
    const [dragState, setDragState] = useState(null);

    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [layoutStyle, setLayoutStyle] = useState({ leftHeight: '400px', wrapperHeight: 'auto' });
    const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });

    // 1-2. 賠率表 AI 影像辨識狀態
    const [ptImages, setPtImages] = useState([]);
    const [isPtProcessing, setIsPtProcessing] = useState(false);
    const [ptResultItems, setPtResultItems] = useState([]);
    const [ptCropState, setPtCropState] = useState({ active: false, itemIndex: null, selectedImageId: null, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false });
    const [ptEnlargedImg, setPtEnlargedImg] = useState(null);
    const ptCropImageRef = useRef(null);

    const { lightboxState, handleLbDragStart, handleLbResizeStart } = useLightbox(ptEnlargedImg);

    // --- 狀態管理: Phase 2 (結算) ---
    const [panelGrid, setPanelGrid] = useState(defaultPanelGrid);
    const [betInput, setBetInput] = useState(100);
    const [calcResults, setCalcResults] = useState(null);
    const [calculateError, setCalculateError] = useState('');
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const [showAllLines, setShowAllLines] = useState(false);

    const [panelInputMode, setPanelInputMode] = useState('paint');
    const [activeBrush, setActiveBrush] = useState('');

    const [showAIConfirmModal, setShowAIConfirmModal] = useState(false);

    // --- 狀態管理: Phase 3 (AI 視覺批次辨識結算) ---
    const [visionImages, setVisionImages] = useState([]);
    const [activeVisionId, setActiveVisionId] = useState(null);

    const [visionP1, setVisionP1] = useState({ x: 10, y: 10, w: 80, h: 80 });
    const [isVisionProcessing, setIsVisionProcessing] = useState(false);
    const [visionBatchProgress, setVisionBatchProgress] = useState({ current: 0, total: 0 });
    const [visionDragState, setVisionDragState] = useState(null);

    const [visionHoveredLineId, setVisionHoveredLineId] = useState(null);
    const [visionShowAllLines, setVisionShowAllLines] = useState(false);
    const [visionCalculateError, setVisionCalculateError] = useState('');
    const [visionCalcResults, setVisionCalcResults] = useState(null);

    const visionCanvasRef = useRef(null);
    const visionContainerRef = useRef(null);

    const activeVisionImg = visionImages.find(img => img.id === activeVisionId) || null;
    const visionImageObj = activeVisionImg?.obj || null;
    const visionImageSrc = activeVisionImg?.previewUrl || null;
    const visionGrid = activeVisionImg?.grid || null;
    const visionError = activeVisionImg?.error || null;

    // --- Google Sheets 雲端狀態管理 ---
    const [cloudTemplates, setCloudTemplates] = useState([]);
    const [showCloudModal, setShowCloudModal] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);
    const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [templateName, setTemplateName] = useState('');
    const [templateMessage, setTemplateMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const defaultSaveName = [platformName, gameName].filter(Boolean).join('-') || `模板 ${gridRows}x${gridCols}`;

    const availableSymbols = useMemo(() => {
        if (!template) return [];
        const symbols = new Set(Object.keys(template.paytable));
        if (template.jpConfig) {
            Object.keys(template.jpConfig).forEach(jp => {
                if (jp.trim() !== '') symbols.add(jp.toUpperCase());
            });
        }
        if (!symbols.has('WILD') && !Array.from(symbols).some(s => isWildSymbol(s))) symbols.add('WILD');
        return Array.from(symbols);
    }, [template]);

    useEffect(() => {
        if (template && availableSymbols.length > 0) {
            if (!activeBrush || (!availableSymbols.includes(activeBrush) && !isCashSymbol(activeBrush))) {
                setActiveBrush(availableSymbols.includes('WILD') ? 'WILD' : availableSymbols[0]);
            }
        }
    }, [template, availableSymbols]);

    const generateRandomPanelGrid = useCallback((rows, cols, symbols) => {
        if (!symbols || symbols.length === 0) return [];
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const rowArr = [];
            for (let c = 0; c < cols; c++) {
                let sym = symbols[Math.floor(Math.random() * symbols.length)];
                if (sym === 'CASH') {
                    sym = `CASH_${[0.5, 1, 2, 5, 10][Math.floor(Math.random() * 5)]}`;
                }
                rowArr.push(sym);
            }
            grid.push(rowArr);
        }
        return grid;
    }, []);

    const handleRandomizePanel = () => {
        if (!template) return;
        const allSymbols = Object.keys(template.paytable);
        setPanelGrid(generateRandomPanelGrid(template.rows, template.cols, allSymbols));
    };

    const handleClearPanel = () => {
        if (!template) return;
        setPanelGrid(Array.from({ length: template.rows }, () => Array(template.cols).fill('')));
    };

    const handlePaytableTextChange = (newText) => {
        setPaytableInput(newText);
        const validLines = newText.split('\n').filter(l => l.trim() !== '');

        setPtResultItems(prevItems => {
            return validLines.map((line, index) => {
                const parts = line.trim().split(/\s+/);
                const name = parts[0] || '';
                const m1 = parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
                const m2 = parts.length > 2 ? parseFloat(parts[2]) || 0 : 0;
                const m3 = parts.length > 3 ? parseFloat(parts[3]) || 0 : 0;
                const m4 = parts.length > 4 ? parseFloat(parts[4]) || 0 : 0;
                const m5 = parts.length > 5 ? parseFloat(parts[5]) || 0 : 0;

                let thumbUrls = [];
                const existingByName = prevItems.find(p => p.name === name);
                if (existingByName && existingByName.thumbUrls && existingByName.thumbUrls.length > 0) {
                    thumbUrls = existingByName.thumbUrls;
                } else if (prevItems[index] && prevItems[index].thumbUrls && prevItems[index].thumbUrls.length > 0) {
                    thumbUrls = prevItems[index].thumbUrls;
                }

                return { name, match1: m1, match2: m2, match3: m3, match4: m4, match5: m5, thumbUrls };
            });
        });
    };

    const performAutoBuild = (data) => {
        try {
            const lines = {};
            (data.extractResults || []).forEach(r => {
                lines[r.id] = r.data;
            });

            const ptLines = (data.paytableInput || '').trim().split('\n').map(l => l.trim()).filter(l => l);
            const paytable = {};
            ptLines.forEach((line) => {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const symbol = parts[0];
                    const pays = parts.slice(1).map(Number);
                    paytable[symbol] = pays;
                }
            });

            const symbolImages = {};
            const symbolImagesAll = {};
            (data.ptResultItems || []).forEach(item => {
                if (item.thumbUrls && item.thumbUrls.length > 0) {
                    symbolImages[item.name] = item.thumbUrls[0];
                    symbolImagesAll[item.name] = item.thumbUrls;
                } else if (item.thumbUrl) {
                    symbolImages[item.name] = item.thumbUrl;
                    symbolImagesAll[item.name] = [item.thumbUrl];
                }
            });

            const targetRows = data.gridRows || gridRows;
            const targetCols = data.gridCols || gridCols;

            setTemplate({
                rows: targetRows,
                cols: targetCols,
                linesCount: data.extractResults?.length || 0,
                lines,
                paytable,
                symbolImages,
                symbolImagesAll,
                jpConfig: { ...defaultJpConfig, ...(data.jpConfig || jpConfig) }
            });

            const availableSyms = Object.keys(paytable);
            setPanelGrid(generateRandomPanelGrid(targetRows, targetCols, availableSyms));

            setIsTemplateMinimized(true);
            setIsPhase2Minimized(false);
            setIsPhase3Minimized(true);
            setCalcResults(null);

            setVisionImages([]);
            setActiveVisionId(null);
            setVisionCalcResults(null);

            setTemplateError('');
            setBuildErrorMsg('');
        } catch (err) {
            console.warn("Auto build failed", err);
            setTemplateError('自動建構失敗：' + err.message);
        }
    };

    const loadDemoData = () => {
        const demoRows = 4;
        const demoCols = 5;
        setPlatformName('EGT');
        setGameName('40 Sparkling Crown');
        setGridRows(demoRows);
        setGridCols(demoCols);

        const demoLines = `2 2 2 2 2\n3 3 3 3 3\n1 1 1 1 1\n4 4 4 4 4\n1 2 3 2 1\n4 3 2 3 4\n2 3 4 3 2\n3 2 1 2 3\n2 4 4 4 2\n3 1 1 1 3\n1 1 2 1 1\n4 4 3 4 4\n2 2 1 2 2\n3 3 4 3 3\n1 2 2 2 1\n4 3 3 3 4\n2 1 1 1 2\n3 4 4 4 3\n1 2 1 2 1\n4 3 4 3 4\n2 1 2 1 2\n3 4 3 4 3\n1 3 1 3 1\n4 2 4 2 4\n2 4 2 4 2\n3 1 3 1 3\n1 1 3 1 1\n4 4 2 4 4\n2 2 4 2 2\n3 3 1 3 3\n1 4 4 4 1\n4 1 1 1 4\n2 3 2 3 2\n3 2 3 2 3\n1 4 1 4 1\n4 1 4 1 4\n2 3 3 3 2\n3 2 2 2 3\n1 3 3 3 1\n4 2 2 2 4`;
        setLinesTextInput(demoLines);

        const parsedLines = demoLines.split('\n').map((l, idx) => ({ id: idx + 1, data: l.split(' ').map(Number) }));
        setExtractResults(parsedLines);
        setLinesMode('text');

        const demoPaytable = `數字7 0 0.25 1.25 6.25 125\n西瓜 0 0 1 3 17.5\n葡萄 0 0 1 3 17.5\n鈴鐺 0 0 0.5 1 5\n星星SCATTER 0 0 2 10 50\nWILD_COLLECT 0 0 0 0 0\nCASH 0 0 0 0 0`;
        setPaytableInput(demoPaytable);

        const validLines = demoPaytable.split('\n').filter(l => l.trim() !== '');
        const newPtItems = validLines.map((line) => {
            const parts = line.trim().split(/\s+/);
            return {
                name: parts[0] || '',
                match1: parseFloat(parts[1]) || 0,
                match2: parseFloat(parts[2]) || 0,
                match3: parseFloat(parts[3]) || 0,
                match4: parseFloat(parts[4]) || 0,
                match5: parseFloat(parts[5]) || 0,
                thumbUrls: []
            };
        });
        setPtResultItems(newPtItems);
        setPaytableMode('text');

        setTemplateMessage('✅ 已為您載入包含收集機制的示範資料！');
        setTimeout(() => setTemplateMessage(''), 5000);

        performAutoBuild({
            gridRows: demoRows,
            gridCols: demoCols,
            extractResults: parsedLines,
            paytableInput: demoPaytable,
            ptResultItems: newPtItems,
            jpConfig: { "MINI": "10", "MINOR": "20", "MAJOR": "50", "GRAND": "1000" }
        });
    };

    const getSafeGrid = useCallback((sourceGrid) => {
        if (!template || (!sourceGrid && !panelGrid)) return [];
        const gridData = sourceGrid || panelGrid;
        const grid = [];
        for (let r = 0; r < template.rows; r++) {
            const rowArr = [];
            for (let c = 0; c < template.cols; c++) {
                rowArr.push(gridData[r]?.[c] || '');
            }
            grid.push(rowArr);
        }
        return grid;
    }, [template, panelGrid]);

    const handleGridPaste = (e, startRow, startCol) => {
        const pasteData = e.clipboardData.getData('Text');
        if (!pasteData) return;

        e.preventDefault();

        setPanelGrid(prev => {
            const newGrid = prev.map(row => [...row]);
            const pastedRows = pasteData.trim().split(/\r?\n/);

            for (let i = 0; i < pastedRows.length; i++) {
                const r = startRow + i;
                if (r >= template.rows) break;

                let pastedCells;
                if (pastedRows[i].includes('\t')) {
                    pastedCells = pastedRows[i].split('\t');
                } else {
                    pastedCells = pastedRows[i].trim().split(/[\s]+/);
                }

                for (let j = 0; j < pastedCells.length; j++) {
                    const c = startCol + j;
                    if (c >= template.cols) break;

                    if (pastedCells[j] !== undefined) {
                        while (newGrid.length <= r) newGrid.push([]);
                        newGrid[r][c] = pastedCells[j];
                    }
                }
            }
            return newGrid;
        });
    };

    const handleCellChange = (rIndex, cIndex, newValue) => {
        setPanelGrid(prev => {
            const newGrid = prev.map(row => [...row]);
            while (newGrid.length <= rIndex) newGrid.push([]);
            newGrid[rIndex][cIndex] = newValue;
            return newGrid;
        });
    };

    const fetchCloudTemplates = useCallback(async () => {
        if (!GAS_URL) return;

        const cachedStr = sessionStorage.getItem('slot_templates_cache');
        if (cachedStr) {
            try {
                setCloudTemplates(JSON.parse(cachedStr));
                setIsBackgroundSyncing(true);
            } catch (e) { }
        } else {
            setIsLoadingCloud(true);
        }

        try {
            const res = await fetch(`${GAS_URL}?action=list`);
            const data = await res.json();
            setCloudTemplates(data || []);
            sessionStorage.setItem('slot_templates_cache', JSON.stringify(data || []));
        } catch (err) {
            console.warn("取得雲端資料失敗", err);
        } finally {
            setIsLoadingCloud(false);
            setIsBackgroundSyncing(false);
        }
    }, []);

    const handleForceRefreshCloud = async () => {
        if (!GAS_URL) return;
        setIsLoadingCloud(true);
        sessionStorage.removeItem('slot_templates_cache');
        try {
            const res = await fetch(`${GAS_URL}?action=list&nocache=true&t=${Date.now()}`);
            const data = await res.json();
            setCloudTemplates(data || []);
            sessionStorage.setItem('slot_templates_cache', JSON.stringify(data || []));
            setTemplateMessage('✅ 雲端資料已強制更新！');
            setTimeout(() => setTemplateMessage(''), 3000);
        } catch (err) {
            console.error("強制更新失敗", err);
            setTemplateError("強制更新失敗：" + err.message);
        } finally {
            setIsLoadingCloud(false);
        }
    };

    useEffect(() => {
        if (showCloudModal) fetchCloudTemplates();
    }, [showCloudModal, fetchCloudTemplates]);

    const handleSaveToCloud = async () => {
        setTemplateMessage('');
        if (extractResults.length === 0) {
            setTemplateError('沒有可儲存的連線資料，請先完成提取！');
            return;
        }
        if (!GAS_URL) {
            setTemplateError('尚未設定 Google Sheets 連線網址，請在程式碼中填寫 GAS_URL！');
            return;
        }
        setIsSaving(true);
        try {
            const generatedName = [platformName, gameName].filter(Boolean).join('-');
            const name = templateName.trim() || generatedName || `模板 ${gridRows}x${gridCols} (${extractResults.length} 線)`;

            const symbolImages = {};
            ptResultItems.forEach(item => {
                if (item.thumbUrls && item.thumbUrls.length > 0) {
                    symbolImages[item.name] = item.thumbUrls[0];
                } else if (item.thumbUrl) {
                    symbolImages[item.name] = item.thumbUrl;
                }
            });

            const newTemplate = {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                name,
                platformName,
                gameName,
                gridRows,
                gridCols,
                extractResults,
                paytableInput,
                ptResultItems,
                jpConfig,
                creatorId: localUserId,
                createdAt: new Date().toISOString()
            };

            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'save', data: newTemplate }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            setTemplateName('');
            setTemplateError('');
            setTemplateMessage('✅ 已成功儲存至 Google Sheets！');
            setTimeout(() => setTemplateMessage(''), 3000);

            sessionStorage.removeItem('slot_templates_cache');
        } catch (e) {
            setTemplateError('雲端儲存失敗：' + e.message);
        }
        setIsSaving(false);
    };

    const handleDeleteTemplate = async (id) => {
        if (!GAS_URL) return;
        try {
            setDeletingId(id);
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', id: id }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            setCloudTemplates(prev => prev.filter(t => t.id !== id));
            sessionStorage.removeItem('slot_templates_cache');
            setDeletingId(null);
        } catch (err) {
            console.warn("刪除失敗", err);
            setTemplateError('刪除失敗：' + err.message);
            setDeletingId(null);
        }
    };

    const loadCloudTemplate = async (templateMeta) => {
        setDownloadingId(templateMeta.id);
        try {
            const res = await fetch(`${GAS_URL}?action=getTemplate&id=${templateMeta.id}&nocache=true&t=${Date.now()}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            if (data.platformName !== undefined) setPlatformName(data.platformName);
            if (data.gameName !== undefined) setGameName(data.gameName);
            if (data.gridRows) setGridRows(data.gridRows);
            if (data.gridCols) setGridCols(data.gridCols);
            if (data.extractResults) setExtractResults(data.extractResults);
            if (data.paytableInput) setPaytableInput(data.paytableInput);
            if (data.jpConfig) setJpConfig(data.jpConfig);
            else setJpConfig(defaultJpConfig);

            if (data.ptResultItems) {
                const processedItems = data.ptResultItems.map(item => ({
                    ...item,
                    thumbUrls: item.thumbUrls || (item.thumbUrl ? [item.thumbUrl] : [])
                }));
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
            console.warn(err);
            setTemplateError("載入模板詳細資料失敗：" + err.message);
        } finally {
            setDownloadingId(null);
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
            jpConfig
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

                if (data.jpConfig) setJpConfig(data.jpConfig);
                else setJpConfig(defaultJpConfig);

                if (data.paytableInput) setPaytableInput(data.paytableInput);
                if (data.ptResultItems) {
                    const processedItems = data.ptResultItems.map(item => ({
                        ...item,
                        thumbUrls: item.thumbUrls || (item.thumbUrl ? [item.thumbUrl] : [])
                    }));
                    setPtResultItems(processedItems);
                    setPaytableMode('image');
                } else {
                    setPaytableMode('text');
                }

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

    const analyzeImage = () => {
        if (!imageObj) return;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = imageObj.width;
        offCanvas.height = imageObj.height;
        const ctx = offCanvas.getContext('2d');
        ctx.drawImage(imageObj, 0, 0);
        const imgData = ctx.getImageData(0, 0, imageObj.width, imageObj.height).data;

        const x1 = (p1.x / 100) * imageObj.width, y1 = (p1.y / 100) * imageObj.height;
        const w1 = (p1.w / 100) * imageObj.width, h1 = (p1.h / 100) * imageObj.height;
        const x2 = (pEnd.x / 100) * imageObj.width, y2 = (pEnd.y / 100) * imageObj.height;
        const w2 = (pEnd.w / 100) * imageObj.width, h2 = (pEnd.h / 100) * imageObj.height;

        const stepX = patternCols > 1 ? (x2 - x1) / (patternCols - 1) : 0;
        const stepY = patternRows > 1 ? (y2 - y1) / (patternRows - 1) : 0;
        const stepW = patternCols > 1 ? (w2 - w1) / (patternCols - 1) : 0;
        const stepH = patternRows > 1 ? (h2 - h1) / (patternRows - 1) : 0;

        const newResults = [];

        for (let r = 0; r < patternRows; r++) {
            for (let c = 0; c < patternCols; c++) {
                const patternIndex = r * patternCols + c + startIndex;
                const patX = x1 + c * stepX, patY = y1 + r * stepY;
                const patW = w1 + c * stepW, patH = h1 + r * stepH;

                const lineData = [];
                for (let gc = 0; gc < gridCols; gc++) {
                    let maxScore = threshold;
                    let bestRow = 0;
                    for (let gr = 0; gr < gridRows; gr++) {
                        const cellW = patW / gridCols;
                        const cellH = patH / gridRows;
                        const sampX = Math.floor(patX + gc * cellW + cellW / 2);
                        const sampY = Math.floor(patY + gr * cellH + cellH / 2);
                        if (sampX < 0 || sampX >= imageObj.width || sampY < 0 || sampY >= imageObj.height) continue;

                        const idx = (sampY * imageObj.width + sampX) * 4;
                        const R = imgData[idx], G = imgData[idx + 1], B = imgData[idx + 2];
                        const yellowScore = (R + G) - B;

                        if (yellowScore > maxScore) {
                            maxScore = yellowScore;
                            bestRow = gr + 1;
                        }
                    }
                    lineData.push(bestRow);
                }
                newResults.push({ id: patternIndex, data: lineData });
            }
        }

        setExtractResults(prev => {
            const merged = [...prev];
            newResults.forEach(nr => {
                const existingIdx = merged.findIndex(r => r.id === nr.id);
                if (existingIdx >= 0) merged[existingIdx] = nr;
                else merged.push(nr);
            });
            merged.sort((a, b) => a.id - b.id);
            return merged;
        });

        setTemplateError('');
        setTemplateMessage('✅ 當前圖片連線已成功合併提取！');
        setTimeout(() => setTemplateMessage(''), 3000);
    };

    const handlePtFileChange = (e) => {
        const files = Array.from(e.target.files);
        processPtFiles(files);
        e.target.value = '';
    };

    const handlePtDrop = (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        processPtFiles(files);
    };

    const processPtFiles = async (files) => {
        setTemplateError("");
        const newImages = [];
        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const base64 = await ptFileToBase64(file);
                newImages.push({
                    id: Math.random().toString(36).substring(7),
                    file,
                    previewUrl: URL.createObjectURL(file),
                    base64: base64
                });
            } catch (err) {
                console.warn("Error reading pt file:", err);
            }
        }
        setPtImages(prev => [...prev, ...newImages]);
    };

    const removePtImage = (id) => {
        setPtImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            const removed = prev.find(img => img.id === id);
            if (removed) URL.revokeObjectURL(removed.previewUrl);
            return filtered;
        });
    };

    const clearPtAll = () => {
        ptImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setPtImages([]);
        setPtResultItems([]);
        setTemplateError("");
    };

    const handlePtTableChange = (index, field, value) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handlePtTableDelete = (index) => {
        setPtResultItems(prev => {
            const newItems = prev.filter((_, i) => i !== index);
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handleAddPtRow = () => {
        setPtResultItems(prev => {
            const newItems = [...prev, { name: '新符號', match1: 0, match2: 0, match3: 0, match4: 0, match5: 0, thumbUrls: [] }];
            const formattedLines = newItems.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            return newItems;
        });
    };

    const handlePtExtract = async () => {
        if (ptImages.length === 0) {
            setTemplateError("請先上傳至少一張賠率表圖片");
            return;
        }

        const effectiveApiKey = customApiKey.trim() || apiKey;
        const modelName = customApiKey.trim() ? "gemini-2.5-flash" : "gemini-2.5-flash-preview-09-2025";

        setIsPtProcessing(true);
        setTemplateError("");
        setTemplateMessage("AI 正在分析賠率表中...");

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;
            const imageParts = ptImages.map(img => ({
                inlineData: { mimeType: img.file.type, data: img.base64 }
            }));

            const promptText = `
            請仔細分析圖片中的「老虎機賠率表 (Paytable)」。
            任務目標：辨識出圖片中【每一個】圖案符號，以及它對應的連線數量(通常為 5, 4, 3, 2連線)所獲得的「賠率分數」。

            命名規則：
            1. 若符號上有寫 "WILD"、"百搭"、或取代其他圖案的功能，請統一命名為 "WILD"。
            2. 若符號上有寫 "SCATTER"、"分散"、"奪寶"、"免費遊戲" (Free Spins) 等字樣，請統一在名稱中包含 "SCATTER" (例如: 星星SCATTER)。
            3. 若符號有「收集」其他符號分數的功能(如漁夫)，請在名稱中包含 "COLLECT" (若同時也是百搭，請命名為 WILD_COLLECT)。
            4. 若符號是帶有數字的現金/金幣，請統一命名為 "CASH" (不用加上數字，這裡是賠率表提取)。
            5. 若為英文字母或數字，請直接使用：A, K, Q, J, 10, 9。
            6. 若為一般圖案，請根據外觀用「繁體中文」直觀命名 (例如: 金龍, 西瓜, 皇冠)。
            7. 符號名稱 (name) 必須是連續字串，不可包含空白或特殊符號。

            數值規則：
            1. 提取對應的賠率數字。如果某個連線數量(例如 2 連線)沒有標示數字，請補 0。
            2. match1 (1連線) 的賠率請一律填寫 0。

            請嚴格按照 JSON Schema 回傳陣列 (Array)，包含所有辨識到的符號，絕對不可回傳空陣列或忽略任何圖案！
          `;

            const payload = {
                contents: [{ role: "user", parts: [{ text: promptText }, ...imageParts] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                name: { type: "STRING", description: "符號名稱" },
                                match1: { type: "NUMBER", description: "1連線賠率" },
                                match2: { type: "NUMBER", description: "2連線賠率" },
                                match3: { type: "NUMBER", description: "3連線賠率" },
                                match4: { type: "NUMBER", description: "4連線賠率" },
                                match5: { type: "NUMBER", description: "5連線賠率" }
                            },
                            required: ["name", "match1", "match2", "match3", "match4", "match5"]
                        }
                    }
                }
            };

            const result = await fetchWithRetry(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("無法從 AI 取得有效回應，請確認 API Key 是否正確。");

            let parsedData = JSON.parse(jsonText);

            if (parsedData && !Array.isArray(parsedData)) {
                const possibleArray = Object.values(parsedData).find(val => Array.isArray(val));
                if (possibleArray) {
                    parsedData = possibleArray;
                } else {
                    parsedData = [parsedData];
                }
            }

            if (!parsedData || parsedData.length === 0) {
                throw new Error("AI 無法從圖片中辨識出賠率資料。請確認圖片清晰且包含完整的賠率數字。");
            }

            parsedData = parsedData.map(item => ({
                ...item,
                name: String(item.name || '未命名').replace(/\s+/g, ''),
                match1: Number(item.match1) || 0,
                match2: Number(item.match2) || 0,
                match3: Number(item.match3) || 0,
                match4: Number(item.match4) || 0,
                match5: Number(item.match5) || 0
            }));

            const hasWild = parsedData.some(item => isWildSymbol(item.name));
            if (!hasWild) {
                parsedData.push({
                    name: 'WILD',
                    match1: 0,
                    match2: 0,
                    match3: 0,
                    match4: 0,
                    match5: 0
                });
            }

            setPtResultItems(parsedData.map(item => ({ ...item, thumbUrls: [] })));

            const formattedLines = parsedData.map(item =>
                `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`
            );
            setPaytableInput(formattedLines.join('\n'));
            setTemplateMessage("✅ 賠率表提取完成！可點擊清單手動擷取特徵縮圖。");

        } catch (err) {
            console.warn(err);
            setTemplateError(`賠率分析失敗：${err.message || '未知錯誤'}`);
            setTemplateMessage("");
        } finally {
            setIsPtProcessing(false);
        }
    };

    const handleRemoveThumb = (itemIndex, thumbIndex) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            newItems[itemIndex].thumbUrls.splice(thumbIndex, 1);
            return newItems;
        });
    };

    const handleBuildTemplate = () => {
        setTemplateError('');
        setCalcResults(null);
        setVisionCalcResults(null);
        try {
            if (extractResults.length === 0) {
                throw new Error('請先設定「線獎資料」（可透過純文字輸入、圖片提取，或從雲端模板庫載入）。');
            }

            const hasMissingData = extractResults.some(res => res.data.includes(0));
            if (hasMissingData) {
                throw new Error('線獎資料中包含 0 (未辨識到線段的格子)。請嘗試調整圖片提取框，或切換至純文字模式手動修正。');
            }

            const isOutOfBounds = extractResults.some(res => res.data.some(r => r < 1 || r > gridRows));
            if (isOutOfBounds) {
                throw new Error(`「線獎資料」中包含了無效的列數 (必須介於 1 到 ${gridRows} 之間)。請修正您的純文字內容。`);
            }

            const lines = {};
            extractResults.forEach(r => {
                lines[r.id] = r.data;
            });

            const ptLines = paytableInput.trim().split('\n').map(l => l.trim()).filter(l => l);
            if (ptLines.length === 0) throw new Error('「賠付表資料」不能為空，請先設定賠率。');

            const paytable = {};
            ptLines.forEach((line, index) => {
                const parts = line.split(/\s+/);
                if (parts.length < 2) throw new Error(`賠付表第 ${index + 1} 行格式錯誤：資料不足`);

                const symbol = parts[0];
                const pays = parts.slice(1).map(Number);
                if (pays.some(isNaN)) throw new Error(`賠付表第 ${index + 1} 行 (${symbol}) 格式錯誤：賠率必須為數字`);
                paytable[symbol] = pays;
            });

            const symbolImages = {};
            const symbolImagesAll = {};
            ptResultItems.forEach(item => {
                if (item.thumbUrls && item.thumbUrls.length > 0) {
                    symbolImages[item.name] = item.thumbUrls[0];
                    symbolImagesAll[item.name] = item.thumbUrls;
                } else if (item.thumbUrl) {
                    symbolImages[item.name] = item.thumbUrl;
                    symbolImagesAll[item.name] = [item.thumbUrl];
                }
            });

            setTemplate({
                rows: gridRows,
                cols: gridCols,
                linesCount: extractResults.length,
                lines,
                paytable,
                symbolImages,
                symbolImagesAll,
                jpConfig
            });

            const availableSyms = Object.keys(paytable);
            setPanelGrid(generateRandomPanelGrid(gridRows, gridCols, availableSyms));

            setIsTemplateMinimized(true);
            setIsPhase2Minimized(false);
            setIsPhase3Minimized(true);
        } catch (err) {
            setTemplateError(err.message);
            setBuildErrorMsg(err.message);
            setTemplate(null);
        }
    };

    useEffect(() => {
        const updateHeight = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width === 0) return;

            let desiredHeight = 400;
            const isDesktop = window.innerWidth >= 1280;

            if (imageObj) {
                const imgRatio = imageObj.width / imageObj.height;
                desiredHeight = rect.width / imgRatio;
                const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 1000;
                desiredHeight = Math.max(400, Math.min(desiredHeight, maxH));
            }

            if (isDesktop) {
                setLayoutStyle({ leftHeight: '100%', wrapperHeight: `${desiredHeight}px` });
            } else {
                setLayoutStyle({ leftHeight: `${desiredHeight}px`, wrapperHeight: 'auto' });
            }
        };

        if (!isTemplateMinimized && linesMode === 'image') {
            updateHeight();
            setTimeout(updateHeight, 50);
        }

        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, [imageObj, isTemplateMinimized, linesMode]);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setCanvasSize(prev => {
                        if (prev.w === width && prev.h === height) return prev;
                        return { w: width, h: height };
                    });
                }
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isTemplateMinimized, linesMode]);

    const handleLineImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let loadedCount = 0;
        const newImgs = [];

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    newImgs.push({
                        id: Math.random().toString(36).substring(7),
                        file,
                        previewUrl: evt.target.result,
                        obj: img
                    });
                    loadedCount++;
                    if (loadedCount === files.length) {
                        setLineImages(prev => {
                            const updated = [...prev, ...newImgs];
                            if (!activeLineImageId && updated.length > 0) {
                                setActiveLineImageId(updated[0].id);
                            }
                            return updated;
                        });
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeLineImage = (id) => {
        setLineImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            if (activeLineImageId === id) {
                setActiveLineImageId(filtered.length > 0 ? filtered[0].id : null);
            }
            return filtered;
        });
    };

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas || !imageObj || linesMode !== 'image') return;
        const ctx = canvas.getContext('2d');

        canvas.width = imageObj.width;
        canvas.height = imageObj.height;

        ctx.drawImage(imageObj, 0, 0, imageObj.width, imageObj.height);

        const getRect = (obj) => ({
            x: toPx(obj.x, imageObj.width),
            y: toPx(obj.y, imageObj.height),
            w: toPx(obj.w, imageObj.width),
            h: toPx(obj.h, imageObj.height)
        });

        const r1 = getRect(p1);
        const rEnd = getRect(pEnd);

        const baseThickness = Math.max(2, Math.floor(imageObj.width / 400));
        const handleSize = Math.max(12, Math.floor(imageObj.width / 60));
        const fontSize = Math.max(14, Math.floor(imageObj.width / 35));

        const drawInnerGrid = (context, rect, gRows, gCols, color) => {
            if (gRows <= 1 && gCols <= 1) return;
            context.strokeStyle = color;
            context.lineWidth = baseThickness;
            context.beginPath();
            const cellW = rect.w / gCols;
            const cellH = rect.h / gRows;
            for (let c = 1; c < gCols; c++) {
                const lx = rect.x + c * cellW;
                context.moveTo(lx, rect.y);
                context.lineTo(lx, rect.y + rect.h);
            }
            for (let r = 1; r < gRows; r++) {
                const ly = rect.y + r * cellH;
                context.moveTo(rect.x, ly);
                context.lineTo(rect.x + rect.w, ly);
            }
            context.stroke();
        };

        ctx.lineWidth = baseThickness;
        ctx.strokeStyle = '#6366f1';
        ctx.strokeRect(r1.x, r1.y, r1.w, r1.h);
        drawInnerGrid(ctx, r1, gridRows, gridCols, 'rgba(99, 102, 241, 0.6)');
        ctx.fillStyle = '#6366f1';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(`${startIndex.toString().padStart(2, '0')} (Start)`, r1.x, r1.y - fontSize * 0.3);
        ctx.fillRect(r1.x + r1.w - handleSize, r1.y + r1.h - handleSize, handleSize, handleSize);

        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(rEnd.x, rEnd.y, rEnd.w, rEnd.h);
        drawInnerGrid(ctx, rEnd, gridRows, gridCols, 'rgba(239, 68, 68, 0.6)');
        ctx.fillStyle = '#ef4444';
        const endIndex = startIndex + patternRows * patternCols - 1;
        ctx.fillText(`${endIndex} (End)`, rEnd.x, rEnd.y - fontSize * 0.3);
        ctx.fillRect(rEnd.x + rEnd.w - handleSize, rEnd.y + rEnd.h - handleSize, handleSize, handleSize);

        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = baseThickness;

        const stepX = patternCols > 1 ? (rEnd.x - r1.x) / (patternCols - 1) : 0;
        const stepY = patternRows > 1 ? (rEnd.y - r1.y) / (patternRows - 1) : 0;
        const stepW = patternCols > 1 ? (rEnd.w - r1.w) / (patternCols - 1) : 0;
        const stepH = patternRows > 1 ? (rEnd.h - r1.h) / (patternRows - 1) : 0;

        for (let r = 0; r < patternRows; r++) {
            for (let c = 0; c < patternCols; c++) {
                if ((r === 0 && c === 0) || (r === patternRows - 1 && c === patternCols - 1)) continue;

                const curX = r1.x + c * stepX;
                const curY = r1.y + r * stepY;
                const curW = r1.w + c * stepW;
                const curH = r1.h + r * stepH;
                const patternIndex = r * patternCols + c + startIndex;

                ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
                ctx.lineWidth = baseThickness;
                ctx.strokeRect(curX, curY, curW, curH);

                ctx.fillStyle = '#10b981';
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillText(patternIndex.toString().padStart(2, '0'), curX, curY - fontSize * 0.3);
                drawInnerGrid(ctx, { x: curX, y: curY, w: curW, h: curH }, gridRows, gridCols, 'rgba(16, 185, 129, 0.4)');
            }
        }
    };

    useEffect(() => {
        if (!isTemplateMinimized && linesMode === 'image') requestAnimationFrame(draw);
    }, [imageObj, p1, pEnd, patternRows, patternCols, gridRows, gridCols, startIndex, isTemplateMinimized, linesMode]);

    const getMousePos = (e, ref) => {
        if (!ref.current || !imageObj) return { x: 0, y: 0 };
        const canvas = ref.current;
        const rect = canvas.getBoundingClientRect();

        const scaleX = imageObj.width / rect.width;
        const scaleY = imageObj.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handleMouseDown = (e) => {
        if (!imageObj || linesMode !== 'image') return;
        const pos = getMousePos(e, canvasRef);

        const getPxRect = (obj) => ({
            x: toPx(obj.x, imageObj.width),
            y: toPx(obj.y, imageObj.height),
            w: toPx(obj.w, imageObj.width),
            h: toPx(obj.h, imageObj.height)
        });

        const r1 = getPxRect(p1);
        const rEnd = getPxRect(pEnd);

        const handleSizePx = Math.max(12, Math.floor(imageObj.width / 60));

        const isOverHandle = (x, y, rect) => x >= rect.x + rect.w - handleSizePx * 1.5 && x <= rect.x + rect.w + handleSizePx * 1.5 && y >= rect.y + rect.h - handleSizePx * 1.5 && y <= rect.y + rect.h + handleSizePx * 1.5;
        const isOverRect = (x, y, rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

        if (isOverHandle(pos.x, pos.y, r1)) setDragState({ type: 'p1', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...p1 } });
        else if (isOverHandle(pos.x, pos.y, rEnd)) setDragState({ type: 'pEnd', action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...pEnd } });
        else if (isOverRect(pos.x, pos.y, r1)) setDragState({ type: 'p1', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...p1 } });
        else if (isOverRect(pos.x, pos.y, rEnd)) setDragState({ type: 'pEnd', action: 'move', startX: pos.x, startY: pos.y, initObj: { ...pEnd } });
    };

    const handleMouseMove = (e) => {
        if (!dragState || !imageObj || linesMode !== 'image') return;
        const pos = getMousePos(e, canvasRef);

        const dxPct = toPct(pos.x - dragState.startX, imageObj.width);
        const dyPct = toPct(pos.y - dragState.startY, imageObj.height);

        if (dragState.action === 'move') {
            const newObj = { ...dragState.initObj, x: dragState.initObj.x + dxPct, y: dragState.initObj.y + dyPct };
            if (dragState.type === 'p1') setP1(newObj); else setPEnd(newObj);
        } else if (dragState.action === 'resize') {
            const newW = Math.max(2, dragState.initObj.w + dxPct);
            const newH = Math.max(2, dragState.initObj.h + dyPct);
            if (dragState.type === 'p1') {
                setP1({ ...dragState.initObj, w: newW, h: newH });
                setPEnd(prev => ({ ...prev, w: newW, h: newH }));
            } else {
                setPEnd({ ...dragState.initObj, w: newW, h: newH });
                setP1(prev => ({ ...prev, w: newW, h: newH }));
            }
        }
    };

    const handleMouseUp = () => setDragState(null);

    // ==========================================
    //  Phase 3: AI 視覺辨識的 Canvas 交互邏輯
    // ==========================================
    useEffect(() => {
        if (visionImageObj && visionCanvasRef.current && !isPhase3Minimized) {
            const canvas = visionCanvasRef.current;
            const ctx = canvas.getContext('2d');

            const activeVisionImg = visionImages.find(img => img.id === activeVisionId);

            if (activeVisionImg?.grid) {
                // 已辨識完成：僅顯示框選範圍 (裁切)
                const rx = toPx(visionP1.x, visionImageObj.width);
                const ry = toPx(visionP1.y, visionImageObj.height);
                const rw = toPx(visionP1.w, visionImageObj.width);
                const rh = toPx(visionP1.h, visionImageObj.height);

                // 加上 5% 的 Padding 以免太緊貼，下方額外加上 50px 區域保留贏分和 BET 資訊
                const paddingX = rw * 0.05;
                const paddingY = rh * 0.05;
                const bottomPadding = paddingY + 150;

                const cropX = Math.max(0, rx - paddingX);
                const cropY = Math.max(0, ry - paddingY);
                const cropW = Math.min(visionImageObj.width - cropX, rw + paddingX * 2);
                const cropH = Math.min(visionImageObj.height - cropY, rh + paddingY + bottomPadding);

                canvas.width = cropW;
                canvas.height = cropH;
                ctx.drawImage(visionImageObj, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

                // 畫框線 (在此要相對位移)
                const relativeRx = rx - cropX;
                const relativeRy = ry - cropY;

                if (template && template.rows > 0 && template.cols > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
                    const cellW = rw / template.cols;
                    const cellH = rh / template.rows;

                    for (let c = 1; c < template.cols; c++) {
                        const lx = relativeRx + c * cellW;
                        ctx.moveTo(lx, relativeRy);
                        ctx.lineTo(lx, relativeRy + rh);
                    }
                    for (let r = 1; r < template.rows; r++) {
                        const ly = relativeRy + r * cellH;
                        ctx.moveTo(relativeRx, ly);
                        ctx.lineTo(relativeRx + rw, ly);
                    }
                    ctx.stroke();
                }

            } else {
                // 尚未辨識：顯示全圖與操控框
                canvas.width = visionImageObj.width;
                canvas.height = visionImageObj.height;

                ctx.drawImage(visionImageObj, 0, 0);

                const getRect = (obj) => ({
                    x: toPx(obj.x, visionImageObj.width),
                    y: toPx(obj.y, visionImageObj.height),
                    w: toPx(obj.w, visionImageObj.width),
                    h: toPx(obj.h, visionImageObj.height)
                });
                const rect = getRect(visionP1);
                const baseThickness = Math.max(2, Math.floor(visionImageObj.width / 400));
                const handleSize = Math.max(12, Math.floor(visionImageObj.width / 60));

                ctx.lineWidth = baseThickness;
                ctx.strokeStyle = '#10b981';
                ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

                ctx.fillStyle = '#10b981';
                ctx.fillRect(rect.x + rect.w - handleSize, rect.y + rect.h - handleSize, handleSize, handleSize);

                if (template && template.rows > 0 && template.cols > 0) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
                    const cellW = rect.w / template.cols;
                    const cellH = rect.h / template.rows;

                    for (let c = 1; c < template.cols; c++) {
                        const lx = rect.x + c * cellW;
                        ctx.moveTo(lx, rect.y);
                        ctx.lineTo(lx, rect.y + rect.h);
                    }
                    for (let r = 1; r < template.rows; r++) {
                        const ly = rect.y + r * cellH;
                        ctx.moveTo(rect.x, ly);
                        ctx.lineTo(rect.x + rect.w, ly);
                    }
                    ctx.stroke();
                }
            }
        }
    }, [visionImageObj, visionP1, template, isPhase3Minimized, visionImages, activeVisionId]);

    const getVisionMousePos = (e, ref, activeImgObj) => {
        if (!ref.current || !activeImgObj) return { x: 0, y: 0 };
        const canvas = ref.current;
        const rect = canvas.getBoundingClientRect();

        const scaleX = activeImgObj.width / rect.width;
        const scaleY = activeImgObj.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handleVisionMouseDown = (e) => {
        if (!visionImageObj) return;
        const pos = getVisionMousePos(e, visionCanvasRef, visionImageObj);

        const getPxRect = (obj) => ({
            x: toPx(obj.x, visionImageObj.width),
            y: toPx(obj.y, visionImageObj.height),
            w: toPx(obj.w, visionImageObj.width),
            h: toPx(obj.h, visionImageObj.height)
        });
        const rect = getPxRect(visionP1);
        const handleSizePx = Math.max(12, Math.floor(visionImageObj.width / 60));

        const isOverHandle = (x, y, r) => x >= r.x + r.w - handleSizePx * 1.5 && x <= r.x + r.w + handleSizePx * 1.5 && y >= r.y + r.h - handleSizePx * 1.5 && y <= r.y + r.h + handleSizePx * 1.5;
        const isOverRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

        if (isOverHandle(pos.x, pos.y, rect)) {
            setVisionDragState({ action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
        } else if (isOverRect(pos.x, pos.y, rect)) {
            setVisionDragState({ action: 'move', startX: pos.x, startY: pos.y, initObj: { ...visionP1 } });
        }
    };

    const handleVisionMouseMove = (e) => {
        if (!visionDragState || !visionImageObj) return;
        const pos = getVisionMousePos(e, visionCanvasRef, visionImageObj);
        const dxPct = toPct(pos.x - visionDragState.startX, visionImageObj.width);
        const dyPct = toPct(pos.y - visionDragState.startY, visionImageObj.height);

        if (visionDragState.action === 'move') {
            setVisionP1({ ...visionDragState.initObj, x: Math.max(0, Math.min(100 - visionDragState.initObj.w, visionDragState.initObj.x + dxPct)), y: Math.max(0, Math.min(100 - visionDragState.initObj.h, visionDragState.initObj.y + dyPct)) });
        } else if (visionDragState.action === 'resize') {
            setVisionP1({ ...visionDragState.initObj, w: Math.max(5, Math.min(100 - visionDragState.initObj.x, visionDragState.initObj.w + dxPct)), h: Math.max(5, Math.min(100 - visionDragState.initObj.y, visionDragState.initObj.h + dyPct)) });
        }
    };

    const handleVisionMouseUp = () => setVisionDragState(null);

    const handleVisionImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let loadedCount = 0;
        const newImgs = [];

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    newImgs.push({
                        id: Math.random().toString(36).substring(7),
                        file,
                        previewUrl: evt.target.result,
                        obj: img,
                        grid: null,
                        error: ''
                    });
                    loadedCount++;
                    if (loadedCount === files.length) {
                        setVisionImages(prev => {
                            const updated = [...prev, ...newImgs];
                            if (!activeVisionId && updated.length > 0) {
                                setActiveVisionId(updated[0].id);
                            }
                            return updated;
                        });
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeVisionImage = (id) => {
        setVisionImages(prev => {
            const filtered = prev.filter(img => img.id !== id);
            if (activeVisionId === id) {
                setActiveVisionId(filtered.length > 0 ? filtered[0].id : null);
            }
            return filtered;
        });
    };

    // === 核心：呼叫 Gemini API 進行語意辨識 (Phase 3 批次版, Token 優化) ===
    const performAIVisionBatchMatching = async () => {
        if (visionImages.length === 0 || !template) {
            setTemplateError("請先上傳截圖，並確保已經完成 Phase 1 模板設定！");
            return;
        }

        const effectiveApiKey = customApiKey.trim() || apiKey;
        // Phase 3 使用 3.1-flash-lite-preview：RPD 500，Preview 模型需加 -preview 後綴
        const modelName = "gemini-3.1-flash-lite-preview";

        let toProcess = visionImages.filter(img => !img.grid);
        if (toProcess.length === 0) {
            toProcess = visionImages;
        }

        setIsVisionProcessing(true);
        setVisionBatchProgress({ current: 0, total: toProcess.length });
        setTemplateMessage(`AI 準備批次處理 ${toProcess.length} 張盤面中...`);

        let currentVisionImages = [...visionImages];

        // --- 預先壓縮參考縮圖至 64px 以節省 token ---
        const referenceImages = [];
        let referenceText = "Symbol references:\n";
        let partIndex = 1;

        for (const symbol in template.symbolImagesAll) {
            const urls = template.symbolImagesAll[symbol];
            if (urls && urls.length > 0) {
                referenceText += `- ${symbol}: img ${urls.map((_, i) => partIndex + i).join(',')}\n`;
                for (const url of urls) {
                    try {
                        const resized = await resizeImageBase64(url, 64, 0.6);
                        referenceImages.push({
                            inlineData: { mimeType: resized.mimeType, data: resized.base64 }
                        });
                    } catch {
                        const b64 = url.split(',')[1];
                        if (b64) referenceImages.push({ inlineData: { mimeType: "image/png", data: b64 } });
                    }
                    partIndex++;
                }
            }
        }

        // --- 固定前綴 parts（利用 Gemini implicit caching）---
        const fixedPrefixParts = [
            { text: referenceText },
            ...referenceImages,
            { text: `Grid: ${template.rows}R x ${template.cols}C. Symbols: [${availableSymbols.join(',')}]. Rules: Pick closest symbol from list only. Cash with number: CASH_N (e.g. CASH_0.5). JP names as-is. Dimmed/grayed cells: identify by shape. Unrecognizable: "". Return ${template.rows}x${template.cols} 2D array.` }
        ];

        for (let i = 0; i < toProcess.length; i++) {
            const targetImg = toProcess[i];
            const imgIndex = currentVisionImages.findIndex(img => img.id === targetImg.id);

            setActiveVisionId(targetImg.id);
            setVisionBatchProgress({ current: i + 1, total: toProcess.length });

            try {
                // --- 裁切盤面區域 ---
                const offCanvas = document.createElement('canvas');
                const rx = (visionP1.x / 100) * targetImg.obj.width;
                const ry = (visionP1.y / 100) * targetImg.obj.height;
                const rw = (visionP1.w / 100) * targetImg.obj.width;
                const rh = (visionP1.h / 100) * targetImg.obj.height;

                offCanvas.width = rw;
                offCanvas.height = rh;
                const ctx = offCanvas.getContext('2d');
                ctx.drawImage(targetImg.obj, rx, ry, rw, rh, 0, 0, rw, rh);

                // --- 壓縮截圖至 512px, JPEG 0.5 ---
                const rawBase64 = offCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                const resizedShot = await resizeImageBase64(`data:image/jpeg;base64,${rawBase64}`, 512, 0.5);

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;

                const payload = {
                    contents: [{
                        role: "user",
                        parts: [
                            // 固定前綴（參考圖 + 規則）放最前面以觸發 implicit caching
                            ...fixedPrefixParts,
                            // 變動部分（當前盤面截圖）放最後
                            { text: "Analyze:" },
                            { inlineData: { mimeType: resizedShot.mimeType, data: resizedShot.base64 } }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "ARRAY",
                            items: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                            }
                        }
                    }
                };

                const result = await fetchWithRetry(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonText) throw new Error("無法從 AI 取得有效回應，請確認 API Key 是否正確。");

                let parsedGrid = JSON.parse(jsonText);

                if (!Array.isArray(parsedGrid) || parsedGrid.length === 0 || !Array.isArray(parsedGrid[0])) {
                    const possibleGrid = Object.values(parsedGrid).find(val => Array.isArray(val) && Array.isArray(val[0]));
                    if (possibleGrid) parsedGrid = possibleGrid;
                    else throw new Error("AI 回傳的格式不正確，無法解析為二維盤面陣列。");
                }

                const safeGrid = [];
                for (let r = 0; r < template.rows; r++) {
                    const rowArr = [];
                    for (let c = 0; c < template.cols; c++) {
                        let sym = parsedGrid[r]?.[c] || '';
                        if (sym && !availableSymbols.includes(sym) && !isCashSymbol(sym, template?.jpConfig)) {
                            sym = '';
                        }
                        rowArr.push(sym);
                    }
                    safeGrid.push(rowArr);
                }

                currentVisionImages[imgIndex] = { ...currentVisionImages[imgIndex], grid: safeGrid, error: '' };
                setVisionImages([...currentVisionImages]);

            } catch (err) {
                console.warn("AI 辨識錯誤:", err);
                currentVisionImages[imgIndex] = { ...currentVisionImages[imgIndex], error: "辨識失敗：" + err.message };
                setVisionImages([...currentVisionImages]);
            }

            if (i < toProcess.length - 1) {
                await new Promise(res => setTimeout(res, 1500));
            }
        }

        setIsVisionProcessing(false);
        setVisionBatchProgress({ current: 0, total: 0 });
        setTemplateMessage(`✅ 批次辨識完成！共處理 ${toProcess.length} 張圖片。`);
        setTimeout(() => setTemplateMessage(''), 5000);
    };

    const computeGridResultsCb = useCallback((targetGrid, betAmount) => {
        return computeGridResults(template, targetGrid, betAmount);
    }, [template]);


    useEffect(() => {
        const { results, error } = computeGridResultsCb(panelGrid, betInput);
        setCalcResults(results);
        setCalculateError(error);
    }, [panelGrid, betInput, computeGridResultsCb]);

    useEffect(() => {
        if (!visionGrid) {
            setVisionCalcResults(null);
            setVisionCalculateError('');
            return;
        }
        const { results, error } = computeGridResultsCb(visionGrid, betInput);
        setVisionCalcResults(results);
        setVisionCalculateError(error);
    }, [visionGrid, betInput, computeGridResultsCb]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans relative">

            <ToastMessage message={templateMessage} />

            <div className="max-w-7xl mx-auto space-y-6">

                <AppHeader onOpenSettings={() => setShowSettingsModal(true)} />

                {/* Phase 1 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                    <div
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setIsTemplateMinimized(!isTemplateMinimized)}
                    >
                        <div className="flex items-center space-x-2">
                            <Settings className="text-indigo-500" size={20} />
                            <h2 className="text-xl font-semibold">Phase 1: 模板設定 (影像提取)</h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            {template && isTemplateMinimized && (
                                <div className="flex items-center space-x-2 text-emerald-600 text-sm font-medium">
                                    <CheckCircle2 size={16} />
                                    <span>已載入: {template.rows}x{template.cols} 盤面, {template.linesCount} 條連線</span>
                                </div>
                            )}
                            {isTemplateMinimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                        </div>
                    </div>

                    {!isTemplateMinimized && (
                        <div className="p-6 pt-0 border-t border-slate-100 mt-4 space-y-6">

                            {templateError && (
                                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200 shadow-sm">
                                    <AlertCircle size={18} className="shrink-0" />
                                    <span>{templateError}</span>
                                </div>
                            )}

                            <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-100 flex flex-col lg:flex-row justify-between gap-4 items-center">
                                <div className="flex w-full lg:w-auto gap-2">
                                    <label className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm border border-slate-200">
                                        <FolderOpen size={16} />載入本地模板
                                        <input type="file" className="hidden" accept=".json" onChange={handleImportLocalTemplate} />
                                    </label>
                                    <button onClick={() => setShowCloudModal(true)} className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-indigo-50 text-indigo-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors border border-indigo-200">
                                        <Cloud size={16} />瀏覽雲端模板庫
                                    </button>
                                </div>
                                <div className="flex w-full lg:w-auto gap-2 items-stretch">
                                    <button onClick={handleExportLocalTemplate} className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors shadow-sm border border-slate-200 shrink-0">
                                        <Save size={16} />匯出
                                    </button>
                                    <div className="flex bg-white rounded-lg shadow-sm border border-indigo-200 overflow-hidden flex-1 lg:flex-none">
                                        <input type="text" placeholder={`儲存名稱 (預設: ${defaultSaveName})`} value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="px-3 py-2 text-sm focus:outline-none w-full lg:w-48 text-slate-700 font-medium" />
                                        <button onClick={handleSaveToCloud} disabled={isSaving} className={`px-4 py-2 text-white text-sm font-bold flex items-center justify-center gap-1 shrink-0 transition-colors border-l border-indigo-200 ${isSaving ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                            <Upload size={16} /> 存檔
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">平台名稱</label>
                                        <input
                                            type="text"
                                            value={platformName}
                                            onChange={(e) => setPlatformName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            placeholder="例如: PG, JDB..."
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">遊戲名稱</label>
                                        <input
                                            type="text"
                                            value={gameName}
                                            onChange={(e) => setGameName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            placeholder="例如: 麻將胡了, 40 Sparkling Crown..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                    <label className="text-base font-bold text-slate-800">線獎資料設定</label>
                                    <div className="flex bg-slate-200 p-1 rounded-lg">
                                        <button
                                            onClick={() => {
                                                setLinesTextInput(extractResults.map(r => r.data.join(' ')).join('\n'));
                                                setLinesMode('text');
                                            }}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${linesMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <FileText size={16} /><span>純文字輸入</span>
                                        </button>
                                        <button
                                            onClick={() => setLinesMode('image')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${linesMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <ImagePlus size={16} /><span>圖片提取</span>
                                        </button>
                                    </div>
                                </div>

                                {linesMode === 'text' && (
                                    <div className="flex flex-col lg:flex-row gap-6">
                                        <div className="flex-1 flex flex-col">
                                            <textarea
                                                value={linesTextInput}
                                                onChange={(e) => {
                                                    setLinesTextInput(e.target.value);
                                                    const validLines = e.target.value.split('\n').map(l => l.trim()).filter(l => l !== '');
                                                    const newResults = validLines.map((line, idx) => {
                                                        const nums = line.match(/\d+/g);
                                                        if (!nums) return null;
                                                        let data = nums.map(Number);
                                                        if (data.length > gridCols) data = data.slice(-gridCols);
                                                        return { id: idx + 1, data };
                                                    }).filter(Boolean);
                                                    setExtractResults(newResults);
                                                }}
                                                className="w-full flex-1 min-h-[350px] p-4 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                                placeholder="請輸入連線矩陣，每行代表一條連線的列數 (Row)&#10;格式範例:&#10;2 2 2 2 2&#10;1 1 1 1 1&#10;3 3 3 3 3"
                                            />
                                        </div>
                                        <div className="w-full lg:w-80 bg-white border border-slate-300 rounded-lg flex flex-col shadow-sm shrink-0 h-[350px]">
                                            <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                                                <label className="text-xs text-slate-500 uppercase font-bold mb-2 block">遊戲盤面 (單一網格大小)</label>
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <span className="text-xs block mb-1 text-slate-700 font-bold">Row (列數)</span>
                                                        <input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" min="1" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <span className="text-xs block mb-1 text-slate-700 font-bold">Col (欄數)</span>
                                                        <input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" min="1" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                                <label className="text-xs text-slate-500 uppercase font-bold mb-2 block">已提取結果 ({extractResults.length} 條)</label>
                                                {extractResults.length === 0 ? (
                                                    <div className="text-slate-400 text-center mt-6 text-sm">尚未提取任何數據。</div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {extractResults.map((res) => {
                                                            const hasZero = res.data.includes(0);
                                                            const lengthWarning = res.data.length !== gridCols;
                                                            return (
                                                                <div key={res.id} className={`flex items-center justify-between p-2 rounded text-sm bg-slate-50 border ${hasZero || lengthWarning ? 'border-rose-400 bg-rose-50' : 'border-slate-100'} transition-colors`}>
                                                                    <span className="font-mono text-indigo-600 font-bold w-8">{res.id.toString().padStart(2, '0')}.</span>
                                                                    <span className={`font-mono tracking-widest ${hasZero || lengthWarning ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>{res.data.join(', ')}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {linesMode === 'image' && (
                                    <div
                                        className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col xl:flex-row transition-all duration-300"
                                        style={{ height: layoutStyle.wrapperHeight }}
                                    >
                                        <div className="flex-1 relative flex flex-col bg-slate-900 transition-all duration-300 min-h-[400px]">

                                            {lineImages.length > 0 && (
                                                <div className="flex gap-2 overflow-x-auto p-3 bg-slate-950 border-b border-slate-800 shrink-0 custom-scrollbar z-20">
                                                    {lineImages.map(img => (
                                                        <div
                                                            key={img.id}
                                                            onClick={() => setActiveLineImageId(img.id)}
                                                            className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all 
                                    ${activeLineImageId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                        >
                                                            <img src={img.previewUrl} className="w-full h-full object-cover" />
                                                            <button onClick={(e) => { e.stopPropagation(); removeLineImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white p-0.5 rounded-bl-lg hover:bg-rose-600 transition-colors">
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <label className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-500 text-slate-400 transition-colors" title="上傳更多圖片">
                                                        <Upload size={20} className="mb-1" />
                                                        <span className="text-[10px]">新增</span>
                                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleLineImageUpload} />
                                                    </label>
                                                </div>
                                            )}

                                            <div className="flex-1 relative flex flex-col p-4 overflow-y-auto custom-scrollbar">
                                                {!imageSrc ? (
                                                    <div className="m-auto text-center w-full max-w-md">
                                                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-600">
                                                            <ImageIcon size={32} className="text-slate-400" />
                                                        </div>
                                                        <label htmlFor="slot-image-upload" className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition inline-flex items-center space-x-2 shadow-lg w-full justify-center">
                                                            <Upload size={18} />
                                                            <span>上傳老虎機連線圖 (可多選)</span>
                                                            <input id="slot-image-upload" type="file" className="hidden" multiple accept="image/*" onChange={handleLineImageUpload} />
                                                        </label>
                                                        <p className="mt-4 text-slate-400 text-sm leading-relaxed">
                                                            支援一次上傳多張連線圖進行分批提取 (JFIF/JPG/PNG)<br />
                                                            或在上方點擊「瀏覽雲端模板庫」直接套用
                                                        </p>

                                                        <div className="mt-6 border border-slate-700/50 rounded-xl p-4 bg-slate-900/50 shadow-inner text-left">
                                                            <span className="text-xs text-slate-400 font-bold mb-3 flex items-center justify-center gap-1.5"><ImageIcon size={14} /> 線獎圖上傳範例參考 (40 Sparkling Crown)</span>
                                                            <div className="w-full bg-[#000000] rounded-lg border border-slate-700 p-4 grid grid-cols-3 sm:grid-cols-6 gap-3 opacity-90 select-none shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                                {[
                                                                    { id: '01', line: [1, 1, 1, 1, 1] }, { id: '02', line: [0, 0, 0, 0, 0] }, { id: '03', line: [2, 2, 2, 2, 2] },
                                                                    { id: '04', line: [3, 3, 3, 3, 3] }, { id: '05', line: [0, 1, 2, 1, 0] }, { id: '06', line: [2, 1, 0, 1, 2] }
                                                                ].map((item) => (
                                                                    <div key={item.id} className="flex gap-1.5 items-center justify-center">
                                                                        <span className="text-[#fcd34d] text-[10px] font-mono font-bold tracking-widest">{item.id}</span>
                                                                        <div className="grid grid-cols-5 gap-[1px] bg-[#78350f] p-[1px] rounded-[2px] shadow-sm">
                                                                            {Array.from({ length: 20 }).map((_, i) => {
                                                                                const row = Math.floor(i / 5); const col = i % 5; const isLine = item.line[col] === row;
                                                                                return <div key={i} className={`w-[6px] h-[4px] ${isLine ? 'bg-[#fde68a]' : 'bg-black'}`}></div>
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="mt-6 p-5 bg-slate-800/40 rounded-xl border border-slate-700/50 text-left">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg"><Zap size={18} /></div>
                                                                <h4 className="text-slate-200 font-bold">第一次使用？看不懂怎麼操作？</h4>
                                                            </div>
                                                            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                                                                點擊下方按鈕，我們將直接為您載入「40 Sparkling Crown」的連線與賠率範本資料，讓您無須上傳圖片也能快速體驗結算功能！
                                                            </p>
                                                            <button onClick={loadDemoData} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 shadow-sm border border-slate-600">
                                                                載入 40 Sparkling Crown 範例
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="relative w-full max-w-4xl mx-auto my-auto shrink-0">
                                                        <img src={imageSrc} alt="layout" className="w-full h-auto opacity-0 pointer-events-none select-none block" />
                                                        <canvas
                                                            ref={canvasRef}
                                                            className="absolute inset-0 w-full h-full cursor-crosshair border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-sm"
                                                            onMouseDown={handleMouseDown}
                                                            onMouseMove={handleMouseMove}
                                                            onMouseUp={handleMouseUp}
                                                            onMouseLeave={handleMouseUp}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="w-full xl:w-80 bg-slate-800 border-t xl:border-t-0 xl:border-l border-slate-700 flex flex-col xl:h-auto shrink-0">
                                            <div className="p-4 border-b border-slate-700 flex-shrink-0">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h2 className="text-lg font-bold text-white">連線擷取設定</h2>
                                                    {extractResults.length > 0 && (
                                                        <button onClick={() => setExtractResults([])} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded transition-colors">
                                                            <Trash2 size={12} /> 清空所有結果
                                                        </button>
                                                    )}
                                                </div>

                                                {imageSrc && (
                                                    <div className="mb-4 bg-slate-900/50 rounded-lg p-2.5 text-xs border border-slate-700">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <div className="w-2.5 h-2.5 bg-indigo-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                            <span className="text-slate-300">藍框對準第 <b className="text-white">1</b> 個圖案</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <div className="w-2.5 h-2.5 bg-rose-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                            <span className="text-slate-300">紅框對準第 <b className="text-white">{patternRows * patternCols}</b> 個圖案</span>
                                                        </div>
                                                        <div className="text-slate-500 mt-1">※ 拖曳框的右下角可縮放大小</div>
                                                    </div>
                                                )}

                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">圖片配置 (圖案陣列)</label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <span className="text-xs block mb-1 text-slate-300">總行數 (Rows)</span>
                                                                <input type="number" value={patternRows} onChange={e => setPatternRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <span className="text-xs block mb-1 text-slate-300">總列數 (Cols)</span>
                                                                <input type="number" value={patternCols} onChange={e => setPatternCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" />
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 bg-indigo-900/20 border border-indigo-500/30 p-2 rounded-lg">
                                                            <div className="flex justify-between items-end mb-1">
                                                                <span className="text-xs block text-indigo-300 font-bold">此圖起始連線編號 (Start ID)</span>
                                                                {extractResults.length > 0 && (
                                                                    <button
                                                                        onClick={() => setStartIndex(Math.max(...extractResults.map(r => r.id)) + 1)}
                                                                        className="text-[10px] text-indigo-400 hover:text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 px-1.5 py-0.5 rounded transition-colors"
                                                                        title="自動設定為目前已提取的最大編號 + 1"
                                                                    >
                                                                        接續最大編號
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <input type="number" value={startIndex} onChange={e => setStartIndex(Number(e.target.value))} className="w-full bg-slate-800 border border-indigo-500/50 rounded px-2 py-1.5 text-white font-bold focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" min="1" />
                                                        </div>
                                                    </div>

                                                    <div className="pt-3 border-t border-slate-700/50">
                                                        <label className="text-xs text-slate-400 uppercase font-bold mb-2 block text-rose-400">遊戲盤面 (單一網格大小)</label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <span className="text-xs block mb-1 text-slate-300">Row (列數)</span>
                                                                <input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <span className="text-xs block mb-1 text-slate-300">Col (欄數)</span>
                                                                <input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={analyzeImage}
                                                        disabled={!imageSrc}
                                                        className={`w-full py-2.5 rounded font-bold transition flex items-center justify-center space-x-2 
                                  ${!imageSrc ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                                                    >
                                                        <Settings size={16} />
                                                        <span>提取當前圖片連線</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900/50">
                                                <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">已提取總結果 ({extractResults.length} 條)</label>
                                                {extractResults.length === 0 ? (
                                                    <div className="text-slate-500 text-center mt-6 text-sm">尚未提取任何數據。</div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {extractResults.map((res) => (
                                                            <div key={res.id} className="flex items-center justify-between p-2 rounded text-sm bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-colors">
                                                                <span className="font-mono text-indigo-400 font-bold w-8">{res.id.toString().padStart(2, '0')}.</span>
                                                                <span className="font-mono tracking-widest text-slate-200">{res.data.join(', ')}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 2: 賠率設定 */}
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                        <label className="text-base font-bold text-slate-800">賠付表資料設定</label>
                                        <div className="flex bg-slate-200 p-1 rounded-lg">
                                            <button onClick={() => setPaytableMode('text')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>純文字</button>
                                            <button onClick={() => setPaytableMode('image')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>圖片提取</button>
                                        </div>
                                    </div>
                                    {paytableMode === 'text' && (
                                        <textarea
                                            value={paytableInput}
                                            onChange={(e) => handlePaytableTextChange(e.target.value)}
                                            className="w-full flex-1 min-h-[220px] p-4 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                            placeholder="格式：符號名稱 + 5格連線數賠率&#10;孔雀 0 0 1 2.5 5&#10;金幣 0 0 0.8 1.5 3..."
                                        />
                                    )}
                                    {paytableMode === 'image' && (
                                        <div className="flex flex-col lg:flex-row gap-4 h-auto min-h-[400px]">
                                            <div className="w-full lg:w-1/3 flex flex-col bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm relative">
                                                <label
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={handlePtDrop}
                                                    className="flex-1 border-2 border-dashed border-slate-300 m-2 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors py-4"
                                                >
                                                    <input type="file" className="hidden" multiple accept="image/*" onChange={handlePtFileChange} />
                                                    <Upload className="text-slate-400 mb-1" size={24} />
                                                    <p className="text-xs text-slate-500 font-medium">點擊或拖曳上傳賠率圖 (可多選)</p>
                                                </label>

                                                {/* 賠率圖範例預覽 */}
                                                {ptImages.length === 0 && (
                                                    <div className="mx-2 mb-2 p-3 bg-slate-50 border border-slate-200 rounded-lg shadow-inner">
                                                        <span className="text-[10px] text-slate-500 font-bold mb-2 flex items-center justify-center gap-1"><ImageIcon size={12} /> 賠付表上傳範例參考</span>
                                                        <div className="bg-[#000000] rounded-md p-2 flex flex-col gap-1.5 opacity-90 select-none border border-slate-700 shadow-[0_0_10px_rgba(0,0,0,0.3)]">
                                                            <div className="flex items-center justify-between border border-slate-600 p-1.5 rounded bg-[#111]">
                                                                <div className="w-8 h-8 flex items-center justify-center text-2xl drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">7️⃣</div>
                                                                <div className="flex flex-col text-[9px] font-mono text-[#fcd34d] text-right">
                                                                    <span>5 - 125</span>
                                                                    <span>4 - 6.25</span>
                                                                    <span>3 - 1.25</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between border border-slate-600 p-1.5 rounded bg-[#111]">
                                                                <div className="w-8 h-8 flex items-center justify-center text-2xl drop-shadow-sm">🍉</div>
                                                                <div className="flex flex-col text-[9px] font-mono text-[#fcd34d] text-right">
                                                                    <span>5 - 17.5</span>
                                                                    <span>4 - 3</span>
                                                                    <span>3 - 1</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {ptImages.length === 0 && (
                                                    <div className="mx-2 mb-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                                                        <span className="text-[10px] text-slate-500 block mb-1.5 font-bold">沒有圖片？先看看範本吧！</span>
                                                        <button onClick={loadDemoData} className="w-full py-1.5 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold rounded-md transition-colors text-xs flex items-center justify-center gap-1 shadow-sm">
                                                            <Zap size={14} /> 載入 40 Sparkling Crown
                                                        </button>
                                                    </div>
                                                )}

                                                {ptImages.length > 0 && (
                                                    <div className="px-3 pb-2">
                                                        <div className="flex justify-between items-center mb-1.5">
                                                            <span className="text-xs font-semibold text-slate-500">已選 {ptImages.length} 張</span>
                                                            <button onClick={clearPtAll} className="text-[10px] text-rose-500 hover:text-rose-700 font-bold">清空全部</button>
                                                        </div>
                                                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                                            {ptImages.map(img => (
                                                                <div key={img.id} className="relative w-12 h-12 shrink-0 rounded border border-slate-200 bg-slate-900 overflow-hidden cursor-pointer shadow-sm hover:border-indigo-400 transition-colors" onClick={() => setPtEnlargedImg(img.previewUrl)}>
                                                                    <img src={img.previewUrl} className="w-full h-full object-contain" />
                                                                    <button onClick={(e) => { e.stopPropagation(); removePtImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white rounded-bl opacity-80 hover:opacity-100 p-0.5 transition-opacity"><X size={10} /></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <button onClick={() => setShowAIConfirmModal(true)} disabled={isPtProcessing || ptImages.length === 0} className={`m-2 mt-0 py-2.5 rounded-lg font-bold flex justify-center items-center gap-1.5 shadow-sm transition-colors ${isPtProcessing || ptImages.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                                                    {isPtProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                                                    {isPtProcessing ? '分析中...' : 'AI 分析賠率'}
                                                </button>
                                            </div>
                                            <div className="w-full lg:w-2/3 bg-white border border-slate-300 rounded-lg overflow-auto shadow-sm relative">
                                                {ptResultItems.length > 0 ? (
                                                    <div className="flex flex-col h-full">
                                                        <div className="flex-1 overflow-auto">
                                                            <table className="w-full text-left border-collapse text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-600 sticky top-0 shadow-sm z-10">
                                                                        <th className="p-2 border-b font-medium w-16 text-center">縮圖集</th>
                                                                        <th className="p-2 border-b font-medium">名稱</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">2連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">3連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">4連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">5連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-8"></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {ptResultItems.map((item, idx) => (
                                                                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                                                                            <td className="p-1.5">
                                                                                <div className="flex flex-row flex-nowrap gap-1 items-center overflow-x-auto max-w-[120px]">
                                                                                    {item.thumbUrls && item.thumbUrls.map((url, tIdx) => (
                                                                                        <div key={tIdx} className="relative w-7 h-7 bg-slate-800 rounded border border-slate-300 shadow-sm group/thumb">
                                                                                            <img src={url} className="w-full h-full object-contain" />
                                                                                            <button onClick={() => handleRemoveThumb(idx, tIdx)} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                                                                <X size={8} />
                                                                                            </button>
                                                                                        </div>
                                                                                    ))}
                                                                                    <button
                                                                                        onClick={() => setPtCropState({ active: true, itemIndex: idx, selectedImageId: ptImages[0]?.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false })}
                                                                                        className="w-7 h-7 bg-slate-100 hover:bg-indigo-50 hover:border-indigo-300 rounded flex items-center justify-center border border-slate-200 border-dashed text-slate-400 hover:text-indigo-500 transition-colors"
                                                                                        title="新增此符號的另一張特徵圖"
                                                                                    >
                                                                                        <Plus size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.name} onChange={(e) => handlePtTableChange(idx, 'name', e.target.value)} className="w-full font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match2} onChange={(e) => handlePtTableChange(idx, 'match2', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match3} onChange={(e) => handlePtTableChange(idx, 'match3', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match4} onChange={(e) => handlePtTableChange(idx, 'match4', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match5} onChange={(e) => handlePtTableChange(idx, 'match5', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1 text-center">
                                                                                <button onClick={() => handlePtTableDelete(idx)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100" title="刪除此符號">
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center sticky bottom-0 z-10 shrink-0">
                                                            <button onClick={handleAddPtRow} className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-800 transition-colors py-1.5 px-4 rounded-md hover:bg-indigo-100 border border-indigo-200 bg-white shadow-sm">
                                                                <Plus size={14} /> 新增賠付符號
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 p-4 text-center">
                                                        <LayoutList size={28} className="mb-2 opacity-30" />
                                                        <p className="text-sm font-medium">等待 AI 分析結果</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 3: Jackpot (JP) 倍率設定 */}
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-6">
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                        <label className="text-base font-bold text-slate-800 flex items-center gap-2"><Trophy size={20} className="text-amber-500" /> Jackpot 倍率設定</label>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-4">設定各級別 JP (如 MINI, GRAND) 觸發收集時的面額倍率。可自行新增自訂大獎名稱，留空表示未使用。<br /><span className="text-indigo-500 font-bold">💡 若需要讓 Phase 3 AI 辨識 JP 符號，請在上方「賠付表資料設定 (圖片提取)」中新增對應名稱的符號行，並裁切該 JP 的特徵圖即可。</span></p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {Object.entries(jpConfig).map(([jpName, jpMult], idx) => (
                                            <div key={idx} className="flex flex-col bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors shadow-sm relative group">
                                                <input
                                                    type="text"
                                                    value={jpName}
                                                    onChange={(e) => {
                                                        const newName = e.target.value.toUpperCase();
                                                        setJpConfig(prev => {
                                                            const newConfig = {};
                                                            Object.keys(prev).forEach(k => {
                                                                if (k === jpName) newConfig[newName] = prev[k];
                                                                else newConfig[k] = prev[k];
                                                            });
                                                            return newConfig;
                                                        });
                                                    }}
                                                    className="w-full text-sm font-bold text-slate-700 outline-none uppercase border-b border-transparent hover:border-slate-200 focus:border-indigo-300 mb-2 placeholder:font-normal placeholder:lowercase placeholder:text-slate-300 pb-1"
                                                    placeholder="JP分類"
                                                />
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={jpMult}
                                                    onChange={(e) => {
                                                        setJpConfig(prev => ({ ...prev, [jpName]: e.target.value }));
                                                    }}
                                                    className="w-full text-lg font-black text-amber-600 outline-none bg-amber-50 hover:bg-amber-100 px-2 py-1.5 rounded focus:ring-1 focus:ring-amber-300 transition-colors"
                                                    placeholder="倍率"
                                                />
                                                <button
                                                    onClick={() => {
                                                        setJpConfig(prev => {
                                                            const newConfig = { ...prev };
                                                            delete newConfig[jpName];
                                                            return newConfig;
                                                        });
                                                    }}
                                                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-600 focus:outline-none"
                                                    disabled={Object.keys(jpConfig).length <= 1}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => {
                                                setJpConfig(prev => ({ ...prev, [`CUSTOM_${Object.keys(prev).length + 1}`]: "" }));
                                            }}
                                            className="flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-100 hover:border-slate-400 hover:text-indigo-600 transition-colors text-slate-400 min-h-[95px] w-full"
                                        >
                                            <Plus size={24} className="mb-1" />
                                            <span className="text-xs font-bold">新增 JP</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 建構結算模板大按鈕 */}
                            <button onClick={handleBuildTemplate} className="w-full mt-6 py-4 bg-slate-800 hover:bg-slate-900 text-white text-lg font-bold rounded-xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]">
                                <CheckCircle2 size={24} />
                                完成設定，建構結算模板
                            </button>
                        </div>
                    )}
                </div>

                {/* ========================================================================= */}
                {/* Phase 2: 手動盤面設定與結算                                                */}
                {/* ========================================================================= */}
                <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${!template ? 'opacity-30 pointer-events-none' : ''}`}>
                    <div
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => template && setIsPhase2Minimized(!isPhase2Minimized)}
                    >
                        <div className="flex items-center space-x-2">
                            <LayoutGrid className="text-indigo-500" size={20} />
                            <h2 className="text-xl font-semibold text-slate-800">Phase 2: 手動盤面設定與結算 <span className="text-sm font-normal text-slate-400 ml-2">(透過畫筆或鍵盤微調盤面)</span></h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            {isPhase2Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                        </div>
                    </div>

                    {!isPhase2Minimized && (
                        <div className="p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="flex flex-col h-full">
                                    <div className="bg-slate-900 p-5 sm:p-6 rounded-xl shadow-2xl border border-slate-800 flex flex-col flex-1">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 border-b border-slate-700 pb-4 gap-3">
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><MousePointer2 className="text-indigo-400" size={20} />盤面設定</h2>
                                            </div>
                                            <div className="flex items-center gap-2 sm:gap-3">
                                                {template && (
                                                    <button onClick={handleRandomizePanel} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-indigo-400 hover:bg-slate-700 hover:text-indigo-300 rounded-lg text-sm font-bold transition-colors border border-slate-700 shadow-sm shrink-0">
                                                        <RefreshCw size={14} />隨機盤面
                                                    </button>
                                                )}
                                                <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 shrink-0">
                                                    <button onClick={() => setPanelInputMode('paint')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${panelInputMode === 'paint' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                                                        <Paintbrush size={14} /> 畫筆
                                                    </button>
                                                    <button onClick={() => setPanelInputMode('text')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${panelInputMode === 'text' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                                                        <Keyboard size={14} /> 鍵盤
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-5">
                                            <div>
                                                {panelInputMode === 'paint' && (
                                                    <div className="mb-4 bg-slate-800/80 border border-slate-700 rounded-lg p-3">
                                                        <span className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">選擇畫筆 (點擊或拖曳下方網格填色)</span>
                                                        <div className="flex flex-wrap gap-2">
                                                            {availableSymbols.map(sym => {
                                                                const isCash = isCashSymbol(sym, template?.jpConfig);
                                                                const baseSym = getBaseSymbol(sym, template?.jpConfig);
                                                                const isActive = getBaseSymbol(activeBrush, template?.jpConfig) === baseSym;

                                                                return (
                                                                    <button
                                                                        key={sym}
                                                                        onClick={() => {
                                                                            if (isCash && !isJpSymbol(sym, template?.jpConfig)) {
                                                                                if (!isActive) {
                                                                                    setActiveBrush(`CASH_1`);
                                                                                }
                                                                            } else {
                                                                                setActiveBrush(sym);
                                                                            }
                                                                        }}
                                                                        className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${isActive ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                                                                        title={isCash ? "點擊選擇金幣畫筆" : sym}
                                                                    >
                                                                        {template?.symbolImages?.[baseSym] ? (
                                                                            <React.Fragment>
                                                                                <img src={template.symbolImages[baseSym]} className="max-w-full max-h-full object-contain p-1" alt={baseSym} />
                                                                                {isActive && isCash && getCashValue(activeBrush, template?.jpConfig) > 0 && (
                                                                                    <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">
                                                                                        {getCashValue(activeBrush, template?.jpConfig)}
                                                                                    </div>
                                                                                )}
                                                                            </React.Fragment>
                                                                        ) : (
                                                                            <span className="text-[10px] sm:text-xs font-black leading-tight text-center px-1 text-slate-200">
                                                                                {isCash ? (isActive && getCashValue(activeBrush, template?.jpConfig) > 0 ? `💰${getCashValue(activeBrush, template?.jpConfig)}` : '💰設定') : sym}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                )
                                                            })}
                                                            <button
                                                                onClick={() => setActiveBrush('')}
                                                                className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${activeBrush === '' ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                                                                title="橡皮擦 (點擊網格清空單格)"
                                                            >
                                                                <div className="w-5 h-5 border-2 border-rose-400 rounded-full flex items-center justify-center">
                                                                    <div className="w-3 h-0.5 bg-rose-400 rotate-45"></div>
                                                                </div>
                                                            </button>

                                                            <div className="w-px h-10 bg-slate-700 mx-1 self-center"></div>

                                                            <button
                                                                onClick={handleClearPanel}
                                                                className="relative px-3 h-[48px] sm:h-[52px] rounded-lg border-2 border-slate-600 bg-slate-800 hover:border-rose-400 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex flex-col items-center justify-center transition-all group shadow-sm"
                                                                title="一鍵清除整個盤面"
                                                            >
                                                                <Trash2 size={18} className="group-active:scale-90 transition-transform mb-0.5" />
                                                                <span className="text-[10px] font-bold leading-none">清除盤面</span>
                                                            </button>

                                                            {/* 新增：當選擇 CASH 畫筆時，動態顯示的面額輸入框 */}
                                                            {getBaseSymbol(activeBrush, template?.jpConfig) === 'CASH' && (
                                                                <React.Fragment>
                                                                    <div className="w-px h-10 bg-slate-700 mx-1 self-center"></div>
                                                                    <div className="flex flex-col justify-center bg-indigo-500/20 border border-indigo-400/50 rounded-lg px-3 h-[48px] sm:h-[52px] animate-in fade-in slide-in-from-left-2 duration-200">
                                                                        <label className="text-[9px] font-bold text-indigo-300 mb-0.5 flex items-center gap-1">設定 CASH 面額</label>
                                                                        <input
                                                                            type="number"
                                                                            step="any"
                                                                            value={getCashValue(activeBrush, template?.jpConfig) || ''}
                                                                            onChange={(e) => setActiveBrush(`CASH_${e.target.value}`)}
                                                                            className="w-16 px-1.5 py-0.5 text-xs font-black text-indigo-900 bg-indigo-50 hover:bg-white focus:bg-white rounded outline-none text-center focus:ring-2 focus:ring-indigo-400 transition-all shadow-inner"
                                                                            placeholder="數值"
                                                                        />
                                                                    </div>
                                                                </React.Fragment>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center h-8 mb-4">
                                                    {hoveredLineId ? (
                                                        <div className="flex items-center gap-2 text-indigo-300 text-sm font-bold bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/30 animate-in fade-in slide-in-from-left-2 duration-200 shadow-sm">
                                                            <Zap size={14} className="fill-indigo-400" />
                                                            <span>正在查看第 <span className="text-white text-base mx-0.5">{hoveredLineId}</span> 條連線軌跡</span>
                                                            {calcResults?.details?.find(d => d.lineId === hoveredLineId)?.winAmount > 0 && (
                                                                <span className="text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded ml-1 flex items-center gap-1">
                                                                    <Trophy size={12} /> +{calcResults.details.find(d => d.lineId === hoveredLineId).winAmount.toLocaleString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-slate-500 text-xs flex items-center gap-1.5 opacity-80">
                                                            <MousePointer2 size={14} />
                                                            <span>將滑鼠移至右側結算清單，即可在此預覽連線軌跡</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="p-3 sm:p-5 bg-black/40 border border-slate-800/80 rounded-xl overflow-x-auto shadow-inner select-none custom-scrollbar">
                                                    <div className="flex flex-col gap-1.5 sm:gap-2 w-max mx-auto" onMouseLeave={() => setHoveredLineId(null)}>
                                                        {getSafeGrid(panelGrid).map((row, rIndex) => (
                                                            <div key={rIndex} className="flex gap-1.5 sm:gap-2">
                                                                {row.map((symbol, cIndex) => {
                                                                    let isWinSymbol = false;
                                                                    let isOnLine = false;
                                                                    if (calcResults) {
                                                                        if (hoveredLineId) {
                                                                            const hoveredResult = calcResults.details.find(d => d.lineId === hoveredLineId);
                                                                            const isFeatureWin = String(hoveredResult.lineId).startsWith('SCATTER') || String(hoveredResult.lineId).startsWith('COLLECT');
                                                                            if (!isFeatureWin) {
                                                                                isOnLine = template.lines[hoveredLineId]?.[cIndex] - 1 === rIndex;
                                                                            }
                                                                            isWinSymbol = hoveredResult?.winCoords.some(c => c.row === rIndex && c.col === cIndex);
                                                                        } else {
                                                                            isWinSymbol = calcResults.details.some(d => d.winCoords.some(c => c.row === rIndex && c.col === cIndex));
                                                                        }
                                                                    }

                                                                    let cellClasses = "relative w-16 h-16 sm:w-[88px] sm:h-[72px] flex items-center justify-center rounded-lg overflow-hidden transition-all duration-300 font-black text-xl ";

                                                                    if (hoveredLineId) {
                                                                        if (isWinSymbol) cellClasses += "opacity-100 bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_0_20px_rgba(99,102,241,0.6)] z-10 scale-105 border-2 border-indigo-300 text-white";
                                                                        else if (isOnLine) cellClasses += "opacity-40 grayscale scale-95 bg-slate-800 border border-slate-600 text-slate-300";
                                                                        else cellClasses += "opacity-10 grayscale scale-90 bg-slate-900 border border-slate-800 text-slate-500";
                                                                    } else {
                                                                        if (isWinSymbol) cellClasses += "opacity-100 bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] z-10 scale-[1.02] border-2 border-indigo-300 text-white";
                                                                        else cellClasses += "opacity-100 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-500 text-white shadow-inner";
                                                                    }

                                                                    const baseSym = getBaseSymbol(symbol, template?.jpConfig);
                                                                    const cashVal = getCashValue(symbol, template?.jpConfig);

                                                                    return (
                                                                        <div
                                                                            key={cIndex}
                                                                            className={`${cellClasses} ${panelInputMode === 'paint' ? 'cursor-pointer' : ''}`}
                                                                            onMouseDown={(e) => { if (panelInputMode === 'paint') { e.preventDefault(); handleCellChange(rIndex, cIndex, activeBrush); } }}
                                                                            onMouseEnter={(e) => { if (panelInputMode === 'paint' && e.buttons === 1) handleCellChange(rIndex, cIndex, activeBrush); }}
                                                                        >
                                                                            {panelInputMode === 'text' ? (
                                                                                <input
                                                                                    id={`cell-${rIndex}-${cIndex}`}
                                                                                    value={symbol}
                                                                                    placeholder="空"
                                                                                    onFocus={(e) => e.target.select()}
                                                                                    onChange={(e) => handleCellChange(rIndex, cIndex, e.target.value)}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'ArrowUp') { e.preventDefault(); document.getElementById(`cell-${rIndex - 1}-${cIndex}`)?.focus(); }
                                                                                        else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); document.getElementById(`cell-${rIndex + 1}-${cIndex}`)?.focus(); }
                                                                                        else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) document.getElementById(`cell-${rIndex}-${cIndex + 1}`)?.focus();
                                                                                        else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) document.getElementById(`cell-${rIndex}-${cIndex - 1}`)?.focus();
                                                                                    }}
                                                                                    onPaste={(e) => handleGridPaste(e, rIndex, cIndex)}
                                                                                    className={`w-full h-full text-center font-black text-base sm:text-lg bg-transparent outline-none placeholder:text-slate-600 placeholder:font-normal ${isWinSymbol ? 'text-white' : 'text-slate-100'}`}
                                                                                />
                                                                            ) : (
                                                                                symbol ? (
                                                                                    template?.symbolImages?.[baseSym] ? (
                                                                                        <React.Fragment>
                                                                                            <img src={template.symbolImages[baseSym]} className={`max-w-full max-h-full object-contain p-1.5 drop-shadow-md pointer-events-none select-none ${isCashSymbol(symbol, template?.jpConfig) ? 'opacity-80' : ''}`} draggable={false} alt={baseSym} />
                                                                                            {cashVal > 0 && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-sm sm:text-base z-20 pointer-events-none">{cashVal}</div>}
                                                                                        </React.Fragment>
                                                                                    ) : (
                                                                                        <span className="z-10 pointer-events-none select-none drop-shadow-md text-sm sm:text-xl">
                                                                                            {isCashSymbol(symbol, template?.jpConfig) && cashVal > 0 ? `💰${cashVal}` : baseSym}
                                                                                        </span>
                                                                                    )
                                                                                ) : (
                                                                                    <div className="w-2 h-2 rounded-full bg-slate-600/50 pointer-events-none"></div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Phase 2 專屬結算 UI */}
                                <ResultView template={template} calcData={calcResults} calcErr={calculateError} hoveredId={hoveredLineId} setHoveredId={setHoveredLineId} showAll={showAllLines} setShowAll={setShowAllLines} betInput={betInput} setBetInput={setBetInput} />
                            </div>
                        </div>
                    )}
                </div>

                {/* ========================================================================= */}
                {/* Phase 3: AI 實機截圖辨識與結算 (支援多圖批次處理)                             */}
                {/* ========================================================================= */}
                <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${!template ? 'opacity-50 pointer-events-none hidden' : ''}`}>
                    <div
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => template && setIsPhase3Minimized(!isPhase3Minimized)}
                    >
                        <div className="flex items-center space-x-2">
                            <BrainCircuit className="text-indigo-500" size={20} />
                            <h2 className="text-xl font-semibold text-slate-800">Phase 3: AI 實機截圖辨識 <span className="text-sm font-normal text-slate-500 ml-2">(支援多圖批次自動結算)</span></h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            {isPhase3Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                        </div>
                    </div>

                    {!isPhase3Minimized && (
                        <div className="p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="flex flex-col h-full">
                                    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col h-full">

                                        {/* Phase 3 頂部：多圖縮圖列與上傳 */}
                                        {visionImages.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto p-3 bg-slate-950 border-b border-slate-800 shrink-0 custom-scrollbar z-20">
                                                {visionImages.map((img, idx) => (
                                                    <div
                                                        key={img.id}
                                                        onClick={() => setActiveVisionId(img.id)}
                                                        className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all
                                                                ${activeVisionId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'}
                                                                ${img.grid ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-slate-950' : ''}`}
                                                    >
                                                        <img src={img.previewUrl} className="w-full h-full object-cover" />
                                                        {/* 狀態標籤 */}
                                                        {img.grid && <div className="absolute top-0 left-0 bg-emerald-500 text-white text-[8px] px-1 font-bold rounded-br z-10">已辨識</div>}
                                                        {img.error && <div className="absolute top-0 left-0 bg-rose-500 text-white text-[8px] px-1 font-bold rounded-br z-10">失敗</div>}
                                                        <button onClick={(e) => { e.stopPropagation(); removeVisionImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white p-0.5 rounded-bl-lg hover:bg-rose-600 transition-colors z-10">
                                                            <X size={12} />
                                                        </button>
                                                        <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 font-bold rounded-tl-md z-10">{idx + 1}</div>
                                                    </div>
                                                ))}
                                                <label className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-500 text-slate-400 transition-colors" title="上傳更多圖片">
                                                    <Upload size={20} className="mb-1" />
                                                    <span className="text-[10px]">新增</span>
                                                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleVisionImageUpload} />
                                                </label>
                                            </div>
                                        )}

                                        {!activeVisionImg ? (
                                            <div className="p-8 text-center flex flex-col items-center justify-center flex-1 min-h-[300px]">
                                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700 shadow-inner">
                                                    <ImageIcon size={32} className="text-indigo-400" />
                                                </div>
                                                <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold transition shadow-lg flex items-center gap-2">
                                                    <Upload size={20} /> 批次上傳實機截圖 (可多選)
                                                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleVisionImageUpload} />
                                                </label>
                                                <p className="mt-4 text-sm text-slate-400 max-w-md leading-relaxed">
                                                    上傳多張截圖，共用一個裁切範圍，由 AI 自動為您「批次辨識盤面」並產出結算結果。<br />
                                                    <span className="text-emerald-400 font-bold inline-block mt-1">優勢：不受灰階、變暗或些微特效干擾，容錯率極高！</span>
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col flex-1">
                                                <div className="p-3 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
                                                    <div className="flex items-center gap-2 px-2 text-sm text-slate-300">
                                                        <div className="w-3 h-3 bg-emerald-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                        <span>請調整綠色框線對齊遊戲盤面 (將套用至所有圖片)</span>
                                                    </div>
                                                    <button onClick={() => { setVisionImages([]); setActiveVisionId(null); setVisionCalcResults(null); }} className="text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 transition-colors flex items-center gap-1">
                                                        <Trash2 size={14} /> 清空全部截圖
                                                    </button>
                                                </div>
                                                <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center min-h-[300px]" ref={visionContainerRef}>
                                                    <div className={`relative w-full flex items-center justify-center overflow-hidden ${activeVisionImg?.grid ? 'h-auto py-4' : 'h-full'}`}>
                                                        <canvas
                                                            ref={visionCanvasRef}
                                                            className={`max-w-full max-h-full object-contain ${activeVisionImg?.grid ? 'cursor-default pointer-events-none drop-shadow-lg' : 'cursor-crosshair'}`}
                                                            onMouseDown={!activeVisionImg?.grid ? handleVisionMouseDown : undefined}
                                                            onMouseMove={!activeVisionImg?.grid ? handleVisionMouseMove : undefined}
                                                            onMouseUp={!activeVisionImg?.grid ? handleVisionMouseUp : undefined}
                                                            onMouseLeave={!activeVisionImg?.grid ? handleVisionMouseUp : undefined}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Phase 3 執行按鈕與進度 */}
                                                <div className="p-4 border-t border-slate-800 bg-slate-950 shrink-0">
                                                    <button
                                                        onClick={performAIVisionBatchMatching}
                                                        disabled={isVisionProcessing}
                                                        className={`w-full py-3 rounded-lg text-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md ${isVisionProcessing ? 'bg-indigo-600/50 cursor-not-allowed text-white/50' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                                                    >
                                                        {isVisionProcessing ? <Loader2 size={20} className="animate-spin" /> : <ListChecks size={20} />}
                                                        {isVisionProcessing
                                                            ? `AI 批次辨識中 (${visionBatchProgress.current}/${visionBatchProgress.total})...`
                                                            : (visionImages.filter(img => !img.grid).length > 0
                                                                ? `批次辨識未處理圖片 (${visionImages.filter(img => !img.grid).length} 張)`
                                                                : '重新辨識全部圖片')}
                                                    </button>
                                                </div>

                                                {/* 錯誤顯示區塊 */}
                                                {visionError && (
                                                    <div className="p-3 bg-rose-950/50 border-t border-rose-900 text-rose-400 text-sm font-bold flex items-center justify-center gap-2">
                                                        <AlertCircle size={18} className="shrink-0" />
                                                        <span>{visionError}</span>
                                                    </div>
                                                )}

                                                {/* AI 辨識後的唯讀小盤面預覽 */}
                                                {!isVisionProcessing && visionGrid && visionCalcResults && (
                                                    <div className="p-4 bg-black/60 border-t border-slate-800">
                                                        <span className="text-xs text-slate-400 mb-3 block font-bold text-center">目前 AI 辨識盤面狀態 (唯讀預覽)</span>
                                                        <div className="flex flex-col gap-1 w-max mx-auto pointer-events-none">
                                                            {getSafeGrid(visionGrid).map((row, rIndex) => (
                                                                <div key={rIndex} className="flex gap-1">
                                                                    {row.map((symbol, cIndex) => {
                                                                        let isWinSymbol = false;
                                                                        let isOnLine = false;
                                                                        if (visionCalcResults) {
                                                                            if (visionHoveredLineId) {
                                                                                const hoveredResult = visionCalcResults.details.find(d => d.lineId === visionHoveredLineId);
                                                                                const isFeatureWin = String(hoveredResult.lineId).startsWith('SCATTER') || String(hoveredResult.lineId).startsWith('COLLECT');
                                                                                if (!isFeatureWin) {
                                                                                    isOnLine = template.lines[visionHoveredLineId]?.[cIndex] - 1 === rIndex;
                                                                                }
                                                                                isWinSymbol = hoveredResult?.winCoords.some(c => c.row === rIndex && c.col === cIndex);
                                                                            } else {
                                                                                isWinSymbol = visionCalcResults.details.some(d => d.winCoords.some(c => c.row === rIndex && c.col === cIndex));
                                                                            }
                                                                        }

                                                                        let cellClass = "relative w-10 h-10 flex items-center justify-center rounded border transition-all duration-300 text-[10px] font-bold text-center overflow-hidden ";
                                                                        if (visionHoveredLineId) {
                                                                            if (isWinSymbol) cellClass += "bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)] z-10 scale-105 text-white";
                                                                            else if (isOnLine) cellClass += "bg-slate-700 border-slate-500 text-slate-300 opacity-60";
                                                                            else cellClass += "bg-slate-900 border-slate-800 text-slate-600 opacity-30";
                                                                        } else {
                                                                            if (isWinSymbol) cellClass += "bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)] z-10 scale-105 text-white";
                                                                            else cellClass += "bg-slate-800 border-slate-700 text-slate-300";
                                                                        }

                                                                        const baseSym = getBaseSymbol(symbol, template?.jpConfig);
                                                                        const cashVal = getCashValue(symbol, template?.jpConfig);

                                                                        return (
                                                                            <div key={cIndex} className={cellClass}>
                                                                                {symbol ? (
                                                                                    template?.symbolImages?.[baseSym] ? (
                                                                                        <React.Fragment>
                                                                                            <img src={template.symbolImages[baseSym]} className={`max-w-full max-h-full object-contain p-1 drop-shadow-md ${isCashSymbol(symbol, template?.jpConfig) ? 'opacity-80' : ''}`} alt={baseSym} />
                                                                                            {cashVal > 0 && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">{cashVal}</div>}
                                                                                        </React.Fragment>
                                                                                    ) : (
                                                                                        <span>{isCashSymbol(symbol, template?.jpConfig) && cashVal > 0 ? `💰${cashVal}` : baseSym}</span>
                                                                                    )
                                                                                ) : null}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="text-center mt-3">
                                                            <span className="text-[10px] text-slate-500">若發現 AI 辨識有誤，這只是輔助功能，請至上方 Phase 2 手動微調盤面</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Phase 3 專屬獨立結算 UI */}
                                {activeVisionImg && visionGrid ? (
                                    <ResultView template={template} calcData={visionCalcResults} calcErr={visionCalculateError} hoveredId={visionHoveredLineId} setHoveredId={setVisionHoveredLineId} showAll={visionShowAllLines} setShowAll={setVisionShowAllLines} betInput={betInput} setBetInput={setBetInput} />
                                ) : (
                                    <div className="relative flex flex-col h-full lg:block w-full">
                                        <div className="static lg:absolute lg:inset-0 flex flex-col w-full h-full">
                                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center flex-1 min-h-0 text-slate-400 opacity-60 border-dashed">
                                                <Trophy size={48} className="mb-3 opacity-50" />
                                                <p className="font-bold text-lg">等待 AI 批次辨識結果...</p>
                                                <p className="text-sm mt-1">結果將在此獨立呈現，不影響 Phase 2</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* 確認 Modal */}
            {
                showAIConfirmModal && (
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
                                <button onClick={() => setShowAIConfirmModal(false)} className="px-4 py-2 text-slate-600">取消</button>
                                <button onClick={() => { setShowAIConfirmModal(false); handlePtExtract(); }} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md">確認並分析</button>
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
                                        手動擷取: <span className="text-indigo-400">{ptResultItems[ptCropState.itemIndex]?.name}</span>
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
                                            canvas.width = cW; canvas.height = cH;
                                            canvas.getContext('2d').drawImage(img, startX * sX, startY * sY, cW, cH, 0, 0, cW, cH);

                                            // 修改：將擷取到的圖片推入 thumbUrls 陣列中
                                            setPtResultItems(prev => {
                                                const arr = [...prev];
                                                if (!arr[ptCropState.itemIndex].thumbUrls) {
                                                    arr[ptCropState.itemIndex].thumbUrls = [];
                                                }
                                                arr[ptCropState.itemIndex].thumbUrls.push(canvas.toDataURL());
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
            />

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
        </div >
    );
}

export default App;

