/**
 * YtDlp Extractor Utilities
 * Helper functions for the custom YtDlp-Youtubei hybrid extractor
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { Innertube } = require('youtubei.js');

const execAsync = promisify(exec);

/**
 * Initialize YouTube service
 */
let innertube = null;
let lastCookies = null;

const initializeYouTube = async (options = {}) => {
    // Check if we need to reinitialize due to different cookies
    const currentCookies = options.cookies;
    const needsReinit = !innertube || (currentCookies !== lastCookies);

    if (needsReinit) {
        try {
            const initOptions = {};

            // Add cookies if provided
            if (options.cookies) {
                // Handle different cookie formats
                if (typeof options.cookies === 'string') {
                    // If it's a string, assume it's in Netscape format or raw cookie string
                    initOptions.cookie = options.cookies;
                } else {
                    // If it's already an object or array, pass it directly
                    initOptions.cookie = options.cookies;
                }
            }

            // Add client configuration if provided
            if (options.client) {
                initOptions.client_name = options.client;
            }

            // Add additional options for better private content access
            initOptions.enable_session_cache = true;

            // Close existing instance if reinitializing
            if (innertube) {
                try {
                    await innertube.session.signOut();
                } catch (e) {
                    // Ignore sign out errors
                }
            }

            innertube = await Innertube.create(initOptions);
            lastCookies = currentCookies;
        } catch (error) {
            console.error('❌ Failed to initialize YouTube service for extractor:', error);
            // Don't throw here, return null to allow fallback
            innertube = null;
        }
    }
    return innertube;
};

/**
 * Check if a string is a valid URL
 */
const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Check if URL is a YouTube URL
 */
const isYouTubeUrl = (url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)/i;
    return youtubeRegex.test(url);
};

/**
 * Check if URL is a YouTube playlist URL
 */
const isYouTubePlaylistUrl = (url) => {
    const playlistRegex = /[?&]list=([a-zA-Z0-9_-]+)/;
    return isYouTubeUrl(url) && playlistRegex.test(url);
};

/**
 * Extract playlist ID from YouTube URL
 */
const extractYouTubePlaylistId = (url) => {
    const regex = /[?&]list=([a-zA-Z0-9_-]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
};

/**
 * Extract video ID from YouTube URL
 */
const extractYouTubeId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
};

/**
 * Search YouTube using youtubei.js
 */
const searchYouTube = async (query, limit = 1, options = {}) => {
    try {
        const yt = await initializeYouTube(options);
        if (!yt) {
            throw new Error('YouTube service not available');
        }

        // Add timeout to prevent hanging
        const searchPromise = yt.search(query, { type: 'video' });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('YouTube search timeout')), 10000)
        );

        const searchResults = await Promise.race([searchPromise, timeoutPromise]);

        if (!searchResults.videos || searchResults.videos.length === 0) {
            return [];
        }

        const results = searchResults.videos.slice(0, limit).map(video => ({
            id: video.id,
            title: video.title?.text || 'Unknown Title',
            duration: video.duration?.text || 'Unknown',
            thumbnail: video.thumbnails?.[0]?.url || null,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            author: video.author?.name || 'Unknown Artist',
            views: video.view_count?.text || '0'
        }));

        return results;
    } catch (error) {
        console.error('YouTube search error:', error);
        return [];
    }
};

/**
 * Get YouTube playlist information and tracks
 */
const getYouTubePlaylist = async (playlistId, options = {}) => {
    try {
        // Check if this is a YouTube Mix playlist (starts with RD)
        if (playlistId.startsWith('RD')) {
            // For Mix playlists, we need to use a different approach
            // Extract the seed video ID from the Mix playlist ID
            let seedVideoId = null;
            if (playlistId.length > 2) {
                seedVideoId = playlistId.substring(2); // Remove 'RD' prefix
            }

            if (!seedVideoId || seedVideoId.length !== 11) {
                throw new Error('Invalid YouTube Mix playlist ID format');
            }

            // For Mix playlists, we'll get the seed video and generate related tracks
            // This is a workaround since Mix playlists are dynamically generated
            const yt = await initializeYouTube(options);
            if (!yt) {
                throw new Error('YouTube service not available');
            }

            try {
                // Get the seed video info
                const seedVideo = await yt.getInfo(seedVideoId);
                if (!seedVideo) {
                    throw new Error('Seed video not found');
                }

                // Create a basic playlist structure with the seed video
                const tracks = [{
                    id: seedVideoId,
                    title: seedVideo.basic_info?.title || 'Unknown Title',
                    duration: seedVideo.basic_info?.duration?.text || 'Unknown',
                    thumbnail: seedVideo.basic_info?.thumbnail?.[0]?.url || null,
                    url: `https://www.youtube.com/watch?v=${seedVideoId}`,
                    author: seedVideo.basic_info?.author || 'Unknown Artist',
                    views: seedVideo.basic_info?.view_count || '0'
                }];

                // Try to get related videos to simulate the Mix
                if (seedVideo.watch_next_feed) {
                    const relatedVideos = seedVideo.watch_next_feed
                        .filter(item => item.type === 'CompactVideo' && item.id && item.title)
                        .slice(0, 19) // Get up to 19 more videos (20 total)
                        .map(video => ({
                            id: video.id,
                            title: video.title?.text || 'Unknown Title',
                            duration: video.duration?.text || 'Unknown',
                            thumbnail: video.thumbnails?.[0]?.url || null,
                            url: `https://www.youtube.com/watch?v=${video.id}`,
                            author: video.author?.name || 'Unknown Artist',
                            views: video.view_count?.text || '0'
                        }));

                    tracks.push(...relatedVideos);
                }

                return {
                    id: playlistId,
                    title: `Mix - ${seedVideo.basic_info?.title || 'Unknown'}`,
                    description: 'YouTube Mix playlist (auto-generated)',
                    thumbnail: seedVideo.basic_info?.thumbnail?.[0]?.url || null,
                    author: 'YouTube',
                    url: `https://www.youtube.com/playlist?list=${playlistId}`,
                    tracks: tracks
                };
            } catch (mixError) {
                console.error('Mix playlist generation error:', mixError);
                throw new Error('Unable to access Mix playlist. This may be a private or unavailable Mix.');
            }
        }

        const yt = await initializeYouTube(options);
        if (!yt) {
            throw new Error('YouTube service not available');
        }

        // Add timeout for playlist requests
        const playlistPromise = yt.getPlaylist(playlistId);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Playlist request timeout')), 15000)
        );

        const playlist = await Promise.race([playlistPromise, timeoutPromise]);

        if (!playlist) {
            throw new Error('Playlist not found or inaccessible');
        }

        // Check if playlist is accessible
        if (!playlist.videos && !playlist.items) {
            throw new Error('Playlist is private or unavailable. Please check your authentication.');
        }

        const tracks = [];

        // Handle different playlist response formats
        const videos = playlist.videos || playlist.items || [];

        if (videos.length === 0) {
            return {
                id: playlistId,
                title: playlist.info?.title || playlist.title?.text || 'Unknown Playlist',
                description: playlist.info?.description || playlist.description?.text || '',
                thumbnail: playlist.info?.thumbnails?.[0]?.url || playlist.thumbnails?.[0]?.url || null,
                author: playlist.info?.author?.name || playlist.author?.name || 'Unknown',
                url: `https://www.youtube.com/playlist?list=${playlistId}`,
                tracks: []
            };
        }

        // Process videos in batches to avoid overwhelming the API
        const batchSize = 10;

        for (let i = 0; i < videos.length; i += batchSize) {
            const batch = videos.slice(i, i + batchSize);
            const batchPromises = batch.map(async (video) => {
                try {
                    // Handle different video object formats
                    const videoId = video.id || video.video_id;
                    const title = video.title?.text || video.title || 'Unknown Title';
                    const author = video.author?.name || video.channel?.name || 'Unknown Artist';
                    const duration = video.duration?.text || video.duration || 'Unknown';
                    const thumbnail = video.thumbnails?.[0]?.url || video.thumbnail?.url || null;
                    const views = video.view_count?.text || video.views || '0';

                    if (!videoId) {
                        return null;
                    }

                    return {
                        id: videoId,
                        title: title,
                        duration: duration,
                        thumbnail: thumbnail,
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        author: author,
                        views: views
                    };
                } catch (error) {
                    return null;
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            const validResults = batchResults
                .filter(result => result.status === 'fulfilled' && result.value !== null)
                .map(result => result.value);

            tracks.push(...validResults);
        }

        return {
            id: playlistId,
            title: playlist.info?.title || playlist.title?.text || 'Unknown Playlist',
            description: playlist.info?.description || playlist.description?.text || '',
            thumbnail: playlist.info?.thumbnails?.[0]?.url || playlist.thumbnails?.[0]?.url || null,
            author: playlist.info?.author?.name || playlist.author?.name || 'Unknown',
            url: `https://www.youtube.com/playlist?list=${playlistId}`,
            tracks: tracks
        };
    } catch (error) {
        console.error('YouTube playlist error:', error);

        // Provide more specific error messages
        if (error.message.includes('unviewable') || error.message.includes('private')) {
            throw new Error('This playlist is private or requires authentication. Please check your YouTube cookies.');
        } else if (error.message.includes('timeout')) {
            throw new Error('Playlist request timed out. Please try again.');
        } else if (error.message.includes('not found')) {
            throw new Error('Playlist not found. Please check the playlist ID.');
        }

        throw error;
    }
};

/**
 * Get YouTube video metadata using youtubei.js
 */
const getYouTubeMetadata = async (videoId, options = {}) => {
    try {
        const yt = await initializeYouTube(options);
        if (!yt) {
            throw new Error('YouTube service not available');
        }

        const info = await yt.getInfo(videoId);
        if (!info) {
            throw new Error('Video not found');
        }

        return {
            id: videoId,
            title: info.basic_info?.title || 'Unknown Title',
            duration: info.basic_info?.duration?.text || 'Unknown',
            thumbnail: info.basic_info?.thumbnail?.[0]?.url || null,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            author: info.basic_info?.author || 'Unknown Artist',
            views: info.basic_info?.view_count || 0,
            description: info.basic_info?.short_description || ''
        };
    } catch (error) {
        console.error('YouTube metadata error:', error);
        return null;
    }
};

/**
 * Get related tracks for autoplay functionality
 */
const getRelatedTracks = async (videoId, options = {}, limit = 10) => {
    try {
        const yt = await initializeYouTube(options);
        if (!yt) {
            throw new Error('YouTube service not available');
        }

        const info = await yt.getInfo(videoId);
        if (!info || !info.watch_next_feed) {
            return [];
        }

        // Get related videos from watch next feed
        const relatedVideos = info.watch_next_feed.filter(item =>
            item.type === 'CompactVideo' && item.id && item.title
        ).slice(0, limit);

        return relatedVideos.map(video => ({
            id: video.id,
            title: video.title?.text || 'Unknown Title',
            duration: video.duration?.text || 'Unknown',
            thumbnail: video.thumbnails?.[0]?.url || null,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            author: video.author?.name || 'Unknown Artist',
            views: video.view_count?.text || '0'
        }));
    } catch (error) {
        console.error('YouTube related tracks error:', error);
        return [];
    }
};

/**
 * Get streaming URL using yt-dlp with optimizations
 */
const getStreamingUrl = async (url, ytdlpPath, quality = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio', cookies = null) => {
    try {
        if (!fs.existsSync(ytdlpPath)) {
            throw new Error(`yt-dlp binary not found at: ${ytdlpPath}`);
        }

        // Optimized command for faster extraction and better compatibility
        const optimizedArgs = [
            '-f', quality,
            '--get-url',
            '--no-playlist',
            '--no-warnings',
            '--no-check-certificates',
            '--prefer-insecure',
            '--skip-download',
            '--no-call-home',
            '--no-cache-dir',
            '--socket-timeout', '10',
            '--retries', '3',
            '--fragment-retries', '3'
        ];

        // Add cookies if provided for YouTube authentication
        if (cookies && typeof cookies === 'string' && cookies.trim()) {
            // Create a temporary cookies file for yt-dlp
            const tempCookiesFile = path.join(__dirname, 'temp_cookies.txt');
            try {
                // Convert browser cookies to Netscape format
                const netscapeCookies = convertToNetscapeFormat(cookies);
                fs.writeFileSync(tempCookiesFile, netscapeCookies);
                optimizedArgs.push('--cookies', tempCookiesFile);
            } catch (cookieError) {
                // Proceed without cookies if conversion fails
            }
        }

        const command = `"${ytdlpPath}" ${optimizedArgs.join(' ')} "${url}"`;

        const { stdout, stderr } = await execAsync(command, {
            timeout: 15000, // Reduced timeout for faster response
            maxBuffer: 1024 * 1024, // 1MB buffer should be enough for URL
            encoding: 'utf8',
            windowsHide: true // Hide console window on Windows
        });

        // Clean up temporary cookies file
        if (cookies) {
            const tempCookiesFile = path.join(__dirname, 'temp_cookies.txt');
            try {
                if (fs.existsSync(tempCookiesFile)) {
                    fs.unlinkSync(tempCookiesFile);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
        }

        if (stderr && !stdout) {
            throw new Error(`yt-dlp error: ${stderr}`);
        }

        const streamUrl = stdout.trim();
        if (!streamUrl || !streamUrl.startsWith('http')) {
            throw new Error('Invalid streaming URL returned');
        }

        return streamUrl;
    } catch (error) {
        console.error('yt-dlp streaming error:', error.message);
        throw error;
    }
};

/**
 * Get YouTube metadata using yt-dlp for consistency
 */
const getYouTubeMetadataWithYtDlp = async (videoId, ytdlpPath, cookies = null) => {
    try {
        if (!fs.existsSync(ytdlpPath)) {
            throw new Error(`yt-dlp binary not found at: ${ytdlpPath}`);
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // Build command arguments
        const args = [
            '-J',
            '--no-playlist',
            '--no-warnings',
            '--no-check-certificates',
            '--socket-timeout', '10',
            '--retries', '2'
        ];

        // Add cookies if provided
        if (cookies) {
            const tempCookiesFile = path.join(__dirname, 'temp_cookies_metadata.txt');
            try {
                // Convert cookies to Netscape format if needed
                const netscapeCookies = convertToNetscapeFormat(cookies);
                fs.writeFileSync(tempCookiesFile, netscapeCookies);
                args.push('--cookies', tempCookiesFile);
            } catch (cookieError) {
                console.warn('Failed to write cookies for metadata, continuing without:', cookieError.message);
            }
        }

        const command = `"${ytdlpPath}" ${args.join(' ')} "${url}"`;

        const { stdout, stderr } = await execAsync(command, {
            timeout: 15000,
            maxBuffer: 1024 * 1024,
            windowsHide: true // Hide console window on Windows
        });

        // Clean up temporary cookies file
        if (cookies) {
            const tempCookiesFile = path.join(__dirname, 'temp_cookies_metadata.txt');
            try {
                if (fs.existsSync(tempCookiesFile)) {
                    fs.unlinkSync(tempCookiesFile);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
        }

        if (stderr && !stdout) {
            throw new Error(`yt-dlp metadata error: ${stderr}`);
        }

        const info = JSON.parse(stdout);

        return {
            id: videoId,
            title: info.title || info.fulltitle || 'Unknown Title',
            duration: info.duration ? formatDuration(info.duration) : 'Unknown',
            thumbnail: info.thumbnail || null,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            author: info.uploader || info.channel || 'Unknown Artist',
            views: info.view_count || 0,
            description: info.description || ''
        };
    } catch (error) {
        console.error('yt-dlp YouTube metadata error:', error);
        throw error;
    }
};

/**
 * Get basic info using yt-dlp (fallback for non-YouTube sites)
 */
const getBasicInfo = async (url, ytdlpPath) => {
    try {
        if (!fs.existsSync(ytdlpPath)) {
            throw new Error(`yt-dlp binary not found at: ${ytdlpPath}`);
        }

        const command = `"${ytdlpPath}" -J --flat-playlist --no-warnings "${url}"`;
        const { stdout, stderr } = await execAsync(command, {
            timeout: 15000, // Reduced timeout
            maxBuffer: 1024 * 1024, // 1MB buffer
            windowsHide: true // Hide console window on Windows
        });

        if (stderr && !stdout) {
            throw new Error(`yt-dlp info error: ${stderr}`);
        }

        const info = JSON.parse(stdout);

        return {
            id: info.id || 'unknown',
            title: info.title || info.fulltitle || 'Unknown Title',
            duration: info.duration ? formatDuration(info.duration) : 'Unknown',
            thumbnail: info.thumbnail || null,
            url: info.webpage_url || url,
            author: info.uploader || info.channel || 'Unknown Artist',
            description: info.description || ''
        };
    } catch (error) {
        console.error('yt-dlp info error:', error);
        throw error;
    }
};

/**
 * Format duration from seconds to readable format
 */
const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'Unknown';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
};

/**
 * Check if yt-dlp can handle the URL
 */
const canExtract = async (url, ytdlpPath) => {
    try {
        if (!fs.existsSync(ytdlpPath)) {
            return false;
        }

        const command = `"${ytdlpPath}" --simulate --quiet "${url}"`;
        await execAsync(command, {
            timeout: 10000,
            windowsHide: true // Hide console window on Windows
        });
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Validate URL format and accessibility
 */
const validateUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return false;
    }

    // Check if it's a valid URL
    if (!isValidUrl(url)) {
        return false;
    }

    // Check for common unsupported protocols
    const unsupportedProtocols = ['file:', 'ftp:', 'mailto:'];
    const protocol = new URL(url).protocol;
    if (unsupportedProtocols.includes(protocol)) {
        return false;
    }

    return true;
};

/**
 * Create a standardized track object
 */
const createTrackObject = (info, source = 'yt-dlp') => {
    return {
        title: info.title || 'Unknown Title',
        author: info.author || 'Unknown Artist',
        duration: info.duration || 'Unknown',
        url: info.url,
        thumbnail: info.thumbnail || null,
        source: source,
        raw: info
    };
};

/**
 * Convert browser cookies to Netscape format for yt-dlp
 */
const convertToNetscapeFormat = (browserCookies) => {
    try {
        // Netscape format header
        let netscapeCookies = '# Netscape HTTP Cookie File\n';
        netscapeCookies += '# This is a generated file! Do not edit.\n\n';

        // Split cookies by semicolon and process each one
        const cookies = browserCookies.split(';').map(cookie => cookie.trim());

        for (const cookie of cookies) {
            if (!cookie || !cookie.includes('=')) continue;

            const [name, ...valueParts] = cookie.split('=');
            const value = valueParts.join('='); // Handle values that contain '='

            if (!name || !value) continue;

            // Netscape format: domain, domain_specified, path, secure, expires, name, value
            // For YouTube cookies, we'll use these defaults:
            const domain = '.youtube.com';
            const domainSpecified = 'TRUE';
            const path = '/';
            const secure = name.includes('Secure') ? 'TRUE' : 'FALSE';
            const expires = '0'; // Session cookie

            netscapeCookies += `${domain}\t${domainSpecified}\t${path}\t${secure}\t${expires}\t${name.trim()}\t${value.trim()}\n`;
        }

        return netscapeCookies;
    } catch (error) {
        // Fallback: return original cookies
        return browserCookies;
    }
};

module.exports = {
    initializeYouTube,
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
    formatDuration,
    canExtract,
    validateUrl,
    createTrackObject,
    convertToNetscapeFormat
};
