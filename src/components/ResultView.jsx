import React from 'react';
import { Trophy, AlertCircle, Zap, Coins, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { getBaseSymbol, isJpSymbol } from '../utils/symbolUtils';

export default function ResultView({ template, calcData, calcErr, hoveredId, setHoveredId, showAll, setShowAll, betInput, setBetInput, totalBalance, setTotalBalance, setTemplateMessage, isBalanceExpanded, setIsBalanceExpanded }) {
    const handleUpdateBalance = (e) => {
        if (e) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
        }
        const winAmount = calcData?.totalWin || 0;
        setTotalBalance(prev => parseFloat((prev + winAmount).toFixed(4)));
        if (setTemplateMessage) {
            setTemplateMessage(`💰 已將贏分 ${winAmount.toLocaleString()} 加入總資產`);
            setTimeout(() => setTemplateMessage(''), 3000);
        }
    };

    const handleDeductBet = () => {
        const betAmount = parseFloat(betInput) || 0;
        if (betAmount > 0) {
            setTotalBalance(prev => parseFloat((prev - betAmount).toFixed(4)));
            if (setTemplateMessage) {
                setTemplateMessage(`🪙 已扣除押注 -${betAmount.toLocaleString()}`);
                setTimeout(() => setTemplateMessage(''), 3000);
            }
        }
    };

    return (
        <div className="relative flex flex-col h-full lg:block w-full">
            <div className="static lg:absolute lg:inset-0 flex flex-col w-full h-full">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-0">

                    <div className="relative mb-6 space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shrink-0">
                        <button 
                            onClick={() => setIsBalanceExpanded(!isBalanceExpanded)}
                            className={`absolute top-4 right-4 text-xs font-black flex items-center gap-1.5 px-3 py-1 rounded-full transition-all shadow-sm z-10 ${
                                isBalanceExpanded 
                                ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95'
                            }`}
                        >
                            {isBalanceExpanded ? <><ChevronUp size={14}/> 收合資產</> : <><ChevronDown size={14}/> 展開資產 (Assets)</>}
                        </button>

                        {/* 第一排：[押注] [自動即時結算] */}
                        <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                            <div className="flex-1 w-full">
                                <div className="mb-1.5">
                                    <label className="block text-sm font-bold text-slate-700">押注 (Total Bet)</label>
                                </div>
                                <div className="relative">
                                    <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input 
                                        type="number" 
                                        value={betInput} 
                                        onChange={(e) => setBetInput(e.target.value)} 
                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateBalance(e)}
                                        className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-black text-lg text-indigo-700 shadow-sm transition-shadow" 
                                    />
                                </div>
                            </div>
                            {isBalanceExpanded ? (
                                <button 
                                    onClick={handleDeductBet}
                                    className="px-6 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 h-[46px] w-full sm:w-auto shrink-0 cursor-pointer"
                                >
                                    <Coins size={18} className="text-rose-500" /> 扣一次BET
                                </button>
                            ) : (
                                <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-lg flex items-center justify-center gap-2 shadow-sm pointer-events-none select-none h-[46px] w-full sm:w-auto shrink-0">
                                    <Zap size={18} className="fill-emerald-500 text-emerald-500" /> 自動即時結算
                                </div>
                            )}
                        </div>

                        {/* 第二排：[目前總財產] [+] [預期總財產] */}
                        {isBalanceExpanded && (
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end pt-3 border-t border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* 目前總財產 */}
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">目前總財產 (Assets)</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                                        <input 
                                            type="number" 
                                            value={totalBalance} 
                                            onChange={(e) => setTotalBalance(parseFloat(e.target.value) || 0)} 
                                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateBalance(e)}
                                            className="w-full h-[28px] pl-6 pr-2 py-1 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none font-black text-sm text-slate-700 shadow-sm transition-shadow" 
                                        />
                                    </div>
                                </div>

                                {/* [+] 按鈕 (置中) */}
                                <div className="flex items-center justify-center h-[28px]">
                                    <button 
                                        type="button"
                                        onClick={handleUpdateBalance}
                                        className="w-[28px] h-[28px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md shadow-md transition-all active:scale-95 flex items-center justify-center shrink-0"
                                        title="將贏分加入總財產 (Enter)"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                </div>

                                {/* 預計結算後餘額 */}
                                <div className="w-full">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">預計結算後餘額 (Expected)</label>
                                    <div className="relative bg-white h-[28px] rounded-md border border-slate-300 shadow-sm flex items-center">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                                        <span className="w-full pl-6 pr-2 font-black text-sm text-slate-700 truncate">
                                            {(parseFloat((totalBalance + (calcData?.totalWin || 0)).toFixed(4))).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {calcErr && (
                        <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200 shadow-sm shrink-0">
                            <AlertCircle size={18} className="shrink-0" />
                            <span>{calcErr}</span>
                        </div>
                    )}

                    {calcData ? (
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4 shrink-0">
                                <div className="flex flex-col space-y-2">
                                    <h2 className="text-xl font-semibold flex items-center gap-2"><Trophy className="text-amber-500" size={24} />結算清單</h2>
                                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border hover:bg-slate-100 transition-colors">
                                        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                        <span className="font-medium">顯示所有連線 (含未中獎)</span>
                                    </label>
                                </div>
                                <div className="text-right bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-100 transition-all duration-300">
                                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-0.5">Total Win</p>
                                    <p className="text-3xl font-black text-emerald-600">{calcData.totalWin.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0 max-h-[440px]">
                                {calcData.details.filter(d => showAll || d.winAmount > 0).length === 0 ? (
                                    <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200 animate-in fade-in duration-300">
                                        <p className="text-lg">此盤面未達成任何連線中獎 😢</p>
                                    </div>
                                ) : (
                                    calcData.details.filter(d => showAll || d.winAmount > 0).map((result, idx) => {
                                        const isWin = result.winAmount > 0;
                                        const isScatterWin = String(result.lineId).startsWith('SCATTER');
                                        const isCollectWin = String(result.lineId).startsWith('COLLECT');
                                        const isWaysWin = String(result.lineId).startsWith('WAYS_');

                                        let rowBgClass = 'opacity-60 grayscale bg-slate-50';
                                        let idBgClass = 'bg-slate-200 border-slate-300';
                                        let idTextClass = 'text-slate-500';
                                        let idLabel = result.lineId;

                                        if (isWin) {
                                            if (isScatterWin) {
                                                rowBgClass = 'bg-amber-50 border-amber-200 shadow-sm hover:border-amber-400 hover:shadow-md';
                                                idBgClass = 'bg-[#291a1a] border-amber-500';
                                                idTextClass = 'text-amber-400';
                                                idLabel = 'SC';
                                            } else if (isCollectWin) {
                                                rowBgClass = 'bg-emerald-50 border-emerald-200 shadow-sm hover:border-emerald-400 hover:shadow-md';
                                                idBgClass = 'bg-[#1a2923] border-emerald-500';
                                                idTextClass = 'text-emerald-400';
                                                idLabel = '💰';
                                            } else if (isWaysWin) {
                                                rowBgClass = 'bg-purple-50 border-purple-200 shadow-sm hover:border-purple-400 hover:shadow-md';
                                                idBgClass = 'bg-[#231a29] border-purple-500';
                                                idTextClass = 'text-purple-400';
                                                idLabel = result.ways || '';
                                            } else {
                                                rowBgClass = 'bg-white border-indigo-100 shadow-sm hover:border-indigo-300 hover:shadow-md';
                                                idBgClass = 'bg-[#1a1c29] border-slate-500';
                                                idTextClass = 'text-white';
                                            }
                                        }

                                        const collectedJps = isCollectWin && template?.jpConfig
                                            ? [...new Set(result.symbolsOnLine.filter(sym => typeof sym === 'string' && isJpSymbol(sym, template.jpConfig)))]
                                            : [];

                                        return (
                                            <div key={idx} className={`p-2 rounded-lg border flex items-center gap-3 transition-all duration-300 cursor-pointer animate-in fade-in slide-in-from-bottom-2 ${rowBgClass}`} onMouseEnter={() => setHoveredId(result.lineId)} onMouseLeave={() => setHoveredId(null)}>
                                                <div className={`w-12 h-16 shrink-0 flex flex-col justify-between rounded-md border shadow-sm overflow-hidden ${idBgClass}`}>
                                                    <div className="flex-1 min-h-0 flex items-center justify-center px-1 pt-1 relative">
                                                        {template?.symbolImages?.[getBaseSymbol(result.symbol, template.jpConfig)] ? (
                                                            <img src={template.symbolImages[getBaseSymbol(result.symbol, template.jpConfig)]} className="max-w-full max-h-full object-contain drop-shadow-md" alt={result.symbol} />
                                                        ) : (
                                                            <span className={`text-[10px] font-black leading-tight text-center ${isWin ? 'text-slate-300' : 'text-slate-500'}`}>{getBaseSymbol(result.symbol, template.jpConfig)}</span>
                                                        )}
                                                    </div>
                                                    <div className={`shrink-0 pb-1 text-center text-sm font-black tracking-wider ${idTextClass}`}>
                                                        {idLabel}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`font-bold text-sm truncate ${isScatterWin ? 'text-amber-700' : isCollectWin ? 'text-emerald-700' : isWaysWin ? 'text-purple-700' : 'text-slate-800'}`}>
                                                                {isCollectWin ? '金幣收集成功' : isWaysWin ? `${result.symbol} ${result.count} 連 × ${result.ways} Ways` : `${result.symbol} ${result.count} ${isScatterWin ? '個' : '連'}`}
                                                            </span>
                                                            {isWin ? (
                                                                <div className="flex items-center gap-1">
                                                                    {collectedJps.map((jp, i) => (
                                                                        <span key={i} className="text-[10px] px-2 py-0.5 font-black rounded-full bg-amber-500 text-white shadow-sm border border-amber-600 animate-pulse whitespace-nowrap">
                                                                            🏆 {jp.toUpperCase()} {template.jpConfig[jp.toUpperCase()]}x
                                                                        </span>
                                                                    ))}
                                                                    <span className={`text-[10px] px-2 py-0.5 font-bold rounded-full border whitespace-nowrap ${isScatterWin ? 'bg-amber-100 text-amber-700 border-amber-300' : isCollectWin ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : isWaysWin ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                                                        {isCollectWin ? `總面額 ${result.payoutMult}` : `倍率 ${result.payoutMult}x`}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full font-medium whitespace-nowrap">未中獎</span>
                                                            )}
                                                        </div>
                                                        <span className={`font-black text-sm shrink-0 ml-2 ${isWin ? (isScatterWin ? 'text-amber-600' : isWaysWin ? 'text-purple-600' : 'text-emerald-600') : 'text-slate-400'}`}>
                                                            {isWin ? `+${result.winAmount.toLocaleString()}` : '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <div className="text-[10px] text-slate-500 font-mono bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                                            <span className="text-slate-400 font-bold">路線:</span>
                                                            {isScatterWin ? (
                                                                <span className="text-amber-600 font-black px-1">全盤散佈 (Anywhere)</span>
                                                            ) : isCollectWin ? (
                                                                <span className="text-emerald-600 font-black px-1">{result.positions[0]}</span>
                                                            ) : isWaysWin ? (
                                                                <span className="text-purple-600 font-black px-1">{result.positions[0]}</span>
                                                            ) : (
                                                                <React.Fragment>
                                                                    {result.positions.map((pos, i) => (
                                                                        <React.Fragment key={i}>
                                                                            <span className={i < result.count && isWin ? 'text-indigo-600 font-black' : ''}>{pos}</span>
                                                                            {i < result.positions.length - 1 && <span className="text-slate-300 mx-0.5">-</span>}
                                                                        </React.Fragment>
                                                                    ))}
                                                                </React.Fragment>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-50">
                            <Trophy size={48} className="mb-2" />
                            <p>等待盤面與結算資料...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
