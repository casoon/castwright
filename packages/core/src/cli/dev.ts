// `castwright dev <file>` — see docs/reference/cli.md. Watch the file, serve a page
// with the player, reload on change.
//
// It builds on Vite rather than a hand-rolled server: Vite already resolves
// bare imports (the player imports xterm.js), already watches and reloads, and
// is already an optional peer dependency for the plugin. Writing a static
// server plus a module resolver plus a reload channel would be a lot of code to
// end up somewhere worse.
//
// Vite is *optional*, and so is the player the generated page imports: a user
// who only runs `castwright build` in CI should not have to install either.
// Both are declared as optional peer dependencies, and when one is missing this
// says so and names the fix rather than failing inside Vite's module graph.

import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { castwright } from '../vite/index.js';
import { CliUsageError } from './errors.js';

/** The slice of Vite this uses, declared structurally so vite is never imported for types. */
interface ViteServerLike {
  listen: () => Promise<unknown>;
  printUrls: () => void;
  resolvedUrls?: { local: string[] } | null;
  middlewares: {
    use: (
      handler: (
        req: { url?: string | undefined },
        res: { setHeader: (k: string, v: string) => void; end: (body?: string) => void },
        next: () => void,
      ) => void,
    ) => void;
  };
  transformIndexHtml: (url: string, html: string) => Promise<string>;
}

const PLAYER_PACKAGE = '@casoon/castwright-player';
const VIRTUAL_ID = 'virtual:castwright-dev';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

function page(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — castwright dev</title>
    <style>
      body { margin: 0; padding: 40px 20px; background: #14141a; color: #e6e6ef;
             font-family: system-ui, sans-serif; }
      main { max-width: 960px; margin: 0 auto; display: grid; gap: 16px; }
      h1 { font-size: 15px; font-weight: 500; color: #9a9ab0; margin: 0; }
      code { color: #7aa2f7; }
    </style>
  </head>
  <body>
    <main>
      <h1><code>${title}</code> — edit and save to reload</h1>
      <castwright-demo id="demo" autoplay loop></castwright-demo>
    </main>
    <script type="module" src="/@id/${VIRTUAL_ID}"></script>
  </body>
</html>
`;
}

export interface DevOptions {
  file: string;
  port: number;
}

export async function runDev(options: DevOptions): Promise<void> {
  const vite = await importVite();

  // Absolute: the entry is a *virtual* module, so it has no directory of its
  // own for Vite to resolve a relative path against — a relative specifier
  // would be resolved against the Vite root and miss.
  const file = resolve(options.file);

  // Checked here rather than left to Vite: the generated page imports the
  // player, and a bare-specifier failure deep in the module graph is a much
  // worse first experience than one sentence naming the missing package.
  requirePlayer(dirname(file));

  const entry = `
import demo from ${JSON.stringify(file)};
import '@casoon/castwright-player';

const el = document.querySelector('#demo');
el.cast = demo.cast;
const pre = document.createElement('pre');
pre.textContent = demo.finalFrame;
el.prepend(pre);
`;

  const server = (await vite.createServer({
    configFile: false,
    // Rooted at the file's directory so Vite watches it and can serve it.
    root: dirname(file),
    server: { port: options.port },
    plugins: [
      castwright(),
      {
        name: 'castwright-dev-page',
        resolveId(id: string) {
          return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
        },
        load(id: string) {
          return id === RESOLVED_VIRTUAL_ID ? entry : null;
        },
        configureServer(devServer: ViteServerLike) {
          devServer.middlewares.use(async (req, res, next) => {
            const url = req.url ?? '/';
            if (url !== '/' && url !== '/index.html') return next();
            const html = await devServer.transformIndexHtml(url, page(basename(file)));
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          });
        },
      },
    ],
  })) as ViteServerLike;

  await server.listen();
  server.printUrls();
}

interface ViteModuleLike {
  createServer: (config: unknown) => Promise<unknown>;
}

/** @throws CliUsageError if the player is not installed in the project being served. */
function requirePlayer(root: string): void {
  // Resolved from the Vite root, because that is where Vite will resolve the
  // generated `import '@casoon/castwright-player'` from.
  const require = createRequire(join(root, 'noop.js'));
  try {
    // `<pkg>/package.json`, not the package itself: the player is ESM-only, so
    // its `exports` has no `require` condition and resolving the entry point
    // from CJS would throw even when it is installed.
    require.resolve(`${PLAYER_PACKAGE}/package.json`);
  } catch {
    throw new CliUsageError(
      `castwright dev needs ${PLAYER_PACKAGE}, which is an optional dependency.\n` +
        `Install it with \`pnpm add -D ${PLAYER_PACKAGE}\`, or use \`castwright build\` ` +
        'and serve the .cast yourself.',
    );
  }
}

async function importVite(): Promise<ViteModuleLike> {
  try {
    return (await import('vite')) as unknown as ViteModuleLike;
  } catch {
    throw new CliUsageError(
      'castwright dev needs Vite, which is an optional dependency.\n' +
        'Install it with `pnpm add -D vite`, or use `castwright build` and serve the .cast yourself.',
    );
  }
}
