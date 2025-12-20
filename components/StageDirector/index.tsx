import React, { useState } from 'react';
import { LayoutGrid, Sparkles, Loader2, AlertCircle, Edit2, Film, Video as VideoIcon } from 'lucide-react';
import { ProjectState, Shot, Keyframe } from '../../types';
import { generateImage, generateVideo, generateActionSuggestion } from '../../services/geminiService';
import { 
  getRefImagesForShot, 
  buildKeyframePrompt, 
  buildVideoPrompt,
  extractBasePrompt,
  generateId,
  delay,
  convertImageToBase64,
  createKeyframe,
  updateKeyframeInShot
} from './utils';
import { DEFAULTS } from './constants';
import EditModal from './EditModal';
import ShotCard from './ShotCard';
import ShotWorkbench from './ShotWorkbench';
import ImagePreviewModal from './ImagePreviewModal';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: any) => boolean;
}

const StageDirector: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number, message: string} | null>(null);
  const [previewImage, setPreviewImage] = useState<{url: string, title: string} | null>(null);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  
  // 统一的编辑状态
  const [editModal, setEditModal] = useState<{
    type: 'action' | 'keyframe' | 'video';
    value: string;
    shotId?: string;
    frameType?: 'start' | 'end';
  } | null>(null);

  const activeShotIndex = project.shots.findIndex(s => s.id === activeShotId);
  const activeShot = project.shots[activeShotIndex];
  
  const allStartFramesGenerated = project.shots.length > 0 && 
    project.shots.every(s => s.keyframes?.find(k => k.type === 'start')?.imageUrl);

  /**
   * 更新镜头
   */
  const updateShot = (shotId: string, transform: (s: Shot) => Shot) => {
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => s.id === shotId ? transform(s) : s)
    }));
  };

  /**
   * 生成关键帧
   */
  const handleGenerateKeyframe = async (shot: Shot, type: 'start' | 'end') => {
    const existingKf = shot.keyframes?.find(k => k.type === type);
    const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
    
    const basePrompt = existingKf?.visualPrompt 
      ? extractBasePrompt(existingKf.visualPrompt, shot.actionSummary)
      : shot.actionSummary;
    
    const visualStyle = project.visualStyle || project.scriptData?.visualStyle || 'live-action';
    const prompt = buildKeyframePrompt(basePrompt, visualStyle, shot.cameraMovement, type);
    
    // 设置生成状态
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map(s => {
        if (s.id !== shot.id) return s;
        return updateKeyframeInShot(s, type, createKeyframe(kfId, type, prompt, undefined, 'generating'));
      })
    }));
    
    try {
      const referenceImages = getRefImagesForShot(shot, project.scriptData);
      const url = await generateImage(prompt, referenceImages);

      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
          if (s.id !== shot.id) return s;
          return updateKeyframeInShot(s, type, createKeyframe(kfId, type, prompt, url, 'completed'));
        })
      }));
    } catch (e: any) {
      console.error(e);
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map(s => {
          if (s.id !== shot.id) return s;
          return updateKeyframeInShot(s, type, createKeyframe(kfId, type, prompt, undefined, 'failed'));
        })
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      alert(`生成失败: ${e.message}`);
    }
  };

  /**
   * 上传关键帧图片
   */
  const handleUploadKeyframeImage = async (shot: Shot, type: 'start' | 'end') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件！');
        return;
      }
      
      try {
        const base64Url = await convertImageToBase64(file);
        const existingKf = shot.keyframes?.find(k => k.type === type);
        const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);
        
        updateProject((prevProject: ProjectState) => ({
          ...prevProject,
          shots: prevProject.shots.map(s => {
            if (s.id !== shot.id) return s;
            const visualPrompt = existingKf?.visualPrompt || shot.actionSummary;
            return updateKeyframeInShot(s, type, createKeyframe(kfId, type, visualPrompt, base64Url, 'completed'));
          })
        }));
      } catch (error) {
        alert('读取文件失败！');
      }
    };
    
    input.click();
  };

  /**
   * 生成视频
   */
  const handleGenerateVideo = async (shot: Shot) => {
    const sKf = shot.keyframes?.find(k => k.type === 'start');
    const eKf = shot.keyframes?.find(k => k.type === 'end');

    if (!sKf?.imageUrl) return alert("请先生成起始帧！");

    const selectedModel = shot.videoModel || DEFAULTS.videoModel;
    const projectLanguage = project.language || project.scriptData?.language || '中文';
    
    const videoPrompt = buildVideoPrompt(
      shot.actionSummary,
      shot.cameraMovement,
      selectedModel,
      projectLanguage
    );
    
    const intervalId = shot.interval?.id || generateId(`int-${shot.id}`);
    
    updateShot(shot.id, (s) => ({
      ...s,
      interval: s.interval ? { ...s.interval, status: 'generating', videoPrompt } : {
        id: intervalId,
        startKeyframeId: sKf.id,
        endKeyframeId: eKf?.id || '',
        duration: 10,
        motionStrength: 5,
        videoPrompt,
        status: 'generating'
      }
    }));
    
    try {
      const videoUrl = await generateVideo(
        videoPrompt, 
        sKf.imageUrl, 
        eKf?.imageUrl,
        selectedModel
      );

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, videoUrl, status: 'completed' } : {
          id: intervalId,
          startKeyframeId: sKf.id,
          endKeyframeId: eKf?.id || '',
          duration: 10,
          motionStrength: 5,
          videoPrompt,
          videoUrl,
          status: 'completed'
        }
      }));
    } catch (e: any) {
      console.error(e);
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed' } : undefined
      }));
      
      if (onApiKeyError && onApiKeyError(e)) return;
      alert(`视频生成失败: ${e.message}`);
    }
  };

  /**
   * 复制上一镜头的结束帧
   */
  const handleCopyPreviousEndFrame = () => {
    if (activeShotIndex === 0 || !activeShot) return;
    
    const previousShot = project.shots[activeShotIndex - 1];
    const previousEndKf = previousShot?.keyframes?.find(k => k.type === 'end');
    
    if (!previousEndKf?.imageUrl) {
      alert("上一个镜头还没有生成结束帧");
      return;
    }
    
    const existingStartKf = activeShot.keyframes?.find(k => k.type === 'start');
    const newStartKfId = existingStartKf?.id || generateId(`kf-${activeShot.id}-start`);
    
    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s, 
        'start', 
        createKeyframe(newStartKfId, 'start', previousEndKf.visualPrompt, previousEndKf.imageUrl, 'completed')
      );
    });
  };

  /**
   * 批量生成关键帧
   */
  const handleBatchGenerateImages = async () => {
    const isRegenerate = allStartFramesGenerated;
    
    let shotsToProcess = [];
    if (isRegenerate) {
      if (!window.confirm("确定要重新生成所有镜头的首帧吗？这将覆盖现有图片。")) return;
      shotsToProcess = [...project.shots];
    } else {
      shotsToProcess = project.shots.filter(s => !s.keyframes?.find(k => k.type === 'start')?.imageUrl);
    }
    
    if (shotsToProcess.length === 0) return;

    setBatchProgress({ 
      current: 0, 
      total: shotsToProcess.length, 
      message: isRegenerate ? "正在重新生成所有首帧..." : "正在批量生成缺失的首帧..." 
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);
      
      const shot = shotsToProcess[i];
      setBatchProgress({ 
        current: i + 1, 
        total: shotsToProcess.length, 
        message: `正在生成镜头 ${i+1}/${shotsToProcess.length}...` 
      });
      
      try {
        await handleGenerateKeyframe(shot, 'start');
      } catch (e: any) {
        console.error(`Failed to generate for shot ${shot.id}`, e);
        if (onApiKeyError && onApiKeyError(e)) {
          setBatchProgress(null);
          return;
        }
      }
    }

    setBatchProgress(null);
  };

  /**
   * 保存编辑内容
   */
  const handleSaveEdit = () => {
    if (!editModal || !activeShot) return;
    
    switch (editModal.type) {
      case 'action':
        updateShot(activeShot.id, (s) => ({ ...s, actionSummary: editModal.value }));
        break;
      case 'keyframe':
        updateShot(activeShot.id, (s) => ({
          ...s,
          keyframes: s.keyframes?.map(kf => 
            kf.type === editModal.frameType 
              ? { ...kf, visualPrompt: editModal.value }
              : kf
          ) || []
        }));
        break;
      case 'video':
        updateShot(activeShot.id, (s) => ({
          ...s,
          interval: s.interval ? { ...s.interval, videoPrompt: editModal.value } : undefined
        }));
        break;
    }
    
    setEditModal(null);
  };

  /**
   * AI生成动作建议
   */
  const handleGenerateAIAction = async () => {
    if (!activeShot) return;
    
    const startKf = activeShot.keyframes?.find(k => k.type === 'start');
    const endKf = activeShot.keyframes?.find(k => k.type === 'end');
    
    // 检查是否有首帧和尾帧
    if (!startKf?.visualPrompt && !endKf?.visualPrompt) {
      alert('请先生成或编辑首帧和尾帧的提示词，以便AI更好地理解场景');
      return;
    }
    
    setIsAIGenerating(true);
    
    try {
      const startPrompt = startKf?.visualPrompt || activeShot.actionSummary || '未定义的起始场景';
      const endPrompt = endKf?.visualPrompt || activeShot.actionSummary || '未定义的结束场景';
      const cameraMovement = activeShot.cameraMovement || '平移';
      
      const suggestion = await generateActionSuggestion(
        startPrompt,
        endPrompt,
        cameraMovement
      );
      
      // 更新编辑框的内容
      if (editModal && editModal.type === 'action') {
        setEditModal({ ...editModal, value: suggestion });
      }
    } catch (e: any) {
      console.error('AI动作生成失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      alert(`AI动作生成失败: ${e.message}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // 空状态
  if (!project.shots.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-[#121212]">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50"/>
        <p>暂无镜头数据，请先返回阶段 1 生成分镜表。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#121212] relative overflow-hidden">
      
      {/* Batch Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
          <h3 className="text-xl font-bold text-white mb-2">{batchProgress.message}</h3>
          <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300" 
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-zinc-500 mt-3 text-xs font-mono">
            {Math.round((batchProgress.current / batchProgress.total) * 100)}%
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-zinc-800 bg-[#1A1A1A] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-indigo-500" />
            导演工作台
            <span className="text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded">
              Director Workbench
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 mr-4 font-mono">
            {project.shots.filter(s => s.interval?.videoUrl).length} / {project.shots.length} 完成
          </span>
          <button 
            onClick={handleBatchGenerateImages}
            disabled={!!batchProgress}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
              allStartFramesGenerated
                ? 'bg-[#141414] text-zinc-400 border border-zinc-700 hover:text-white hover:border-zinc-500'
                : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/5'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {allStartFramesGenerated ? '重新生成所有首帧' : '批量生成首帧'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Grid View */}
        <div className={`flex-1 overflow-y-auto p-6 transition-all duration-500 ease-in-out ${activeShotId ? 'border-r border-zinc-800' : ''}`}>
          <div className={`grid gap-4 ${activeShotId ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
            {project.shots.map((shot, idx) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={idx}
                isActive={activeShotId === shot.id}
                onClick={() => setActiveShotId(shot.id)}
              />
            ))}
          </div>
        </div>

        {/* Workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={activeShotIndex}
            totalShots={project.shots.length}
            scriptData={project.scriptData}
            onClose={() => setActiveShotId(null)}
            onPrevious={() => setActiveShotId(project.shots[activeShotIndex - 1].id)}
            onNext={() => setActiveShotId(project.shots[activeShotIndex + 1].id)}
            onEditActionSummary={() => setEditModal({ type: 'action', value: activeShot.actionSummary })}
            onAddCharacter={(charId) => updateShot(activeShot.id, s => ({ ...s, characters: [...s.characters, charId] }))}
            onRemoveCharacter={(charId) => updateShot(activeShot.id, s => ({
              ...s,
              characters: s.characters.filter(id => id !== charId),
              characterVariations: Object.fromEntries(
                Object.entries(s.characterVariations || {}).filter(([k]) => k !== charId)
              )
            }))}
            onVariationChange={(charId, varId) => updateShot(activeShot.id, s => ({
              ...s,
              characterVariations: { ...(s.characterVariations || {}), [charId]: varId }
            }))}
            onGenerateKeyframe={(type) => handleGenerateKeyframe(activeShot, type)}
            onUploadKeyframe={(type) => handleUploadKeyframeImage(activeShot, type)}
            onEditKeyframePrompt={(type, prompt) => setEditModal({ type: 'keyframe', value: prompt, frameType: type })}
            onCopyPreviousEndFrame={handleCopyPreviousEndFrame}
            onGenerateVideo={() => handleGenerateVideo(activeShot)}
            onModelChange={(model) => updateShot(activeShot.id, s => ({ ...s, videoModel: model }))}
            onEditVideoPrompt={() => setEditModal({ 
              type: 'video', 
              value: activeShot.interval?.videoPrompt || '' 
            })}
            onImageClick={(url, title) => setPreviewImage({ url, title })}
          />
        )}
      </div>

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        onSave={handleSaveEdit}
        title={
          editModal?.type === 'action' ? '编辑叙事动作' :
          editModal?.type === 'keyframe' ? '编辑关键帧提示词' :
          '编辑视频提示词'
        }
        icon={
          editModal?.type === 'action' ? <Film className="w-4 h-4 text-indigo-400" /> :
          editModal?.type === 'keyframe' ? <Edit2 className="w-4 h-4 text-indigo-400" /> :
          <VideoIcon className="w-4 h-4 text-indigo-400" />
        }
        value={editModal?.value || ''}
        onChange={(value) => setEditModal(editModal ? { ...editModal, value } : null)}
        placeholder={
          editModal?.type === 'action' ? '描述镜头的动作和内容...' :
          editModal?.type === 'keyframe' ? '输入关键帧的提示词...' :
          '输入视频生成的提示词...'
        }
        textareaClassName={editModal?.type === 'keyframe' || editModal?.type === 'video' ? 'font-mono' : 'font-normal'}
        showAIGenerate={editModal?.type === 'action'}
        onAIGenerate={handleGenerateAIAction}
        isAIGenerating={isAIGenerating}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage?.url || null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

export default StageDirector;
