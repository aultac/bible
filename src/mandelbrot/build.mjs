import { promises as fs, watch as watchFileSystem } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const sourceRoot = path.join(__dirname, 'src');
const outputPath = path.join(repoRoot, 'dist', 'mandelbrot.html');
const watchMode = process.argv.includes('--watch');
const watchedDirectories = [
    path.join(sourceRoot, 'fragments'),
    path.join(sourceRoot, 'sections'),
    path.join(sourceRoot, 'styles'),
    path.join(sourceRoot, 'scripts')
];

async function readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

async function readOrderedDirectory(directoryPath) {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const fileNames = entries
        .filter(function(entry) {
            return entry.isFile();
        })
        .map(function(entry) {
            return entry.name;
        })
        .sort(function(left, right) {
            return left.localeCompare(right);
        });

    const contents = [];
    for (const fileName of fileNames) {
        contents.push(await readFile(path.join(directoryPath, fileName)));
    }
    return contents.join('');
}

async function buildMandelbrot() {
    const html = [
        await readFile(path.join(sourceRoot, 'fragments', '00-before-styles.html')),
        await readOrderedDirectory(path.join(sourceRoot, 'styles')),
        await readFile(path.join(sourceRoot, 'fragments', '10-after-styles-before-sections.html')),
        await readOrderedDirectory(path.join(sourceRoot, 'sections')),
        await readFile(path.join(sourceRoot, 'fragments', '80-after-sections-before-script.html')),
        await readOrderedDirectory(path.join(sourceRoot, 'scripts')),
        await readFile(path.join(sourceRoot, 'fragments', '90-after-script.html'))
    ].join('');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html);
    console.log('Built ' + path.relative(repoRoot, outputPath));
}

if (!watchMode) {
    await buildMandelbrot();
} else {
    let buildInProgress = false;
    let rebuildQueued = false;
    let debounceTimer = null;

    async function runBuild() {
        if (buildInProgress) {
            rebuildQueued = true;
            return;
        }
        buildInProgress = true;
        try {
            await buildMandelbrot();
        } catch (error) {
            console.error(error);
        } finally {
            buildInProgress = false;
            if (rebuildQueued) {
                rebuildQueued = false;
                await runBuild();
            }
        }
    }

    function scheduleBuild() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(function() {
            debounceTimer = null;
            runBuild().catch(function(error) {
                console.error(error);
            });
        }, 80);
    }

    await runBuild();

    const watchers = watchedDirectories.map(function(directoryPath) {
        return watchFileSystem(directoryPath, function() {
            scheduleBuild();
        });
    });

    function closeWatchers() {
        watchers.forEach(function(watcher) {
            watcher.close();
        });
    }

    process.on('SIGINT', function() {
        closeWatchers();
        process.exit(0);
    });
    process.on('SIGTERM', function() {
        closeWatchers();
        process.exit(0);
    });

    console.log('Watching ' + path.relative(repoRoot, sourceRoot) + ' for changes');
    await new Promise(function() {});
}
