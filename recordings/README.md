# 講者錄音

把要用來複製聲音的錄音放在這個資料夾。音檔不會進 git，只有這份說明會。

需求：

- 1 到 5 分鐘、只有你一個人在說話
- 不要背景音樂、不要明顯噪音或回音
- 格式：mp3、wav、m4a、webm、ogg、flac

準備好 ElevenLabs 付費方案的 API key 後，寫進專案根目錄的 `.env`：

```text
ELEVENLABS_API_KEY=你的金鑰
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

然後在專案根目錄執行：

```text
node scripts/narration/clone-voice.js --deck=taiwan-ai-strategic-blueprint
```

若這個資料夾沒有音檔，腳本會改用 ElevenLabs 帳戶裡已經建立的複製聲音，把正確的 `voice_id` 寫進 `.env`。帳戶裡有多個複製聲音時，用 `--name=聲音名稱` 指定。有音檔時才會上傳並新建聲音。加上 `--deck` 會把該簡報的講者改成這個聲音。
