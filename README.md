# toast-site · AI 会话交接文档

> 本 README 不是用户手册，是**给未来 AI 编码会话的背景交接**。
> 新会话开场白：「访问 https://github.com/nightea886/toast-site ，读取 README，然后开始做下面的任务：……」即可。
> 全文中文协作；**仓库为 public，任何密钥（门禁密码明文、token 明文）永不进仓库/提交信息/README/网页**。

## 一、这是什么站

- 主播「吐司大王」微信群限定静态站：**相册 / 表情包 / 歌曲 / 歌单** 四板块。
- 纯 HTML/CSS/JS，无构建、无后端；数据全在仓库：`data/manifest.json`（清单）+ `media/`（图片/音频）。
- 托管：主用 Cloudflare Pages <https://toast-site-ed1.pages.dev/>（用户自绑）；并行 GitHub Pages <https://nightea886.github.io/toast-site/>（`.github/workflows/deploy-pages.yml` 自动部署，含 `scripts/sanitize-manifest.js` 部署自愈：丢弃清单里媒体已不存在的悬空条目）。

## 二、技术地图

| 文件 | 职责 |
| --- | --- |
| `index.html` | 单页四 tab + 播放器 + 大图光箱 + 各弹窗；head 含门禁防闪同步脚本与 no-store meta |
| `assets/css/main.css` | 全部颜色收敛在 `:root` CSS 变量；暗色「深夜烘焙坊」（暖黑底+焦糖金）；`color-scheme:dark` 防手机系统/微信强制暗夜二次压暗；移动端用 `(hover:none)` 媒体查询 |
| `assets/js/config.js` | `gateSha256/adminSha256`（门禁哈希）+ `tokenCipherMember/Admin`（推送 token 密文） |
| `assets/js/gh.js` | GitHub git-data API 封装：`commitFiles`（可传 expectedBase 校验基线）、`headManifest`（refs→commit→tree→blob 强一致读）、`readContent/rawContent` 等 |
| `assets/js/store.js` | manifest 读写与提交通道：`commitWith` = **串行锁 + 三级基线（git-data 强一致 → contents API → CDN 回退）+ rev 单调护栏 + 基线 sha 校验 + 409/422 重试**；`manifest.rev` 单调递增防静默回退 |
| `assets/js/playlist.js` | 歌单网页预览 / 管理员编辑器 / 9:16 canvas 长图 `exportPoster`（**勿引入 html-to-image**，历史全黑事故） |
| `assets/js/app.js` | 全部 UI 与业务（门禁、上传队列、光箱滑轨、播放模式、toast 通道等） |

关键机制（勿破坏）：
- **门禁**：成员/管理员密码哈希比对 config.js；通过写 localStorage `tk_gate_ok`；密码明文只在微信群公告。
- **上传凭证**：classic token（public_repo scope）以 AES-GCM 密文存 config.js（key=对应门禁密码的 SHA-256，iv=密文前 12 字节）；进门后浏览器解密存 `tk_token`，任何设备零配置。
- **写路径**：浏览器内 git-data API 提交（媒体文件+manifest 同 commit 原子落地）；部署窗口内媒体 404 有 API 中转兜底（`mediaObjectUrl`）。
- **权限**：删除/重命名/改分类 = 管理员 或（有凭证 且 `entry.uploader === 本机 tk_uid`）；tk_uid 同浏览器持久（清站点数据/无痕/换设备才变，"重置缓存"不清它）。
- **相册标签**：`manifest.albumTags`（管理员抽屉增删；**已绑定图片的标签禁删**）；旧 cat 值 `daily` ≡ `日常`（`normCat`）。
- **光箱**：三槽滑轨（prev/cur/next，滑轨即邻图预载）；拖拽跟手、松手阈值 `min(90px, 槽宽22%)` 翻页；**边界钳制不露图 + 提示"到底啦~"**；caption 格式「名字（分类）」；点空白关闭但拖拽过的松手不误关。
- **播放模式**：顺序/循环/随机三态（`tk_playmode` 本机记忆），播放条与全屏页双钮同步。

## 三、推送凭证获取（新会话操作步骤）

1. 向用户**在对话里索要门禁密码**（勿猜、勿硬编码、勿写进仓库）。
2. 解密（node `crypto` 或 webcrypto）：读 `assets/js/config.js` 的 `tokenCipherMember` base64 → 解码 → `iv=前12字节`、`ct=其余` → `key=SHA-256(密码明文)` → AES-GCM 解密 → `ghp_...` token。
3. 只放内存或仓库外临时文件，**用完即删**。
4. 推送方式 A：`git remote set-url origin https://<token>@github.com/nightea886/toast-site.git` → push → **push 完 set-url 回干净地址**。
   方式 B（github.com:443 被间歇重置时）：`api.github.com` 直连通常稳定，走 git-data API 推提交（blob→tree→commit→PATCH ref）；注意 GitHub 会把提交时区归一为 +0000，本地 SHA 与远程不同属正常，push 后 `git fetch` + `reset --hard origin/main` 对齐。

## 四、上线流程（铁律）

1. 开工先 `git fetch`：用户会**自己并行改代码并推送**（常带版本号），有分歧先 rebase。
2. 本地改 → `node --check` 语法 → 自测（见 §五，尽量给客观证据）。
3. **给用户预览地址（桌面 local + 手机 LAN），等用户回"上线"才 commit+push**；严禁先推后报。
4. commit 时把 `index.html` 里 `?v=20261009y` 的**字母 +1**（7 处引用一起 sed）对抗微信缓存；HTML 本身已 no-cache（`_headers` + meta），版本号是双保险。
5. commit 信息中文：`fix/feat/style: 内容摘要；版本号X`。
6. push 后核验 pages.dev：HTML 引用版本号、关键代码标记 grep 命中；GH Pages workflow 会并行自动跑。

## 五、本地预览与自测工具箱

- 本地服务器：`python -m http.server 8642 --bind 0.0.0.0`；手机同 Wi-Fi 开 `http://<局域网IP>:8642`。
- **无头 Edge（稳定、首选）**：`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --virtual-time-budget=12000 --dump-dom|--screenshot=out.png URL`。
  - 可写临时 harness 页（引 config/gh/store，直接调 `Store.commitUploads/commitDelete/saveManifestApply/GH.headManifest` 做真实链路自测），**用完即删**。
  - 注入登录态：预设 `localStorage.tk_gate_ok`（值=config.js 的 gateSha256）或门禁页填密码。
  - `--window-size` 最小宽约 500，模拟不了真窄手机屏；`(hover:none)` 也模拟不了，移动端规则靠代码审查+用户真机。
- 应用内浏览器自动化（IAB/MCP node_repl）可做轻 UI 操作，但渲染进程易崩、长 evaluate 易 32s 超时；**大截图会污染上下文**，控制频率、用完关标签。
- 并发自测范式：一次提交上传 N 个测试图/歌 → `Promise.all` 并发重命名/改分类/删除/追加 → `GH.headManifest`（强一致）逐条核验 → 清理 commit → api 直查清单与目录**零残留**。自测提交一律 `test:` 前缀留审计痕。
- 服务器直查：token 调 `api.github.com/repos/nightea886/toast-site/contents/...` 读 manifest 与目录列表。

## 六、历史坑位清单（ đều 踩过）

- 微信缓存极顽固：用户反馈"手机没变"先怀疑**缓存/设备强制暗夜**，再怀疑代码；让用户带 `?v=X` 开一次。
- `.btn` 的 display 会覆盖 `hidden` → 已有全局 `[hidden]{display:none!important}`。
- 手机屏蔽 `window.confirm/prompt` → 一律站内 askbox 弹窗；`toast(msg, err, channel)` 第三参同通道互挤（快切提示不叠罗汉）。
- 微信屏蔽程序化下载 → 图片靠长按保存，`(hover:none)` 隐藏下载钮。
- 多行脚本别内嵌 workflow YAML → 独立文件。
- GitHub 网页删 token 的交互对自动化不可靠（曾误删正式凭证两次）→ 吊销逐行校验或交用户手动。
- 网格列数要数全按钮个数。
- 点击处理里**同步替换按钮 innerHTML** 会使冒泡 guard 失效（detached target 的 closest 落空）→ stopPropagation 或延迟替换。
- 抠图透明图可能有全透明缝的游离碎片 → alpha 连通域分析核对。
- `/contents` 有读后写延迟、CDN 有分钟级延迟 → manifest 基线必须 git-data 强一致读；**rev 记账只能在 commit 成功后推进**。
- 移动端按钮点按延迟（双击缩放）→ 全局 `button{touch-action:manipulation}`。
- localStorage 键：`tk_gate_ok / tk_token / tk_uid / tk_playmode / tk_np_hint`（`tk_theme` 已废弃）。

## 七、版本与里程碑速览

- 版本号字母见 `index.html` 的 `?v=`（写本文时：**y**）。
- 里程碑：徽章 logo 全平台替换（含皇冠宝石修复、唱片 contain）→ 歌单长图像素级还原参考图（虚线药丸组标/琥珀补零序号圆/五列柔渐变卡/跨组连续编号/长歌名缩字号）→ 「深夜烘焙坊」提亮定稿 → 体验五件套（光箱锁滚动/滚轮翻图/移动端去进度条/上传命名必填/标签动态化）→ 并发四层防护 → 滑轨光箱与弹窗交互分层 → 边界钳制。

## 八、协作记忆

- 始终中文回复；写完代码不做用户未要求的提交/推送。
- 用户审美：暖烘焙色系；厌恶"又黄又暗"的脏感与闪烁动画；要系统相册式的跟手顺滑。
- 用户不想自己测试：尽量给客观自测证据（MutationObserver 计数、服务器直查、并发压测 PASS 输出）。
- 拿不准就先预览、别赌上线；被指出流程错误时先认再改。
