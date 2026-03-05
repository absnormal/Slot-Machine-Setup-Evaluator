// === 特殊符號判定輔助函式 ===
export const isScatterSymbol = (sym) => sym && sym.toUpperCase().includes('SCATTER');
export const isCollectSymbol = (sym) => sym && sym.toUpperCase().includes('COLLECT');
export const isWildSymbol = (sym) => sym && sym.toUpperCase().includes('WILD');
export const isCashSymbol = (sym) => sym && sym.toUpperCase().startsWith('CASH');

export const getCashValue = (sym) => {
    if (!isCashSymbol(sym)) return 0;
    const parts = sym.split('_');
    return parts.length > 1 ? parseFloat(parts[1]) || 0 : 0;
};

export const getBaseSymbol = (sym) => {
    if (isCashSymbol(sym)) return 'CASH';
    return sym;
};
