export interface AppConfig {
    ANTSK_API_KEY: string;
    ALL_API_BASE: string;
    USE_GLOBAL_API: boolean;
    TEXT_API_BASE: string;
    IMAGE_API_BASE: string;
    VIDEO_API_BASE: string;
}

const STORAGE_KEY = 'app_runtime_config';

const DEFAULTS: AppConfig = {
    ANTSK_API_KEY: process.env.ANTSK_API_KEY || '',
    ALL_API_BASE: process.env.ALL_API_BASE || 'https://api.antsk.cn',
    USE_GLOBAL_API: process.env.USE_GLOBAL_API !== 'false', // Default to true unless explicitly false
    TEXT_API_BASE: process.env.TEXT_API_BASE || '',
    IMAGE_API_BASE: process.env.IMAGE_API_BASE || '',
    VIDEO_API_BASE: process.env.VIDEO_API_BASE || '',
};

export const configService = {
    getConfig: (): AppConfig => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return { ...DEFAULTS, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.warn('Failed to load config from localStorage', e);
        }
        return { ...DEFAULTS };
    },

    saveConfig: (config: Partial<AppConfig>) => {
        try {
            const current = configService.getConfig();
            const updated = { ...current, ...config };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            // Dispatch a custom event to notify listeners (like geminiService) if needed,
            // though typically we just re-read config on demand.
            window.dispatchEvent(new Event('config-updated'));
        } catch (e) {
            console.error('Failed to save config to localStorage', e);
        }
    },

    resetConfig: () => {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new Event('config-updated'));
    },

    // Helper to resolve specific service URLs based on current config logic
    getServiceUrls: () => {
        const config = configService.getConfig();
        const useGlobal = config.USE_GLOBAL_API;

        return {
            text: useGlobal ? config.ALL_API_BASE : (config.TEXT_API_BASE || config.ALL_API_BASE),
            // Note: original requirement said "If false ... do NOT fallback". 
            // But implementation usually falls back if explicit is empty to avoid crashing?
            // Let's stick strictly to the requirement: "If false ... no fallback to ALL_API_BASE".
            // Wait, the previous implementation in geminiService.ts was:
            // const TEXT_API_URL = USE_GLOBAL_API ? ALL_API_BASE : (process.env.TEXT_API_BASE || '');
            // So checks for empty string.

            textUrl: useGlobal ? config.ALL_API_BASE : (config.TEXT_API_BASE || ''),
            imageUrl: useGlobal ? config.ALL_API_BASE : (config.IMAGE_API_BASE || ''),
            videoUrl: useGlobal ? config.ALL_API_BASE : (config.VIDEO_API_BASE || ''),
            apiKey: config.ANTSK_API_KEY,
        };
    }
};
