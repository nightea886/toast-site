/* ==========================================================
   app.js —— 主控制器：门禁 / Tab / 渲染 / 上传 / 播放器 / 大图 / 设置
   ========================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* 上传后 Pages 部署有延迟，用 objectURL 先本地预览 */
  const previewUrls = {};
  const origMediaUrl = Store.mediaUrl;
  Store.mediaUrl = p => previewUrls[p] || origMediaUrl(p);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, err) {
    const d = document.createElement('div');
    d.className = 'toast' + (err ? ' err' : '');
    d.textContent = msg;
    $('#toasts').appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, 2800);
  }
  function downloadUrl(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name || url.split('/').pop();
    document.body.appendChild(a); a.click(); a.remove();
  }
  function downloadText(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ================= 门禁 ================= */
  function showGate() { $('#gate').hidden = false; setTimeout(() => $('#gateInput').focus(), 60); }
  function hideGate() { $('#gate').hidden = true; }
  $('#gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#gateInput').value;
    if (!code) return;
    try {
      const h = await Store.sha256hex(code);
      const isAdmin = h === Store.cfg().adminSha256;
      if (h === Store.cfg().gateSha256 || isAdmin) {
        Store.setGateOk(h); hideGate();
        // 进门即解锁凭证：用刚输入的密码解密密文存本机，任何设备零配置
        try {
          const cipher = isAdmin ? Store.cfg().tokenCipherAdmin : Store.cfg().tokenCipherMember;
          if (cipher) {
            const tk = await Store.decryptToken(cipher, code); // 每次进门都刷新凭证，换token后重输密码即恢复
            const vr = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + tk } }).catch(() => null);
            if (!vr || vr.status !== 401) Store.setTokenLocal(tk);
            else toast('凭证校验异常，上传功能可能受限', true);
          }
        } catch (e) { /* 解密失败时保留已有凭证/种子链接 */ }
        renderAll();
        toast(isAdmin ? '管理员模式' : '欢迎回家，面包人 🍞');
      } else {
        $('#gateErr').hidden = false;
        const card = $('#gate .gate-card');
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      }
    } catch (err) { toast(err.message, true); }
  });

  /* ================= Tab 切换 ================= */
  function switchTab(name) {
    $$('.sec').forEach(s => s.classList.toggle('active', s.dataset.sec === name));
    $$('#tabs .tab, #mobilenav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  /* ================= 渲染：相册 / 表情包 ================= */
  let albumFilter = 'all', stickerFilter = 'all', songQuery = '';
  let albumQuery = '', stickerQuery = '';
  /* 相册标签：存 manifest.albumTags，缺失时回退默认两个 */
  function albumTags() {
    const t = Store.get().albumTags;
    return Array.isArray(t) && t.length ? t : ['cosplay', '日常'];
  }
  /* 旧数据 cat 值为 daily，与中文标签「日常」等价 */
  function normCat(c) { return c === 'daily' ? '日常' : (c || '日常'); }
  function renderAlbumChips() {
    const wrap = $('#albumChips');
    if (!wrap) return;
    if (albumFilter !== 'all' && !albumTags().includes(albumFilter)) albumFilter = 'all';
    wrap.innerHTML = `<button class="chip${albumFilter === 'all' ? ' active' : ''}" data-cat="all">全部</button>` +
      albumTags().map(t => `<button class="chip${albumFilter === t ? ' active' : ''}" data-cat="${esc(t)}">${esc(t)}</button>`).join('');
  }
  /* 管理员永远可删；成员仅在自己上传且有凭证时可删 */
  function canDelete(entry) {
    if (Store.role() === 'admin') return true;
    return !!Store.token() && !!entry.uploader && entry.uploader === Store.myId();
  }
  /* 上传音频前填写歌名与原唱 */
  function askSongMeta(defTitle) {
    return new Promise(res => {
      $('#metaTitle').value = defTitle || '';
      $('#metaSinger').value = '';
      $('#metaBox').hidden = false;
      const done = v => {
        $('#metaBox').hidden = true;
        $('#metaOk').onclick = null; $('#metaCancel').onclick = null;
        res(v);
      };
      $('#metaOk').onclick = () => done({
        title: $('#metaTitle').value.trim() || defTitle || '未命名',
        singer: $('#metaSinger').value.trim() || '吐司大王'
      });
      $('#metaCancel').onclick = () => done(null);
    });
  }
  /* 站内命名弹窗：上传逐张起名 / 详情重命名复用；取消返回 null */
  function askName(def, tip) {
    return new Promise(res => {
      $('#nameTip').textContent = tip || '给这张图起个名字';
      $('#nameIn').value = def || '';
      $('#nameBox').hidden = false;
      const done = v => {
        $('#nameBox').hidden = true;
        $('#nameOk').onclick = null; $('#nameCancel').onclick = null;
        res(v);
      };
      $('#nameOk').onclick = () => {
        const v = $('#nameIn').value.trim();
        if (!v) { toast('先起个名字才能上传哦', true); return; }
        done(v);
      };
      $('#nameCancel').onclick = () => done(null);
    });
  }
  /* 站内确认框：部分手机浏览器屏蔽 window.confirm，故自绘 */
  function askConfirm(msg, yesLabel) {
    return new Promise(res => {
      $('#askMsg').textContent = msg;
      $('#askYes').textContent = yesLabel || '确定';
      $('#askbox').hidden = false;
      const done = v => {
        $('#askbox').hidden = true;
        $('#askYes').onclick = null; $('#askNo').onclick = null;
        res(v);
      };
      $('#askYes').onclick = () => done(true);
      $('#askNo').onclick = () => done(false);
    });
  }
  async function doDelete(kind, it) {
    if (!Store.token()) { toast('缺少上传凭证：请用群公告里的进入链接打开一次本站后再删除', true); return; }
    const who = Store.role() === 'admin' ? '管理员' : '水友';
    if (!await askConfirm(kind === 'song' ? '确定删除歌曲吗？' : '确定删除图片吗？', '删除')) return;
    const m = Store.get();
    const arr = kind === 'album' ? m.albums : kind === 'sticker' ? m.stickers : m.songs;
    const i = arr.indexOf(it);
    if (i > -1) arr.splice(i, 1);
    renderAll();   // 乐观更新：界面立即消失，提交在后台进行
    toast('已删除');
    try {
      await Store.commitDelete([it.file], `delete: ${kind} 「${it.title}」 by ${who}`, mm => {
        const a2 = kind === 'album' ? mm.albums : kind === 'sticker' ? mm.stickers : mm.songs;
        const i2 = a2.findIndex(x => x.file === it.file);
        if (i2 > -1) a2.splice(i2, 1);
      });
    } catch (e) {
      toast('删除失败已恢复：' + (e.message === 'NO_CONFIG' ? '缺少上传凭证' : e.message), true);
      await Store.loadManifest(); renderAll();
    }
  }
  function mediaCard(it, i, kind) {
    const d = document.createElement('div');
    d.className = 'card';
    d.style.setProperty('--i', i % 12);
    const isGif = /\.gif$/i.test(it.file);
    d.innerHTML =
      `<div class="thumb"><img loading="lazy" data-path="${esc(it.file)}" src="${esc(Store.mediaUrl(it.file))}" alt="${esc(it.title)}"></div>
       ${isGif ? '<span class="badge-gif">GIF</span>' : ''}`;
    d.addEventListener('click', () => {
      const list = kind === 'album' ? Store.get().albums : Store.get().stickers;
      /* 轮询会替换清单对象，旧卡片闭包可能持有孤儿对象：按 id/file 重新定位 */
      const idx = list.findIndex(x => x.id === it.id || x.file === it.file);
      if (idx < 0) { renderMedia(); return; }
      openLightbox(kind, list, idx);
    });
    return d;
  }
  function renderMedia() {
    const m = Store.get();
    const ag = $('#albumGrid'), sg = $('#stickerGrid');
    ag.innerHTML = ''; sg.innerHTML = '';
    const albums = m.albums.filter(a =>
      (albumFilter === 'all' || normCat(a.cat) === albumFilter) && fuzzy(albumQuery, a.title));
    const stickers = m.stickers.filter(s =>
      (stickerFilter === 'all' || (stickerFilter === 'gif' ? /\.gif$/i.test(s.file) : !/\.gif$/i.test(s.file))) &&
      fuzzy(stickerQuery, s.title));
    albums.forEach((it, i) => ag.appendChild(mediaCard(it, i, 'album')));
    stickers.forEach((it, i) => sg.appendChild(mediaCard(it, i, 'sticker')));
    $('#albumEmpty').hidden = albums.length > 0;
    $('#stickerEmpty').hidden = stickers.length > 0;
  }
  /* 整个板块区域都接受拖拽上传，不必瞄准小框 */
  $$('.sec').forEach(sec => {
    const kind = sec.dataset.sec;
    if (!['album', 'sticker', 'song'].includes(kind)) return;
    const dz = sec.querySelector('.dropzone');
    sec.addEventListener('dragover', e => { e.preventDefault(); if (dz) dz.classList.add('over'); });
    sec.addEventListener('dragleave', e => { if (!sec.contains(e.relatedTarget) && dz) dz.classList.remove('over'); });
    sec.addEventListener('drop', e => {
      e.preventDefault();
      if (dz) dz.classList.remove('over');
      if (e.target.closest('.dropzone')) return; // dropzone 自己处理过
      handleFiles(kind, e.dataTransfer.files);
    });
  });

  /* 分类 chips */
  document.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    const cat = chip.dataset.cat;
    if (chip.parentElement.id === 'albumChips') albumFilter = cat;
    else stickerFilter = cat;
    renderMedia();
  });
  /* 图片名模糊搜索（与歌曲搜索同款 fuzzy） */
  $('#albumSearch').addEventListener('input', e => { albumQuery = e.target.value; renderMedia(); });
  $('#stickerSearch').addEventListener('input', e => { stickerQuery = e.target.value; renderMedia(); });

  /* ================= 大图 Lightbox ================= */
  let lbList = [], lbIdx = 0, lbKind = 'album';
  function closeLightbox() { $('#lightbox').hidden = true; document.body.classList.remove('lb-open'); }
  function openLightbox(kind, list, idx) {
    lbKind = kind; lbList = list; lbIdx = idx;
    paintLightbox();
    $('#lightbox').hidden = false;
    document.body.classList.add('lb-open'); // 锁背景滚动：手机端滑动切图不再闪滚动条
  }
  function paintLightbox() {
    const it = lbList[lbIdx];
    if (!it) return;
    $('#lbImg').src = Store.mediaUrl(it.file);
    $('#lbImg').dataset.path = it.file;
    delete $('#lbImg').dataset.fb;
    $('#lbDl').href = Store.mediaUrl(it.file);
    $('#lbDl').setAttribute('download', it.file.split('/').pop());
    $('#lbDel').hidden = !canDelete(it);
    const cap = $('#lbCap');
    cap.textContent = it.title || '';
    cap.hidden = !it.title;
    const editable = canDelete(it);
    $('#lbRename').hidden = !editable;
    $('#lbTag').hidden = !editable || lbKind !== 'album';
  }
  function lbStep(d) { lbIdx = (lbIdx + d + lbList.length) % lbList.length; paintLightbox(); }
  $('#lbPrev').addEventListener('click', () => lbStep(-1));
  $('#lbNext').addEventListener('click', () => lbStep(1));
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbDel').addEventListener('click', () => {
    const it = lbList[lbIdx];
    if (!it) return;
    closeLightbox(); // 立即关闭，提交在后台进行，避免等待卡顿
    doDelete(lbKind, it);
  });
  $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', e => {
    if ($('#lightbox').hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lbStep(-1);
    if (e.key === 'ArrowRight') lbStep(1);
  });
  /* 桌面端滚轮 = 左右翻图（节流防连翻） */
  let wheelLast = 0;
  $('#lightbox').addEventListener('wheel', e => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    const now = Date.now();
    if (now - wheelLast < 350) return;
    wheelLast = now;
    lbStep(d > 0 ? 1 : -1);
  }, { passive: false });
  /* 重命名 / 改分类：与删除同权限（本人或管理员），乐观更新+服务器叠加提交+失败回滚 */
  async function saveMediaEdit(msg, finder, change, rollbackChange) {
    const it = lbList[lbIdx]; if (!it) return;
    change(it);
    renderMedia(); paintLightbox();
    try {
      await Store.saveManifestApply(mm => {
        const x = finder(mm);
        if (x) change(x);
      }, msg);
      toast('已保存 🍞');
    } catch (e) {
      rollbackChange(it);
      toast('保存失败已还原：' + (e.message === 'NO_CONFIG' ? '缺少上传凭证' : e.message), true);
      await Store.loadManifest(); renderAll(); paintLightbox();
    }
  }
  $('#lbRename').addEventListener('click', async () => {
    const it = lbList[lbIdx]; if (!it) return;
    const nm = await askName(it.title, '改成新名字');
    if (!nm || nm === it.title) return;
    const old = it.title;
    await saveMediaEdit(`rename: ${lbKind} 「${old}」→「${nm}」`,
      mm => (lbKind === 'album' ? mm.albums : mm.stickers).find(y => y.file === it.file),
      x => { x.title = nm; },
      x => { x.title = old; });
  });
  $('#lbTag').addEventListener('click', async () => {
    const it = lbList[lbIdx]; if (!it || lbKind !== 'album') return;
    const tag = await askCat();
    if (!tag || tag === normCat(it.cat)) return;
    const old = it.cat || 'daily';
    await saveMediaEdit(`retag: 相册「${it.title}」${old} → ${tag}`,
      mm => mm.albums.find(y => y.file === it.file),
      x => { x.cat = tag; },
      x => { x.cat = old; });
  });
  /* 手机端左右滑动浏览大图 */
  let touchX = null;
  $('#lightbox').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#lightbox').addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  /* ================= 渲染：歌曲 + 播放器 ================= */
  const IC_PLAY = '<svg viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4"/></svg>';
  const IC_PAUSE = '<svg class="ic-pause" viewBox="0 0 24 24"><rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/></svg>';
  const IC_TRASH = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  const audio = new Audio();
  let cur = -1;
  /* 模糊匹配：子串或按顺序的子序列（如 "qqg" 命中 "千千歌"） */
  function fuzzy(q, t) {
    q = (q || '').toLowerCase().replace(/\s+/g, '');
    t = (t || '').toLowerCase();
    if (!q) return true;
    if (t.includes(q)) return true;
    let i = 0;
    for (const ch of t) { if (ch === q[i]) i++; if (i === q.length) return true; }
    return false;
  }
  function renderSongs() {
    const m = Store.get();
    const wrap = $('#songList');
    wrap.innerHTML = '';
    const list = m.songs.filter(s => fuzzy(songQuery, s.title + ' ' + (s.singer || '')));
    $('#songEmpty').hidden = m.songs.length > 0;
    if (m.songs.length && !list.length) {
      wrap.innerHTML = '<div class="empty"><p>没搜到相关歌曲，换个词试试 🔍</p></div>';
      return;
    }
    list.forEach(s => {
      const i = m.songs.indexOf(s);
      const row = document.createElement('div');
      row.className = 'song-row' + (i === cur ? ' playing' : '');
      row.style.setProperty('--i', i % 14);
      row.dataset.idx = i;
      row.innerHTML =
        `<span class="song-idx">${i === cur ? '♪' : i + 1}</span>
         <span class="song-info"><b title="${esc(s.title)}">${esc(s.title)}</b><span>${esc(s.singer || '吐司大王')}</span></span>
         <span class="song-dur">${s.dur ? fmtTime(s.dur) : '--:--'}</span>
         <button class="icon-btn" data-act="play" title="播放/暂停">${i === cur && !audio.paused ? IC_PAUSE : IC_PLAY}</button>
         <button class="icon-btn" data-act="dl" title="下载">⬇</button>
         ${canDelete(s) ? `<button class="icon-btn" data-act="del" title="删除">${IC_TRASH}</button>` : ''}`;
      row.addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'dl') { downloadUrl(Store.mediaUrl(s.file)); return; }
        if (act && act.dataset.act === 'del') { doDelete('song', s); return; }
        if (i === cur) togglePause(); else playAt(i);
      });
      wrap.appendChild(row);
    });
  }
  document.addEventListener('input', e => {
    if (e.target.id === 'songSearch') { songQuery = e.target.value; renderSongs(); }
  });
  /* 探测站点是否支持 Range（拖动进度条的前提）：
     支持（如 github.io）直接流式播放；不支持（如 Cloudflare Pages 只回 200）
     则整首下载为 blob 再播，本地 blob 可任意 seek */
  let rangeOK = null, blobCache = null;
  async function resolveSrc(url) {
    if (rangeOK === null) {
      try {
        const r = await fetch(url, { method: 'HEAD' });
        if (!r.ok) {
          // 部署窗口内静态路径尚不存在：经 GitHub API 中转取回整首 blob 播放
          try { return await Store.mediaObjectUrl(url); } catch (e2) { /* 落回原链 */ }
        }
        rangeOK = (r.headers.get('accept-ranges') || '').includes('bytes');
      } catch (e) { rangeOK = true; }
    }
    if (rangeOK) return url;
    if (blobCache && blobCache.src === url) return blobCache.url;
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + r.status);
    if (blobCache) URL.revokeObjectURL(blobCache.url);
    blobCache = { src: url, url: URL.createObjectURL(await r.blob()) };
    return blobCache.url;
  }
  /* 裂图兜底：部署窗口内缩略图/大图 404 时经 GitHub API 中转替换 src（error 不冒泡，用捕获） */
  document.addEventListener('error', e => {
    const el = e.target;
    if (el && el.tagName === 'IMG' && el.dataset.path && el.dataset.fb !== '1') {
      el.dataset.fb = '1';
      Store.mediaObjectUrl(el.dataset.path).then(u => { el.src = u; }).catch(() => {});
    }
  }, true);
  function playAt(i) {
    const songs = Store.get().songs;
    if (i < 0 || i >= songs.length) return;
    cur = i;
    const s = songs[i];
    const url = Store.mediaUrl(s.file);
    resolveSrc(url).then(src => {
      if (Store.get().songs[cur] !== s) return; /* 等待期间用户已切歌 */
      audio.src = src;
      audio.play().catch(() => toast('播放失败，文件可能还在部署中', true));
    }).catch(() => toast('播放失败，文件可能还在部署中', true));
    $('#player').hidden = false;
    document.body.classList.add('has-player');
    if (!localStorage.getItem('tk_np_hint')) {
      localStorage.setItem('tk_np_hint', '1');
      setTimeout(() => toast('点播放条左侧曲名可展开唱片全屏页 🍞'), 800);
    }
    $('#plTitle').textContent = s.title;
    $('#plSinger').textContent = s.singer || '吐司大王';
    $('#npTitle').textContent = s.title;
    $('#npSinger').textContent = s.singer || '吐司大王';
    renderSongs();
  }
  function togglePause() {
    if (cur < 0) { playAt(0); return; }
    if (audio.paused) audio.play(); else audio.pause();
  }
  audio.addEventListener('play', () => {
    $('#plPlay').innerHTML = IC_PAUSE; $('#npPlay').innerHTML = IC_PAUSE;
    $('#nowplay').classList.add('playing'); renderSongs();
  });
  audio.addEventListener('pause', () => {
    $('#plPlay').innerHTML = IC_PLAY; $('#npPlay').innerHTML = IC_PLAY;
    $('#nowplay').classList.remove('playing'); renderSongs();
  });
  audio.addEventListener('timeupdate', () => {
    const v = audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
    $('#plSeek').value = v; $('#npSeek').value = v;
    $('#plTime').textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
    $('#npCur').textContent = fmtTime(audio.currentTime);
    $('#npDur').textContent = fmtTime(audio.duration);
  });
  audio.addEventListener('ended', () => {
    const n = Store.get().songs.length;
    if (cur + 1 < n) playAt(cur + 1); else { audio.pause(); audio.currentTime = 0; }
  });
  $('#plPlay').addEventListener('click', togglePause);
  $('#plPrev').addEventListener('click', () => playAt(Math.max(0, cur - 1)));
  $('#plNext').addEventListener('click', () => playAt(Math.min(Store.get().songs.length - 1, cur + 1)));
  $('#plSeek').addEventListener('input', e => {
    if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration;
  });
  $('#npSeek').addEventListener('input', e => {
    if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration;
  });
  /* 点播放条 → 弹出正在播放全屏页（点控件本身除外） */
  $('#player').addEventListener('click', e => {
    if (e.target.closest('button, input, a')) return;
    $('#nowplay').hidden = false;
  });
  $('#npClose').addEventListener('click', () => { $('#nowplay').hidden = true; });
  /* 点击正在播放页空白处收起 */
  $('#nowplay').addEventListener('click', e => { if (e.target.id === 'nowplay') $('#nowplay').hidden = true; });
  $('#plClose').addEventListener('click', e => {
    e.stopPropagation();
    audio.pause();
    audio.removeAttribute('src');
    cur = -1;
    $('#player').hidden = true;
    $('#nowplay').hidden = true;
    document.body.classList.remove('has-player');
    renderSongs();
  });
  $('#npPlay').addEventListener('click', togglePause);
  $('#npPrev').addEventListener('click', () => playAt(Math.max(0, cur - 1)));
  $('#npNext').addEventListener('click', () => playAt(Math.min(Store.get().songs.length - 1, cur + 1)));
  $('#plVol').addEventListener('input', e => { audio.volume = e.target.value / 100; });
  audio.volume = .8;

  /* ================= 渲染：歌单 ================= */
  function currentPlaylist() {
    const m = Store.get();
    if (!$('#plManage').hidden) {
      return {
        title: $('#plTitleIn').value,
        subtitle: $('#plSubIn').value,
        footer: $('#plFooterIn').value,
        groups: Playlist.readManage($('#plGroups'))
      };
    }
    return m.playlist;
  }
  function renderPlaylist() {
    const pl = Store.get().playlist;
    const isAdmin = Store.role() === 'admin';
    $('#btnPlManage').style.display = isAdmin ? '' : 'none';
    if (!isAdmin) $('#plManage').hidden = true;
    Playlist.renderPreview(pl, $('#plPreview'));
    if (!$('#plManage').hidden) {
      $('#plTitleIn').value = pl.title || '';
      $('#plSubIn').value = pl.subtitle || '';
      $('#plFooterIn').value = pl.footer || '';
      Playlist.renderManage(pl, $('#plGroups'));
    }
  }
  $('#btnPlManage').addEventListener('click', () => {
    const p = $('#plManage');
    p.hidden = !p.hidden;
    if (!p.hidden) renderPlaylist();
  });
  $('#plAddGroup').addEventListener('click', () => Playlist.addManageGroup($('#plGroups')));
  $('#plSave').addEventListener('click', async () => {
    if (Store.role() !== 'admin') { toast('歌单仅管理员可修改哦', true); return; }
    const m = Store.get();
    m.playlist = currentPlaylist();
    try {
      await Store.saveManifest('chore: 更新歌单 by 水友');
      toast('歌单已保存 🍞');
      renderPlaylist();
    } catch (e) {
      if (e.message === 'NO_CONFIG') { toast('缺少上传凭证：请用群公告里的进入链接打开一次本站', true); }
      else toast('保存失败：' + e.message, true);
    }
  });
  $('#btnPlImage').addEventListener('click', async () => {
    toast('正在生成歌单中...');
    try {
      const r = await Playlist.exportPoster(currentPlaylist());
      $('#pbImg').src = r.dataUrl;
      $('#posterBox').hidden = false;
      if (!/MicroMessenger/i.test(navigator.userAgent)) { // 微信屏蔽程序化下载，靠长按
        const a = document.createElement('a');
        a.href = r.dataUrl; a.download = '吐司大王歌单-9x16.png';
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) { toast('生成失败：' + e.message, true); }
  });
  $('#pbClose').addEventListener('click', () => { $('#posterBox').hidden = true; });

  /* ================= 上传 ================= */
  const pick = $('#filePick');
  let pickKind = '';
  function openPicker(kind) {
    pickKind = kind;
    pick.accept = kind === 'song' ? '' : 'image/*'; // 音频不限定 accept，兼容手机文件选择器
    pick.multiple = kind === 'song'; // 图片逐张起名，一次只选一张
    pick.click();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-upload]');
    if (b) openPicker(b.dataset.upload);
  });
  pick.addEventListener('change', () => { handleFiles(pickKind, pick.files); pick.value = ''; });
  $$('.dropzone').forEach(dz => {
    const kind = dz.dataset.drop;
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => { e.stopPropagation(); handleFiles(kind, e.dataTransfer.files); });
    dz.addEventListener('click', () => openPicker(kind));
  });

  function probeDuration(file) {
    return new Promise(res => {
      const a = new Audio(URL.createObjectURL(file));
      a.addEventListener('loadedmetadata', () => res(Math.round(a.duration || 0)));
      a.addEventListener('error', () => res(0));
      setTimeout(() => res(0), 6000);
    });
  }

  /* 上传分类选择弹窗（标签来自 manifest.albumTags，管理员可在设置里增删） */
  function askCat() {
    return new Promise(res => {
      const box = $('#catBox');
      const acts = $('#catActs');
      acts.innerHTML = '';
      const done = v => { box.hidden = true; acts.innerHTML = ''; res(v); };
      albumTags().forEach(t => {
        const b = document.createElement('button');
        b.className = 'btn btn-ghost'; b.type = 'button'; b.textContent = t;
        b.onclick = () => done(t);
        acts.appendChild(b);
      });
      const c = document.createElement('button');
      c.className = 'btn btn-ghost'; c.type = 'button'; c.textContent = '取消';
      c.onclick = () => done(null);
      acts.appendChild(c);
      box.hidden = false;
    });
  }
  async function handleFiles(kind, fileList) {
    let files = Array.from(fileList || []);
    if (!files.length) return;
    files = kind === 'song'
      ? files.filter(f => f.type.startsWith('audio') || /\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(f.name))
      : files.filter(f => f.type.startsWith('image'));
    if (!files.length) { toast('文件类型不匹配哦', true); return; }
    if (kind !== 'song' && files.length > 1) { toast('图片一次只能上传一张哦', true); return; }
    if (!Store.token()) { toast('请先用群公告里的「进入链接」打开一次本站（自动带入上传凭证）', true); return; }
    let cat = 'daily';
    if (kind === 'album') {
      cat = await askCat();
      if (!cat) return; // 取消上传
    }
    toast('上传中');
    try {
      const m = Store.get();
      const commits = [];
      const newEntries = [];
      for (let fi = 0; fi < files.length; fi++) {
        const f = files[fi];
        if (f.size > 80 * 1024 * 1024) { toast(`「${f.name}」超过 80MB 已跳过`, true); continue; }
        let imgName = null;
        if (kind !== 'song') {
          imgName = await askName('', '给这张图起个名字（必填）');
          if (!imgName) return; // 不输入名字 = 不上传
        }
        toast(`上传中 ${fi + 1}/${files.length}：${f.name}`);
        const base64 = await GH.fileToBase64(f);
        const safe = f.name.replace(/[\\/:*?"<>|]/g, '_');
        const dir = kind === 'album' ? 'albums' : kind === 'sticker' ? 'stickers' : 'songs';
        const path = `media/${dir}/${Store.uid()}-${safe}`;
        commits.push({ path, base64 });
        previewUrls[path] = URL.createObjectURL(f);
        const entry = { id: Store.uid(), title: imgName || f.name.replace(/\.[^.]+$/, ''), file: path, date: Store.today(), uploader: Store.myId(), _kind: kind };
        if (kind === 'song') {
          const meta = await askSongMeta(f.name.replace(/\.[^.]+$/, ''));
          if (!meta) continue;
          entry.title = meta.title;
          entry.singer = meta.singer;
          entry.dur = await probeDuration(f);
          const base = entry.title;
          if (m.songs.some(x => x.title === base)) {
            const dup = await askConfirm(`已收录该曲「${base}」，是否重复添加？`, '添加');
            if (!dup) continue;
            let n = 2;
            while (m.songs.some(x => x.title === `${base}_${n}`)) n++;
            entry.title = `${base}_${n}`;
          }
          newEntries.push(entry);
        } else if (kind === 'album') {
          entry.cat = cat;
          newEntries.push(entry);
        } else {
          newEntries.push(entry);
        }
      }
      if (!commits.length) return;
      await Store.commitUploads(commits, `upload: ${kind} ×${commits.length}（水友上传）`, mm => {
        for (const e of newEntries) {
          const k = e._kind; delete e._kind;
          (k === 'album' ? mm.albums : k === 'sticker' ? mm.stickers : mm.songs).push(e);
        }
      });
      toast('上传成功 🍞');
      renderAll();
    } catch (e) {
      toast('上传失败：' + e.message, true);
    }
  }

  /* ================= 设置抽屉 ================= */
  function openDrawer() {
    $('#secGateTool').hidden = Store.role() !== 'admin'; // 换密码仅管理员
    $('#secTagTool').hidden = Store.role() !== 'admin';  // 标签管理仅管理员
    if (!$('#secTagTool').hidden) renderTagTool();
    $('#roleHint').innerHTML = '当前身份：' + (Store.role() === 'admin' ? '管理员（可删除全站内容）' : '水友（仅可删除本机上传的内容）') + '<br>本机上传ID：' + Store.myId();
    $('#drawer').hidden = false;
  }
  function closeDrawer() { $('#drawer').hidden = true; }
  /* 相册标签管理（仅管理员）：增删 manifest.albumTags */
  function renderTagTool() {
    const wrap = $('#tagList');
    if (!wrap) return;
    wrap.innerHTML = '';
    albumTags().forEach(t => {
      const c = document.createElement('span');
      c.className = 'plm-chip';
      c.innerHTML = `${esc(t)}<button type="button" title="删除标签">×</button>`;
      c.querySelector('button').addEventListener('click', async () => {
        const used = Store.get().albums.filter(a => normCat(a.cat) === t).length;
        if (used) { toast(`「${t}」下还有 ${used} 张图片，先把它们改到其他分类再删标签`, true); return; }
        if (!await askConfirm(`删除标签「${t}」？`, '删除')) return;
        const next = albumTags().filter(x => x !== t);
        Store.get().albumTags = next;
        renderAlbumChips(); renderTagTool();
        try {
          await Store.saveManifestApply(mm => { mm.albumTags = next.slice(); }, `chore: 删除相册标签「${t}」`);
        } catch (e) {
          toast('保存失败：' + e.message, true);
          await Store.loadManifest(); renderAlbumChips(); renderTagTool();
        }
      });
      wrap.appendChild(c);
    });
  }
  $('#btnAddTag').addEventListener('click', async () => {
    if (Store.role() !== 'admin') { toast('标签仅管理员可修改哦', true); return; }
    const v = $('#newTag').value.trim();
    if (!v) return;
    if (albumTags().includes(v)) { toast('标签已存在', true); return; }
    const next = albumTags().concat([v]);
    Store.get().albumTags = next;
    $('#newTag').value = '';
    renderAlbumChips(); renderTagTool();
    try {
      await Store.saveManifestApply(mm => { mm.albumTags = next.slice(); }, `chore: 新增相册标签「${v}」`);
      toast('标签已添加 🍞');
    } catch (e) {
      toast('保存失败：' + e.message, true);
      await Store.loadManifest(); renderAlbumChips(); renderTagTool();
    }
  });
  $('#btnSettings').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  /* 一键换密码：改 config.js 哈希行并经 GitHub API 提交，无需手动复制哈希 */
  $('#btnGateHash').addEventListener('click', async () => {
    const code = $('#newGate').value.trim();
    if (!code) return;
    const which = $('#gateWhich').value;
    const box = $('#gateHash');
    box.hidden = false;
    box.textContent = '正在更换…';
    try {
      if (!Store.token()) throw new Error('NO_TOKEN');
      const h = await Store.sha256hex(code);
      const { text } = await GH.readContent(Store.repo(), 'assets/js/config.js');
      const key = which === 'admin' ? 'adminSha256' : 'gateSha256';
      const re = new RegExp('(' + key + ": ')[0-9a-f]{64}(')");
      if (!re.test(text)) throw new Error('config.js 中未找到对应哈希行');
      let next = text.replace(re, '$1' + h + '$2');
      // 同步用新密码重加密上传凭证密文，保证换码后进门仍能解锁凭证
      const tok = Store.token();
      if (tok) {
        const cKey = which === 'admin' ? 'tokenCipherAdmin' : 'tokenCipherMember';
        const cre = new RegExp('(' + cKey + ": ')[^']*(')");
        const cipher = await Store.encryptToken(tok, code);
        next = next.replace(cre, '$1' + cipher + '$2');
      }
      await GH.writeContent(Store.repo(), 'assets/js/config.js', next,
        `chore: 更换${which === 'admin' ? '管理员' : '水友'}密码（站内一键）`);
      box.textContent = '已更换 ✓ 约 1 分钟后生效；生效后所有人需重输新密码，新密码明文只发微信群公告。';
      $('#newGate').value = '';
      toast('密码已更换，约 1 分钟生效');
    } catch (e) {
      box.textContent = '更换失败：' + (e.message === 'NO_TOKEN'
        ? '缺少上传凭证，请用群公告里的进入链接打开一次本站后再试'
        : e.message);
    }
  });
  $('#btnLogout').addEventListener('click', () => {
    Store.clearGate();
    Store.clearToken();
    closeDrawer(); showGate();
    $('#gateInput').value = '';
    toast('已重置本机缓存');
  });

  /* 回到顶部悬浮按钮 */
  const toTop = $('#toTop');
  window.addEventListener('scroll', () => { toTop.classList.toggle('show', window.scrollY > 600); }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* 轮询 manifest：其他设备上传/删除后本页自动更新，免手动刷新。
     带凭证时读 GitHub head 实时清单（秒级看见他人上传，不等部署）；无凭证回退 CDN 副本 */
  let manifestSig = '';
  async function fetchManifestText() {
    if (Store.token()) {
      try {
        const r = await window.GH.readContent(Store.repo(), 'data/manifest.json');
        return r.text;
      } catch (e) { /* 落到 CDN 回退 */ }
    }
    const res = await fetch('data/manifest.json?t=' + Date.now(), { cache: 'no-store' });
    return res.ok ? await res.text() : null;
  }
  async function syncManifestBaseline() {
    try {
      const txt = await fetchManifestText();
      if (txt) manifestSig = txt;
    } catch (e) { /* ignore */ }
  }
  setInterval(async () => {
    if (!$('#gate').hidden) return;              // 未进门不轮询
    if (!$('#plManage').hidden) return;          // 歌单编辑中有未保存修改时不覆盖
    if (Store.isPending()) return;               // 本机提交进行中不轮询覆盖
    try {
      const txt = await fetchManifestText();
      if (!txt || txt === manifestSig) return;
      const parsed = JSON.parse(txt);
      manifestSig = txt;
      if (JSON.stringify(parsed) === JSON.stringify(Store.get())) return; // 本机刚提交的内容，无需提示
      Store.set(parsed);
      renderAll();
    } catch (e) { /* ignore */ }
  }, 45000);

  /* ================= 启动 ================= */
  /* 群公告种子链接：#tk=ghp_xxx 打开即把上传凭证存入本机，之后零配置 */
  (function seedToken() {
    const m = location.hash.match(/[#&]tk=([^&]+)/);
    if (m) {
      localStorage.setItem('tk_token', decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => toast('上传凭证已存入本机 🍞'), 400);
    }
  })();
  function renderAll() { renderAlbumChips(); renderMedia(); renderSongs(); renderPlaylist(); }
  async function init() {
    Store.gateOk() ? hideGate() : showGate();
    await Store.loadManifest();
    await syncManifestBaseline();
    renderAll();
    // 凭证健康检查：失效则清除并提示重新进门领取
    (async () => {
      const t = Store.token();
      if (!t) return;
      try {
        const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t } });
        if (r.status === 401) {
          Store.clearToken();
          toast('上传凭证已失效：请设置→重置缓存后重新输入密码领取', true);
        }
      } catch (e) { /* 网络问题忽略 */ }
    })();
  }
  init();
})();
