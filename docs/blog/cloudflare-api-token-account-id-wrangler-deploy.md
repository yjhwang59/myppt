---
title: "如何取得 Cloudflare API Token 與 Account ID：給 Wrangler 一鍵部署"
description: "Wrangler 一鍵部署需要兩把鑰匙：CLOUDFLARE_API_TOKEN 授權「可以部署」，CLOUDFLARE_ACCOUNT_ID 指定「部署到哪個帳號」。PUBLIC_DECK_BASE_URL 則決定 Admin 複製出來的公開網址。會員全文含 Dashboard 逐步操作、最小權限表與檢查清單。"
date: "2026-08-31"
author: "Jack Y. J. Hwang"
tags: ["Cloudflare", "Wrangler", "Workers", "API Token", "Account ID", "AI-EIP", "部署", "環境變數"]
category: "實戰資源"
memberOnly: true
draft: false
featured: false
seoTitle: "Cloudflare Token 與 Account ID｜Wrangler 部署（會員）"
seoDescription: "會員專屬：從 Dashboard 建立 Edit Cloudflare Workers Token、複製 Account ID，並判斷何時填 PUBLIC_DECK_BASE_URL。"
sourceProject: "AI-EIP"
sourcePath: "docs/blog/cloudflare-api-token-account-id-wrangler-deploy.md"
---

本機 Admin 按「上傳正式環境」時，系統會用 Wrangler（Cloudflare 的命令列部署工具）把簡報靜態檔推到 Workers。這一步**不是登入瀏覽器**，而是讀本機 `.env` 裡的兩組憑證：`CLOUDFLARE_API_TOKEN` 與 `CLOUDFLARE_ACCOUNT_ID`。少了 Token，部署會直接失敗；Account ID 則告訴 Wrangler 要把 Worker 放到哪一個帳號。第三個變數 `PUBLIC_DECK_BASE_URL` 是選填，用來在解析 stdout 失敗、或你已綁自訂網域時，仍能正確顯示／複製公開簡報網址。

本文以 AI-EIP 為實作情境，步驟對任何用 Wrangler 部署 Workers 的專案同樣適用。

可登入後開啟 [Cloudflare Token 與 Account ID 教學簡報](/blog/cloudflare-api-token-account-id-wrangler-deploy-deck)。

## 這篇文章適合誰

- 第一次把本機專案部署到 Cloudflare Workers 的 AI Builder 與學員
- 要設定 AI-EIP Admin「一鍵上稿」、或 GitHub Actions `workflow_dispatch` 部署的實作者
- 已經有 Cloudflare 帳號，但不知道 Token 與 Account ID 差在哪裡的人

讀完後，你應能：

1. 用 Dashboard 建立最小夠用的 API Token，並只顯示一次時就複製走
2. 從 Workers & Pages 或搜尋列複製 Account ID
3. 判斷要不要填 `PUBLIC_DECK_BASE_URL`，以及填錯會發生什麼事
4. 用官方 verify 端點與本機 Admin 驗證部署鏈是否通

相關文章可對照：[用手機指揮 Cursor Agent 建站：mybike × GitHub × Cloudflare](/blog/cursor-agent-mobile-mybike-github-cloudflare)、[從 SRS 到部署準備：Codex、GitHub、Cloudflare](/blog/codex-github-cloudflare-ai-system-mvp)、[Cursor、Codex、GitHub 的 AI 開發工作流](/blog/cursor-codex-github-ai-dev-workflow)。

## 先說結論

- **Token 是密碼，Account ID 是門牌。** Token 授權「可以部署」；Account ID 指定「部署到哪一個 Cloudflare 帳號」。兩者都要寫進本機 `.env`，且 **Token 絕不可提交 Git**。
- 建議從官方模板 **Edit Cloudflare Workers** 建立 Token（見 [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)），不要用過時的 Global API Key。
- Account ID 可在 Dashboard 用搜尋列輸入 `Copy account ID`，或到 **Workers & Pages** 的 Account Details 複製（官方說明：[Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)）。它**不是** `workers.dev` 子網域名稱。
- `PUBLIC_DECK_BASE_URL` **選填**。有填時會**優先**當成公開網址基底；沒填時才從 `wrangler deploy` 輸出解析 `*.workers.dev`。佔位字串 `https://ai-eip.<your-subdomain>.workers.dev` 必須換成真實 URL，否則複製出來的連結會是錯的。
- 改完 `.env` 後要**重啟**本機 Admin（`dotenv` 在行程啟動時載入）。同一組 Token／Account ID 也可放進 GitHub Actions Secrets，供手動 workflow 使用。

## 背景／問題

AI-EIP 把「講稿、TTS、Admin」留在本機，只把 `presentations/` 靜態檔部署到 Cloudflare Workers（`wrangler.jsonc` 的 Worker 名稱是 `ai-eip`）。因此：

```text
本機 Admin「上傳正式環境」
  → 讀 .env 的 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
  → npx wrangler deploy
  → 解析或改用 PUBLIC_DECK_BASE_URL
  → 顯示並可複製 https://…/{deckId}.html
```

常見卡住點不是程式，而是憑證沒填、權限不夠、或把 Account ID 與 workers.dev 子網域搞混。Wrangler 官方把這兩個值列為系統環境變數（[System environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)）：有設 `CLOUDFLARE_API_TOKEN` 時，會用 Token 認證，而不是互動式 `wrangler login`。這正是 Admin 一鍵部署與 CI 所需要的非互動模式。

## 核心說明

### 三個變數各做什麼

| 變數 | 必填？ | 是什麼 | 從哪裡來 | 填錯會怎樣 |
| --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 必填 | 有時效、可限權的存取憑證 | Dashboard → My Profile → API Tokens | 缺少時 Admin 會報「缺少 CLOUDFLARE_API_TOKEN」；權限不足則 `wrangler deploy` 失敗 |
| `CLOUDFLARE_ACCOUNT_ID` | 建議必填 | 帳號的 32 字元十六進位識別碼 | Dashboard 複製 Account ID | 多帳號時可能部署到錯誤帳號；未填時 Wrangler 可能無法判斷目標帳號 |
| `PUBLIC_DECK_BASE_URL` | 選填 | 公開簡報的**網址前綴**（不含檔名） | 第一次成功部署後的 `*.workers.dev`，或自訂網域 | 有填就優先使用；填成佔位字串或舊網域，Admin 會複製錯誤連結（Worker 其實可能已部署成功） |

Token 與 Account ID 是 **Cloudflare／Wrangler 認證**；`PUBLIC_DECK_BASE_URL` 只影響 **Admin 顯示與複製的公開 URL**，不代替部署本身。

### 1. 取得 `CLOUDFLARE_API_TOKEN`

官方建立步驟見 [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)（文件更新日期：2026-04-20）。

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 建立**使用者 Token**：右上角頭像 → **My Profile** → **API Tokens**（直接連結：[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)）。若組織要用與個人無關的服務憑證，改走 **Manage Account → API Tokens**（需 Superadmin；且端點須支援 Account Token）。
3. 選 **Create Token**。
4. 在模板中找 **Edit Cloudflare Workers** → **Use template**。此模板預設權限包含（[token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)）：
   - Zone：Workers Routes Write
   - Account：Workers Scripts Write、Workers KV Storage Write、Workers Tail Read、Workers R2 Storage Write、Account Settings Read
   - User：User Details Read、User Memberships Read
5. 把 Token 名稱改成可辨識的用途，例如 `ai-eip-local-deploy`。
6. **Account resources** 建議只包含你要部署的那一個帳號，不要「Include all accounts」（除非你確實需要）。
7. 可選：加上 Client IP 過濾或 TTL（[Restrict token use](https://developers.cloudflare.com/fundamentals/api/how-to/restrict-tokens/)）。
8. **Continue to summary** → 確認 → **Create Token**。
9. **立刻複製** Token 到密碼管理器或本機 `.env`。畫面上的 secret **只顯示一次**。新格式 Token 可能帶 `cfut_` 前綴，方便掃漏工具辨識外洩。

若你要最小權限、且 AI-EIP 目前沒有 KV／R2／自訂網域路由，可改 **Create Custom Token**，至少包含：

| 範圍 | 權限 | 原因 |
| --- | --- | --- |
| Account | Workers Scripts → Edit | 實際上傳／更新 Worker |
| Account | Account Settings → Read | Wrangler 讀帳號資訊 |
| User | User Details → Read | Token 驗證與身分 |

實際畫面可對照下列兩張（Token 名稱範例：`ai-eip-local-deploy`）：

![Cloudflare Create Custom Token：Workers Scripts Edit、Account Settings Read、User Details Read](/blog/cloudflare-api-token-account-id-wrangler-deploy/custom-token-permissions.png "Create Custom Token 最小權限設定")

![Cloudflare API token summary：確認權限後按 Create Token](/blog/cloudflare-api-token-account-id-wrangler-deploy/custom-token-summary.png "API token summary 確認頁")

摘要頁若顯示 **All accounts**，代表此 Token 可對帳號內所有帳戶套用上述權限。能選單一帳號時仍建議限縮；無法限縮時，至少不要再加多餘權限。之後若要綁自訂網域，再補 Zone → Workers Routes → Edit。課堂第一次上線也可改用 **Edit Cloudflare Workers** 模板，較不容易因權限不足卡住。

建立後可用官方 verify 端點確認 Token 有效（把 `<API_TOKEN>` 換成你的值，**不要**把真實 Token 貼到聊天或 issue）：

```bash
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" --header "Authorization: Bearer <API_TOKEN>"
```

成功時 `success` 為 `true`，訊息會類似 `This API Token is valid and active`。

**不要用** `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`（舊的 Global API Key）。權限過大，也不符合 Wrangler 現行建議。

### 2. 取得 `CLOUDFLARE_ACCOUNT_ID`

Account ID 不是機密到不能出現在文件裡，但仍不宜公開貼在社群貼文；它會出現在 API 路徑中。取得方式（[官方文件](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)，更新日期：2026-08-03）：

**方法 A — 搜尋列（最快）**

1. 開啟 [Account home](https://dash.cloudflare.com/?to=/:account/home)。
2. 按 `Ctrl+K`（macOS 為 `Cmd+K`）或點 **Search**。
3. 輸入 `Copy account ID`，選結果即可複製。

**方法 B — Workers & Pages**

1. 開啟 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)。
2. 找到 **Account Details**。
3. 按 Account ID 旁的複製按鈕。

**方法 C — 網域 Overview**

若帳號已加入網域：進入該網域 Overview 底部 **API** 區塊，可同時複製 Zone ID 與 Account ID。AI-EIP 預設走 `workers.dev`，**不需要 Zone ID**。

**方法 D — 命令列（Token 已能認證時）**

```powershell
npx wrangler whoami
```

輸出會列出你有權限的帳號與 Account ID。這需要已登入或環境中已有有效 Token。

Account ID 外觀通常是 **32 個十六進位字元**（0–9、a–f），例如 `a1b2c3d4e5f67890a1b2c3d4e5f67890` 這種長度。它**不是**：

- `workers.dev` 子網域（那是帳號層的公開主機名稱，例如 `your-subdomain`）
- Zone ID（那是某個網域的識別碼）
- API Token（那是一長串 secret）

### 3. 設定 `PUBLIC_DECK_BASE_URL`（選填）

`.env.example` 的佔位為：

```text
PUBLIC_DECK_BASE_URL=https://myppt.aidc.work
```

語意是：Admin 複製給訪客的公開網址前綴。正式站目前是自訂網域 `myppt.aidc.work`（Worker 名稱仍是 `ai-eip`）。若尚未綁自訂網域，也可用第一次 `wrangler deploy` 印出的 `https://ai-eip.<你的子網域>.workers.dev`。

子網域在 Dashboard **Workers & Pages** 總覽可見（「Your subdomain is …」一類說明）。第一次成功 `wrangler deploy` 後，終端機也會印出實際 `https://….workers.dev`。

AI-EIP 的 Admin 會把「基底 URL」與 deck 檔名組合成可分享連結：

```text
{PUBLIC_DECK_BASE_URL}/{deckId}.html
```

例如 deck id 為 `enterprise-ai-portal-deck` 時：

```text
https://myppt.aidc.work/enterprise-ai-portal-deck.html
```

**建議填寫時機**

| 情況 | 要不要填 | 填什麼 |
| --- | --- | --- |
| 第一次部署、stdout 能解析出 `*.workers.dev` | 可先留空 | — |
| Wrangler 輸出格式變了、Admin 複製到空白或相對路徑 | 要填 | 實際的 `https://ai-eip.<subdomain>.workers.dev`（不要結尾斜線） |
| 已綁自訂網域（例如課堂用的公開網域） | 要填 | `https://你的自訂網域`（同樣不要結尾斜線） |
| 仍看得到 `<your-subdomain>` 這種佔位 | 不要上線 | 換成真實主機名 |

程式行為（重點）：**只要 `.env` 有非空的 `PUBLIC_DECK_BASE_URL`，就會覆寫從 wrangler stdout 解析到的 URL。** 因此佔位字串或過期網域會讓「部署成功、複製連結卻 404」看起來像部署失敗。此時先打開 Cloudflare Dashboard 確認 Worker 是否已更新，再修正基底 URL。

### 4. 寫入本機 `.env` 並重啟 Admin

從 `.env.example` 複製為 `.env`（若尚未有）。只填這一段即可啟動一鍵部署（其餘 LLM／TTS 變數與此無關）：

```dotenv
# One-click publish (wrangler deploy from admin UI)
CLOUDFLARE_API_TOKEN=請貼上剛才複製的 Token
CLOUDFLARE_ACCOUNT_ID=請貼上 32 字元 Account ID
# Optional: shown/copied after deploy if wrangler stdout parse fails
PUBLIC_DECK_BASE_URL=https://ai-eip.你的子網域.workers.dev
```

確認事項：

- `.env` 已在 `.gitignore`，**不要** `git add .env`
- 值不要加引號，除非值本身含空白（這三個變數都不該有空白）
- 改完後重啟 `npm run dev`（或你啟動 Admin 的行程），否則仍讀舊環境
- GitHub 手動部署：在 repo **Settings → Secrets and variables → Actions** 新增同名 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`。workflow 僅 `workflow_dispatch`，push 不會自動覆蓋正式檔

## 實例或 Prompt

### 檢查清單（可直接照做）

```text
[ ] Cloudflare 帳號可登入 Dashboard
[ ] 已用「Edit Cloudflare Workers」模板或最小權限 Custom Token 建立 Token，名稱可辨識
[ ] Token 已存密碼管理器；畫面上已離開「只顯示一次」頁面
[ ] curl verify 回傳 success: true（本機執行，勿把 Token 貼到聊天）
[ ] 已複製 Account ID（搜尋列 Copy account ID 或 Workers & Pages）
[ ] 本機 .env 已填 TOKEN 與 ACCOUNT_ID；.env 未進 Git
[ ] 已重啟本機 Admin（預設埠 8787）
[ ] 按「上傳正式環境」成功；瀏覽器打得開回傳的 {deckId}.html
[ ] 若複製網址不對：把 PUBLIC_DECK_BASE_URL 改成真實 workers.dev 或自訂網域後再重啟
```

### 給 AI 助手的提示詞（你已登入 Dashboard 時）

把下面貼到 Cursor／ChatGPT，請它**只指導步驟、不要叫你把 Token 貼回對話**：

```text
我要為本機 Wrangler 部署設定 .env。
請依 Cloudflare 官方文件，用繁體中文逐步告訴我：
1. 如何用 Edit Cloudflare Workers 模板建立 API Token（使用者 Token）
2. 如何複製 Account ID（搜尋列或 Workers & Pages）
3. PUBLIC_DECK_BASE_URL 何時必填；Worker 名稱是 ai-eip
不要請我把 Token 或完整 .env 貼給你。
若權限不足，列出最小權限：Workers Scripts Edit、Account Settings Read。
```

### 本機驗證順序

```powershell
# 1）Token 是否有效（PowerShell；勿把輸出整段貼到公開頻道）
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" --header "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN"

# 2）Wrangler 是否認得帳號（需已把 Token 寫進專案 .env 或目前 session）
npx wrangler whoami

# 3）可選：命令列部署一次（與 Admin 按鈕同一條路徑）
npx wrangler deploy
```

Admin 路徑：啟動後開啟本機 Admin → 選好 deck → **上傳正式環境**。成功時會顯示 `https://…/{deckId}.html` 並可複製。

## 注意事項

- **Token 等同部署權。** 持有 Edit Workers 權限的 Token 可以覆寫該帳號下對應的 Worker。外洩時立刻到 API Tokens 頁面 **Roll**（輪替）或刪除，再更新 `.env` 與 GitHub Secrets。
- **不要把真實 Token 貼進 Chat、Issue、Blog、簡報截圖。** 教學文只保留佔位符。新 Token 的 `cfut_` 前綴有助於掃描工具抓外洩，但無法取代「不要提交 `.env`」。
- **Account ID 與 workers.dev 子網域是兩件事。** 前者填 `CLOUDFLARE_ACCOUNT_ID`；後者組成 `PUBLIC_DECK_BASE_URL`。
- **Dashboard UI 文案可能微調。** 權限名稱與模板以 [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) 與 [templates](https://developers.cloudflare.com/fundamentals/api/reference/template/) 為準。若找不到「Edit Cloudflare Workers」，改走 Custom Token 並對照上表權限。
- **課堂與正式站邊界：** 未經授權不要對共用 production 帳號 `wrangler deploy`。學員應使用自己的 Cloudflare 帳號或講師指定的 sandbox。AI-EIP 的 Admin、LLM、TTS **不會**部署到 Workers，只上靜態簡報。
- **GitHub Actions 與本機是兩套密鑰存放處。** 改本機 `.env` 不會更新 Actions Secrets；反之亦然。
- 以上 Dashboard 操作路徑依 2026 年 8 月 Cloudflare 公開文件整理；若官方改版，以 developers.cloudflare.com 為準。

## 結語與下一步

把 Token 與 Account ID 當成「自動化部署的鑰匙與門牌」：鑰匙要鎖好，門牌要填對；公開網址基底則是給人點的門牌號碼，填錯不影響房子蓋好，但訪客會走錯路。先完成檢查清單、用本機 Admin 部署一份測試 deck，再決定是否把同一組憑證放進 GitHub Secrets。

若你正在把 AI 簡報／Workers 部署納入團隊工作流，可從 [課程與實作](/courses) 對照完整開發循環，或透過 [聯絡](/contact)、[預約諮詢](/booking) 討論企業內的密鑰管理與發布閘門。

## 相關連結

- 站內：[mybike × GitHub × Cloudflare](/blog/cursor-agent-mobile-mybike-github-cloudflare)
- 站內：[Codex＋GitHub＋Cloudflare MVP](/blog/codex-github-cloudflare-ai-system-mvp)
- 站內：[Cursor、Codex、GitHub 工作流](/blog/cursor-codex-github-ai-dev-workflow)
- 簡報（會員）：[Cloudflare Token 與 Account ID 教學簡報](/blog/cloudflare-api-token-account-id-wrangler-deploy-deck)
- 官方：[Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- 官方：[API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)
- 官方：[Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
- 官方：[Wrangler system environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)
- 官方：[Restrict token use](https://developers.cloudflare.com/fundamentals/api/how-to/restrict-tokens/)
