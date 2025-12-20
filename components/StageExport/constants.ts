/**
 * StageExport 样式常量和类型定义
 */

// 样式常量
export const STYLES = {
  // 主容器
  container: "flex flex-col h-full bg-[#121212] overflow-hidden",
  
  // 头部
  header: {
    container: "h-16 border-b border-zinc-800 bg-[#1A1A1A] px-6 flex items-center justify-between shrink-0",
    title: "text-lg font-bold text-white flex items-center gap-3",
    subtitle: "text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded",
    status: "text-[10px] text-zinc-500 font-mono uppercase bg-zinc-900 border border-zinc-800 px-2 py-1 rounded"
  },
  
  // 按钮样式
  button: {
    primary: "h-12 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500 shadow-lg shadow-indigo-500/20 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all",
    secondary: "h-12 bg-white text-black hover:bg-zinc-200 border border-white shadow-lg shadow-white/5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all",
    tertiary: "h-12 bg-[#1A1A1A] hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all",
    disabled: "h-12 bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all",
    loading: "h-12 bg-indigo-600 text-white border border-indigo-500 cursor-wait rounded-lg flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest transition-all"
  },
  
  // 卡片样式
  card: {
    base: "p-5 bg-[#141414] border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors group cursor-pointer flex flex-col justify-between h-32 relative overflow-hidden",
    active: "p-5 bg-[#141414] border border-indigo-500 cursor-wait rounded-xl transition-all flex flex-col justify-between h-32 relative overflow-hidden",
    loading: "absolute inset-0 bg-indigo-600/20 backdrop-blur-sm flex flex-col items-center justify-center z-10"
  },
  
  // 模态框样式
  modal: {
    overlay: "fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4",
    container: "bg-[#141414] border border-zinc-800 rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl",
    header: "p-6 border-b border-zinc-800 flex items-center justify-between",
    content: "flex-1 overflow-y-auto p-6 space-y-2",
    footer: "p-4 border-t border-zinc-800 bg-[#0A0A0A] flex justify-end items-center"
  },
  
  // 视频播放器模态框
  videoModal: {
    overlay: "fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4",
    container: "bg-[#0A0A0A] border border-zinc-800 rounded-xl max-w-6xl w-full flex flex-col shadow-2xl overflow-hidden",
    player: "bg-black relative flex items-center justify-center overflow-hidden",
    controls: "p-4 border-t border-zinc-800 bg-[#0A0A0A] flex items-center justify-between shrink-0"
  },
  
  // 状态面板
  statusPanel: {
    container: "bg-[#141414] border border-zinc-800 rounded-xl p-8 shadow-2xl relative overflow-hidden group",
    decoration: {
      top: "absolute top-0 right-0 p-48 bg-indigo-900/5 blur-[120px] rounded-full pointer-events-none",
      bottom: "absolute bottom-0 left-0 p-32 bg-emerald-900/5 blur-[100px] rounded-full pointer-events-none"
    },
    progressBadge: "text-right bg-black/20 p-4 rounded-lg border border-white/5 backdrop-blur-sm min-w-[160px]",
    stat: "flex flex-col",
    statLabel: "text-[9px] text-zinc-600 uppercase tracking-widest font-bold mb-0.5",
    statValue: "text-sm font-mono text-zinc-300"
  },
  
  // 时间线
  timeline: {
    container: "h-20 bg-[#080808] rounded-lg border border-zinc-800 flex items-center px-2 gap-1 overflow-x-auto custom-scrollbar relative shadow-inner",
    segment: "h-14 min-w-[4px] flex-1 rounded-[2px] transition-all relative group flex flex-col justify-end overflow-hidden",
    segmentComplete: "bg-indigo-900/40 border border-indigo-500/30 hover:bg-indigo-500/40",
    segmentIncomplete: "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800",
    tooltip: "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap"
  },
  
  // 日志项
  logItem: {
    container: "bg-[#0A0A0A] border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors",
    header: "p-4 cursor-pointer",
    details: "px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3"
  },
  
  // 统计面板
  statsPanel: {
    container: "p-6 border-b border-zinc-800 bg-[#0A0A0A]",
    grid: "grid grid-cols-1 md:grid-cols-3 gap-4",
    card: "bg-[#141414] border border-zinc-800 rounded-lg p-4",
    label: "text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1"
  }
};

// 状态颜色映射
export const STATUS_COLORS = {
  success: 'text-green-400 bg-green-500/10 border-green-500/30',
  failed: 'text-red-400 bg-red-500/10 border-red-500/30',
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
};

// 日志类型图标映射
export const LOG_TYPE_ICONS = {
  character: '👤',
  'character-variation': '👤',
  scene: '🎬',
  keyframe: '🖼️',
  video: '🎥',
  default: '📝'
};

// 下载状态类型
export interface DownloadState {
  isDownloading: boolean;
  phase: string;
  progress: number;
}

// 视频播放器状态类型
export interface VideoPlayerState {
  showVideoPlayer: boolean;
  currentShotIndex: number;
  isPlaying: boolean;
}
