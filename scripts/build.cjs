const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + fs.readFileSync(path.join(root, 'styles.css'), 'utf8') + '\n</style>');
for (const name of ['model.js', 'app.js']) html = html.replace('<script src="' + name + '"></script>', () => '<script>\n' + fs.readFileSync(path.join(root, name), 'utf8') + '\n</script>');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'reflex-arc.html'), html);
console.log('Built dist/reflex-arc.html — self-contained, works offline.');
