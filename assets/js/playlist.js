/* ==========================================================
   playlist.js —— 歌单：页面预览 / 管理编辑（仅管理员）/ 9:16 高清长图
   长图为纯 canvas 绘制（2 倍像素、宽 2160）：不依赖任何第三方库，
   规避 html-to-image 在部分环境输出全黑的问题；版式对照示例图：
   吉祥物 + 渐变标题 + 副标题 + 徽章 + 歌手分组 + 五列歌曲卡片 + 页脚 + 边框角标。
   高度不足 1920（9:16）时补底，内容多时自然延伸为长图。
   ========================================================== */
window.Playlist = (function () {
  const W = 1080, PAD = 56, MIN_H = 1920;
  const COLS = 5, CARD_GAP = 12, CARD_H = 96;
  const LABEL_H = 44, LABEL_GAP = 18, GROUP_GAP = 44;
  const F_SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
  const F_SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';

  const songT = o => (o && typeof o === 'object') ? o.t : o;
  const songS = (o, g) => (o && typeof o === 'object' && o.s) ? o.s : g;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- canvas 工具 ---------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function trunc(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  /* 两行换行：第一行尽量填满，第二行放不下再截断（五列窄卡用） */
  function wrap2(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return [text];
    let cut = text.length - 1;
    while (cut > 1 && ctx.measureText(text.slice(0, cut)).width > maxW) cut--;
    return [text.slice(0, cut), trunc(ctx, text.slice(cut), maxW)];
  }
  /* 吐司猫 logo（透明 PNG）；加载失败时头部回退为手绘面包 */
  let _logo = null;
  function loadLogo() {
    if (_logo) return Promise.resolve(_logo);
    _logo = new Image();
    _logo.src = 'assets/img/logo.png';
    return _logo.decode().then(() => _logo);
  }
  /* 矢量小面包：不依赖 emoji 字体，任何环境渲染一致 */
  function drawBread(ctx, cx, cy, s) {
    const w = s, h = s * 0.72, top = -h * 0.10;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#E8A04C';
    rr(ctx, -w / 2, top, w, h * 0.66, w * 0.16); ctx.fill();
    ctx.beginPath();
    for (const dx of [-0.30, 0, 0.30]) {
      ctx.moveTo(dx * w + w * 0.185, top);
      ctx.arc(dx * w, top, w * 0.185, 0, 7);
    }
    ctx.fill();
    ctx.strokeStyle = '#FCF6E9'; ctx.lineWidth = s * 0.075; ctx.lineCap = 'round';
    for (const dx of [-0.30, 0, 0.30]) {
      ctx.beginPath();
      ctx.moveTo(dx * w - w * 0.07, top - w * 0.07);
      ctx.lineTo(dx * w + w * 0.07, top + w * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  }
  /* 网页字体异步预加载（镜像源，不阻塞）；超时即用系统字体，保证出图 */
  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const specs = ['900 58px ' + F_SERIF, '700 34px ' + F_SERIF, '600 21px ' + F_SANS, '400 24px ' + F_SANS];
    return Promise.race([
      Promise.all(specs.map(s => document.fonts.load(s).catch(() => null))),
      new Promise(r => setTimeout(r, 2500)),
    ]).then(() => null);
  }

  /* ---------- 布局度量 ---------- */
  function groupRows(g) { return Math.max(1, Math.ceil((g.songs || []).length / COLS)); }
  function groupHeight(g) { return LABEL_H + LABEL_GAP + groupRows(g) * CARD_H + (groupRows(g) - 1) * CARD_GAP + GROUP_GAP; }
  function contentHeight(pl) {
    let y = 76 + 104 + 14;         // 顶边距 + logo 行 + 间隔
    y += 40 + 36;                  // 副标题 + 间隔
    (pl.groups || []).forEach(g => { y += groupHeight(g); });
    y += 52 + 40 + 60;             // 页脚间隔 + 文本 + 底边距
    return y;
  }

  /* ---------- 9:16 高清长图（暖奶油色系，对照示例图） ---------- */
  async function exportPoster(pl) {
    await ensureFonts();
    const H = Math.max(MIN_H, contentHeight(pl));
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    ctx.textBaseline = 'middle';

    // 奶油底 + 上下暖光 + 边框 + 角标
    ctx.fillStyle = '#FCF6E9'; ctx.fillRect(0, 0, W, H);
    let g1 = ctx.createLinearGradient(0, 0, 0, 360);
    g1.addColorStop(0, 'rgba(232,160,76,.16)'); g1.addColorStop(1, 'rgba(232,160,76,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, 360);
    let g2 = ctx.createLinearGradient(0, H, 0, H - 300);
    g2.addColorStop(0, 'rgba(217,142,74,.12)'); g2.addColorStop(1, 'rgba(217,142,74,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, H - 300, W, 300);
    ctx.strokeStyle = 'rgba(217,142,74,.4)'; ctx.lineWidth = 2;
    rr(ctx, 26, 26, W - 52, H - 52, 26); ctx.stroke();
    ctx.font = '34px ' + F_SANS; ctx.textAlign = 'center';
    drawBread(ctx, 62, 52, 40);
    drawBread(ctx, W - 62, H - 48, 40);

    // 头部：吐司猫 logo + 棕色标题
    const logo = await loadLogo().catch(() => null);
    const logoH = 104;
    const logoW = logo ? Math.round(logoH * logo.naturalWidth / logo.naturalHeight) : logoH;
    let y = 76;
    ctx.font = '900 58px ' + F_SERIF;
    const rawTitle = pl.title || '';
    const hadEmoji = /\p{Extended_Pictographic}/u.test(rawTitle);
    const title = rawTitle.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim();
    const tw = ctx.measureText(title).width;
    const breadW = hadEmoji ? 58 : 0;
    const total = logoW + 22 + tw + breadW;
    if (logo) {
      ctx.drawImage(logo, (W - total) / 2, y - 4, logoW, logoH);
    } else {
      drawBread(ctx, (W - total) / 2 + logoW / 2, y + 52, 64);
    }
    ctx.font = '900 58px ' + F_SERIF;
    ctx.fillStyle = '#7C4A21'; ctx.textAlign = 'left';
    ctx.fillText(title, (W - total) / 2 + logoW + 22, y + 50);
    if (hadEmoji) drawBread(ctx, (W - total) / 2 + logoW + 22 + tw + 34, y + 50, 46);
    y += logoH + 14;

    // 副标题 + 徽章
    ctx.textAlign = 'center';
    ctx.font = '400 26px ' + F_SANS; ctx.fillStyle = '#B49B7F';
    ctx.fillText(pl.subtitle || '', W / 2, y + 16);
    y += 40 + 36;

    // 分组与歌曲卡片（白卡 + 暖边框 + 轻投影）
    const cw = (W - PAD * 2 - (COLS - 1) * CARD_GAP) / COLS;
    (pl.groups || []).forEach(gr => {
      rr(ctx, PAD, y + 2, 44, 44, 12);
      ctx.fillStyle = 'rgba(232,160,76,.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(217,142,74,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#D98E4A'; ctx.font = '600 24px ' + F_SANS;
      ctx.fillText('♪', PAD + 22, y + 25);
      ctx.textAlign = 'left';
      ctx.font = '700 34px ' + F_SERIF; ctx.fillStyle = '#6B4A2F';
      ctx.fillText(gr.singer, PAD + 58, y + 24);
      const sw = ctx.measureText(gr.singer).width;
      ctx.font = '400 24px ' + F_SANS; ctx.fillStyle = '#B49B7F';
      ctx.fillText(`（${(gr.songs || []).length} 首）`, PAD + 58 + sw + 12, y + 26);
      ctx.textAlign = 'center';
      const y0 = y + LABEL_H + LABEL_GAP;
      (gr.songs || []).forEach((s, i) => {
        const cx = PAD + (i % COLS) * (cw + CARD_GAP);
        const cy = y0 + Math.floor(i / COLS) * (CARD_H + CARD_GAP);
        ctx.save();
        ctx.shadowColor = 'rgba(176,132,74,.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
        rr(ctx, cx, cy, cw, CARD_H, 14);
        ctx.fillStyle = '#FFFCF5'; ctx.fill();
        ctx.restore();
        rr(ctx, cx, cy, cw, CARD_H, 14);
        ctx.strokeStyle = '#EFDFC3'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + 21, cy + 23, 13, 0, 7);
        ctx.fillStyle = 'rgba(232,160,76,.16)'; ctx.fill();
        ctx.strokeStyle = 'rgba(217,142,74,.45)'; ctx.stroke();
        ctx.fillStyle = '#D98E4A'; ctx.font = '600 15px ' + F_SANS;
        ctx.fillText(String(i + 1), cx + 21, cy + 24);
        ctx.textAlign = 'left';
        ctx.font = '600 21px ' + F_SANS; ctx.fillStyle = '#5C3A1E';
        const lines = wrap2(ctx, songT(s), cw - 26);
        lines.forEach((ln, li) => ctx.fillText(ln, cx + 13, cy + 56 + li * 26));
        ctx.textAlign = 'center';
      });
      y += groupHeight(gr);
    });

    // 页脚（文字居中，两侧矢量面包）
    ctx.font = '400 24px ' + F_SANS; ctx.fillStyle = '#B49B7F';
    const ft = '·  ' + (pl.footer || '') + '  ·';
    ctx.fillText(ft, W / 2, H - 66);
    const fw = ctx.measureText(ft).width;
    drawBread(ctx, W / 2 - fw / 2 - 26, H - 66, 26);
    drawBread(ctx, W / 2 + fw / 2 + 26, H - 66, 26);

    const dataUrl = cv.toDataURL('image/png');
    return { w: cv.width, h: cv.height, dataUrl };
  }

  /* ---------- 页面预览 ---------- */
  function renderPreview(pl, el) {
    const g = pl.groups || [];
    el.innerHTML =
      `<div class="pl-head">
        <h3>${esc(pl.title || '')}</h3><p>${esc(pl.subtitle || '')}</p></div>` +
      g.map((gr, i) =>
        `<div class="pl-group" style="--i:${i % 10}">
          <div class="pl-group-label"><span class="dot">♪</span><b>${esc(gr.singer)}</b><span>（${(gr.songs || []).length} 首）</span></div>
          <div class="pl-cards">${(gr.songs || []).map((s, si) =>
            `<div class="pl-card"><span class="n">${si + 1}</span><span class="t"><b title="${esc(songT(s))}">${esc(songT(s))}</b><span>${esc(songS(s, gr.singer))}</span></span></div>`).join('')}
          </div>
        </div>`).join('') +
      `<div class="pl-foot">${esc(pl.footer || '')}</div>`;
  }

  /* ---------- 管理编辑器（仅管理员可见入口） ---------- */
  /* 歌曲用标签 chips 编辑：输入歌名回车或点＋添加，点 × 移除，比 textarea 换行直观 */
  function groupBlock(singer, songs) {
    const d = document.createElement('div');
    d.className = 'plm-group';
    d.innerHTML =
      `<div class="plm-head"><input class="plm-singer" placeholder="歌手名" value="${esc(singer || '')}">
        <button class="icon-btn plm-del" title="删除该分组">🗑</button></div>
       <div class="plm-chips"></div>
       <div class="plm-addrow">
         <input class="plm-add" placeholder="输入歌名，回车或点＋添加" autocomplete="off">
         <button class="btn btn-ghost plm-addbtn" type="button">＋</button>
       </div>`;
    const chips = d.querySelector('.plm-chips');
    const addChip = (t, sg) => {
      t = (t || '').trim();
      if (!t) return;
      const c = document.createElement('span');
      c.className = 'plm-chip';
      if (sg) c.dataset.s = sg;
      c.innerHTML = `${esc(t)}<button type="button" title="移除">×</button>`;
      c.querySelector('button').addEventListener('click', () => c.remove());
      chips.appendChild(c);
    };
    (songs || []).forEach(o => addChip(songT(o), o && typeof o === 'object' ? o.s : ''));
    const inp = d.querySelector('.plm-add');
    const parseAdd = () => {
      const v = inp.value;
      const at = v.indexOf('@');
      if (at > 0) addChip(v.slice(0, at), v.slice(at + 1));
      else addChip(v);
      inp.value = ''; inp.focus();
    };
    d.querySelector('.plm-addbtn').addEventListener('click', parseAdd);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); parseAdd(); }
    });
    d.querySelector('.plm-del').addEventListener('click', () => d.remove());
    return d;
  }
  function renderManage(pl, wrap) {
    wrap.innerHTML = '';
    (pl.groups || []).forEach(g => wrap.appendChild(groupBlock(g.singer, g.songs)));
  }
  function addManageGroup(wrap) { wrap.appendChild(groupBlock('', [])); }
  function readManage(wrap) {
    return Array.from(wrap.querySelectorAll('.plm-group')).map(b => ({
      singer: b.querySelector('.plm-singer').value.trim() || '未命名',
      songs: Array.from(b.querySelectorAll('.plm-chip')).map(c =>
        c.dataset.s ? { t: c.firstChild.textContent.trim(), s: c.dataset.s } : c.firstChild.textContent.trim())
    })).filter(g => g.songs.length);
  }

  return { renderPreview, renderManage, addManageGroup, readManage, exportPoster };
})();
