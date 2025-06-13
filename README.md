# discord-player-ytdlp

A discord-player extractor that utilizing yt-dlp for streaming audio from various sites.

## Features

- **YouTube Search**: Uses [youtubei.js](https://github.com/LuanRT/YouTube.js) for searching YouTube videos
- **Multi-site Support**: Stream audio from any site [yt-dlp](https://github.com/yt-dlp/yt-dlp) can handle
- **Playlist Support**: Handles YouTube playlists including private playlist (require cookies)
- **Autoplay**: Provides related tracks using [youtubei.js](https://github.com/LuanRT/YouTube.js) for YouTube tracks
- **Cookie Support**: Supports Youtube cookies for video with restrictions

## Installation

```bash
npm install discord-player-ytdlp
```

## Requirements

- [Node.js](https://nodejs.org/) 20 or higher
- [discord-player](https://github.com/Androz2091/discord-player) v7.0.0 or higher
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) binary (you need to provide the path to the binary)

## Usage

```javascript
const { Player } = require('discord-player');
const { YtDlpExtractor } = require('discord-player-ytdlp');

const player = new Player(client);

// Register the extractor
await player.extractors.register(YtDlpExtractor, {
    ytdlpPath: './bin/yt-dlp.exe', // Path to your yt-dlp binary (required)
    // Other options...
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ytdlpPath` | `string` | **Required** | Path to the yt-dlp binary |
| `priority` | `number` | `100` | Priority of this extractor |
| `enableYouTubeSearch` | `boolean` | `true` | Enable YouTube search functionality |
| `enableDirectUrls` | `boolean` | `true` | Enable direct URL extraction |
| `preferYtdlpMetadata` | `boolean` | `true` | Prefer yt-dlp for YouTube metadata over youtubei.js |
| `streamQuality` | `string` | `'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio'` | Stream quality format for yt-dlp |
| `youtubeiOptions.cookies` | `string\|object` | `null` | YouTube cookies for authentication |
| `youtubeiOptions.client` | `string` | `null` | YouTube client configuration |

## Supported Sites

[Check here for a list of supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## Youtube Metadata Strategy

The extractor supports two metadata sources for YouTube videos:

- **yt-dlp** (default): More consistent with streaming source
- **youtubei.js**: Uses YouTube's internal API (Fallback when yt-dlp fails)

You can control this with the `preferYtdlpMetadata` option:

```javascript
// Use yt-dlp for metadata (default)
preferYtdlpMetadata: true

// Use youtubei.js for metadata
preferYtdlpMetadata: false
```

Both options include automatic fallback to the other method if the preferred one fails.

## YouTube Cookies

To access private YouTube content or improve reliability, you can provide YouTube cookies:

1. Export cookies from your browser in Netscape format
2. Set the cookies in the configuration:

```javascript
youtubeiOptions: {
    cookies: 'cookie1; cookie2; cookie3; ...'
}
```

## Examples

### Basic Usage

```javascript
// Search for a song
const searchResult = await player.search('Never Gonna Give You Up', {
    requestedBy: interaction.user
});

// Play a YouTube URL
await player.play(voiceChannel, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    requestedBy: interaction.user
});

// Play a YouTube playlist
await player.play(voiceChannel, 'https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMt9xaJGA6H_VjBf9L', {
    requestedBy: interaction.user
});
```

### With Custom Options

```javascript
await player.extractors.register(YtDlpExtractor, {
    ytdlpPath: './bin/yt-dlp.exe',
    priority: 150, // Higher priority
    preferYtdlpMetadata: false, // Prefer youtubei.js for metadata
    streamQuality: 'bestaudio[ext=webm]/bestaudio', // Prefer WebM
    youtubeiOptions: {
        cookies: process.env.YOUTUBE_COOKIES,
        client: 'ANDROID' // Use Android client
    }
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Supporting

Star and pull request to the repo!

##  Streaming content from YouTube

Streaming content from YouTube is against [YouTube's terms of service](https://www.youtube.com/static?template=terms). Use this at your own risk and responsibility :).
