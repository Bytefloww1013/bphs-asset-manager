import { Inbox, Megaphone } from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import { canSendNotices } from '../shared/index.ts'
import manifest from '../shared/manifest.ts'

/** The Inbox and Notices pages on Home. Their pages are in `routes/`; the bell and the unread badge are in `parts.tsx`. */
export default defineWebModule({
  manifest,
  nav: [
    { workspace: 'me', group: 'start', order: 20, to: '/me/inbox', label: 'Inbox', icon: Inbox, badge: 'unread' },
    {
      workspace: 'me',
      group: 'mine',
      order: 30,
      to: '/me/notices',
      label: 'Notices',
      icon: Megaphone,
      visible: canSendNotices,
    },
  ],
})
