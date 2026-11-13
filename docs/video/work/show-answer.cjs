const fs=require('node:fs');
const a=JSON.parse(fs.readFileSync('docs/video/work/answer.json','utf8'));
console.log('aiLog entries:', a.log.length);
console.log('answer (first 800 chars):');
console.log(a.answer.slice(0,800));
const w=JSON.parse(fs.readFileSync('docs/video/work/warmup.json','utf8'));
console.log('warmup aiLog entries:', w.log.length);
