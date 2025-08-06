import { BatchSimulationResult, StorageData, TransactionArgs } from '../types/simulation_interfaces';

export class StorageService {
  private readonly isExtension: boolean;

  constructor() {
    this.isExtension = typeof chrome !== 'undefined' && chrome.storage !== undefined;
  }

  async get<T>(key: string): Promise<T | null> {
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

  async set<T>(key: string, value: T): Promise<void> {
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

  async remove(key: string): Promise<void> {
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