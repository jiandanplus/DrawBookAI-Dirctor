import React, { useState, useEffect } from 'react';
import { Users, Sparkles, RefreshCw, Loader2, MapPin } from 'lucide-react';
import { ProjectState, CharacterVariation, Character, Scene } from '../../types';
import { generateImage, generateVisualPrompts } from '../../services/geminiService';
import { 
  getRegionalPrefix, 
  handleImageUpload, 
  getProjectLanguage, 
  getProjectVisualStyle,
  delay,
  generateId,
  compareIds 
} from './utils';
import { DEFAULTS, STYLES, GRID_LAYOUTS } from './constants';
import ImagePreviewModal from './ImagePreviewModal';
import CharacterCard from './CharacterCard';
import SceneCard from './SceneCard';
import WardrobeModal from './WardrobeModal';
import { useAlert } from '../GlobalAlert';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: any) => boolean;
}

const StageAssets: React.FC<Props> = ({ project, updateProject, onApiKeyError }) => {
  const { showAlert } = useAlert();
  const [batchProgress, setBatchProgress] = useState<{current: number, total: number} | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 获取项目配置
  const language = getProjectLanguage(project.language, project.scriptData?.language);
  const visualStyle = getProjectVisualStyle(project.visualStyle, project.scriptData?.visualStyle);
  const genre = project.scriptData?.genre || DEFAULTS.genre;

  /**
   * 组件加载时，检测并重置卡住的生成状态
   * 解决关闭页面后重新打开时，状态仍为"generating"导致无法重新生成的问题
   */
  useEffect(() => {
    if (!project.scriptData) return;

    const hasStuckCharacters = project.scriptData.characters.some(char => {
      // 检查角色本身是否卡住
      const isCharStuck = char.status === 'generating' && !char.referenceImage;
      // 检查角色变体是否卡住
      const hasStuckVariations = char.variations?.some(v => v.status === 'generating' && !v.referenceImage);
      return isCharStuck || hasStuckVariations;
    });

    const hasStuckScenes = project.scriptData.scenes.some(scene => 
      scene.status === 'generating' && !scene.referenceImage
    );

    if (hasStuckCharacters || hasStuckScenes) {
      console.log('🔧 检测到卡住的生成状态，正在重置...');
      const newData = { ...project.scriptData };
      
      // 重置角色状态
      newData.characters = newData.characters.map(char => ({
        ...char,
        status: char.status === 'generating' && !char.referenceImage ? 'failed' as const : char.status,
        variations: char.variations?.map(v => ({
          ...v,
          status: v.status === 'generating' && !v.referenceImage ? 'failed' as const : v.status
        }))
      }));
      
      // 重置场景状态
      newData.scenes = newData.scenes.map(scene => ({
        ...scene,
        status: scene.status === 'generating' && !scene.referenceImage ? 'failed' as const : scene.status
      }));
      
      updateProject({ scriptData: newData });
    }
  }, [project.id]); // 仅在项目ID变化时运行，避免重复执行

  /**
   * 生成资源（角色或场景）
   */
  const handleGenerateAsset = async (type: 'character' | 'scene', id: string) => {
    // 设置生成状态
    if (project.scriptData) {
      const newData = { ...project.scriptData };
      if (type === 'character') {
        const c = newData.characters.find(c => compareIds(c.id, id));
        if (c) c.status = 'generating';
      } else {
        const s = newData.scenes.find(s => compareIds(s.id, id));
        if (s) s.status = 'generating';
      }
      updateProject({ scriptData: newData });
    }
    try {
      let prompt = "";
      
      if (type === 'character') {
        const char = project.scriptData?.characters.find(c => compareIds(c.id, id));
        if (char) {
          if (char.visualPrompt) {
            prompt = char.visualPrompt;
          } else {
            const prompts = await generateVisualPrompts('character', char, genre, DEFAULTS.modelVersion, visualStyle, language);
            prompt = prompts.visualPrompt;
            
            // 保存生成的提示词
            if (project.scriptData) {
              const newData = { ...project.scriptData };
              const c = newData.characters.find(c => compareIds(c.id, id));
              if (c) {
                c.visualPrompt = prompts.visualPrompt;
                c.negativePrompt = prompts.negativePrompt;
              }
              updateProject({ scriptData: newData });
            }
          }
        }
      } else {
        const scene = project.scriptData?.scenes.find(s => compareIds(s.id, id));
        if (scene) {
          if (scene.visualPrompt) {
            prompt = scene.visualPrompt;
          } else {
            const prompts = await generateVisualPrompts('scene', scene, genre, DEFAULTS.modelVersion, visualStyle, language);
            prompt = prompts.visualPrompt;
            
            // 保存生成的提示词
            if (project.scriptData) {
              const newData = { ...project.scriptData };
              const s = newData.scenes.find(s => compareIds(s.id, id));
              if (s) {
                s.visualPrompt = prompts.visualPrompt;
                s.negativePrompt = prompts.negativePrompt;
              }
              updateProject({ scriptData: newData });
            }
          }
        }
      }

      // 添加地域特征前缀
      const regionalPrefix = getRegionalPrefix(language, type);
      const enhancedPrompt = regionalPrefix + prompt;

      // 生成图片
      const imageUrl = await generateImage(enhancedPrompt);

      // 更新状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        if (type === 'character') {
          const c = newData.characters.find(c => compareIds(c.id, id));
          if (c) {
            c.referenceImage = imageUrl;
            c.status = 'completed';
          }
        } else {
          const s = newData.scenes.find(s => compareIds(s.id, id));
          if (s) {
            s.referenceImage = imageUrl;
            s.status = 'completed';
          }
        }
        updateProject({ scriptData: newData });
      }

    } catch (e: any) {
      console.error(e);
      // 设置失败状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        if (type === 'character') {
          const c = newData.characters.find(c => compareIds(c.id, id));
          if (c) c.status = 'failed';
        } else {
          const s = newData.scenes.find(s => compareIds(s.id, id));
          if (s) s.status = 'failed';
        }
        updateProject({ scriptData: newData });
      }
      if (onApiKeyError && onApiKeyError(e)) {
        return;
      }
    }
  };

  /**
   * 批量生成资源
   */
  const handleBatchGenerate = async (type: 'character' | 'scene') => {
    const items = type === 'character' 
      ? project.scriptData?.characters 
      : project.scriptData?.scenes;
    
    if (!items) return;

    const itemsToGen = items.filter(i => !i.referenceImage);
    const isRegenerate = itemsToGen.length === 0;

    if (isRegenerate) {
      if (!window.confirm(`确定要重新生成所有${type === 'character' ? '角色' : '场景'}图吗？`)) return;
    }

    const targetItems = isRegenerate ? items : itemsToGen;
    setBatchProgress({ current: 0, total: targetItems.length });

    for (let i = 0; i < targetItems.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);
      
      await handleGenerateAsset(type, targetItems[i].id);
      setBatchProgress({ current: i + 1, total: targetItems.length });
    }

    setBatchProgress(null);
  };

  /**
   * 上传角色图片
   */
  const handleUploadCharacterImage = async (charId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const char = newData.characters.find(c => compareIds(c.id, charId));
        if (char) {
          char.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  /**
   * 上传场景图片
   */
  const handleUploadSceneImage = async (sceneId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
        if (scene) {
          scene.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  /**
   * 保存角色提示词
   */
  const handleSaveCharacterPrompt = (charId: string, newPrompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (char) {
      char.visualPrompt = newPrompt;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 更新角色基本信息
   */
  const handleUpdateCharacterInfo = (charId: string, updates: { name?: string; gender?: string; age?: string; personality?: string }) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (char) {
      if (updates.name !== undefined) char.name = updates.name;
      if (updates.gender !== undefined) char.gender = updates.gender;
      if (updates.age !== undefined) char.age = updates.age;
      if (updates.personality !== undefined) char.personality = updates.personality;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 保存场景提示词
   */
  const handleSaveScenePrompt = (sceneId: string, newPrompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
    if (scene) {
      scene.visualPrompt = newPrompt;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 更新场景基本信息
   */
  const handleUpdateSceneInfo = (sceneId: string, updates: { location?: string; time?: string; atmosphere?: string }) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const scene = newData.scenes.find(s => compareIds(s.id, sceneId));
    if (scene) {
      if (updates.location !== undefined) scene.location = updates.location;
      if (updates.time !== undefined) scene.time = updates.time;
      if (updates.atmosphere !== undefined) scene.atmosphere = updates.atmosphere;
      updateProject({ scriptData: newData });
    }
  };

  /**
   * 新建角色
   */
  const handleAddCharacter = () => {
    if (!project.scriptData) return;
    
    const newChar: Character = {
      id: generateId('char'),
      name: '新角色',
      gender: '未设定',
      age: '未设定',
      personality: '待补充',
      visualPrompt: '',
      variations: [],
      status: 'pending'
    };

    const newData = { ...project.scriptData };
    newData.characters.push(newChar);
    updateProject({ scriptData: newData });
    showAlert('新角色已创建，请编辑提示词并生成图片', { type: 'success' });
  };

  /**
   * 删除角色
   */
  const handleDeleteCharacter = (charId: string) => {
    if (!project.scriptData) return;
    const char = project.scriptData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;

    showAlert(
      `确定要删除角色 "${char.name}" 吗？\n\n注意：这将会影响所有使用该角色的分镜，可能导致分镜关联错误。`,
      {
        type: 'warning',
        title: '删除角色',
        showCancel: true,
        confirmText: '删除',
        cancelText: '取消',
        onConfirm: () => {
          const newData = { ...project.scriptData! };
          newData.characters = newData.characters.filter(c => !compareIds(c.id, charId));
          updateProject({ scriptData: newData });
          showAlert(`角色 "${char.name}" 已删除`, { type: 'success' });
        }
      }
    );
  };

  /**
   * 新建场景
   */
  const handleAddScene = () => {
    if (!project.scriptData) return;
    
    const newScene: Scene = {
      id: generateId('scene'),
      location: '新场景',
      time: '未设定',
      atmosphere: '待补充',
      visualPrompt: '',
      status: 'pending'
    };

    const newData = { ...project.scriptData };
    newData.scenes.push(newScene);
    updateProject({ scriptData: newData });
    showAlert('新场景已创建，请编辑提示词并生成图片', { type: 'success' });
  };

  /**
   * 删除场景
   */
  const handleDeleteScene = (sceneId: string) => {
    if (!project.scriptData) return;
    const scene = project.scriptData.scenes.find(s => compareIds(s.id, sceneId));
    if (!scene) return;

    showAlert(
      `确定要删除场景 "${scene.location}" 吗？\n\n注意：这将会影响所有使用该场景的分镜，可能导致分镜关联错误。`,
      {
        type: 'warning',
        title: '删除场景',
        showCancel: true,
        confirmText: '删除',
        cancelText: '取消',
        onConfirm: () => {
          const newData = { ...project.scriptData! };
          newData.scenes = newData.scenes.filter(s => !compareIds(s.id, sceneId));
          updateProject({ scriptData: newData });
          showAlert(`场景 "${scene.location}" 已删除`, { type: 'success' });
        }
      }
    );
  };

  /**
   * 添加角色变体
   */
  const handleAddVariation = (charId: string, name: string, prompt: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;

    const newVar: CharacterVariation = {
      id: generateId('var'),
      name: name || "New Outfit",
      visualPrompt: prompt || char.visualPrompt || "",
      referenceImage: undefined
    };

    if (!char.variations) char.variations = [];
    char.variations.push(newVar);
    
    updateProject({ scriptData: newData });
  };

  /**
   * 删除角色变体
   */
  const handleDeleteVariation = (charId: string, varId: string) => {
    if (!project.scriptData) return;
    const newData = { ...project.scriptData };
    const char = newData.characters.find(c => compareIds(c.id, charId));
    if (!char) return;
    
    char.variations = char.variations?.filter(v => !compareIds(v.id, varId));
    updateProject({ scriptData: newData });
  };

  /**
   * 生成角色变体
   */
  const handleGenerateVariation = async (charId: string, varId: string) => {
    const char = project.scriptData?.characters.find(c => compareIds(c.id, charId));
    const variation = char?.variations?.find(v => compareIds(v.id, varId));
    if (!char || !variation) return;

    // 设置生成状态
    if (project.scriptData) {
      const newData = { ...project.scriptData };
      const c = newData.characters.find(c => compareIds(c.id, charId));
      const v = c?.variations?.find(v => compareIds(v.id, varId));
      if (v) v.status = 'generating';
      updateProject({ scriptData: newData });
    }
    try {
      const refImages = char.referenceImage ? [char.referenceImage] : [];
      const regionalPrefix = getRegionalPrefix(language, 'character');
      const enhancedPrompt = `${regionalPrefix}Character: ${char.name}. ${variation.visualPrompt}. Keep facial features consistent with reference.`;
      
      const imageUrl = await generateImage(enhancedPrompt, refImages);

      const newData = { ...project.scriptData! };
      const c = newData.characters.find(c => compareIds(c.id, charId));
      const v = c?.variations?.find(v => compareIds(v.id, varId));
      if (v) {
        v.referenceImage = imageUrl;
        v.status = 'completed';
      }

      updateProject({ scriptData: newData });
    } catch (e: any) {
      console.error(e);
      // 设置失败状态
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const c = newData.characters.find(c => compareIds(c.id, charId));
        const v = c?.variations?.find(v => compareIds(v.id, varId));
        if (v) v.status = 'failed';
        updateProject({ scriptData: newData });
      }
      if (onApiKeyError && onApiKeyError(e)) {
        return;
      }
      showAlert("Variation generation failed", { type: 'error' });
    }
  };

  /**
   * 上传角色变体图片
   */
  const handleUploadVariationImage = async (charId: string, varId: string, file: File) => {
    try {
      const base64 = await handleImageUpload(file);
      
      if (project.scriptData) {
        const newData = { ...project.scriptData };
        const char = newData.characters.find(c => compareIds(c.id, charId));
        const variation = char?.variations?.find(v => compareIds(v.id, varId));
        if (variation) {
          variation.referenceImage = base64;
        }
        updateProject({ scriptData: newData });
      }
    } catch (e: any) {
      showAlert(e.message, { type: 'error' });
    }
  };

  // 空状态
  if (!project.scriptData) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#121212] text-zinc-500">
        <p>请先完成 Phase 01 剧本分析</p>
      </div>
    );
  }
  
  const allCharactersReady = project.scriptData.characters.every(c => c.referenceImage);
  const allScenesReady = project.scriptData.scenes.every(s => s.referenceImage);
  const selectedChar = project.scriptData.characters.find(c => compareIds(c.id, selectedCharId));

  return (
    <div className={STYLES.mainContainer}>
      
      {/* Image Preview Modal */}
      <ImagePreviewModal 
        imageUrl={previewImage} 
        onClose={() => setPreviewImage(null)} 
      />

      {/* Global Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
          <h3 className="text-xl font-bold text-white mb-2">正在批量生成资源...</h3>
          <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300" 
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-zinc-400 font-mono text-xs">
            进度: {batchProgress.current} / {batchProgress.total}
          </p>
        </div>
      )}

      {/* Wardrobe Modal */}
      {selectedChar && (
        <WardrobeModal
          character={selectedChar}
          onClose={() => setSelectedCharId(null)}
          onAddVariation={handleAddVariation}
          onDeleteVariation={handleDeleteVariation}
          onGenerateVariation={handleGenerateVariation}
          onUploadVariation={handleUploadVariationImage}
          onImageClick={setPreviewImage}
        />
      )}

      {/* Header */}
      <div className={STYLES.header}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-500" />
            角色与场景
            <span className="text-xs text-zinc-600 font-mono font-normal uppercase tracking-wider bg-black/30 px-2 py-1 rounded">
              Assets & Casting
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className={STYLES.badge}>
              {project.scriptData.characters.length} CHARS
            </span>
            <span className={STYLES.badge}>
              {project.scriptData.scenes.length} SCENES
            </span>
          </div>
        </div>
      </div>

      <div className={STYLES.content}>
        {/* Characters Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                角色定妆 (Casting)
              </h3>
              <p className="text-xs text-zinc-500 mt-1 pl-3.5">为剧本中的角色生成一致的参考形象</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAddCharacter}
                disabled={!!batchProgress}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Users className="w-3 h-3" />
                新建角色
              </button>
              <button 
                onClick={() => handleBatchGenerate('character')}
                disabled={!!batchProgress}
                className={allCharactersReady ? STYLES.secondaryButton : STYLES.primaryButton}
              >
                {allCharactersReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {allCharactersReady ? '重新生成所有角色' : '一键生成所有角色'}
              </button>
            </div>
          </div>

          <div className={GRID_LAYOUTS.cards}>
            {project.scriptData.characters.map((char) => (
              <CharacterCard
                key={char.id}
                character={char}
                isGenerating={char.status === 'generating'}
                onGenerate={() => handleGenerateAsset('character', char.id)}
                onUpload={(file) => handleUploadCharacterImage(char.id, file)}
                onPromptSave={(newPrompt) => handleSaveCharacterPrompt(char.id, newPrompt)}
                onOpenWardrobe={() => setSelectedCharId(char.id)}
                onImageClick={setPreviewImage}
                onDelete={() => handleDeleteCharacter(char.id)}
                onUpdateInfo={(updates) => handleUpdateCharacterInfo(char.id, updates)}
              />
            ))}
          </div>
        </section>

        {/* Scenes Section */}
        <section>
          <div className="flex items-end justify-between mb-6 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                场景概念 (Locations)
              </h3>
              <p className="text-xs text-zinc-500 mt-1 pl-3.5">为剧本场景生成环境参考图</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAddScene}
                disabled={!!batchProgress}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <MapPin className="w-3 h-3" />
                新建场景
              </button>
              <button 
                onClick={() => handleBatchGenerate('scene')}
                disabled={!!batchProgress}
                className={allScenesReady ? STYLES.secondaryButton : STYLES.primaryButton}
              >
                {allScenesReady ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {allScenesReady ? '重新生成所有场景' : '一键生成所有场景'}
              </button>
            </div>
          </div>

          <div className={GRID_LAYOUTS.cards}>
            {project.scriptData.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isGenerating={scene.status === 'generating'}
                onGenerate={() => handleGenerateAsset('scene', scene.id)}
                onUpload={(file) => handleUploadSceneImage(scene.id, file)}
                onPromptSave={(newPrompt) => handleSaveScenePrompt(scene.id, newPrompt)}
                onImageClick={setPreviewImage}
                onDelete={() => handleDeleteScene(scene.id)}
                onUpdateInfo={(updates) => handleUpdateSceneInfo(scene.id, updates)}
              />
            ))}
          </div>
        </section>
      </div>

    </div>
  );
};

export default StageAssets;
