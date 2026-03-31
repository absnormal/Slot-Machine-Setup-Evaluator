import { useState, useRef } from 'react';
import { fetchWithRetry, ptFileToBase64 } from '../utils/helpers';
import { isWildSymbol } from '../utils/symbolUtils';
import { buildPaytablePrompt, buildPaytableGenerationConfig } from '../config/promptTemplates';

/**
 * 賠率表處理邏輯
 * 從 useTemplateBuilder.js 拆出的子 hook
 * 處理：賠率表文字編輯、表格 CRUD、圖片上傳、AI OCR、符號縮圖擷取
 */
export function usePaytableProcessor({
    customApiKey,
    apiKey,
    hasDoubleSymbol,
    setTemplateMessage,
    setTemplateError,
}) {
    // --- Paytable State ---
    const [ptImages, setPtImages] = useState([]);
    const [isPtProcessing, setIsPtProcessing] = useState(false);
    const [ptResultItems, setPtResultItems] = useState([]);
    const [ptCropState, setPtCropState] = useState({ active: false, itemIndex: null, selectedImageId: null, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false });
    const [ptEnlargedImg, setPtEnlargedImg] = useState(null);
    const ptCropImageRef = useRef(null);

    // === Text ↔ Table Sync ===
    const handlePaytableTextChange = (newText, setPaytableInput) => {
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
                const m6 = parts.length > 6 ? parseFloat(parts[6]) || 0 : 0;
                const m7 = parts.length > 7 ? parseFloat(parts[7]) || 0 : 0;
                const m8 = parts.length > 8 ? parseFloat(parts[8]) || 0 : 0;
                const m9 = parts.length > 9 ? parseFloat(parts[9]) || 0 : 0;
                const m10 = parts.length > 10 ? parseFloat(parts[10]) || 0 : 0;

                let thumbUrls = [];
                let doubleThumbUrls = [];
                const existingByName = prevItems.find(p => p.name === name);
                if (existingByName) {
                    if (existingByName.thumbUrls && existingByName.thumbUrls.length > 0) thumbUrls = existingByName.thumbUrls;
                    if (existingByName.doubleThumbUrls && existingByName.doubleThumbUrls.length > 0) doubleThumbUrls = existingByName.doubleThumbUrls;
                } else if (prevItems[index]) {
                    if (prevItems[index].thumbUrls && prevItems[index].thumbUrls.length > 0) thumbUrls = prevItems[index].thumbUrls;
                    if (prevItems[index].doubleThumbUrls && prevItems[index].doubleThumbUrls.length > 0) doubleThumbUrls = prevItems[index].doubleThumbUrls;
                }
                return { name, match1: m1, match2: m2, match3: m3, match4: m4, match5: m5, match6: m6, match7: m7, match8: m8, match9: m9, match10: m10, thumbUrls, doubleThumbUrls };
            });
        });
    };

    const formatPtLine = (item) => {
        const base = `${item.name} ${item.match1} ${item.match2} ${item.match3} ${item.match4} ${item.match5}`;
        if (hasDoubleSymbol) {
            return `${base} ${item.match6 || 0} ${item.match7 || 0} ${item.match8 || 0} ${item.match9 || 0} ${item.match10 || 0}`;
        }
        return base;
    };

    const handlePtTableChange = (index, field, value, setPaytableInput) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            setPaytableInput(newItems.map(formatPtLine).join('\n'));
            return newItems;
        });
    };

    const handlePtTableDelete = (index, setPaytableInput) => {
        setPtResultItems(prev => {
            const newItems = prev.filter((_, i) => i !== index);
            setPaytableInput(newItems.map(formatPtLine).join('\n'));
            return newItems;
        });
    };

    const handleAddPtRow = (setPaytableInput) => {
        setPtResultItems(prev => {
            const newItems = [...prev, { name: '新符號', match1: 0, match2: 0, match3: 0, match4: 0, match5: 0, match6: 0, match7: 0, match8: 0, match9: 0, match10: 0, thumbUrls: [], doubleThumbUrls: [] }];
            setPaytableInput(newItems.map(formatPtLine).join('\n'));
            return newItems;
        });
    };

    const handleRemoveThumb = (itemIndex, thumbIndex, isDouble = false) => {
        setPtResultItems(prev => {
            const newItems = [...prev];
            const targetField = isDouble ? 'doubleThumbUrls' : 'thumbUrls';
            if (newItems[itemIndex][targetField]) {
                newItems[itemIndex][targetField].splice(thumbIndex, 1);
            }
            return newItems;
        });
    };

    // === Image Upload ===
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

    // === AI OCR ===
    const handlePtExtract = async (setPaytableInput) => {
        if (ptImages.length === 0) {
            setTemplateError("請先上傳至少一張賠率表圖片");
            return;
        }

        const effectiveApiKey = customApiKey.trim() || apiKey;
        const modelName = customApiKey.trim() ? "gemini-2.5-flash" : "gemini-2.5-flash-preview-09-2025";

        setIsPtProcessing(true);
        setTemplateError("");
        if (setTemplateMessage) setTemplateMessage("AI 正在分析賠率表中...");

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveApiKey}`;
            const imageParts = ptImages.map(img => ({
                inlineData: { mimeType: img.file.type, data: img.base64 }
            }));

            const promptText = buildPaytablePrompt();

            const payload = {
                contents: [{ role: "user", parts: [{ text: promptText }, ...imageParts] }],
                generationConfig: buildPaytableGenerationConfig()
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
                match5: Number(item.match5) || 0,
                match6: Number(item.match6) || 0,
                match7: Number(item.match7) || 0,
                match8: Number(item.match8) || 0,
                match9: Number(item.match9) || 0,
                match10: Number(item.match10) || 0
            }));

            const hasWild = parsedData.some(item => isWildSymbol(item.name));
            if (!hasWild) {
                parsedData.push({ name: 'WILD', match1: 0, match2: 0, match3: 0, match4: 0, match5: 0 });
            }

            setPtResultItems(parsedData.map(item => ({ ...item, thumbUrls: [], doubleThumbUrls: [] })));

            const formattedLines = parsedData.map(item => formatPtLine(item));
            if (setPaytableInput) setPaytableInput(formattedLines.join('\n'));
            if (setTemplateMessage) setTemplateMessage("✅ 賠率表提取完成！可點擊清單手動擷取特徵縮圖。");

        } catch (err) {
            console.warn(err);
            setTemplateError(`賠率分析失敗：${err.message || '未知錯誤'}`);
            if (setTemplateMessage) setTemplateMessage("");
        } finally {
            setIsPtProcessing(false);
        }
    };

    return {
        ptImages, setPtImages,
        isPtProcessing, setIsPtProcessing,
        ptResultItems, setPtResultItems,
        ptCropState, setPtCropState,
        ptEnlargedImg, setPtEnlargedImg,
        ptCropImageRef,
        handlePaytableTextChange,
        handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        handlePtFileChange, handlePtDrop, processPtFiles, removePtImage, clearPtAll,
        handlePtExtract,
    };
}
