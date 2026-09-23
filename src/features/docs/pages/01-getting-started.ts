import type { DocPageContent } from '../docs-content'

const page = {
  order: 1,
  slug: 'getting-started',
  title: 'Getting Started',
  description:
    'What Beatvideo Maker is, what your browser needs, and your first edit from launch to export.',
  category: 'Start',
  related: ['concepts', 'workspaces', 'export'],
  sections: [
    {
      title: 'What Beatvideo Maker is',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Beatvideo Maker is a **local-first** editor for beat-driven photo and video projects. Editing, effects, music analysis, AI tools, and export run on your own machine using your browser, GPU, and CPU.',
        },
        {
          kind: 'note',
          tone: 'tip',
          text: 'Your project data stays on your device. When the browser allows folder access, Beatvideo Maker uses a workspace folder you choose. Browsers such as Brave that block the folder picker use private local browser storage instead.',
        },
      ],
    },
    {
      title: 'What your browser needs',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Use a recent desktop browser with WebGPU, WebCodecs, and writable local browser storage. Chrome, Edge, and Brave are the recommended paths.',
        },
        {
          kind: 'table',
          headers: ['Browser', 'Storage behavior'],
          rows: [
            ['Chrome / Edge', 'Uses a workspace folder you choose'],
            ['Brave', 'Uses private local browser storage automatically'],
            ['Other modern browsers', 'Works when the required editing and local-storage APIs are available'],
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Folder access is optional compatibility, not a startup requirement. Beatvideo Maker falls back to Origin Private File System (OPFS) when a browser does not expose the folder picker.',
        },
      ],
    },
    {
      title: 'Your first edit',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Open Beatvideo Maker. If your browser offers folder access, choose a **workspace folder**; otherwise the app opens with private local browser storage automatically.',
            'On the Projects page, choose **New Project**, name it, choose **Photo** or **Video**, and set the output resolution and frame rate.',
            'Open **Media** and import your cover image, footage, and beat.',
            'Drag the visual media onto the timeline, then open **Beat** to analyze the music and verify bar 1.',
            'Use the timeline, overlays, effects, and editor tools to build the visual.',
            'Save with `Ctrl+S` as you work, then choose **Export** to render the finished video.',
          ],
        },
      ],
    },
    {
      title: 'Confirm your setup works',
      blocks: [
        {
          kind: 'list',
          items: [
            'The Projects page opens without an unsupported-browser blocker.',
            'Imported media appears in the Media panel with thumbnails.',
            'Playback starts from the timeline when you press `Space`.',
            'Beat analysis shows progress and produces a musical grid.',
            'Export opens and the preflight check reports no blocking problems.',
          ],
        },
        {
          kind: 'note',
          tone: 'tip',
          text: 'If any step fails, see the **Troubleshooting** page for the matching symptom.',
        },
      ],
    },
  ],
} satisfies DocPageContent

export default page
