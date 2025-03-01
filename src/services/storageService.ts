import { SimulationResult } from '../types/transaction';

interface StorageData {
  simulationResult: SimulationResult | null;
  lastRequest: any;
}

export class StorageService {
  private readonly isExtension: boolean;

  constructor() {
    this.isExtension = typeof chrome !== 'undefined' && chrome.storage !== undefined;
  }

  async get<T>(key: keyof StorageData): Promise<T | null> {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] || null);
        });
      });
    }
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: keyof StorageData, value: T): Promise<void> {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => {
          resolve();
        });
      });
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  async clear(): Promise<void> {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.clear(() => {
          resolve();
        });
      });
    }
    localStorage.clear();
  }

  async remove(key: keyof StorageData): Promise<void> {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, () => {
          resolve();
        });
      });
    }
    localStorage.removeItem(key);
  }
}

export const storageService = new StorageService(); 