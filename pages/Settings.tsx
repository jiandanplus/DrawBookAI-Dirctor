import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { configService, AppConfig } from '../services/configService';

const Settings: React.FC = () => {
    const [config, setConfig] = useState<AppConfig>(configService.getConfig());
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        setConfig(configService.getConfig());
    }, []);

    const handleChange = (key: keyof AppConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        configService.saveConfig(config);
        setMessage({ type: 'success', text: '设置已保存，立即生效' });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleReset = () => {
        if (confirm('确定要重置所有设置吗？这将清除本地存储的配置，恢复到默认环境变量。')) {
            configService.resetConfig();
            setConfig(configService.getConfig());
            setMessage({ type: 'success', text: '设置已重置为默认值' });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-8 text-white">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold mb-2">系统设置</h1>
                        <p className="text-zinc-400 text-sm">配置 API 接口和密钥，这些设置将保存在本地浏览器中。</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 hover:text-red-400 transition-colors text-sm"
                        >
                            <RotateCcw className="w-4 h-4" />
                            重置默认
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors text-sm"
                        >
                            <Save className="w-4 h-4" />
                            保存设置
                        </button>
                    </div>
                </div>

                {message && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                        {message.text}
                    </div>
                )}

                <div className="space-y-6">
                    {/* API Key Section */}
                    <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
                        <h2 className="text-lg font-semibold mb-4 text-zinc-200">鉴权配置</h2>
                        <div className="grid gap-6">
                            <div>
                                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                                    ANTSK_API_KEY
                                </label>
                                <input
                                    type="password"
                                    value={config.ANTSK_API_KEY}
                                    onChange={(e) => handleChange('ANTSK_API_KEY', e.target.value)}
                                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                                    placeholder="sk-..."
                                />
                                <p className="mt-2 text-xs text-zinc-600">
                                    AntSK 平台的 API 密钥，用于访问所有 AI 服务。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Global API Section */}
                    <div className="bg-[#141414] border border-zinc-800 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-zinc-200">全局接口配置</h2>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-zinc-400">启用全局接口</span>
                                <button
                                    onClick={() => handleChange('USE_GLOBAL_API', !config.USE_GLOBAL_API)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${config.USE_GLOBAL_API ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config.USE_GLOBAL_API ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>

                        <div className={`grid gap-6 transition-opacity duration-200 ${!config.USE_GLOBAL_API ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                            <div>
                                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                                    ALL_API_BASE
                                </label>
                                <input
                                    type="text"
                                    value={config.ALL_API_BASE}
                                    onChange={(e) => handleChange('ALL_API_BASE', e.target.value)}
                                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                                    placeholder="https://api.antsk.cn"
                                />
                                <p className="mt-2 text-xs text-zinc-600">
                                    统一的 API 基础地址。开启全局接口时，所有服务都将使用此地址。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Service Specific Section */}
                    <div className={`bg-[#141414] border border-zinc-800 rounded-xl p-6 transition-opacity duration-200 ${config.USE_GLOBAL_API ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <h2 className="text-lg font-semibold mb-4 text-zinc-200">分服务接口配置</h2>
                        <div className="grid gap-6">
                            <div>
                                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                                    TEXT_API_BASE (LLM / Chat)
                                </label>
                                <input
                                    type="text"
                                    value={config.TEXT_API_BASE}
                                    onChange={(e) => handleChange('TEXT_API_BASE', e.target.value)}
                                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                                    placeholder="https://text.api.example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                                    IMAGE_API_BASE (Image Generation)
                                </label>
                                <input
                                    type="text"
                                    value={config.IMAGE_API_BASE}
                                    onChange={(e) => handleChange('IMAGE_API_BASE', e.target.value)}
                                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                                    placeholder="https://image.api.example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                                    VIDEO_API_BASE (Video Generation)
                                </label>
                                <input
                                    type="text"
                                    value={config.VIDEO_API_BASE}
                                    onChange={(e) => handleChange('VIDEO_API_BASE', e.target.value)}
                                    className="w-full bg-[#0A0A0A] border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors font-mono"
                                    placeholder="https://video.api.example.com"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
