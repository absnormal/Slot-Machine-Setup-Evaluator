# 專案特定規則 (Project Rules)

1. **中文計畫書 (Chinese Plans Only)**: 所有提供的 `implementation_plan.md` 與相關規劃文件，必須使用 **繁體中文** 撰寫。
2. 環境不支援 '&&' 語彙基元不是有效的陳述式分隔符號，terminal相關指令要使用其他方式
3. **自動 Git Commit (Automatic Git Commits)**: 只要有任何程式碼變動（新增、修改、刪除、還原），都必須執行 `git commit`。
4. **Commit 訊息規範**: 必須使用 **使用者下達的原始指令文字**，或是**執行的PLAN名稱**(優先) 作為 `git commit -m` 的參數。
5. 計畫中不需要包含驗證部分，我會自己驗收