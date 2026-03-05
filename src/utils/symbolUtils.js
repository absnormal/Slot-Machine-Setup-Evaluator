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

export const getCashValue = (sym, jpConfig = {}) => {
    if (!isCashSymbol(sym, jpConfig)) return 0;
    if (isJpSymbol(sym, jpConfig)) {
        return parseFloat(jpConfig[sym.toUpperCase()]) || 0;
    }
    const parts = sym.split('_');
    return parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
};

export const getBaseSymbol = (sym, jpConfig = {}) => {
    if (isCashSymbol(sym, jpConfig)) return isJpSymbol(sym, jpConfig) ? sym.toUpperCase() : 'CASH';
    return sym;
};
