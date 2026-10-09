/* ==========================================================
   gh.js —— 零服务器上传：通过 GitHub REST API 把文件提交进仓库
   流程：取分支 head → 建 blob（媒体 base64 / manifest 文本）→
         基于 base_tree 建新 tree → 建 commit → 快进更新 ref
   凭证为仓库 owner 签发的 fine-grained token（仅 Contents 读写、仅本仓库），
   由群公告分发，保存在每个成员浏览器 localStorage，不进入代码仓库。
   ========================================================== */
window.GH = (function () {
  const API = 'https://api.github.com';

  /* 瞬态错误退避重试：断网/5xx/限流(429 与带 rate limit 的 403) 最多 3 次；
     其余 4xx（凭证无效、路径错误等）立即失败，不做无谓重试 */
  async function api(repo, path, opts = {}) {
    const token = window.Store && window.Store.token();
    const headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res = null;
      try {
        res = await fetch(`${API}/repos/${repo}${path}`, Object.assign({}, opts, { headers }));
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).message || ''; } catch (e) { /* ignore */ }
        const msg = `GitHub API ${res.status} ${detail}`.trim();
        if (res.status >= 500 || res.status === 429 || (res.status === 403 && /rate limit/i.test(detail))) {
          lastErr = new Error(msg);
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new Error(msg);
      }
      return res.status === 204 ? null : res.json();
    }
    throw lastErr || new Error('GitHub API 不可达');
  }

  function blobFromBinary(base64) {
    return { content: base64, encoding: 'base64' };
  }
  function blobFromText(text) {
    // UTF-8 安全 base64
    return { content: btoa(unescape(encodeURIComponent(text))), encoding: 'base64' };
  }

  async function fileToBase64(file) {
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  /* files: [{ path, blob: {content, encoding} }] 或 [{ path, del: true }]（删除该路径）；message: commit 信息 */
  async function commitFiles(repo, branch, files, message) {
    const ref = await api(repo, `/git/refs/heads/${branch}`);
    const baseSha = ref.object.sha;
    const baseCommit = await api(repo, `/git/commits/${baseSha}`);
    const baseTree = baseCommit.tree.sha;

    const entries = [];
    for (const f of files) {
      if (f.del) {
        entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const b = await api(repo, '/git/blobs', {
        method: 'POST',
        body: JSON.stringify(f.blob)
      });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    const tree = await api(repo, '/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTree, tree: entries })
    });
    const commit = await api(repo, '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] })
    });
    /* 并发冲突(422)不在这里重试：内部重试用的是旧 entries（含旧基线 manifest blob），
       会覆盖丢条目；抛给 Store.commitWith 重拉实时基线后整体重放才是真合并 */
    await api(repo, `/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return commit.sha;
  }

  /* 单文件读写（一键换密码用）：读 config.js → 改哈希行 → 写回提交 */
  async function readContent(repo, path) {
    const r = await api(repo, `/contents/${path}`);
    return { sha: r.sha, text: decodeURIComponent(escape(atob(r.content.replace(/\n/g, '')))) };
  }
  async function writeContent(repo, path, text, message) {
    const cur = await api(repo, `/contents/${path}`);
    return api(repo, `/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(text))), sha: cur.sha })
    });
  }

  /* 连通性 / 凭证测试 */
  async function test(repo, branch) {
    const ref = await api(repo, `/git/refs/heads/${branch}`);
    return !!ref.object.sha;
  }

  return { api, commitFiles, fileToBase64, blobFromBinary, blobFromText, test, readContent, writeContent };
})();
