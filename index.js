/**
 * YtDlp-Youtubei Hybrid Extractor
 * Uses yt-dlp for consistent metadata and streaming, with youtubei.js for search/playlists
 * Supports both YouTube search queries and direct URLs from various sites
 */

const { BaseExtractor, Track, Playlist } = require('discord-player');
const {
    isValidUrl,
    isYouTubeUrl,
    isYouTubePlaylistUrl,
    extractYouTubeId,
    extractYouTubePlaylistId,
    searchYouTube,
    getYouTubePlaylist,
    getYouTubeMetadata,
    getYouTubeMetadataWithYtDlp,
    getRelatedTracks,
    getStreamingUrl,
    getBasicInfo,
    canExtract,
    validateUrl
} = require('./utils');

class YtDlpExtractor extends BaseExtractor {
    static identifier = 'ytdlp-extractor';

    constructor(context, options) {
        super(context, options);

        // Configuration
        this.ytdlpPath = options.ytdlpPath;
        this.priority = options.priority || 100;
        this.enableYouTubeSearch = options.enableYouTubeSearch !== false;
        this.enableDirectUrls = options.enableDirectUrls !== false;
        this.streamQuality = options.streamQuality || 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';

        // YouTubei options
        this.youtubeiOptions = {
            cookies: options.youtubeiOptions?.cookies || null,
            client: options.youtubeiOptions?.client || null
        };

        // Supported protocols for direct URLs
        this.protocols = ['http:', 'https:'];

        this.debug('YtDlp Extractor initialized');
    }

    /**
     * Activate the extractor
     */
    async activate() {
        this.debug('Activating YtDlp Extractor');

        // Verify yt-dlp binary exists
        const fs = require('fs');
        if (!fs.existsSync(this.ytdlpPath)) {
            throw new Error(`yt-dlp binary not found at: ${this.ytdlpPath}`);
        }

        this.debug('YtDlp Extractor activated successfully');
    }

    /**
     * Deactivate the extractor
     */
    async deactivate() {
        this.debug('YtDlp Extractor deactivated');
    }

    /**
     * Validate if this extractor can handle the query
     */
    async validate(query, type) {
        try {
            this.debug(`Validating query: ${query}, type: ${type}`);

            // Handle direct URLs
            if (isValidUrl(query)) {
                if (!this.enableDirectUrls) {
                    this.debug('Direct URLs disabled');
                    return false;
                }

                // Always handle YouTube URLs (including playlists) if YouTube search is enabled
                if (isYouTubeUrl(query) && this.enableYouTubeSearch) {
                    this.debug('YouTube URL detected and enabled');
                    return true;
                }

                // Check if yt-dlp can handle other URLs (with timeout)
                this.debug('Checking if yt-dlp can extract URL');
                const canHandle = await canExtract(query, this.ytdlpPath);
                return canHandle;
            }

            // Handle search queries - accept all if YouTube search is enabled
            if (this.enableYouTubeSearch) {
                this.debug('Search query accepted');
                return true;
            }

            this.debug('Query not supported');
            return false;
        } catch (error) {
            this.debug(`Validation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Handle the query and return track information
     */
    async handle(query, context) {
        try {
            this.debug(`Handling query: ${query}`);
            
            if (isValidUrl(query)) {
                return await this.handleDirectUrl(query, context);
            } else {
                return await this.handleSearchQuery(query, context);
            }
        } catch (error) {
            this.debug(`Handle error: ${error.message}`);
            return this.createResponse(null, []);
        }
    }

    /**
     * Handle direct URL queries
     */
    async handleDirectUrl(url, context) {
        try {
            if (!validateUrl(url)) {
                throw new Error('Invalid URL format');
            }

            if (isYouTubeUrl(url)) {
                // Check if it's a playlist URL
                if (isYouTubePlaylistUrl(url)) {
                    return await this.handleYouTubePlaylist(url, context);
                }

                // Handle single video
                const videoId = extractYouTubeId(url);
                if (!videoId) {
                    throw new Error('Could not extract YouTube video ID');
                }

                // Use yt-dlp for YouTube metadata for consistency, with youtubei.js as fallback
                let trackInfo;
                try {
                    // Pass cookies to yt-dlp if available
                    const cookies = this.youtubeiOptions?.cookies || null;
                    trackInfo = await getYouTubeMetadataWithYtDlp(videoId, this.ytdlpPath, cookies);
                } catch (ytdlpError) {
                    this.debug(`yt-dlp metadata failed, falling back to youtubei.js: ${ytdlpError.message}`);
                    // Fallback to youtubei.js
                    trackInfo = await getYouTubeMetadata(videoId, this.youtubeiOptions);
                }

                if (!trackInfo) {
                    throw new Error('Could not get YouTube metadata');
                }

                const track = new Track(this, {
                    title: trackInfo.title,
                    author: trackInfo.author,
                    duration: trackInfo.duration,
                    url: trackInfo.url,
                    thumbnail: trackInfo.thumbnail,
                    source: 'ytdlp-extractor',
                    raw: trackInfo,
                    requestedBy: context.requestedBy,
                    queryType: 'arbitrary'
                });

                return this.createResponse(null, [track]);
            } else {
                // Use yt-dlp for other sites
                const trackInfo = await getBasicInfo(url, this.ytdlpPath);

                const track = new Track(this, {
                    title: trackInfo.title,
                    author: trackInfo.author,
                    duration: trackInfo.duration,
                    url: trackInfo.url,
                    thumbnail: trackInfo.thumbnail,
                    source: 'ytdlp-extractor',
                    raw: trackInfo,
                    requestedBy: context.requestedBy,
                    queryType: 'arbitrary'
                });

                return this.createResponse(null, [track]);
            }
        } catch (error) {
            this.debug(`Direct URL error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle YouTube playlist URLs
     */
    async handleYouTubePlaylist(url, context) {
        try {
            const playlistId = extractYouTubePlaylistId(url);
            if (!playlistId) {
                throw new Error('Could not extract playlist ID');
            }

            const playlistInfo = await getYouTubePlaylist(playlistId, this.youtubeiOptions);
            if (!playlistInfo || !playlistInfo.tracks || playlistInfo.tracks.length === 0) {
                throw new Error('Could not get playlist information or playlist is empty');
            }

            // Create playlist object
            const playlist = new Playlist(this, {
                title: playlistInfo.title,
                description: playlistInfo.description,
                thumbnail: playlistInfo.thumbnail,
                type: 'playlist',
                source: 'ytdlp-extractor',
                author: {
                    name: playlistInfo.author,
                    url: null
                },
                tracks: [],
                id: playlistId,
                url: playlistInfo.url,
                rawPlaylist: playlistInfo
            });

            // Create tracks
            const tracks = playlistInfo.tracks.map(trackData => {
                const track = new Track(this, {
                    title: trackData.title,
                    author: trackData.author,
                    duration: trackData.duration,
                    url: trackData.url,
                    thumbnail: trackData.thumbnail,
                    source: 'ytdlp-extractor',
                    raw: trackData,
                    requestedBy: context.requestedBy,
                    queryType: 'arbitrary',
                    playlist: playlist
                });
                return track;
            });

            playlist.tracks = tracks;
            return this.createResponse(playlist, tracks);
        } catch (error) {
            this.debug(`YouTube playlist error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle search queries (YouTube only)
     */
    async handleSearchQuery(query, context) {
        try {
            if (!this.enableYouTubeSearch) {
                throw new Error('YouTube search is disabled');
            }

            const searchResults = await searchYouTube(query, 1, this.youtubeiOptions);
            if (!searchResults || searchResults.length === 0) {
                return this.createResponse(null, []);
            }

            const result = searchResults[0];

            // Create track with YouTube URL that will be passed to yt-dlp for streaming
            const track = new Track(this, {
                title: result.title,
                author: result.author,
                duration: result.duration,
                url: result.url, // This YouTube URL will be used by yt-dlp for streaming
                thumbnail: result.thumbnail,
                source: 'ytdlp-extractor',
                raw: {
                    ...result,
                    originalQuery: query,
                    searchMethod: 'youtubei'
                },
                requestedBy: context.requestedBy,
                queryType: 'youtubeSearch'
            });

            return this.createResponse(null, [track]);
        } catch (error) {
            this.debug(`Search query error: ${error.message}`);
            // Return empty response instead of throwing to prevent crashes
            return this.createResponse(null, []);
        }
    }

    /**
     * Get streaming URL for a track
     */
    async stream(info) {
        try {
            this.debug(`Getting stream for: ${info.title || info.raw?.title || 'Unknown'}`);

            // Use the URL from the track info
            const url = info.url || info.raw?.url;
            if (!url) {
                throw new Error('No URL found in track info');
            }

            // Get fresh streaming URL each time to avoid expiration
            // Pass cookies to yt-dlp for authentication if available
            const cookies = this.youtubeiOptions?.cookies || null;
            const streamUrl = await getStreamingUrl(url, this.ytdlpPath, this.streamQuality, cookies);

            if (!streamUrl || !streamUrl.startsWith('http')) {
                throw new Error('Invalid streaming URL returned');
            }

            this.debug(`Stream URL obtained successfully`);

            // Return the stream URL directly - discord-player will handle it
            return streamUrl;
        } catch (error) {
            this.debug(`Stream error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get related tracks for autoplay functionality
     */
    async getRelatedTracks(track, history) {
        try {
            this.debug(`Getting related tracks for: ${track.title}`);

            // Only work with YouTube tracks for now
            if (!isYouTubeUrl(track.url)) {
                this.debug('Non-YouTube track, no related tracks available');
                return this.createResponse(null, []);
            }

            const videoId = extractYouTubeId(track.url);
            if (!videoId) {
                this.debug('Could not extract video ID');
                return this.createResponse(null, []);
            }

            // Get related tracks using YouTube's recommendation system
            let relatedTracks = await getRelatedTracks(videoId, this.youtubeiOptions, 10);

            // If no related tracks found, try search-based approach
            if (!relatedTracks || relatedTracks.length === 0) {
                this.debug('No related tracks from YouTube API, trying search-based approach');

                // Use track author for search
                if (track.author && track.author !== 'Unknown Artist') {
                    const searchQuery = `${track.author} music`;
                    relatedTracks = await searchYouTube(searchQuery, 5, this.youtubeiOptions);
                }
            }

            // Filter out tracks that are already in history
            const historyUrls = new Set(
                history.tracks.toArray().map(t => t.url)
            );

            const filteredTracks = relatedTracks.filter(trackData =>
                !historyUrls.has(trackData.url) && trackData.url !== track.url
            );

            if (filteredTracks.length === 0) {
                this.debug('No new related tracks found after filtering');
                return this.createResponse(null, []);
            }

            // Create Track objects
            const tracks = filteredTracks.slice(0, 5).map(trackData => {
                const relatedTrack = new Track(this, {
                    title: trackData.title,
                    author: trackData.author,
                    duration: trackData.duration,
                    url: trackData.url,
                    thumbnail: trackData.thumbnail,
                    source: 'ytdlp-extractor',
                    raw: {
                        ...trackData,
                        relatedTo: track.url,
                        autoplay: true
                    },
                    requestedBy: track.requestedBy,
                    queryType: 'autoplay'
                });
                return relatedTrack;
            });

            this.debug(`Found ${tracks.length} related tracks`);
            return this.createResponse(null, tracks);
        } catch (error) {
            this.debug(`Related tracks error: ${error.message}`);
            return this.createResponse(null, []);
        }
    }

    /**
     * Bridge functionality for other extractors
     */
    async bridge(track, sourceExtractor) {
        try {
            // If the source extractor is not this one, try to get stream
            if (sourceExtractor?.identifier !== this.identifier) {
                const streamUrl = await this.stream(track);
                return { stream: streamUrl, type: 'arbitrary' };
            }

            return null;
        } catch (error) {
            this.debug(`Bridge error: ${error.message}`);
            return null;
        }
    }

    /**
     * Create bridge query for track search
     */
    createBridgeQuery(track) {
        return `${track.author} - ${track.title}`;
    }
}

module.exports = { YtDlpExtractor };
