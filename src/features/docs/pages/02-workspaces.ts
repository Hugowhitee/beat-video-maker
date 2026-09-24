import type { DocPageContent } from '../docs-content'

const page = {
  order: 2,
  slug: 'workspaces',
  title: 'Workspaces and Storage',
  description:
    'How Beatvideo Maker stores projects locally, when a workspace folder is used, and how permissions work.',
  category: 'Start',
  related: ['concepts', 'projects', 'troubleshooting'],
  sections: [
    {
      title: 'The local storage model',
      blocks: [
        {
          kind: 'list',
          items: [
            'Beatvideo Maker always keeps project state local to your device.',
            'When the browser exposes a folder picker, a **workspace** is a folder on disk that Beatvideo Maker reads from and writes to.',
            'When the browser blocks that picker — Brave is the main example — Beatvideo Maker uses an Origin Private File System (OPFS) workspace automatically instead of blocking the app.',
            'Project files, metadata, thumbnails, waveforms, transcripts, analysis data, caches, and generated assets all use the active workspace.',
          ],
        },
        {
          kind: 'note',
          tone: 'tip',
          text: 'A normal folder is easiest to inspect and back up directly. A browser-private workspace is still local, but use project export for portable backups because the browser owns that storage area.',
        },
      ],
    },
    {
      title: 'Folder workspaces',
      blocks: [
        {
          kind: 'list',
          items: [
            'Chrome and Edge can ask you to pick a workspace before the editor opens.',
            'Pick a normal folder you own — for example a folder in Documents. Avoid protected system locations.',
            'Use the **Workspaces** control to add, switch between, or remove known folder workspaces.',
            'Switching changes which workspace Beatvideo Maker uses; it does not modify your original source files.',
          ],
        },
      ],
    },
    {
      title: 'Brave and browser-private storage',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Brave intentionally does not expose the same user-facing folder picker. Beatvideo Maker therefore creates and reopens a private local workspace automatically. There is no browser error to dismiss and no flag you need to enable.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'If you specifically want a directly browsable folder workspace, open the app in Chrome or Edge. Otherwise Brave can keep using its private local workspace.',
        },
      ],
    },
    {
      title: 'Permissions and reconnecting',
      blocks: [
        {
          kind: 'paragraph',
          text: 'This section applies to normal folder workspaces. Browsers can expire folder permission between sessions for security.',
        },
        {
          kind: 'list',
          items: [
            'When Beatvideo Maker shows **Reconnect your workspace**, choose **Reconnect** and grant read and write access to the same folder.',
            'If access is denied, pick the folder again and allow access when the browser prompts.',
            'If the folder was moved, renamed, or deleted, choose a different folder instead.',
          ],
        },
      ],
    },
    {
      title: 'Moving projects and clearing caches',
      blocks: [
        {
          kind: 'list',
          items: [
            'Use **Export Project** to package a project for backup or transfer.',
            'Project cache actions clear regenerated data such as waveforms, filmstrips, GIF frames, and decoded audio.',
            'Storage settings also let you regenerate thumbnails, generate missing proxies, and delete proxies.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Clearing caches never deletes your original source media; Beatvideo Maker regenerates previews when the project needs them.',
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page
