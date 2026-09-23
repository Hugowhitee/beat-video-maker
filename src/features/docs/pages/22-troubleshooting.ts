import type { DocPageContent } from '../docs-content'

const page = {
  order: 22,
  slug: 'troubleshooting',
  title: 'Troubleshooting',
  description: 'Fixes for browser, workspace, media, WebGPU, local AI, and export problems.',
  category: 'Reference',
  related: ['workspaces', 'export'],
  sections: [
    {
      title: 'Browser and workspace',
      blocks: [
        {
          kind: 'table',
          headers: ['Symptom', 'Fix'],
          rows: [
            [
              'Local storage is unavailable',
              'Use a recent desktop browser with writable local storage. Chrome, Edge, and Brave are the recommended paths.',
            ],
            [
              'Brave does not show a folder picker',
              'Nothing is wrong: Beatvideo Maker automatically uses private local browser storage in Brave.',
            ],
            [
              'Folder permission denied',
              'For a normal folder workspace, choose a folder you can edit and allow read and write access.',
            ],
            [
              'Asked to reconnect on reopen',
              'Choose **Reconnect** for the same folder; if it moved, pick a different folder.',
            ],
          ],
        },
      ],
    },
    {
      title: 'Media and import',
      blocks: [
        {
          kind: 'table',
          headers: ['Symptom', 'Fix'],
          rows: [
            [
              'Missing Media',
              'Relink with **Grant Access**, **Locate**, **Locate Folder**, or **Browse Another Folder**.',
            ],
            [
              'Import failed or unsupported codec',
              'Try another browser-supported format, or transcode the file first.',
            ],
            [
              'Import from URL fails',
              'Make sure the link points at the media file itself, not a page that embeds it.',
            ],
            [
              'Stale previews or waveforms',
              'Regenerate thumbnails or proxies, or clear the project cache in Storage settings.',
            ],
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Use **Work Offline** only when you intend to relink the files later — clips stay as broken references until then.',
        },
      ],
    },
    {
      title: 'WebGPU and local AI',
      blocks: [
        {
          kind: 'table',
          headers: ['Symptom', 'Fix'],
          rows: [
            [
              'Effects, scopes, or AI unavailable',
              'WebGPU may be off — update your browser and GPU drivers and keep hardware acceleration on.',
            ],
            [
              'A model download is slow or fails',
              'Keep the tab open, retry on a stable connection, and clear the **Local AI Model Cache** if a download is corrupt.',
            ],
            ['Out of memory during AI work', 'Use **Unload Local Models** to release runtimes.'],
            ['LUT import blocked', 'Try a recent Chromium-based desktop browser.'],
          ],
        },
      ],
    },
    {
      title: 'Export',
      blocks: [
        {
          kind: 'table',
          headers: ['Symptom', 'Fix'],
          rows: [
            [
              'Codec unavailable in preflight',
              'Choose another codec or format, or lower resolution or quality.',
            ],
            [
              'Worker export unavailable',
              'Keep the tab focused and avoid heavy interaction; replacing animated image items with video clips can help.',
            ],
            [
              'Large or slow export',
              'Export a shorter in/out range, lower resolution or quality, and free disk space first.',
            ],
            [
              'Export will not start',
              'Clear any blocking preflight warning, then try a short range to confirm the pipeline works.',
            ],
          ],
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page
