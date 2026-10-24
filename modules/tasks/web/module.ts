import { ListPlus, ListTodo } from 'lucide-react'
import { defineWebModule } from '@/modules.ts'
import manifest from '../shared/manifest.ts'
import { canAssignTasks } from '../shared/permissions.ts'

/** The Tasks workspace, third on the rail, and My tasks on Home, before Profile. Its pages are in `routes/`. */
export default defineWebModule({
  manifest,
  workspaces: [{ id: 'tasks', label: 'Tasks', icon: ListTodo, home: '/tasks', order: 30 }],
  nav: [
    { workspace: 'me', group: 'mine', order: 10, to: '/me/tasks', label: 'My tasks', icon: ListTodo },
    { workspace: 'tasks', to: '/tasks', label: 'All tasks', icon: ListTodo },
    {
      workspace: 'tasks',
      to: '/tasks/new',
      label: 'Assign task',
      icon: ListPlus,
      visible: canAssignTasks,
    },
  ],
})
