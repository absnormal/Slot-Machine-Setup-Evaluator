/**
 * exprEvaluator.js — 安全的表達式解析器（無 eval / Function）
 *
 * 支援：
 *   - 數字字面值：123, 0.5, -3
 *   - 字串字面值："text", 'text'
 *   - 比較：==  !=  ===  !==  <  >  <=  >=
 *   - 邏輯：&&  ||  !
 *   - 算術：+  -  *  /  %
 *   - 分組：( expr )
 *
 * 設計原則：
 *   - 零外部依賴
 *   - 變數替換在外部完成（由 FlowRunner 替換 $var 後傳入）
 *   - 遇到語法錯誤回傳 0 / false，不拋出例外
 */

// ─────────────────────────────────────────
// Tokenizer
// ─────────────────────────────────────────

const TK = {
    NUM: 'NUM', STR: 'STR',
    OP: 'OP', LPAREN: 'LPAREN', RPAREN: 'RPAREN',
    EOF: 'EOF',
};

function tokenize(src) {
    const tokens = [];
    let i = 0;
    const s = String(src).trim();

    while (i < s.length) {
        // 空白
        if (/\s/.test(s[i])) { i++; continue; }

        // 字串字面值
        if (s[i] === '"' || s[i] === "'") {
            const q = s[i++];
            let str = '';
            while (i < s.length && s[i] !== q) {
                if (s[i] === '\\') { i++; str += s[i] ?? ''; }
                else str += s[i];
                i++;
            }
            i++; // closing quote
            tokens.push({ type: TK.STR, value: str });
            continue;
        }

        // 數字（含負數 - 但僅在開頭或運算符後）
        if (/\d/.test(s[i]) || (s[i] === '-' && /\d/.test(s[i + 1] ?? '') &&
            (tokens.length === 0 || tokens[tokens.length - 1].type === TK.OP || tokens[tokens.length - 1].type === TK.LPAREN))) {
            let num = s[i++];
            while (i < s.length && /[\d.]/.test(s[i])) num += s[i++];
            tokens.push({ type: TK.NUM, value: Number(num) });
            continue;
        }

        // 小括號
        if (s[i] === '(') { tokens.push({ type: TK.LPAREN }); i++; continue; }
        if (s[i] === ')') { tokens.push({ type: TK.RPAREN }); i++; continue; }

        // 多字元運算符（優先匹配長的）
        const multi = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||'];
        let matched = false;
        for (const op of multi) {
            if (s.startsWith(op, i)) {
                tokens.push({ type: TK.OP, value: op });
                i += op.length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // 單字元運算符
        if (/[+\-*/%<>!]/.test(s[i])) {
            tokens.push({ type: TK.OP, value: s[i++] });
            continue;
        }

        // 未知字元跳過
        i++;
    }

    tokens.push({ type: TK.EOF });
    return tokens;
}

// ─────────────────────────────────────────
// Parser (Pratt / Precedence Climbing)
// ─────────────────────────────────────────

const PREC = {
    '||': 1, '&&': 2,
    '==': 3, '!=': 3, '===': 3, '!==': 3,
    '<': 4, '>': 4, '<=': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6,
};

function parse(tokens) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    function parseExpr(minPrec = 0) {
        let left = parseUnary();

        while (true) {
            const tok = peek();
            if (tok.type !== TK.OP) break;
            const prec = PREC[tok.value];
            if (prec === undefined || prec <= minPrec) break;
            consume();
            const right = parseExpr(prec); // left-associative
            left = { op: tok.value, left, right };
        }

        return left;
    }

    function parseUnary() {
        const tok = peek();
        if (tok.type === TK.OP && tok.value === '!') {
            consume();
            return { op: '!', operand: parseUnary() };
        }
        return parsePrimary();
    }

    function parsePrimary() {
        const tok = consume();
        if (tok.type === TK.NUM) return { value: tok.value };
        if (tok.type === TK.STR) return { value: tok.value };
        if (tok.type === TK.LPAREN) {
            const expr = parseExpr();
            consume(); // RPAREN
            return expr;
        }
        // fallback
        return { value: 0 };
    }

    return parseExpr();
}

// ─────────────────────────────────────────
// Evaluator
// ─────────────────────────────────────────

function evalAST(node) {
    if ('value' in node) return node.value;

    if (node.op === '!') return !evalAST(node.operand);

    const L = evalAST(node.left);
    const R = evalAST(node.right);

    // 嘗試數值比較（'5' vs 5 → 5 vs 5）
    const lNum = Number(L);
    const rNum = Number(R);
    const bothNum = !isNaN(lNum) && !isNaN(rNum) && L !== '' && R !== '';

    switch (node.op) {
        // 比較
        case '===': return L === R;
        case '!==': return L !== R;
        // 寬鬆比較：數字優先
        case '==':  return bothNum ? lNum === rNum : String(L) === String(R);
        case '!=':  return bothNum ? lNum !== rNum : String(L) !== String(R);
        case '<':   return bothNum ? lNum < rNum   : String(L) < String(R);
        case '>':   return bothNum ? lNum > rNum   : String(L) > String(R);
        case '<=':  return bothNum ? lNum <= rNum  : String(L) <= String(R);
        case '>=':  return bothNum ? lNum >= rNum  : String(L) >= String(R);
        // 邏輯
        case '&&': return L && R;
        case '||': return L || R;
        // 算術
        case '+': return bothNum ? lNum + rNum : String(L) + String(R);
        case '-': return bothNum ? lNum - rNum : NaN;
        case '*': return lNum * rNum;
        case '/': return rNum !== 0 ? lNum / rNum : 0;
        case '%': return rNum !== 0 ? lNum % rNum : 0;
        default:  return 0;
    }
}

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/**
 * 對已完成變數替換的字串求值，回傳 boolean。
 * 遇到任何錯誤（語法/型別）回傳 false。
 * @param {string} substituted - 已替換 $var 的條件字串
 * @returns {boolean}
 */
export function evalConditionStr(substituted) {
    try {
        const tokens = tokenize(substituted);
        const ast = parse(tokens);
        return !!evalAST(ast);
    } catch {
        return false;
    }
}

/**
 * 對已完成變數替換的字串求算術值，回傳 number 或 string。
 * 遇到任何錯誤回傳 0。
 * @param {string} substituted - 已替換 $var 的算術字串
 * @returns {number|string}
 */
export function evalArithStr(substituted) {
    try {
        const tokens = tokenize(substituted);
        const ast = parse(tokens);
        return evalAST(ast);
    } catch {
        return 0;
    }
}
