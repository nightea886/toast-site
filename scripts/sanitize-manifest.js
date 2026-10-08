// 部署自愈：丢弃 manifest 中文件已不存在的悬空条目（防旧版客户端复活脏数据）
const fs = require('fs');
const p = 'data/manifest.json';
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0;
for (const k of ['albums', 'stickers', 'songs']) {
  const before = m[k].length;
  m[k] = m[k].filter(e => fs.existsSync(e.file));
  n += before - m[k].length;
}
if (n) {
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
  console.log('removed ' + n + ' dangling entries');
} else {
  console.log('manifest clean');
}
