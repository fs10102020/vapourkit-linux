import axios from 'axios';
import { app } from 'electron';
import { logger } from './logger';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  changelog: string;
  publishedAt: string;
}

const GITHUB_OWNER = 'Kim2091';
const GITHUB_REPO = 'vapourkit';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/**
 * Compares two semantic version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  // Remove 'v' prefix if present
  const clean1 = v1.replace(/^v/, '');
  const clean2 = v2.replace(/^v/, '');
  
  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
}

/**
 * Checks for updates by comparing current version with latest GitHub release
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    logger.info('Checking for updates...');
    
    // Get current version from package.json
    const currentVersion = app.getVersion();
    logger.info(`Current version: ${currentVersion}`);
    
    // Fetch latest release from GitHub
    const response = await axios.get<GitHubRelease>(GITHUB_API_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vapourkit-app'
      },
      timeout: 10000 // 10 second timeout
    });
    
    const release = response.data;
    
    // Skip draft and prerelease versions
    if (release.draft || release.prerelease) {
      logger.info('Latest release is draft or prerelease, skipping');
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: '',
        changelog: '',
        publishedAt: ''
      };
    }
    
    const latestVersion = release.tag_name;
    logger.info(`Latest version: ${latestVersion}`);
    
    // Compare versions
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;
    
    if (isNewer) {
      logger.info('Update available!');
      return {
        available: true,
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url,
        changelog: release.body || 'No changelog available.',
        publishedAt: release.published_at
      };
    } else {
      logger.info('No updates available');
      return {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: '',
        changelog: '',
        publishedAt: ''
      };
    }
  } catch (error) {
    logger.error('Error checking for updates:', error);
    
    // Return no update available on error
    return {
      available: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      releaseUrl: '',
      changelog: '',
      publishedAt: ''
    };
  }
}

/**
 * Gets the GitHub releases page URL
 */
export function getReleasesPageUrl(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
}
