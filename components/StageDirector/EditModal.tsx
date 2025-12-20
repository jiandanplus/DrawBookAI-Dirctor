import React from 'react';
import { X, Edit2, Check, Sparkles, Loader2 } from 'lucide-react';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textareaClassName?: string;
  // AI生成功能相关
  showAIGenerate?: boolean;
  onAIGenerate?: () => Promise<void>;
  isAIGenerating?: boolean;
}

const EditModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  title,
  icon,
  value,
  onChange,
  placeholder = '输入内容...',
  textareaClassName = 'font-normal',
  showAIGenerate = false,
  onAIGenerate,
  isAIGenerating = false
}) => {
  if (!isOpen) return null;

  const handleAIGenerate = async () => {
    if (onAIGenerate && !isAIGenerating) {
      await onAIGenerate();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#1A1A1A] border border-zinc-700 rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            {icon || <Edit2 className="w-4 h-4 text-indigo-400" />}
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* AI生成按钮 */}
        {showAIGenerate && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAIGenerate}
              disabled={isAIGenerating}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                isAIGenerating
                  ? 'bg-indigo-600/50 text-white cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              {isAIGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI正在生成动作建议...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI生成动作建议
                </>
              )}
            </button>
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-64 bg-black text-white border border-zinc-700 rounded-lg p-4 text-sm outline-none focus:border-indigo-500 transition-colors resize-none ${textareaClassName}`}
          placeholder={placeholder}
          autoFocus
          disabled={isAIGenerating}
        />
        
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={isAIGenerating}
            className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-500 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
