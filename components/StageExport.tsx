import React, { useState } from 'react';
import { Film, Download, Share2, FileVideo, Layers, Clock, CheckCircle, BarChart3, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ProjectState } from '../types';
import { downloadMasterVideo, downloadSourceAssets } from '../services/exportService';

interface Props {
  project: ProjectState;
}

const StageExport: React.FC<Props> = ({ project }) => {
  const completedShots = project.shots.filter(s => s.interval?.videoUrl);
  const totalShots = project.shots.length;
  const progress = totalShots > 0 ? Math.round((completedShots.length / totalShots) * 100) : 0;
  
  // Calculate total duration roughly
  const estimatedDuration = project.shots.reduce((acc, s) => acc + (s.interval?.duration || 3), 0);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPhase, setDownloadPhase] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Source Assets Download state
  const [isDownloadingAssets, setIsDownloadingAssets] = useState(false);
  const [assetsPhase, setAssetsPhase] = useState('');
  const [assetsProgress, setAssetsProgress] = useState(0);

  // Render Logs Modal state
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Handle master video download
  const handleDownloadMaster = async () => {
    if (isDownloading || progress < 100) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      await downloadMasterVideo(project, (phase, prog) => {
        setDownloadPhase(phase);
        setDownloadProgress(prog);
      });
      
      // Reset after successful download
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadPhase('');
        setDownloadProgress(0);
      }, 2000);
    } catch (error) {
      console.error('Download failed:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsDownloading(false);
      setDownloadPhase('');
      setDownloadProgress(0);
    }
  };

  // Collect render logs from project
  const collectRenderLogs = () => {
    const logs = project.renderLogs || [];
    return { logs: logs.sort((a, b) => b.timestamp - a.timestamp) };
  };

  // Handle source assets download
  const handleDownloadAssets = async () => {
    if (isDownloadingAssets) return;
    
    // 检查是否有任何可下载的资源
    const hasAssets = 
      (project.scriptData?.characters.some(c => c.referenceImage || c.variations?.some(v => v.referenceImage))) ||
      (project.scriptData?.scenes.some(s => s.referenceImage)) ||
      (project.shots.some(s => s.keyframes?.some(k => k.imageUrl) || s.interval?.videoUrl));
    
    if (!hasAssets) {
      alert('没有可下载的资源。请先生成角色、场景或镜头素材。');
      return;
    }
    
    setIsDownloadingAssets(true);
    setAssetsProgress(0);
    
    try {
      await downloadSourceAssets(project, (phase, prog) => {
        setAssetsPhase(phase);
        setAssetsProgress(prog);
      });
      
      // Reset after successful download
      setTimeout(() => {
        setIsDownloadingAssets(false);
        setAssetsPhase('');
        setAssetsProgress(0);
      }, 2000);
    } catch (error) {
      console.error('Assets download failed:', error);
      alert(`下载源资源失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsDownloadingAssets(false);
      setAssetsPhase('');
      setAssetsProgress(0);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] overflow-hidden">
      
      {/* Header - Consistent with Director */}
      <div className="h-16 border-b border-zinc-800 bg-[#1A1A1A] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  <Film className="w-5 h-5 text-indigo-500" />
                  成片与导出
                  <span className="text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded">Rendering & Export</span>
              </h2>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-[10px] text-zinc-500 font-mono uppercase bg-zinc-900 border border-zinc-800 px-2 py-1 rounded">
               Status: {progress === 100 ? 'READY' : 'IN PROGRESS'}
             </span>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Main Status Panel */}
          <div className="bg-[#141414] border border-zinc-800 rounded-xl p-8 shadow-2xl relative overflow-hidden group">
             {/* Background Decoration */}
             <div className="absolute top-0 right-0 p-48 bg-indigo-900/5 blur-[120px] rounded-full pointer-events-none"></div>
             <div className="absolute bottom-0 left-0 p-32 bg-emerald-900/5 blur-[100px] rounded-full pointer-events-none"></div>

             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 relative z-10 gap-6">
               <div>
                 <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{project.scriptData?.title || '未命名项目'}</h3>
                    <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px] rounded uppercase font-mono tracking-wider">Master Sequence</span>
                 </div>
                 <div className="flex items-center gap-6 mt-3">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-0.5">Shots</span>
                        <span className="text-sm font-mono text-zinc-300">{project.shots.length}</span>
                    </div>
                    <div className="w-px h-6 bg-zinc-800"></div>
                    <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-0.5">Est. Duration</span>
                        <span className="text-sm font-mono text-zinc-300">~{estimatedDuration}s</span>
                    </div>
                    <div className="w-px h-6 bg-zinc-800"></div>
                    <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-0.5">Target</span>
                        <span className="text-sm font-mono text-zinc-300">{project.targetDuration}</span>
                    </div>
                 </div>
               </div>
               
               <div className="text-right bg-black/20 p-4 rounded-lg border border-white/5 backdrop-blur-sm min-w-[160px]">
                 <div className="flex items-baseline justify-end gap-1 mb-1">
                     <span className="text-3xl font-mono font-bold text-indigo-400">{progress}</span>
                     <span className="text-sm text-zinc-500">%</span>
                 </div>
                 <div className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center justify-end gap-2">
                    {progress === 100 ? <CheckCircle className="w-3 h-3 text-green-500" /> : <BarChart3 className="w-3 h-3" />}
                    Render Status
                 </div>
               </div>
             </div>

             {/* Timeline Visualizer Strip */}
             <div className="mb-10">
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono uppercase tracking-widest mb-2 px-1">
                    <span>Sequence Map</span>
                    <span>TC 00:00:00:00</span>
                </div>
                <div className="h-20 bg-[#080808] rounded-lg border border-zinc-800 flex items-center px-2 gap-1 overflow-x-auto custom-scrollbar relative shadow-inner">
                   {project.shots.length === 0 ? (
                      <div className="w-full flex items-center justify-center text-zinc-800 text-xs font-mono uppercase tracking-widest">
                          <Film className="w-4 h-4 mr-2" />
                          No Shots Available
                      </div>
                   ) : (
                      project.shots.map((shot, idx) => {
                        const isDone = !!shot.interval?.videoUrl;
                        return (
                          <div 
                            key={shot.id} 
                            className={`h-14 min-w-[4px] flex-1 rounded-[2px] transition-all relative group flex flex-col justify-end overflow-hidden ${
                              isDone
                                ? 'bg-indigo-900/40 border border-indigo-500/30 hover:bg-indigo-500/40' 
                                : 'bg-zinc-900 border border-zinc-800 hover:bg-zinc-800'
                            }`}
                            title={`Shot ${idx+1}: ${shot.actionSummary}`}
                          >
                             {/* Mini Progress Bar inside timeline segment */}
                             {isDone && <div className="h-full w-full bg-indigo-500/20"></div>}
                             
                             {/* Hover Tooltip */}
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap">
                                <div className="bg-black text-white text-[10px] px-2 py-1 rounded border border-zinc-700 shadow-xl">
                                    Shot {idx + 1}
                                </div>
                             </div>
                          </div>
                        )
                      })
                   )}
                </div>
             </div>

             {/* Action Buttons */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <button 
                  onClick={handleDownloadMaster}
                  disabled={progress < 100 || isDownloading} 
                  className={`h-12 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all border ${
                 isDownloading
                   ? 'bg-indigo-600 text-white border-indigo-500 cursor-wait'
                   : progress === 100 
                   ? 'bg-white text-black hover:bg-zinc-200 border-white shadow-lg shadow-white/5' 
                   : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
               }`}>
                 {isDownloading ? (
                   <Loader2 className="w-4 h-4 animate-spin" />
                 ) : (
                   <Download className="w-4 h-4" />
                 )}
                 {isDownloading ? `${downloadPhase} ${downloadProgress}%` : 'Download Master (.mp4)'}
               </button>
               
               <button className="h-12 bg-[#1A1A1A] hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all">
                 <FileVideo className="w-4 h-4" />
                 Export EDL / XML
               </button>
             </div>
          </div>

          {/* Secondary Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div 
                  onClick={handleDownloadAssets}
                  className={`p-5 bg-[#141414] border rounded-xl transition-all flex flex-col justify-between h-32 relative overflow-hidden ${
                    isDownloadingAssets 
                      ? 'border-indigo-500 cursor-wait' 
                      : 'border-zinc-800 hover:border-zinc-600 group cursor-pointer'
                  }`}
              >
                  {isDownloadingAssets && (
                    <div className="absolute inset-0 bg-indigo-600/20 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-2" />
                      <p className="text-xs text-white font-mono">{assetsPhase}</p>
                      <div className="w-32 h-1 bg-zinc-800 rounded-full overflow-hidden mt-2">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${assetsProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                  <Layers className={`w-5 h-5 mb-4 transition-colors ${
                    isDownloadingAssets ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-indigo-400'
                  }`} />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Source Assets</h4>
                    <p className="text-[10px] text-zinc-500">Download all generated images and raw video clips.</p>
                  </div>
              </div>
              <div className="p-5 bg-[#141414] border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors group cursor-pointer flex flex-col justify-between h-32">
                  <Share2 className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 mb-4 transition-colors" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Share Project</h4>
                    <p className="text-[10px] text-zinc-500">Create a view-only link for client review.</p>
                  </div>
              </div>
              <div 
                  onClick={() => setShowLogsModal(true)}
                  className="p-5 bg-[#141414] border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors group cursor-pointer flex flex-col justify-between h-32"
              >
                  <Clock className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 mb-4 transition-colors" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Render Logs</h4>
                    <p className="text-[10px] text-zinc-500">View generation history and status.</p>
                  </div>
              </div>
          </div>

        </div>
      </div>

      {/* Render Logs Modal */}
      {showLogsModal && (() => {
        const { logs } = collectRenderLogs();
        
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#141414] border border-zinc-800 rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-xl font-bold text-white">Render Logs</h3>
                  <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px] rounded uppercase font-mono tracking-wider">
                    {logs.length} Events
                  </span>
                </div>
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Stats Panel */}
              <div className="p-6 border-b border-zinc-800 bg-[#0A0A0A]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Total Events</div>
                    <div className="text-2xl font-mono font-bold text-white">{logs.length}</div>
                  </div>
                  <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Completed</div>
                    <div className="text-2xl font-mono font-bold text-green-400">
                      {logs.filter(l => l.status === 'success').length}
                    </div>
                  </div>
                  <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4">
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Failed</div>
                    <div className="text-2xl font-mono font-bold text-red-400">
                      {logs.filter(l => l.status === 'failed').length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Logs List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                    <Clock className="w-12 h-12 mb-4 opacity-30" />
                    <p className="text-sm font-mono uppercase tracking-widest">No generation history available</p>
                  </div>
                ) : (
                  logs.map((log) => {
                    const statusColor = log.status === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/30' :
                                       'text-red-400 bg-red-500/10 border-red-500/30';
                    
                    const typeIcon = log.type === 'character' || log.type === 'character-variation' ? '👤' :
                                    log.type === 'scene' ? '🎬' :
                                    log.type === 'keyframe' ? '🖼️' : 
                                    log.type === 'video' ? '🎥' : '📝';
                    
                    const isExpanded = expandedLogId === log.id;
                    const hasDetails = log.prompt || log.resourceId || log.inputTokens || log.outputTokens;
                    
                    return (
                      <div key={log.id} className="bg-[#0A0A0A] border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors">
                        <div 
                          className="p-4 cursor-pointer"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl mt-0.5">{typeIcon}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-bold text-white">{log.resourceName}</h4>
                                <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded border ${statusColor}`}>
                                  {log.status}
                                </span>
                                {log.duration && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-mono text-zinc-500 bg-zinc-900 rounded border border-zinc-800">
                                    {(log.duration / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                                <span className="font-mono">
                                  {new Date(log.timestamp).toLocaleString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  })}
                                </span>
                                <span className="text-zinc-700">|</span>
                                <span className="uppercase tracking-wider">{log.model}</span>
                                <span className="text-zinc-700">|</span>
                                <span className="uppercase tracking-wider text-zinc-600">{log.type}</span>
                              </div>
                              {log.error && (
                                <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded text-[10px] text-red-400">
                                  {log.error}
                                </div>
                              )}
                            </div>
                            {hasDetails && (
                              <button className="mt-1 text-zinc-600 hover:text-white transition-colors">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded Details */}
                        {isExpanded && hasDetails && (
                          <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
                            {log.resourceId && (
                              <div>
                                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Resource ID</div>
                                <div className="text-[10px] text-zinc-400 font-mono bg-black/30 px-2 py-1 rounded">
                                  {log.resourceId}
                                </div>
                              </div>
                            )}
                            
                            {log.prompt && (
                              <div>
                                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Prompt</div>
                                <div className="text-[10px] text-zinc-300 bg-black/30 px-3 py-2 rounded max-h-32 overflow-y-auto">
                                  {log.prompt}
                                </div>
                              </div>
                            )}
                            
                            {(log.inputTokens || log.outputTokens || log.totalTokens) && (
                              <div>
                                <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Token Usage</div>
                                <div className="flex gap-4 text-[10px]">
                                  {log.inputTokens && (
                                    <div className="bg-black/30 px-2 py-1 rounded">
                                      <span className="text-zinc-500">Input:</span>
                                      <span className="text-indigo-400 font-mono ml-1">{log.inputTokens}</span>
                                    </div>
                                  )}
                                  {log.outputTokens && (
                                    <div className="bg-black/30 px-2 py-1 rounded">
                                      <span className="text-zinc-500">Output:</span>
                                      <span className="text-indigo-400 font-mono ml-1">{log.outputTokens}</span>
                                    </div>
                                  )}
                                  {log.totalTokens && (
                                    <div className="bg-black/30 px-2 py-1 rounded">
                                      <span className="text-zinc-500">Total:</span>
                                      <span className="text-indigo-400 font-mono ml-1">{log.totalTokens}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-800 bg-[#0A0A0A] flex justify-end items-center">
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default StageExport;