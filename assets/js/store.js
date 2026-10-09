/* ==========================================================
   store.js —— 全局状态：manifest 数据、内置凭证、门禁会话、身份
   ========================================================== */
window.Store = (function () {
  const LS = {
    gate: 'tk_gate_ok',   // 保存进入时验证通过的密码哈希
    uid: 'tk_uid',        // 本机匿名 ID，用于"删除自己上传的内容"
    token: 'tk_token'     // 上传凭证：由群公告种子链接（#tk=）写入，仅存本机
  };
  let manifest = null;

  function cfg() { return window.SITE_CONFIG; }

  /* 凭证优先级：本机种子（群链接）> 部署注入（Actions 从 Secrets 写入）> config 兜底 */
  function token() { return localStorage.getItem(LS.token) || window.RUNTIME_TOKEN || cfg().uploadToken || ''; }
  function repo() { return cfg().repo || ''; }
  function branch() { return cfg().branch || 'main'; }

  /* 会话与当前密码哈希绑定：换密码后所有浏览器旧豁免自动失效 */
  function gateOk() {
    const s = localStorage.getItem(LS.gate);
    return s === cfg().gateSha256 || s === cfg().adminSha256;
  }
  function setGateOk(hash) { localStorage.setItem(LS.gate, hash); }
  function clearGate() { localStorage.removeItem(LS.gate); }
  function clearToken() { localStorage.removeItem(LS.token); }
  function setTokenLocal(v) { localStorage.setItem(LS.token, v); }

  /* 凭证密文保险库：AES-GCM，密钥 = SHA-256(门禁密码)。
     进门时用刚输入的密码解密，换密码时用新密码重加密。 */
  async function decryptToken(cipherB64, pw) {
    const raw = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12), ct = raw.slice(12);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  }
  async function encryptToken(secret, pw) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv); out.set(new Uint8Array(ct), 12);
    let bin = '';
    out.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function role() { return localStorage.getItem(LS.gate) === cfg().adminSha256 ? 'admin' : 'member'; }

  /* 本机匿名 ID：上传时记入 manifest，用来判定"自己上传的" */
  function myId() {
    let id = localStorage.getItem(LS.uid);
    if (!id) {
      id = 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(LS.uid, id);
    }
    return id;
  }

  async function sha256hex(text) {
    if (!crypto.subtle) throw new Error('需要 HTTPS 或 localhost 环境');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadManifest() {
    if (token() && repo()) {
      try {
        manifest = JSON.parse((await window.GH.readContent(repo(), 'data/manifest.json')).text);
        lastSeenRev = Math.max(lastSeenRev, manifest.rev || 0);
        return manifest;
      } catch (e) { /* 落到 CDN 回退 */ }
    }
    try {
      const res = await fetch('data/manifest.json?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        manifest = await res.json();
        lastSeenRev = Math.max(lastSeenRev, manifest.rev || 0);
        return manifest;
      }
    } catch (e) { /* 本地 file:// 或尚未提交数据 */ }
    manifest = JSON.parse(JSON.stringify(window.DEFAULT_MANIFEST));
    return manifest;
  }
  function get() { return manifest; }
  function set(m) { manifest = m; }

  function manifestText() { return JSON.stringify(manifest, null, 2); }

  /* 提交前基线：GitHub head 实时清单。部署产物有分钟级延迟，拿它当基线
     会在部署窗口内把别人已提交的条目覆盖丢掉；API 不可用时回退 CDN 副本 */
  async function freshManifest() {
    if (token() && repo()) {
      /* 基线新鲜度三级：git-data 强一致读 → contents API（瞬态失败重试一次）→ CDN 回退。
         CDN 有分钟级延迟、contents 有读后写延迟，拿旧快照当基线会静默回退刚提交的改动 */
      try {
        return await window.GH.headManifest(repo(), branch());
      } catch (e) { /* 落到 contents */ }
      for (let i = 0; i < 2; i++) {
        try {
          const r = await window.GH.readContent(repo(), 'data/manifest.json');
          return JSON.parse(r.text);
        } catch (e) {
          if (i === 0) await new Promise(r2 => setTimeout(r2, 600));
        }
      }
    }
    try {
      const res = await fetch('data/manifest.json?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* 退回落地清单 */ }
    return JSON.parse(JSON.stringify(manifest));
  }
  let pending = 0;
  function isPending() { return pending > 0; }
  /* 见过的最高清单版本号：基线 rev 低于它 = 拿到旧快照（CDN 延迟/GitHub 读副本滞后），
     视为冲突重试，杜绝"旧基线+本次改动"合法快进造成的静默回退 */
  let lastSeenRev = 0;

  /* 并发安全提交：冲突(409/422)时重新拉取最新清单并重放本次变更，最多 3 次 */
  async function commitWithNow(mutator, buildEntries, message) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      pending++;
      try {
        manifest = await freshManifest();
        const baseRev = manifest.rev || 0;
        if (baseRev < lastSeenRev) throw new Error('409 stale manifest baseline rev=' + baseRev + ' < seen=' + lastSeenRev);
        if (mutator) mutator(manifest);
        manifest.rev = baseRev + 1;
        const baseSha = manifest.__baseSha;
        const entries = buildEntries();
        entries.push({ path: 'data/manifest.json', blob: window.GH.blobFromText(manifestText()) });
        await window.GH.commitFiles(repo(), branch(), entries, message, baseSha);
        lastSeenRev = baseRev + 1; // 提交成功后才推进，失败不得虚报版本号
        return;
      } catch (e) {
        lastErr = e;
        if (!/409|422|conflict|rate limit/i.test(String(e.message))) throw e;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      } finally { pending--; }
    }
    throw lastErr;
  }
  /* 清单提交串行锁：连续提交若各自拿旧基线，会把先前的改动以合法快进方式静默覆盖
     （409/422 重试防不住这种回退），故所有 commitWith 排队执行 */
  let commitLock = Promise.resolve();
  function commitWith(mutator, buildEntries, message) {
    const run = () => commitWithNow(mutator, buildEntries, message);
    const p = commitLock.then(run, run);
    commitLock = p.catch(() => {});
    return p;
  }

  /* 媒体文件 + manifest 一次提交；applyFn 在最新清单上追加变更 */
  async function commitUploads(files, message, applyFn) {
    if (!token() || !repo()) throw new Error('NO_CONFIG');
    await commitWith(applyFn,
      () => files.map(f => ({ path: f.path, blob: window.GH.blobFromBinary(f.base64) })),
      message);
  }

  /* 删除媒体文件 + 更新 manifest 一次提交；applyFn 在最新清单上移除条目 */
  async function commitDelete(paths, message, applyFn) {
    if (!token() || !repo()) throw new Error('NO_CONFIG');
    try {
      await commitWith(applyFn, () => paths.map(p => ({ path: p, del: true })), message);
    } catch (e) {
      // 文件在服务器已不存在（悬空条目）时降级为仅更新清单
      if (/422|BadObjectState/i.test(String(e.message))) {
        await commitWith(applyFn, () => [], message);
      } else throw e;
    }
  }

  /* 把本地编辑（歌单）叠加到服务器最新清单后提交 */
  async function saveManifest(message) {
    if (!token() || !repo()) throw new Error('NO_CONFIG');
    const localPlaylist = JSON.parse(JSON.stringify(manifest.playlist));
    await commitWith(mm => { mm.playlist = localPlaylist; }, () => [], message || 'chore: 更新歌单');
  }

  /* 通用清单编辑提交：mutator 叠加到服务器最新清单（重命名/改分类/标签增删等用） */
  async function saveManifestApply(mutator, message) {
    if (!token() || !repo()) throw new Error('NO_CONFIG');
    await commitWith(mutator, () => [], message || 'chore: 更新 manifest');
  }

  function mediaUrl(path) { return path; } // 媒体与站点同仓库同目录，相对路径即可

  /* 部署窗口内媒体兜底：静态路径 404 时经 GitHub API 取回 blob 转 objectURL（按 path 缓存） */
  const mediaBlobUrls = {};
  async function mediaObjectUrl(path) {
    if (mediaBlobUrls[path]) return mediaBlobUrls[path];
    const blob = await window.GH.rawContent(repo(), path);
    mediaBlobUrls[path] = URL.createObjectURL(blob);
    return mediaBlobUrls[path];
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { return new Date().toISOString().slice(0, 10); }

  return {
    cfg, token, repo, branch,
    gateOk, setGateOk, clearGate, clearToken, setTokenLocal, role, myId, sha256hex,
    decryptToken, encryptToken, mediaObjectUrl,
    loadManifest, get, set, manifestText, saveManifest, saveManifestApply, commitUploads, commitDelete, isPending,
    mediaUrl, uid, today
  };
})();
