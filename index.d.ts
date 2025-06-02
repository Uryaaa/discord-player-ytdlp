import { BaseExtractor, Track, Playlist, ExtractorInfo, SearchQueryType } from 'discord-player';

export interface YtDlpExtractorOptions {
  /**
   * Path to the yt-dlp binary
   */
  ytdlpPath: string;
  
  /**
   * Priority of this extractor (default: 100)
   */
  priority?: number;
  
  /**
   * Enable YouTube search functionality (default: true)
   */
  enableYouTubeSearch?: boolean;
  
  /**
   * Enable direct URL extraction (default: true)
   */
  enableDirectUrls?: boolean;
  
  /**
   * Stream quality format for yt-dlp (default: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio')
   */
  streamQuality?: string;
  
  /**
   * YouTubei.js options
   */
  youtubeiOptions?: {
    /**
     * YouTube cookies for authentication
     */
    cookies?: string | object;
    
    /**
     * YouTube client configuration
     */
    client?: string;
  };
}

export interface TrackInfo {
  id: string;
  title: string;
  author: string;
  duration: string;
  url: string;
  thumbnail: string | null;
  views?: string | number;
  description?: string;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  author: string;
  url: string;
  tracks: TrackInfo[];
}

export declare class YtDlpExtractor extends BaseExtractor {
  static identifier: string;
  
  ytdlpPath: string;
  priority: number;
  enableYouTubeSearch: boolean;
  enableDirectUrls: boolean;
  streamQuality: string;
  youtubeiOptions: {
    cookies: string | object | null;
    client: string | null;
  };
  protocols: string[];

  constructor(context: any, options: YtDlpExtractorOptions);

  /**
   * Activate the extractor
   */
  activate(): Promise<void>;

  /**
   * Deactivate the extractor
   */
  deactivate(): Promise<void>;

  /**
   * Validate if this extractor can handle the query
   */
  validate(query: string, type?: SearchQueryType): Promise<boolean>;

  /**
   * Handle the query and return track information
   */
  handle(query: string, context: any): Promise<ExtractorInfo>;

  /**
   * Handle direct URL queries
   */
  handleDirectUrl(url: string, context: any): Promise<ExtractorInfo>;

  /**
   * Handle YouTube playlist URLs
   */
  handleYouTubePlaylist(url: string, context: any): Promise<ExtractorInfo>;

  /**
   * Handle search queries (YouTube only)
   */
  handleSearchQuery(query: string, context: any): Promise<ExtractorInfo>;

  /**
   * Get streaming URL for a track
   */
  stream(info: any): Promise<string>;

  /**
   * Get related tracks for autoplay functionality
   */
  getRelatedTracks(track: Track, history: any): Promise<ExtractorInfo>;

  /**
   * Bridge functionality for other extractors
   */
  bridge(track: Track, sourceExtractor: BaseExtractor): Promise<{ stream: string; type: string } | null>;

  /**
   * Create bridge query for track search
   */
  createBridgeQuery(track: Track): string;
}

export { YtDlpExtractor as default };
