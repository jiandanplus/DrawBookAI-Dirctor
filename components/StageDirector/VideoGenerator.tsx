import React from 'react';
import { Video, Loader2, Edit2 } from 'lucide-react';
import { Shot } from '../../types';

interface VideoGeneratorProps {
  shot: Shot;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  onGenerate: () => void;
  onModelChange: (model: 'sora-2' | 'veo_3_1_i2v_s_fast_fl_landscape') => void;
  onEditPrompt: () => void;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({
  shot,
  hasStartFrame,
  hasEndFrame,
  onGenerate,
  onModelChange,
  onEditPrompt
}) => {
  const isGenerating = shot.interval?.status === 'generating';
  const hasVideo = !!shot.interval?.videoUrl;
  const selectedModel = shot.videoModel || 'sora-2';

  return (
    <div className="bg-[#141414] rounded-xl p-5 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
          <Video className="w-3 h-3 text-indigo-500" />
          视频生成
          <button 
            onClick={onEditPrompt}
            className="p-1 text-yellow-400 hover:text-white transition-colors"
            title="预览/编辑视频提示词"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </h4>
        {shot.interval?.status === 'completed' && (
          <span className="text-[10px] text-green-500 font-mono flex items-center gap-1">
            ● READY
          </span>
        )}
      </div>
      
      {/* Model Selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
          选择视频模型
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value as any)}
          className="w-full bg-black text-white border border-zinc-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="sora-2">Sora-2 (OpenAI)</option>
          <option value="veo_3_1_i2v_s_fast_fl_landscape">Veo 3.1 (Google)</option>
        </select>
        <p className="text-[9px] text-zinc-600 font-mono">
          {selectedModel === 'sora-2' 
            ? '✦ Sora-2: OpenAI最新视频生成模型，画质精细'
            : '✦ Veo 3.1: Google高速视频生成，适合快速预览'}
        </p>
      </div>
      
      {/* Video Preview */}
      {hasVideo ? (
        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700 relative shadow-lg">
          <video src={shot.interval.videoUrl} controls className="w-full h-full" />
        </div>
      ) : (
        <div className="w-full aspect-video bg-zinc-900/50 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center">
          <span className="text-xs text-zinc-600 font-mono">PREVIEW AREA</span>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={!hasStartFrame || isGenerating}
        className={`w-full py-3 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
          hasVideo 
            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
        } ${(!hasStartFrame) ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            生成视频中...
          </>
        ) : (
          <>{hasVideo ? '重新生成视频' : '开始生成视频'}</>
        )}
      </button>
      
      {/* Status Messages */}
      {!hasEndFrame && (
        <div className="text-[9px] text-zinc-500 text-center font-mono">
          * 未检测到结束帧，将使用单图生成模式 (Image-to-Video)
        </div>
      )}
    </div>
  );
};

export default VideoGenerator;
