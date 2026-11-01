import { getPlatformProxy } from 'wrangler';
import { catalogState } from '../src/lib/publication.mjs';
const platform = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  persist: true,
  remoteBindings: false,
});
try {
  const state = await catalogState(platform.env.DB);
  if (!state.ready) process.exitCode = 1;
} finally {
  await platform.dispose();
}
