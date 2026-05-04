import { useCallback } from 'react';

/**
 * useSmartDedup — 智慧標記 / 去重 / 手動指定最佳幀
 *
 * 從 useKeyframeExtractor 抽離。純資料計算，無 ref/effect 依賴。
 *
 * 職責：
 *   1. smartDedup()          — Union-Find 分組 + Cascade 合併 + 最佳幀標記
 *   2. confirmDedup()        — 移除非最佳幀
 *   3. setManualBestCandidate() — 手動指定某張卡片為該局最佳
 */
export function useSmartDedup({ setCandidates, setTemplateMessage }) {

    /**
     * 智慧標記：辨識同局幀 → 凸顯最佳、淡化其餘（不刪除）
     *
     * 同局判定（BET 相同時）：
     *   State 1: WIN=0, BAL=B0-BET
     *   State 2: WIN>0, BAL=B0-BET（贏分顯現，餘額尚未更新）
     *   State 3: WIN>0, BAL=B0-BET+WIN（餘額已更新）
     *
     * 選取優先級：State 2 的第一張 > State 2 任一張 > WIN 最大的任一張
     */
    const smartDedup = useCallback(() => {
        setCandidates(prev => {
            if (prev.length <= 1) return prev.map(c => ({ ...c, spinGroupId: 0, isSpinBest: true }));

            // 自動判定：候選列表中有 isCascadeCapture 標記的幀 → 使用 cascade 合併策略
            const hasCascadeFrames = prev.some(c => c.isCascadeCapture);
            const isCascadeMode = hasCascadeFrames;
            const eps = 0.5; // OCR 容差
            const parse = (v) => parseFloat(v) || 0;

            // 解析每幀的數值
            let frames = prev.map((kf, i) => ({
                idx: i,
                kf,
                win: parse(kf.ocrData?.win),
                bal: parse(kf.ocrData?.balance),
                bet: parse(kf.ocrData?.bet),
            }));

            // 【防禦源頭：淨化贏分殘影 (Ghost Win Purify)】
            // 如果 B 的餘額剛好等於 A 的扣款後餘額 (A.bal + A.win - B.bet)，且 B.win == A.win，
            // 代表 B 其實是剛轉動的新局，只是畫面截到了上一局留下來的 WIN！把它淨化成 0。
            frames.sort((a, b) => a.kf.time - b.kf.time);
            for (let i = 1; i < frames.length; i++) {
                const curr = frames[i];
                if (curr.win > 0) {
                    for (let j = i - 1; j >= 0; j--) {
                        const prevF = frames[j];
                        // 找尋近 15 秒內有沒有上一局的殘影
                        if (curr.kf.time - prevF.kf.time > 15) break;

                        if (Math.abs(curr.win - prevF.win) < eps) {
                            // 【局號防呆】：如果兩幀有不同的局號，代表是不同局的真實贏分，不是殘影
                            const currId = curr.kf.ocrData?.orderId;
                            const prevId = prevF.kf.ocrData?.orderId;
                            const stripId = (s) => (s || '').replace(/\D/g, '');
                            if (currId && prevId && stripId(currId) !== stripId(prevId)) continue;

                            const expectedNewBal = prevF.bal + prevF.win - curr.bet;
                            if (curr.bet > 0 && Math.abs(curr.bal - expectedNewBal) < eps) {
                                // 抓到了！這是一個剛開始轉的新局，但帶著舊的 WIN 殘影！
                                curr.win = 0; // 功能邏輯同步淨化
                                curr.kf = {
                                    ...curr.kf,
                                    ocrData: { ...curr.kf.ocrData, win: '0' },
                                    error: '🌟 已淨化前局贏分殘影'
                                };
                                break; // 淨化完畢，這局就是新開的空局，不需再往回找
                            }
                        }
                    }
                }
            }

            // 把順序掛回最初的 idx 順序以配合後續 Union-Find 定義
            frames.sort((a, b) => a.idx - b.idx);

            // 正規化比對：去掉所有非數字字元（解決 OCR 讀出不同格式的 dash，如 22330-845300 vs 2233084530）
            const normalizeId = (s) => s.replace(/\D/g, '');
            const isSimilarStr = (s1, s2) => normalizeId(s1) === normalizeId(s2);

            // 判斷兩幀是否為同一局
            function areSameSpin(frameA, frameB) {
                // 【先鋒判定法則 (Vanguard Rule)：注單號比對】
                const id1 = frameA.kf.ocrData?.orderId;
                const id2 = frameB.kf.ocrData?.orderId;
                const isValidId = (id) => id && id.length >= 5;

                if (isValidId(id1) && isValidId(id2)) {
                    if (isSimilarStr(id1, id2)) {
                        return true; // 身分證高度相似，無條件同局 (解決複雜 FG 算術失效)
                    } else {
                        return false; // 有明確且不同的單號，無條件不同局 (防禦殘影 / 幽冥斷層)
                    }
                }

                // --------- Fallback: 傳統餘額算術比對 ---------
                // 確保 f1 在影片時間上「早於或等於」 f2
                const [f1, f2] = frameA.kf.time <= frameB.kf.time ? [frameA, frameB] : [frameB, frameA];

                // BET 必須一致
                if (Math.abs(f1.bet - f2.bet) > eps && f1.bet > 0 && f2.bet > 0) return false;

                // Case 1: 完全相同 (無關順序)
                if (Math.abs(f1.win - f2.win) < eps && Math.abs(f1.bal - f2.bal) < eps) return true;

                // Case 2: 較早的沒有 WIN，較晚的準備跳 WIN（State 1→2）
                // 嚴格限定：必須是「先沒有贏分 (f1)，後來才有贏分 (f2)」，不能時光倒流！
                if (f1.win < eps && f2.win > eps && Math.abs(f1.bal - f2.bal) < eps) return true;

                // Case 3: 同 WIN, 較晚的 BAL 更新了（State 2→3）
                if (f1.win > eps && f2.win > eps && Math.abs(f1.win - f2.win) < eps) {
                    if (Math.abs(f1.bal + f1.win - f2.bal) < eps) return true;
                }

                // Case 4: 較早的沒有 WIN，較晚的已經結算完畢（State 1→3）
                if (f1.win < eps && f2.win > eps && Math.abs(f1.bal + f2.win - f2.bal) < eps) return true;

                return false;
            }

            // Union-Find 分組
            const parent = frames.map((_, i) => i);
            const groupCode = frames.map(f => {
                const id = f.kf.ocrData?.orderId;
                return (id && id.length >= 5) ? id : null;
            });

            function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }

            function canUnion(a, b) {
                const rootA = find(a);
                const rootB = find(b);
                if (rootA === rootB) return true;
                const idA = groupCode[rootA];
                const idB = groupCode[rootB];
                // 如果兩邊群組都有單號，而且不一樣，就絕對不能縫合！阻止內鬼牽線！
                if (idA && idB && !isSimilarStr(idA, idB)) return false;
                return true;
            }

            function union(a, b) {
                const rootA = find(a);
                const rootB = find(b);
                if (rootA !== rootB) {
                    parent[rootA] = rootB;
                    // 繼承單號血統
                    if (!groupCode[rootB] && groupCode[rootA]) groupCode[rootB] = groupCode[rootA];
                }
            }

            for (let i = 0; i < frames.length; i++) {
                for (let j = i + 1; j < frames.length; j++) {
                    const timeDiff = Math.abs(frames[i].kf.time - frames[j].kf.time);
                    if (timeDiff <= 300 && areSameSpin(frames[i], frames[j])) {

                        // 【終極防呆】：防止 Union-Find 把跨越中獎局的兩個死局縫合
                        // 如果首尾兩張圖都沒有贏分（WIN=0），但它們中間夾了一張有贏分的圖，
                        // 代表這絕對是「跨越了不同局」，不可縫合！
                        let crossWinBoundary = false;
                        if (frames[i].win < eps && frames[j].win < eps) {
                            for (let k = i + 1; k < j; k++) {
                                // 中間只要有任何大於 0 的贏分，這條連線就必須剪斷
                                if (frames[k].win > eps) {
                                    crossWinBoundary = true;
                                    break;
                                }
                            }
                        }

                        if (!crossWinBoundary && canUnion(i, j)) {
                            union(i, j);
                        }
                    }
                }
            }

            // 收集分組
            const groups = {};
            frames.forEach((f, i) => {
                const root = find(i);
                if (!groups[root]) groups[root] = [];
                groups[root].push(f);
            });

            // ==========================================
            // 🔥 [Cascade 智能合併 Pass] 
            // 根據使用者指定的 isCascadeMode 決定合併策略
            // ==========================================
            let finalGroups = Object.values(groups);
            finalGroups.sort((a, b) => a[0].kf.time - b[0].kf.time);

            let foldedGroups = [];

            if (!isCascadeMode) {
                // 完全不做 Cascade 合併
                foldedGroups = finalGroups.map(g => [...g]);
            } else {
                let currentCascade = null;

                for (let i = 0; i < finalGroups.length; i++) {
                    const g = finalGroups[i];
                    let maxWin = -1, rep = g[0];
                    g.forEach(f => { if (f.win > maxWin) { maxWin = f.win; rep = f; } });

                    if (currentCascade) {
                        const prevTime = currentCascade.group[currentCascade.group.length - 1].kf.time;
                        // 用初始 BAL 和最高累計 WIN 來判斷斷層
                        const initBal = currentCascade.initBal;   // cascade 開始時的凍結餘額
                        const totalWin = currentCascade.totalWin;  // 整條鏈的最高累計 WIN
                        const cascadeBet = currentCascade.initBet;
                        
                        const timeDiff = g[0].kf.time - prevTime;

                        // BAL 還凍結在初始值 → cascade 繼續中
                        const isBelowFrozen = Math.abs(rep.bal - initBal) < eps;
                        // BAL 已更新 = initBal + totalWin → 確認是新局（斷層）
                        const isBalSettled = Math.abs(rep.bal - (initBal + totalWin)) < eps;
                        const isWinIncreasing = rep.win >= totalWin;
                        const isSameBet = rep.bet === cascadeBet && rep.bet > 0;
                        const isTieSpin = Math.abs(totalWin - rep.bet) < eps;

                        let shouldMerge = false;

                        if (timeDiff <= 180 && isSameBet) {
                            if (isBelowFrozen && isWinIncreasing) {
                                if (isTieSpin) {
                                    shouldMerge = false; // 平局防呆
                                } else {
                                    shouldMerge = true;
                                }
                            }
                            // BAL 已結算 → 明確斷層，不合併
                            if (isBalSettled && totalWin > eps) {
                                shouldMerge = false;
                            }
                        }

                        if (shouldMerge) {
                            g.forEach(f => f.isCascadeMember = true);
                            currentCascade.group.forEach(f => f.isCascadeMember = true);
                            currentCascade.group.push(...g);
                            currentCascade.totalWin = Math.max(totalWin, rep.win); // 更新最高累計 WIN
                            continue;
                        } else {
                            foldedGroups.push(currentCascade.group);
                            currentCascade = null;
                        }
                    }

                    if (!currentCascade) {
                        currentCascade = {
                            group: [...g],
                            initBal: rep.bal,      // 凍結初始餘額
                            initBet: rep.bet,
                            totalWin: rep.win       // 初始 WIN（可能是 0 或已有值）
                        };
                    }
                }
                if (currentCascade) {
                    foldedGroups.push(currentCascade.group);
                }
            }

            // 把 foldedGroups 內容交接給後續的最佳幀挑選邏輯
            const mergedGroupsList = foldedGroups;

            // 每組標記最佳幀
            const bestIds = new Set();
            let spinGroupCounter = 0;
            const spinGroupMap = {}; // kf.id → spinGroupId

            for (const group of mergedGroupsList) {
                const gid = spinGroupCounter++;
                group.forEach(f => { spinGroupMap[f.kf.id] = { id: gid, isCascadeMember: !!f.isCascadeMember, cascadeDeltaWin: f.cascadeDeltaWin }; });

                if (group.length === 1) {
                    bestIds.add(group[0].kf.id);
                    continue;
                }

                // 🔗 [Cascade Delta WIN] 連鎖序列：按 WIN 去重 → 計算 delta → 只保留 delta > 0 的盤面
                const isCascadeGroup = group.some(f => f.isCascadeMember);
                if (isCascadeGroup) {
                    // Step 1: 按時間排序
                    const sorted = [...group].sort((a, b) => a.kf.time - b.kf.time);

                    // Step 2: 按 WIN 值去重（同一 WIN 值只保留第一張）
                    const seen = new Map(); // winKey → frame
                    for (const f of sorted) {
                        const winKey = Math.round(f.win * 100); // 避免浮點誤差
                        if (!seen.has(winKey)) seen.set(winKey, f);
                    }
                    const unique = [...seen.values()];

                    // Step 3 & 4: 計算 delta WIN，只保留 delta > 0 的盤面
                    let prevWin = 0;
                    let markedCount = 0;
                    for (const f of unique) {
                        const delta = f.win - prevWin;
                        if (delta > eps) {
                            bestIds.add(f.kf.id);
                            spinGroupMap[f.kf.id].cascadeDeltaWin = delta;
                            markedCount++;
                        }
                        prevWin = f.win;
                    }

                    // 保底：如果沒有任何 delta > 0（例如全部 WIN=0），保留最早的一張
                    if (markedCount === 0) {
                        bestIds.add(sorted[0].kf.id);
                    }
                    continue;
                }

                // ── 最佳幀選取：支援消除遊戲的一局多最佳幀 ──
                // 有效 Poll = completed（正常完成）或 forced_with_data（被中斷但已有 WIN）
                const useful = group.filter(f =>
                    f.kf.winPollStatus === 'completed' || f.kf.winPollStatus === 'forced_with_data'
                );

                if (useful.length > 0) {
                    // 每個有效 Poll 結果代表一個獨立的 cascade step → 全部標記最佳
                    useful.forEach(f => bestIds.add(f.kf.id));
                } else {
                    // 無 winPollStatus → 傳統 State 2 邏輯（向下相容）
                    const withWin = group.filter(f => f.win > eps);
                    let best = null;

                    if (withWin.length > 0) {
                        const minBal = Math.min(...withWin.map(f => f.bal));
                        const state2 = withWin.filter(f => Math.abs(f.bal - minBal) < eps);
                        if (state2.length > 0) {
                            best = state2.reduce((a, b) => a.kf.time < b.kf.time ? a : b);
                        } else {
                            best = withWin.reduce((a, b) => a.win > b.win ? a : b);
                        }
                    } else {
                        best = group.reduce((a, b) => a.kf.time < b.kf.time ? a : b);
                    }
                    bestIds.add(best.kf.id);
                }
            }

            const totalGroups = Object.keys(groups).length;
            const multiGroups = Object.values(groups).filter(g => g.length > 1).length;

            setTimeout(() => {
                setTemplateMessage?.(`🧹 分析完成：${prev.length} 幀 → ${totalGroups} 局（${multiGroups} 局有重複幀），已標記最佳`);
            }, 0);

            const cleansedMap = {};
            frames.forEach(f => { cleansedMap[f.kf.id] = f.kf; });

            return prev.map(kf => {
                const safeKf = cleansedMap[kf.id] || kf;
                const mapping = spinGroupMap[kf.id];
                return {
                    ...safeKf,
                    spinGroupId: mapping ? mapping.id : 0,
                    isCascadeMember: mapping ? mapping.isCascadeMember : false,
                    cascadeDeltaWin: mapping ? mapping.cascadeDeltaWin : 0,
                    isSpinBest: bestIds.has(kf.id),
                };
            });
        });
    }, [setCandidates, setTemplateMessage]);

    // 智慧刪除：移除未被標記為 isSpinBest 的幀
    const confirmDedup = useCallback(() => {
        setCandidates(prev => {
            const kept = prev.filter(c => c.isSpinBest !== false); // 保留 best 或是還沒被標記過單局的

            setTimeout(() => {
                setTemplateMessage?.(`已刪除 ${prev.length - kept.length} 張重複畫格，剩餘 ${kept.length} 張`);
            }, 0);

            return kept.map(c => ({ ...c, isSpinBest: undefined })); // 清除標記
        });
    }, [setCandidates, setTemplateMessage]);

    // 手動指定某張卡片為該局的最佳畫格
    const setManualBestCandidate = useCallback((candidateId) => {
        setCandidates(prev => {
            const target = prev.find(c => c.id === candidateId);
            if (!target) return prev;
            const targetGroupId = target.spinGroupId;

            // 只有跑過 smartDedup 的才能指定
            if (targetGroupId === undefined) return prev;

            // 找到同群組的所有卡片
            const sameGroup = prev.filter(c => c.spinGroupId === targetGroupId);
            // 群組內只有一張，不需要切換
            if (sameGroup.length <= 1) return prev;

            // 只切換 isSpinBest 標記，每偵保留自己的 OCR 數據
            // （OCR 數據屬於該偵的截圖時間點，不應搬移）
            return prev.map(c => {
                if (c.spinGroupId === targetGroupId) {
                    return { ...c, isSpinBest: c.id === candidateId };
                }
                return c;
            });
        });
    }, [setCandidates]);

    return { smartDedup, confirmDedup, setManualBestCandidate };
}
