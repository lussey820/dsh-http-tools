import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'lib',
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    // The dsh runtime provides these; never bundle them into the plugin.
    neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
  },
})
