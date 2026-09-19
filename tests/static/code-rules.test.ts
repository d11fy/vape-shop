import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Repository-wide rules that the type checker cannot see. Each one guards a
 * bug that actually shipped once:
 *
 *  1. A client component importing a value from a `server-only` module —
 *     Turbopack fails that route with an unhelpful missing-manifest error.
 *  2. An internal link to a route that does not exist — a 404 behind a button.
 *  3. The `.num` class (forced left-to-right) around text that contains Arabic
 *     words — the words render in reverse order. Use `.num-mixed` there.
 */

const root = process.cwd();
const src = path.join(root, 'src');

function walk(dir: string, filter: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'generated') walk(full, filter, out);
    } else if (filter(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = walk(src, (name) => /\.(ts|tsx)$/.test(name));
const text = new Map(sourceFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const rel = (file: string) => path.relative(root, file).replaceAll('\\', '/');

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]) {
    if (text.has(candidate)) return candidate;
  }
  return null;
}

const isServerOnly = (file: string) => /^\s*import ['"]server-only['"]/m.test(text.get(file) ?? '');
const isClient = (file: string) => /^\s*['"]use client['"]/.test(text.get(file) ?? '');
const isServerActions = (file: string) => /^\s*['"]use server['"]/.test(text.get(file) ?? '');

/** Value (non-type) imports and re-exports of a module. */
function valueImports(file: string): string[] {
  const source = text.get(file) ?? '';
  const out: string[] = [];
  for (const match of source.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    if (match[1]) continue;
    const names = (match[2] ?? '').replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length > 0 && names.every((name) => name.startsWith('type '))) continue;
    const target = resolveImport(file, match[3] ?? '');
    if (target) out.push(target);
  }
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    const target = resolveImport(file, match[1] ?? '');
    if (target) out.push(target);
  }
  for (const match of source.matchAll(/export\s+(?!type)[^;]*?from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, match[1] ?? '');
    if (target) out.push(target);
  }
  return out;
}

describe('code rules', () => {
  it('client components never reach a server-only module', () => {
    const leaks: string[] = [];
    for (const start of sourceFiles.filter(isClient)) {
      const seen = new Set([start]);
      const queue: Array<[string, string[]]> = [[start, [start]]];
      while (queue.length > 0) {
        const [file, trail] = queue.shift()!;
        for (const next of valueImports(file)) {
          if (seen.has(next)) continue;
          seen.add(next);
          // A 'use server' module reaches the client as action references only.
          if (isServerActions(next)) continue;
          if (isServerOnly(next)) {
            leaks.push([...trail, next].map(rel).join(' → '));
            continue;
          }
          queue.push([next, [...trail, next]]);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('every internal link points at a route that exists', () => {
    const appDir = path.join(src, 'app');
    const routes: RegExp[] = [];
    for (const file of walk(appDir, (name) => /^(page|route)\.tsx?$/.test(name))) {
      const segments = path
        .relative(appDir, path.dirname(file))
        .split(path.sep)
        .filter((segment) => segment && !/^\(.*\)$/.test(segment));
      const pattern = segments.map((segment) =>
        /^\[\.\.\..+\]$/.test(segment)
          ? '.+'
          : /^\[.+\]$/.test(segment)
            ? '[^/]+'
            : segment.replace(/[.*+?^${}()|\\]/g, '\\$&'),
      );
      routes.push(new RegExp(`^/${pattern.join('/')}$`));
    }

    const linkRe =
      /(?:href=|push\(|replace\(|redirect\(|href:\s*|link:\s*|window\.open\()\s*[{(]?\s*(['"`])(\/[^'"`?#\s]*)/g;
    const broken: string[] = [];
    for (const file of sourceFiles) {
      for (const match of (text.get(file) ?? '').matchAll(linkRe)) {
        let url = match[2] ?? '';
        if (url.startsWith('/_next') || url.startsWith('/api/') || /\.\w+$/.test(url)) continue;
        url = url.replace(/\$\{[^}]*\}/g, 'x').replace(/\/$/, '') || '/';
        if (!routes.some((route) => route.test(url))) broken.push(`${rel(file)}: ${url}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('never forces left-to-right on text that contains Arabic words', () => {
    const ARABIC = /[؀-ۿ]/;
    const offenders: string[] = [];

    for (const file of sourceFiles.filter((f) => f.endsWith('.tsx'))) {
      const source = text.get(file) ?? '';
      for (const match of source.matchAll(/<([a-zA-Z][\w.]*)\b([^>]*?)>/g)) {
        const [whole, tag = '', attrs = ''] = match;
        if (whole.endsWith('/>')) continue;
        if (!/className=\{?[^>]*?(["'`\s(])num(["'`\s)])/.test(attrs)) continue;

        const start = (match.index ?? 0) + whole.length;
        const escaped = tag.replace('.', '\\.');
        const tagRe = new RegExp(`<${escaped}\\b[^>]*?(/?)>|</${escaped}>`, 'g');
        tagRe.lastIndex = start;
        let depth = 1;
        let end = -1;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(source))) {
          if (m[0].startsWith('</')) depth -= 1;
          else if (!m[1]) depth += 1;
          if (depth === 0) {
            end = m.index;
            break;
          }
        }
        if (end === -1) continue;

        const inner = source.slice(start, end).replace(/<[^>]*>/g, ' ');
        if (ARABIC.test(inner)) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${rel(file)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps money arithmetic off floating-point scale factors', () => {
    // Scaled integers (qty ×1000, cost ×1e6) are combined with the BigInt
    // helpers in core/quantity — a float multiply loses cents on large stocks.
    const offenders = sourceFiles
      .filter((file) => !file.includes(`${path.sep}core${path.sep}`))
      .filter((file) => /1_000_000_000/.test(text.get(file) ?? ''))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
