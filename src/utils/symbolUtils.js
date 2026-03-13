// === 特殊符號判定輔助函式 ===
export const isScatterSymbol = (sym) => sym && sym.toUpperCase().includes('SCATTER');
export const isCollectSymbol = (sym) => sym && sym.toUpperCase().includes('COLLECT');
export const isWildSymbol = (sym) => sym && sym.toUpperCase().includes('WILD');

// JP 符號需透過 template.jpConfig 來判定
export const isJpSymbol = (sym, jpConfig = {}) => sym && typeof sym === 'string' && Object.keys(jpConfig || {}).includes(sym.toUpperCase());

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

export const getBaseSymbol = (sym, jpConfig = {}) => {
    if (isJpSymbol(sym, jpConfig)) return sym.toUpperCase();
    if (isCashSymbol(sym, jpConfig)) {
        const parts = sym.split('_');
        const lastPart = parts[parts.length - 1];
        // If the last part has a number or a unit shorthand, it's a value part
        const hasNumber = /[0-9]/.test(lastPart);
        if (parts.length > 1 && hasNumber) {
            return parts.slice(0, -1).join('_');
        }
        return sym;
    }
    return sym;
};
