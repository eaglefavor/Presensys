
import fs from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
    const nextUrl = new URL(specifier + '.ts', context.parentURL).href;
    try {
      await fs.stat(new URL(nextUrl));
      return nextResolve(specifier + '.ts', context);
    } catch {
      // Ignore
    }
  }
  return nextResolve(specifier, context);
}
