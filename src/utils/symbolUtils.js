// === 特殊符號判定輔助函式 ===
export const isScatterSymbol = (sym) => sym && sym.toUpperCase().includes('SCATTER');
export const isCollectSymbol = (sym) => sym && sym.toUpperCase().includes('COLLECT');
export const isDynamicMultiplierSymbol = (sym) => {
    if (!sym || typeof sym !== 'string') return false;
    return /^x\d+(?:\.\d+)?$/i.test(sym) || /^WILD_x\d+(?:\.\d+)?$/i.test(sym) || /^xN$/i.test(sym);
};

export const isWildSymbol = (sym) => {
    if (!sym || typeof sym !== 'string') return false;
    return sym.toUpperCase().includes('WILD') || isDynamicMultiplierSymbol(sym);
};

// JP 符號需透過 template.jpConfig 來判定
export const isJpSymbol = (sym, jpConfig = {}) => sym && typeof sym === 'string' && Object.keys(jpConfig || {}).includes(sym.toUpperCase());

export const isDoubleSymbol = (sym) => sym && typeof sym === 'string' && sym.toLowerCase().endsWith('_double');

export const getSymbolCount = (sym) => isDoubleSymbol(sym) ? 2 : 1;

export const getSymbolMultiplier = (sym) => {
    if (!sym || typeof sym !== 'string') return 1;
    // Handle suffix format: Symbol_x5
    const suffixMatch = sym.match(/_x(\d+(?:\.\d+)?)$/i);
    if (suffixMatch) return parseFloat(suffixMatch[1]);
    // Handle standalone/prefix format: x5, x2
    const prefixMatch = sym.match(/^x(\d+(?:\.\d+)?)$/i);
    if (prefixMatch) return parseFloat(prefixMatch[1]);
    return 1;
};

export const isMultiplierSymbol = (sym) => {
    return getSymbolMultiplier(sym) > 1;
};

export const isCashSymbol = (sym, jpConfig = {}) => {
    if (!sym || typeof sym !== 'string') return false;
    if (sym.toUpperCase().startsWith('CASH')) return true;
    if (isJpSymbol(sym, jpConfig)) return true;
    return false;
};

export const formatShorthandValue = (num) => {
    if (num === null || num === undefined || isNaN(num) || num === 0) return '';
    const absNum = Math.abs(num);
    if (absNum >= 1000000000) return +(num / 1000000000).toFixed(2) + 'B';
    if (absNum >= 1000000) return +(num / 1000000).toFixed(2) + 'M';
    if (absNum >= 1000) return +(num / 1000).toFixed(2) + 'K';
    return String(num);
};

export const parseShorthandValue = (str) => {
    if (!str || typeof str !== 'string') return parseFloat(str) || 0;
    const cleanStr = str.trim().toUpperCase();
    const multiplier = cleanStr.endsWith('K') ? 1000 :
        cleanStr.endsWith('M') ? 1000000 :
            cleanStr.endsWith('B') ? 1000000000 : 1;
    const numPart = multiplier !== 1 ? cleanStr.slice(0, -1) : cleanStr;
    const val = parseFloat(numPart);
    return isNaN(val) ? 0 : val * multiplier;
};

export const getCashValue = (sym, jpConfig = {}) => {
    if (!isCashSymbol(sym, jpConfig)) return 0;
    if (isJpSymbol(sym, jpConfig)) {
        return parseFloat(jpConfig[sym.toUpperCase()]) || 0;
    }
    const parts = sym.split('_');
    const lastPart = parts[parts.length - 1];
    return parseShorthandValue(lastPart);
};

export const getCollectValue = (sym) => {
    if (!isCollectSymbol(sym)) return 0;
    const parts = sym.split('_');
    const lastPart = parts[parts.length - 1];
    return parseShorthandValue(lastPart);
};

export const getBaseSymbol = (sym, jpConfig = {}) => {
    if (!sym || typeof sym !== 'string') return sym;
    if (isDynamicMultiplierSymbol(sym) && sym.toUpperCase() !== 'XN') return 'xN';
    let base = sym;
    if (isDoubleSymbol(base)) {
        base = base.slice(0, -7); // strip '_double'
    }
    // Handle xN multiplier: e.g. "Grape_x5" -> "Grape"
    const multMatch = base.match(/_x(\d+(?:\.\d+)?)$/i);
    if (multMatch) {
        base = base.replace(/_x(\d+(?:\.\d+)?)$/i, '');
    }
    if (isJpSymbol(base, jpConfig)) return base.toUpperCase();
    if (isCashSymbol(base, jpConfig) || isCollectSymbol(base)) {
        const parts = base.split('_');
        const lastPart = parts[parts.length - 1];
        // If the last part has a number or a unit shorthand, it's a value part
        const hasNumber = /[0-9]/.test(lastPart);
        if (parts.length > 1 && hasNumber) {
            return parts.slice(0, -1).join('_');
        }
        return base;
    }
    return base;
};

/**
 * 尋找最適合該符號呈現的圖片
 * 處理 AI 辨識出的動態符號 (如 COLLECT_500) 與 模板原始定義 (如 漁夫COLLECT) 的對應
 */
export const getSymbolDisplayImage = (sym, symbolImages, jpConfig = {}) => {
    if (!sym || !symbolImages) return null;
    
    // 1. 直覺匹配 (完整名稱)
    if (symbolImages[sym]) return symbolImages[sym];
    
    // 2. 基本符號匹配 (剝除 _double, _xN, _value)
    const base = getBaseSymbol(sym, jpConfig);
    if (symbolImages[base]) return symbolImages[base];
    
    // 3. 模糊匹配：處理 COLLECT_500 -> 漁夫COLLECT 這種情況
    const isCollect = isCollectSymbol(sym);
    const isCash = isCashSymbol(sym, jpConfig);
    const isScatter = isScatterSymbol(sym);
    const isWild = isWildSymbol(sym);
    
    if (isCollect || isCash || isScatter || isWild) {
        // 在所有已登記的小圖中尋找具有相同特性的「基底」圖片
        const allKeys = Object.keys(symbolImages);
        
        // 優先找完全包含 base 名稱的 (例如 sym="COLLECT_500", base="COLLECT", key="漁夫COLLECT")
        const partialMatch = allKeys.find(k => k.toUpperCase().includes(base.toUpperCase()));
        if (partialMatch) return symbolImages[partialMatch];
        
        // 次之依據符號類別尋找
        const categoryMatch = allKeys.find(k => {
            if (isCollect) return isCollectSymbol(k);
            if (isCash) return isCashSymbol(k, jpConfig);
            if (isScatter) return isScatterSymbol(k);
            if (isWild) return isWildSymbol(k);
            return false;
        });
        if (categoryMatch) return symbolImages[categoryMatch];
    }
    
    return null;
};