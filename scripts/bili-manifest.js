// 读取 media/songs/*.info.json + ffprobe 时长，把新歌曲合并进 data/manifest.json
// 标题直接用分P标题（即歌名），重名加序号；歌手固定"吐司大王"
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = 'media/songs';
const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const existing = new Set(manifest.songs.map(s => s.file));
const seenTitles = new Set(manifest.songs.map(s => s.title));
const files = fs.readdirSync(dir).filter(f => f.endsWith('.info.json')).sort();
let added = 0;
const entries = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const mp3 = f.replace(/\.info\.json$/, '.mp3');
  if (!fs.existsSync(path.join(dir, mp3))) continue;
  const file = 'media/songs/' + mp3;
  if (existing.has(file)) continue;
  let title = (j.title || mp3).trim();
  if (seenTitles.has(title)) {
    let n = 2;
    while (seenTitles.has(`${title} (${n})`)) n++;
    title = `${title} (${n})`;
  }
  seenTitles.add(title);
  let dur = 0;
  try {
    dur = Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, mp3)], { encoding: 'utf8' })));
  } catch (e) { /* ignore */ }
  entries.push({
    id: 'bili-' + mp3.replace(/\.mp3$/, '').replace(/[^\w一-龥-]/g, '_'),
    title,
    singer: '吐司大王',
    file,
    dur,
    date: new Date().toISOString().slice(0, 10),
    uploader: 'bili-import'
  });
  added++;
}
manifest.songs = manifest.songs.concat(entries);
fs.writeFileSync('data/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('added=' + added, 'total=' + manifest.songs.length);
