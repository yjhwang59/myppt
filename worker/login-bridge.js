export const BRIDGE_PATH = "/myppt-auth";

const ALLOWED_TARGETS = ["http://localhost:8787", "http://127.0.0.1:8787", "https://myppt.aidc.work"];

export function isAllowedLoginTarget(origin) {
  return ALLOWED_TARGETS.includes(String(origin || ""));
}

export function bridgePageHtml() {
  const allowed = JSON.stringify(ALLOWED_TARGETS);
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>使用 Google 帳號登入</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5faf8; color: #17324d; font: 16px/1.5 "Segoe UI", sans-serif; }
    main { width: min(420px, calc(100% - 32px)); background: #fff; border: 1px solid #cbded9; border-radius: 16px; padding: 28px 24px; box-shadow: 0 18px 50px #17324d1f; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { margin: 0 0 16px; color: #607286; }
    #error { color: #8a2b22; }
    #google-btn { min-height: 44px; }
  </style>
</head>
<body>
  <main>
    <h1>使用 Google 帳號登入</h1>
    <p id="lead">請選擇要登入 myPPT簡報工作室的 Google 帳號。</p>
    <p id="error" hidden></p>
    <div id="google-btn"></div>
  </main>
  <script>
    const allowed = new Set(${allowed});
    const params = new URL(location.href).searchParams;
    const target = params.get("target") || "";
    const clientId = params.get("client") || "";
    const errorEl = document.getElementById("error");
    function fail(message) {
      errorEl.hidden = false;
      errorEl.textContent = message;
      if (window.opener && allowed.has(target)) {
        window.opener.postMessage({ type: "myppt-google-error", message }, target);
      }
    }
    function finish(credential) {
      if (window.opener) {
        window.opener.postMessage({ type: "myppt-google-credential", credential }, target);
        window.close();
        return;
      }
      location.replace(target + "/admin/#myppt_google=" + encodeURIComponent(credential));
    }
    if (!allowed.has(target)) {
      fail("這個登入視窗的返回位址不被允許");
    } else if (!/^[\\w.-]+$/.test(clientId)) {
      fail("缺少 Google 用戶端識別碼");
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client?hl=zh-TW";
      script.onload = () => {
        google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          callback: (response) => {
            if (response?.credential) finish(response.credential);
          },
        });
        google.accounts.id.renderButton(document.getElementById("google-btn"), {
          theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 320,
        });
      };
      script.onerror = () => fail("無法載入 Google 登入");
      document.head.appendChild(script);
    }
  </script>
</body>
</html>`;
}
