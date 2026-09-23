# Beatvideo Maker Workspace

This folder is your Beatvideo Maker project workspace - the app's source of truth
for projects, media metadata, thumbnails, analysis data, waveforms, and caches.

Everything here is **plain files** you can inspect and back up with normal tools.

## Layout

```
./
|-- README.md                  <- this file
|-- .freecut-workspace.json    <- legacy-compatible marker + schema version
|-- index.json                 <- fast project list
|-- projects/
|   `-- <projectId>/
|       |-- project.json       <- timeline, settings, keyframes, markers, transitions
|       |-- thumbnail.jpg
|       `-- media-links.json   <- which media this project uses
|-- media/
|   `-- <mediaId>/
|       |-- metadata.json      <- codec, duration, resolution, etc.
|       |-- source.<ext>       <- inline source file
|       |-- source.link.json   <- OR a link descriptor to an external file
|       |-- thumbnail.jpg
|       `-- cache/
|           |-- filmstrip/
|           |-- waveform/
|           |-- gif-frames/
|           |-- decoded-audio/
|           |-- preview-audio.wav
|           `-- ai/
`-- content/
    |-- <hash[0:2]>/<hash>/
    |   |-- refs.json
    |   `-- data.<ext>
    `-- proxies/<proxyKey>/
        |-- proxy.mp4
        `-- meta.json
```

## Compatibility files

Some internal filenames still use the historical `.freecut-*` prefix. They are kept
for safe compatibility with the upstream storage format; the product and workspace
are Beatvideo Maker.

## Safe to edit?

Everything except media source bytes is safe to inspect. Editing
`project.json` externally works; Beatvideo Maker picks up changes on next load.

Binary caches are regeneratable - delete them and the app rebuilds them when needed.

## Moving the workspace

You can move this folder to a new location. Beatvideo Maker just needs you to
pick it again from the reconnect prompt on next launch.
