import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import StageScript from './components/StageScript';
import StageAssets from './components/StageAssets';
import StageDirector from './components/StageDirector';
import StageExport from './components/StageExport';
import Dashboard from './components/Dashboard';
import { ProjectState } from './types';
import { Key, Save, CheckCircle, ArrowRight, ShieldCheck, Loader2, X } from 'lucide-react';
import { saveProjectToDB } from './services/storageService';
import { setGlobalApiKey, verifyApiKey } from './services/geminiService';
import { setLogCallback, clearLogCallback } from './services/renderLogService';
import logoImg from './logo.png';

function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [inputKey, setInputKey] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState(false);
  
  // Ref to hold debounce timer
  const saveTimeoutRef = useRef<any>(null);

  // Load API Key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('antsk_api_key');
    if (storedKey) {
      setApiKey(storedKey);
      setGlobalApiKey(storedKey);
    }
  }, []);

  // Setup render log callback
  useEffect(() => {
    if (project) {
      setLogCallback((log) => {
        setProject(prev => {
          if (!prev) return null;
          return {
            ...prev,
            renderLogs: [...(prev.renderLogs || []), log]
          };
        });
      });
    } else {
      clearLogCallback();
    }
    
    return () => clearLogCallback();
  }, [project?.id]); // Re-setup when project changes

  // Auto-save logic
  useEffect(() => {
    if (!project) return;

    setSaveStatus('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProjectToDB(project);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 1000); // Debounce 1s

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project]);

  const handleSaveKey = async () => {
    if (!inputKey.trim()) return;
    
    setIsVerifying(true);
    setVerifyError('');
    
    try {
      const result = await verifyApiKey(inputKey.trim());
      
      if (result.success) {
        setApiKey(inputKey.trim());
        setGlobalApiKey(inputKey.trim());
        localStorage.setItem('antsk_api_key', inputKey.trim());
      } else {
        setVerifyError(result.message);
      }
    } catch (error: any) {
      setVerifyError(error.message || '验证过程出错');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClearKey = () => {
      localStorage.removeItem('antsk_api_key');
      setApiKey('');
      setGlobalApiKey('');
      setProject(null);
  };

  const updateProject = (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => {
    if (!project) return;
    setProject(prev => {
      if (!prev) return null;
      // 支持函数式更新
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  };

  const setStage = (stage: 'script' | 'assets' | 'director' | 'export') => {
    updateProject({ stage });
  };

  const handleOpenProject = (proj: ProjectState) => {
    setProject(proj);
  };

  const handleExitProject = async () => {
    // Force save before exiting
    if (project) {
        await saveProjectToDB(project);
    }
    setProject(null);
  };

  const renderStage = () => {
    if (!project) return null;
    switch (project.stage) {
      case 'script':
        return <StageScript project={project} updateProject={updateProject} />;
      case 'assets':
        return <StageAssets project={project} updateProject={updateProject} />;
      case 'director':
        return <StageDirector project={project} updateProject={updateProject} />;
      case 'export':
        return <StageExport project={project} />;
      default:
        return <div className="text-white">未知阶段</div>;
    }
  };

  // API Key Entry Screen (Industrial Design)
  if (!apiKey) {
    return (
      <div className="h-screen bg-[#050505] flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-0 right-0 p-64 bg-indigo-900/5 blur-[150px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 p-48 bg-zinc-900/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="w-full max-w-md bg-[#0A0A0A] border border-zinc-800 p-8 rounded-xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
          
          <div className="flex items-center gap-3 mb-8 border-b border-zinc-900 pb-6">
             <img src={logoImg} alt="Logo" className="w-10 h-10 flex-shrink-0" />
             <div>
                <h1 className="text-xl font-bold text-white tracking-wide">BigBanana AI Director</h1>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Authentication Required</p>
             </div>
          </div>

          <div className="space-y-6">
             <div>
               <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">BigBanana API Key</label>
               <input 
                 type="password" 
                 value={inputKey}
                 onChange={(e) => {
                   setInputKey(e.target.value);
                   setVerifyError('');
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && inputKey.trim() && !isVerifying) {
                     handleSaveKey();
                   }
                 }}
                 placeholder="Enter your API Key..."
                 className="w-full bg-[#141414] border border-zinc-800 text-white px-4 py-3 text-sm rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-900 transition-all font-mono placeholder:text-zinc-700"
                 disabled={isVerifying}
               />
               {verifyError && (
                 <p className="mt-2 text-xs text-red-400 flex items-center gap-2">
                   <span className="w-1 h-1 bg-red-400 rounded-full"></span>
                   {verifyError}
                 </p>
               )}
               <p className="mt-3 text-[10px] text-zinc-600 leading-relaxed">
                  本应用需要 BigBanana API 支持的图片生成和视频生成模型。
                  <a href="https://api.antsk.cn" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">立即购买 API Key</a>
               </p>
             </div>

             <button 
               onClick={handleSaveKey}
               disabled={!inputKey || isVerifying}
               className="w-full py-3 bg-white text-black font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isVerifying ? (
                 <>
                   <Loader2 className="w-3 h-3 animate-spin" />
                   验证中...
                 </>
               ) : (
                 <>
                   Confirm Access <ArrowRight className="w-3 h-3" />
                 </>
               )}
             </button>

             <div className="flex items-center justify-center gap-2 text-[10px] text-zinc-700 font-mono">
               <ShieldCheck className="w-3 h-3" />
               Key is stored locally in your browser
             </div>

             <div className="pt-6 border-t border-zinc-900 mt-6">
               <div className="flex flex-col gap-2 text-center text-[10px] text-zinc-600">
                 <a href="https://tree456.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">
                   官网：tree456.com
                 </a>
                 <a href="https://bigbanana.tree456.com/" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">
                   BigBanana产品首页
                 </a>
                 <button onClick={() => setShowQrCode(true)} className="hover:text-indigo-400 transition-colors">
                   联系我们
                 </button>
               </div>
             </div>
          </div>
        </div>

        {/* QR Code Modal */}
        {showQrCode && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowQrCode(false)}>
            <div className="bg-[#0A0A0A] border border-zinc-800 rounded-xl p-6 relative max-w-sm mx-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              <button 
                onClick={() => setShowQrCode(false)} 
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-white text-lg font-bold mb-4 text-center">联系我们</h3>
              <div className="bg-white p-4 rounded-lg">
                <img src="/qrcode.png" alt="联系我们二维码" className="w-full h-auto" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Dashboard View
  if (!project) {
    return (
       <>
         <button onClick={handleClearKey} className="fixed top-4 right-4 z-50 text-[10px] text-zinc-600 hover:text-red-500 transition-colors uppercase font-mono tracking-widest">
            Sign Out
         </button>
         <Dashboard onOpenProject={handleOpenProject} />
       </>
    );
  }

  // Workspace View
  return (
    <div className="flex h-screen bg-[#121212] font-sans text-gray-100 selection:bg-indigo-500/30">
      <Sidebar 
        currentStage={project.stage} 
        setStage={setStage} 
        onExit={handleExitProject} 
        projectName={project.title}
      />
      
      <main className="ml-72 flex-1 h-screen overflow-hidden relative">
        {renderStage()}
        
        {/* Save Status Indicator */}
        <div className="absolute top-4 right-6 pointer-events-none opacity-50 flex items-center gap-2 text-xs font-mono text-zinc-400 bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm z-50">
           {saveStatus === 'saving' ? (
             <>
               <Save className="w-3 h-3 animate-pulse" />
               保存中...
             </>
           ) : (
             <>
               <CheckCircle className="w-3 h-3 text-green-500" />
               已保存
             </>
           )}
        </div>
      </main>
      
      <div className="lg:hidden fixed inset-0 bg-black z-[100] flex items-center justify-center p-8 text-center">
        <p className="text-zinc-500">为了获得最佳体验，请使用桌面浏览器访问。</p>
      </div>
    </div>
  );
}

export default App;