import axios, { type AxiosInstance } from 'axios';

import type { AppConfig } from '../config/config';
import type { Torrent } from '../models/torrent';

export class QBittorrentClient {
  private readonly http: AxiosInstance;

  private authenticated = false;
  private sessionCookie?: string;

  public constructor(private readonly appConfig: AppConfig) {
    this.http = axios.create({
      baseURL: appConfig.qbittorrent.baseUrl,
      timeout: appConfig.qbittorrent.requestTimeoutMs,
      withCredentials: true
    });
  }

  public async authenticate(): Promise<void> {
    const params = new URLSearchParams({
      username: this.appConfig.qbittorrent.username,
      password: this.appConfig.qbittorrent.password
    });

    const response = await this.http.post<string>('/api/v2/auth/login', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      responseType: 'text'
    });

    if (typeof response.data === 'string' && response.data.trim() !== 'Ok.') {
      throw new Error('qBittorrent authentication failed');
    }

    const setCookieHeader = response.headers['set-cookie'];
    const rawCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    const sessionCookie = rawCookie?.split(';')[0];

    if (!sessionCookie) {
      throw new Error('qBittorrent authentication succeeded but no session cookie was returned');
    }

    this.sessionCookie = sessionCookie;
    this.authenticated = true;
  }

  public async getTorrents(): Promise<Torrent[]> {
    return this.withRetryOnSession(async () => {
      const response = await this.http.get<Torrent[]>('/api/v2/torrents/info');
      return response.data.map((torrent) => ({
        hash: torrent.hash,
        name: torrent.name,
        ratio: torrent.ratio,
        size: torrent.size,
        progress: torrent.progress,
        category: torrent.category ?? '',
        tags: torrent.tags ?? '',
        savePath: torrent.savePath ?? (torrent as Torrent & { save_path?: string }).save_path ?? '',
        addedOn: torrent.addedOn ?? (torrent as Torrent & { added_on?: number }).added_on ?? 0,
        completionOn:
          torrent.completionOn ??
          (torrent as Torrent & { completion_on?: number }).completion_on ??
          0,
        lastActivity:
          torrent.lastActivity ??
          (torrent as Torrent & { last_activity?: number }).last_activity ??
          0,
        state: torrent.state
      }));
    });
  }

  public async deleteTorrents(hashes: string[], deleteFiles: boolean): Promise<void> {
    if (hashes.length === 0) {
      return;
    }

    await this.withRetryOnSession(async () => {
      const params = new URLSearchParams({
        hashes: hashes.join('|'),
        deleteFiles: String(deleteFiles)
      });

      await this.http.post('/api/v2/torrents/delete', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    });
  }

  public async getCategories(): Promise<Record<string, unknown>> {
    return this.withRetryOnSession(async () => {
      const response = await this.http.get<Record<string, unknown>>('/api/v2/torrents/categories');
      return response.data;
    });
  }

  public async getTags(): Promise<string[]> {
    return this.withRetryOnSession(async () => {
      const response = await this.http.get<string[]>('/api/v2/torrents/tags');
      return response.data;
    });
  }

  private async withRetryOnSession<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    try {
      this.applySessionCookie();
      return await operation();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        this.authenticated = false;
        await this.authenticate();
        this.applySessionCookie();
        return operation();
      }

      throw error;
    }
  }

  private applySessionCookie(): void {
    if (!this.sessionCookie) {
      return;
    }

    this.http.defaults.headers.common.Cookie = this.sessionCookie;
  }
}
