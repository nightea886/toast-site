// 读取 bili-meta.txt（id|pidx|pcount|title|duration），筛选"歌曲形态"分P：
// 合集/多P视频的全部整P + 单P且时长<=30分钟；输出下载URL列表 bili-dl-urls.txt
const fs = require('fs');
const lines = fs.readFileSync('bili-meta.txt', 'utf8').split('\n').filter(l => l.trim());
const urls = [];
let kept = 0, skipped = 0;
for (const l of lines) {
  const [id, pidx, pcount, title, dur] = l.split('|');
  const d = parseFloat(dur);
  const multi = parseInt(pcount || '1', 10) > 1;
  if (multi || (d && d <= 1800)) { urls.push(`https://www.bilibili.com/video/${id}?p=${pidx}`); kept++; }
  else skipped++;
}
fs.writeFileSync('bili-dl-urls.txt', urls.join('\n') + '\n');
console.log('kept=' + kept, 'skipped=' + skipped);
