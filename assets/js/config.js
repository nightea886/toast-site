/* ==========================================================
   站点配置
   - gateSha256：成员进入密码的 SHA-256 哈希。输对一次该浏览器永久进入；
     替换哈希 = 换密码，所有人豁免同时失效。
   - adminSha256：管理员密码的哈希。用管理员密码进入 = 管理员身份，
     可删除任意相册/表情包/歌曲；成员密码进入只能删除自己上传的内容。
     明文密码只允许出现在微信群公告里，永远不要写在别处。
     换码方法：设置面板「门禁码工具」生成新哈希后替换对应行。
   - repo / branch：站点仓库，已写死。
   - uploadToken：留空。上传凭证**不能**写进代码——公开仓库里出现的
     GitHub token 会被 secret scanning 几分钟内自动吊销（已实测踩过）。
     凭证改由群公告里的"种子链接"分发：链接形如
     https://nightea886.github.io/toast-site/#tk=ghp_xxx
     成员点开后凭证自动存入该浏览器（localStorage），之后过门禁即可上传，零配置。
   ========================================================== */
window.SITE_CONFIG = {
  siteName: '吐司大王',
  gateSha256: '382403d9434ff58214659ef99ed92aa8190ea2fcbeaae4b865c33b55c875f7d8', // 成员密码 148971
  adminSha256: 'd43d9a629681216a85fd5d2d4fc1cdd3c7a431481dfac6a3fca23489ae7fa55f', // 管理员密码见群公告/README
  repo: 'nightea886/toast-site',
  branch: 'main',
  uploadToken: '',
  /* 上传凭证密文（AES-GCM，密钥 = 对应密码的 SHA-256）：
     门禁输对密码即在浏览器内解密出凭证，任何设备零配置可上传/删除；
     密文不是 token 明文，不会触发 GitHub 吊销。
     换密码时站内「更换密码」会用新密码重加密并同步更新对应行。 */
  tokenCipherMember: '7Pruf6OxG9NADhB95aPg6E45IXzcCMfXxDmm+jU4XRusPzFgETw5EHlQJHZte0+vvTZffn4/2BXJrC249tyTHwd3/BM=',
  tokenCipherAdmin: 'YoP/cuRQd8g8h9yr6mJhMgjDUS/Kh6uXTxUmJjOb0kRmXrvwjWZ3FvjlaFbYehVPR+KRFXeO+i5u8nY11JUhC483neY=',
};

/* 兜底数据：data/manifest.json 拉取失败时使用（例如刚克隆还没提交数据）。
   上传/编辑成功后以仓库里的 data/manifest.json 为准。 */
window.DEFAULT_MANIFEST = {
  version: 1,
  albums: [
    { id: 'a1', title: '深夜直播 · 名场面', file: 'media/albums/album-1.svg', date: '2026-10-01', cat: 'daily' },
    { id: 'a2', title: '焦糖色打光测试', file: 'media/albums/album-2.svg', date: '2026-10-02', cat: 'daily' },
    { id: 'a3', title: '线下见面会合照', file: 'media/albums/album-3.svg', date: '2026-10-04', cat: 'cosplay' },
    { id: 'a4', title: '生日回直播截图', file: 'media/albums/album-4.svg', date: '2026-10-06', cat: 'daily' }
  ],
  stickers: [
    { id: 's1', title: '吐司比心', file: 'media/stickers/sticker-1.svg', date: '2026-10-01' },
    { id: 's2', title: '拍桌爆笑', file: 'media/stickers/sticker-2.svg', date: '2026-10-01' },
    { id: 's3', title: '蹦跳登场（动图）', file: 'media/stickers/sticker-3.svg', date: '2026-10-03' }
  ],
  songs: [],
  playlist: {
    title: '吐司大王的点歌单 🍞',
    subtitle: '欢迎围观 / 灯牌点歌 (｡･ω･｡)ﾉ',
    footer: '歌单持续更新中～',
    groups: [
      { singer: '薛之谦', songs: ['演员', '绅士', '刚刚好', '你还要我怎样', '丑八怪', '动物世界', '暧昧', '怪咖', '天外来物', '认真的雪'] },
      { singer: '周杰伦', songs: ['晴天', '稻香', '告白气球', '七里香', '夜曲', '搁浅', '安静', '蒲公英的约定'] },
      { singer: '陈奕迅', songs: ['浮夸', '十年', '爱情转移', '红玫瑰', '好久不见', '你的背包'] },
      { singer: '林俊杰', songs: ['修炼爱情', '她说', '可惜没如果', '江南', '不为谁而作的歌'] },
      { singer: '王菲', songs: ['红豆', '传奇', '匆匆那年', '我愿意'] },
      { singer: '孙燕姿', songs: ['遇见', '开始懂了', '绿光', '天黑黑'] },
      { singer: '其他热门', songs: ['起风了', '光年之外', '漠河舞厅', '孤勇者', '错位时空', '少年'] }
    ]
  }
};
