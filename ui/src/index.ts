/** Node half of dsh-http-tools-ui: nothing runs on the host. The browser
 * client half (see src/client) registers the tool cards into the web UI. */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-http-tools-ui'

export function apply(_ctx: Context): void {
  // No host-side behavior.
}
