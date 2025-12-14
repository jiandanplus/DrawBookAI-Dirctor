// 全局变量
let currentFramePrompts = []; // 存储图片提示词
let generatedImages = []; // 存储生成的图片
let videoPrompts = []; // 存储视频提示词
let generatedVideos = []; // 存储生成的视频
let videoPromptStatus = []; // 存储视频提示词生成状态
let videoLastFrames = []; // 存储每段视频的最后一帧（用于下一段视频的首帧）
let currentStyleText = '';
let currentStylePreference = '';
let extractedCharacters = []; // 存储提取的角色信息
let characterDescriptionText = ''; // 存储角色描述的完整文本
let uploadedImages = []; // 存储上传的角色参考图
const MAX_IMAGES = 3; // 最多上传3张图片
let lastCharacterImage = null; // 记录最近一次生成的角色设定图（用于展示/复用）
let generatedNarration = ''; // 存储生成的剧情解说文案

// AI生成剧本
async function generateScriptFromIdea() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const idea = document.getElementById('scriptIdea').value.trim();
    const model = document.getElementById('modelSelect').value;
    const styleSelect = document.getElementById('styleSelect');
    const styleKey = styleSelect ? styleSelect.value : 'kawaii';
    const customStyleInput = document.getElementById('customStyle');
    const customStyle = customStyleInput ? customStyleInput.value.trim() : '';
    const stylePreferenceInput = document.getElementById('stylePreference');
    const stylePreference = stylePreferenceInput ? stylePreferenceInput.value.trim() : '';
    const styleText = getStyleText(styleKey, customStyle, stylePreference);
    const btn = document.getElementById('generateScriptBtn');
    const scriptTextarea = document.getElementById('script');
    
    if (!apiKey) {
        showError('请先输入 API 密钥');
        return;
    }
    
    if (!idea) {
        showError('请先输入您的剧本创意想法');
        return;
    }
    
    // 判断是否为真人风格
    const isRealistic = styleText && (styleText.includes('真人') || styleText.includes('写实') || styleText.includes('摄影'));
    
    btn.disabled = true;
    btn.textContent = '🤖 AI正在创作...';
    hideError();
    
    try {
        const frameCount = parseInt(document.getElementById('frameCount').value);
        
        const prompt = `你是一个专业的${isRealistic ? '影视' : '动漫'}编剧。请根据用户的创意想法，创作一个完整的${isRealistic ? '影视' : '视频漫剧'}剧本。

用户创意：
${idea}

风格设定：${styleText}

剧本要求：
1. 剧本需要适合拆分成 ${frameCount} 个连续的关键场景/镜头
2. 每个场景都要有清晰的视觉描述（场景、人物、动作、表情）
3. ${isRealistic ? '使用真人影视的叙述方式，注重人物特征、服装、环境的具体描述' : '使用动漫风格的叙述方式，注重画面感和情绪表达'}
4. 场景之间要有自然的过渡和连贯性
5. 可以包含对话或旁白，增强故事性
6. 剧本长度适中，能够清晰展现故事的起承转合
7. ${isRealistic ? '角色描述要具体（如：25岁亚洲女性，黑色长发，白色衬衫，黑色西裤）' : '角色设定要明确（外貌、服装、性格特点）'}

输出格式：
直接输出剧本内容，用自然的段落描述每个场景，不需要特殊格式标记。
每个场景用换行分隔，重点描述画面、人物、动作、氛围，让读者能想象出具体的视觉效果。

现在，请根据以上要求创作剧本：`;
        
        const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 2000
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || `API 请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        const generatedScript = data.choices?.[0]?.message?.content;
        
        if (!generatedScript) {
            throw new Error('AI 未返回剧本内容');
        }
        
        // 将生成的剧本填入剧本输入框
        scriptTextarea.value = generatedScript.trim();
        
        // 显示成功提示
        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.style.marginTop = '10px';
        successMsg.innerHTML = '<p style="margin: 0;">✅ 剧本已生成！您可以在下方编辑修改后再生成分镜。</p>';
        scriptTextarea.parentElement.appendChild(successMsg);
        
        setTimeout(() => {
            successMsg.remove();
        }, 5000);
        
        // 滚动到剧本输入框
        scriptTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
    } catch (err) {
        console.error('生成剧本失败:', err);
        showError(`生成剧本失败: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI生成剧本';
    }
}

// 避免“后台分镜生成”覆盖用户重新生成角色后的状态（用于丢弃过期结果）
let promptGenerationToken = 0;

// 视频台词去重：避免不同段落重复念同一句
let usedVideoDialogues = []; // 按顺序记录已用于视频段落的台词（去重前的来源）
let usedVideoDialogueSet = new Set(); // 用于快速判断重复

function normalizeDialogue(text) {
    if (!text) return '';
    return String(text)
        .replace(/["“”]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[，。！？、,.!?]/g, '')
        .trim();
}

function pickUniqueDialogueForPair(frameADialogue, frameBDialogue) {
    const candidates = [frameBDialogue, frameADialogue]
        .map(t => (t || '').trim())
        .filter(Boolean);

    for (const c of candidates) {
        const n = normalizeDialogue(c);
        if (!n) continue;
        if (!usedVideoDialogueSet.has(n)) return c;
    }
    return ''; // 找不到新的台词就留空，避免重复
}

function buildCompactVideoPrompt({ pairIndex, frameA, frameB, transition, dialogue, sound }) {
    const isRealistic = currentStyleText && (currentStyleText.includes('真人') || currentStyleText.includes('写实') || currentStyleText.includes('摄影'));
    const motionNote = isRealistic
        ? '镜头语言真实自然（推拉摇移/跟拍/景别变化），人物表演克制可信'
        : '镜头运动自然顺滑（轻微推拉/摇移/跟随），动作连贯有节奏';

    const dialogueLine = (dialogue || '').trim();
    const hasDialogue = !!normalizeDialogue(dialogueLine);

    // 目标：短、每段不同、只包含本段新增信息
    return [
        `段落${pairIndex + 1}（10秒，16:9横屏）：从"第${frameA.index}帧"平滑过渡到"第${frameB.index}帧"。`,
        `起始画面：${(frameA.scene || '').trim()}；结束画面：${(frameB.scene || '').trim()}。`,
        `过渡：${(transition || '').trim() || '动作/机位自然衔接，保持场景、光影与风格连续。'}`,
        hasDialogue ? `对白/旁白（本段仅此一句，不要重复其他段落台词）："${dialogueLine.replace(/["""]/g, '').trim()}"` : '对白/旁白：无（本段仅环境音与氛围）。',
        `音效/配乐：${(sound || '').trim() || '根据场景给出环境音与轻配乐，避免喧宾夺主。'}`,
        `一致性：人物外貌与服装完全不变；画面禁止出现任何英文/拼音/混合语言可见文字；整体风格：${currentStyleText || '二次元动漫风格'}${currentStylePreference ? `；偏好：${currentStylePreference}` : ''}。`,
        `镜头：${motionNote}。`,
        `画面比例：16:9横屏（Landscape宽屏格式）。`
    ]
        .filter(Boolean)
        .join('\n');
}

const STYLE_MAP = {
    kawaii: '日系萌系，粉色系，梦幻可爱，Q版精致，高光柔焦',
    shonen: '少年热血，动感张力，强对比光影，鲜艳饱和，战斗感',
    shoujo: '少女浪漫，柔和粉彩，细腻线条，光晕梦幻，唯美情绪',
    fantasy: '奇幻冒险，魔法元素，光效粒子，宏大场景，异世界感',
    'slice-of-life': '日常治愈，柔和暖色，干净线条，温馨生活感，低对比',
    cyberpunk: '赛博朋克，霓虹高对比，冷暖撞色，未来都市，金属质感',
    wuxia: '国风武侠，江湖意境，水墨/国风色彩，侠义感，飘带衣袂',
    xianxia: '国风仙侠，仙气飘渺，淡彩流光，御剑飞行，云雾氛围',
    guofeng: '国风古韵，古装美学，雅致配色，传统纹样，柔和光影',
    urban: '都市潮流，街拍纪实，霓虹街景，摩登时尚，现实光影',
    vintage: '复古胶片，颗粒质感，褪色色彩，老电影构图，怀旧氛围',
    scifi: '科幻未来，硬朗机械，冷色调，星际场景，科技细节',
    'dark-fantasy': '暗黑奇幻，哥特氛围，低饱和，戏剧性光影，神秘压迫感',
    realistic: '真人写实，超高清摄影，自然光影，细腻肤质，真实人物，电影质感',
    'cinematic-realism': '电影写实，专业摄影，深景深，胶片质感，戏剧化光影，真人演绎',
    'fashion-portrait': '时尚写真，高级摄影，柔和打光，精致妆容，真人模特，杂志风格',
    'documentary': '纪实风格，自然抓拍，真实场景，生活化光线，真人纪录，街头摄影',
    'dramatic-realism': '戏剧写实，强烈光影对比，真人表演，情绪张力，舞台感，艺术摄影'
};

function getStyleText(styleKey, customStyle, stylePreference) {
    let base = STYLE_MAP[styleKey] || STYLE_MAP.kawaii;
    if (styleKey === 'custom' && customStyle) {
        base = customStyle;
    }
    if (stylePreference) {
        // “偏好”通常是用户想强制/优先满足的内容，因此用更强的措辞，避免被基础风格描述覆盖
        base += `，以用户偏好为准：${stylePreference}`;
    }
    return base;
}

// 页面加载时从 localStorage 读取 API Key
window.addEventListener('DOMContentLoaded', function() {
    const savedApiKey = localStorage.getItem('gemini_api_key');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }

    const styleSelect = document.getElementById('styleSelect');
    if (styleSelect) {
        styleSelect.addEventListener('change', function() {
            const customGroup = document.getElementById('customStyleGroup');
            if (customGroup) {
                customGroup.style.display = this.value === 'custom' ? 'block' : 'none';
            }
        });
    }
    
    // 初始化拖拽和粘贴功能
    initDragAndPaste();
    
    // 初始化按钮文字
    updateGenerateButtonText();
});

// 初始化拖拽和粘贴上传功能
function initDragAndPaste() {
    const uploadArea = document.getElementById('uploadArea');
    if (!uploadArea) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('drag-over');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('drag-over');
        });
    });
    
    uploadArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleMultipleImageFiles(files);
        }
    });
    
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImageFile(file);
                break;
            }
        }
    });
}

function handleImageUpload(input) {
    const files = input.files;
    if (files && files.length > 0) {
        handleMultipleImageFiles(Array.from(files));
    } else {
        clearImagePreview();
    }
}

function handleMultipleImageFiles(files) {
    if (uploadedImages.length + files.length > MAX_IMAGES) {
        alert(`最多只能上传 ${MAX_IMAGES} 张图片`);
        return;
    }
    
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            continue;
        }
    }
    
    files.forEach(file => handleImageFile(file));
}

function handleImageFile(file) {
    if (uploadedImages.length >= MAX_IMAGES) {
        alert(`最多只能上传 ${MAX_IMAGES} 张图片`);
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        alert('请上传图片文件');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedImages.push({
            dataUrl: e.target.result,
            name: file.name
        });
        updateImagePreview();
    };
    reader.readAsDataURL(file);
}

function updateImagePreview() {
    const previewDiv = document.getElementById('imagePreviewInput');
    const uploadArea = document.getElementById('uploadArea');
    
    // 更新按钮文字
    updateGenerateButtonText();
    
    if (uploadedImages.length === 0) {
        previewDiv.innerHTML = '';
        if (uploadArea) uploadArea.style.display = 'block';
        return;
    }
    
    if (uploadedImages.length >= MAX_IMAGES) {
        if (uploadArea) uploadArea.style.display = 'none';
    } else {
        if (uploadArea) uploadArea.style.display = 'block';
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">';
    uploadedImages.forEach((img, index) => {
        const borderColor = img.isGenerated ? '#10b981' : '#FF69B4';
        const badge = img.isGenerated ? '<span style="position: absolute; top: 5px; left: 5px; background: rgba(16,185,129,0.9); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; font-weight: 600;">AI生成</span>' : '';
        html += `
            <div style="position: relative; border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
                <img src="${img.dataUrl}" style="width: 100%; height: 150px; object-fit: cover;">
                ${badge}
                <button onclick="removeImage(${index})" style="position: absolute; top: 5px; right: 5px; background: rgba(255,0,0,0.8); color: white; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-size: 16px; line-height: 1;">×</button>
            </div>
        `;
    });
    html += '</div>';
    html += `<p style="color: #999; font-size: 0.9em; margin-top: 10px; text-align: center;">已上传 ${uploadedImages.length}/${MAX_IMAGES} 张</p>`;
    
    previewDiv.innerHTML = html;
}

// 更新生成按钮文字（根据是否上传了参考图）
function updateGenerateButtonText() {
    const btnText = document.getElementById('generatePromptsBtnText');
    if (!btnText) return;
    
    const hasUploadedImages = uploadedImages.length > 0;
    if (hasUploadedImages) {
        btnText.textContent = '🚀 使用参考图开始生成';
    } else {
        btnText.textContent = '🚀 AI生成角色设定图';
    }
}

function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreview();
}

function clearImagePreview() {
    uploadedImages = [];
    const previewDiv = document.getElementById('imagePreviewInput');
    const fileInput = document.getElementById('imageFile');
    const uploadArea = document.getElementById('uploadArea');
    if (previewDiv) previewDiv.innerHTML = '';
    if (fileInput) fileInput.value = '';
    if (uploadArea) uploadArea.style.display = 'block';
}

// 将生成的角色设定图添加到上传区域
function addCharacterImageToUploadArea(characterImage) {
    if (!characterImage || !characterImage.image) return;
    
    // 构建完整的 data URL
    const dataUrl = `data:${characterImage.image.mimeType};base64,${characterImage.image.base64}`;
    
    // 添加到 uploadedImages 数组（如果未达到最大数量）
    if (uploadedImages.length < MAX_IMAGES) {
        uploadedImages.push({
            dataUrl: dataUrl,
            name: 'AI生成-角色设定图.png',
            isGenerated: true // 标记为AI生成的图片
        });
        
        // 更新预览
        updateImagePreview();
    }
}

// 替换/插入 AI 生成的角色设定图（避免占用用户上传名额时不断叠加）
function upsertGeneratedCharacterImage(characterImage) {
    if (!characterImage || !characterImage.image) return;

    const dataUrl = `data:${characterImage.image.mimeType};base64,${characterImage.image.base64}`;
    const idx = uploadedImages.findIndex(img => img && img.isGenerated);

    if (idx >= 0) {
        uploadedImages[idx] = {
            ...uploadedImages[idx],
            dataUrl,
            name: 'AI生成-角色设定图.png',
            isGenerated: true
        };
        updateImagePreview();
        return;
    }

    if (uploadedImages.length < MAX_IMAGES) {
        uploadedImages.push({
            dataUrl,
            name: 'AI生成-角色设定图.png',
            isGenerated: true
        });
        updateImagePreview();
        return;
    }

    // 没有空位且未找到旧的AI图：不强行覆盖用户图，但仍然会在右侧角色信息里展示
    alert(`已上传满 ${MAX_IMAGES} 张参考图，无法加入AI角色设定图。请先删除一张参考图后重试。`);
}

function parseCharactersFromText(fullText) {
    const text = (fullText || '').trim();
    if (!text) return [];

    // 兼容：既支持 <character> 分隔，也支持只有一段文本
    const blocks = text
        .split(/<character>/i)
        .map(b => (b || '').trim())
        .filter(Boolean);

    const characters = [];
    blocks.forEach((block, index) => {
        const nameMatch = block.match(/【角色名称】(.+)/m);
        const name = nameMatch ? nameMatch[1].trim() : `角色${index + 1}`;
        characters.push({ name, description: block });
    });

    // 如果用户删掉了分隔符，至少保证有一个“角色”
    if (characters.length === 0 && text) {
        characters.push({ name: '角色1', description: text });
    }
    return characters;
}

// 重新生成角色设定图（不再重新提取角色；使用用户可编辑的角色文本）
async function regenerateCharacterDesignImageFromEditedText() {
    const btn = document.getElementById('regenerateCharactersBtn');
    const statusEl = document.getElementById('regenerateCharactersStatus');
    const editor = document.getElementById('characterTextEditor');

    const apiKey = document.getElementById('apiKey').value.trim();
    const script = document.getElementById('script').value.trim();
    const model = document.getElementById('modelSelect').value;

    const styleSelect = document.getElementById('styleSelect');
    const customStyleInput = document.getElementById('customStyle');
    const stylePreferenceInput = document.getElementById('stylePreference');
    const styleKey = styleSelect ? styleSelect.value : 'kawaii';
    const customStyle = customStyleInput ? customStyleInput.value.trim() : '';
    const stylePreference = stylePreferenceInput ? stylePreferenceInput.value.trim() : '';
    const styleText = getStyleText(styleKey, customStyle, stylePreference);
    // 同步全局风格，用于后续图片/视频生成一致
    currentStyleText = styleText;
    currentStylePreference = stylePreference;

    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    if (!script) {
        showError('请输入剧本内容');
        return;
    }

    // 让任何“正在后台生成的分镜提示词结果”失效（避免覆盖）
    promptGenerationToken++;

    if (btn) {
        btn.disabled = true;
        btn.textContent = '🖼️ 重新出图中...';
    }
    if (statusEl) {
        statusEl.textContent = '正在根据你修改后的角色文本重新生成角色设定图，请稍候...';
        statusEl.style.color = '#92400e';
    }
    hideError();

    try {
        const editedText = (editor ? editor.textContent : characterDescriptionText).trim();
        if (!editedText) {
            showError('角色设定文本为空，请先生成角色信息或手动填写后再出图');
            return;
        }

        const characters = parseCharactersFromText(editedText);
        extractedCharacters = characters;
        characterDescriptionText = editedText;

        // 直接复用现有的"生成角色设定图图片"逻辑：buildCharacterDesignImagePrompt + generateCharacterImage
        const isRealistic = styleText && (styleText.includes('真人') || styleText.includes('写实') || styleText.includes('摄影'));
        const imagePrompt = buildCharacterDesignImagePrompt(characters, script, editedText, styleText, isRealistic, stylePreference);
        const imageBase64 = await generateCharacterImage(apiKey, imagePrompt);

        const characterImage = {
            characters,
            characterText: editedText,
            image: imageBase64
        };
        lastCharacterImage = characterImage;

        // 替换/插入 AI 设定图到左侧参考区（不无限叠加）
        upsertGeneratedCharacterImage(characterImage);

        // 更新右侧角色信息展示
        displayCharactersInfo(characterImage);

        if (statusEl) {
            statusEl.innerHTML = '✅ 角色设定图已更新！<br><strong style="color: #dc2626;">⚠️ 重要提示：</strong>如果你已经生成过图片提示词，建议重新点击下方"🧠 生成图片提示词"按钮，以确保新的角色设定图被应用到所有分镜中。如果只是修改了角色文字描述，后续生成的漫画图片会自动使用最新的角色设定图。';
            statusEl.style.color = '#166534';
        }
    } catch (err) {
        console.error('重新生成角色失败:', err);
        showError(`重新生成角色失败: ${err.message}`);
        if (statusEl) {
            statusEl.textContent = '重新生成失败，请检查 API Key / 网络 / 模型后重试。';
            statusEl.style.color = '#dc2626';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🖼️ 根据修改重新生成设定图';
        }
    }
}

// 第一步：提取角色并生成角色设定图（不再自动生成分镜提示词）
async function generateFramePrompts() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const script = document.getElementById('script').value.trim();
    const model = document.getElementById('modelSelect').value;
    const frameCount = parseInt(document.getElementById('frameCount').value);
    const styleSelect = document.getElementById('styleSelect');
    const customStyleInput = document.getElementById('customStyle');
    const stylePreferenceInput = document.getElementById('stylePreference');
    const styleKey = styleSelect ? styleSelect.value : 'kawaii';
    const customStyle = customStyleInput ? customStyleInput.value.trim() : '';
    const stylePreference = stylePreferenceInput ? stylePreferenceInput.value.trim() : '';
    const styleText = getStyleText(styleKey, customStyle, stylePreference);
    
    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    
    if (!script) {
        showError('请输入剧本内容');
        return;
    }
    
    // 保存 API Key
    localStorage.setItem('gemini_api_key', apiKey);
    currentStyleText = styleText;
    currentStylePreference = stylePreference;
    
    // 重置之前的结果
    currentFramePrompts = [];
    generatedImages = [];
    generatedVideos = [];
    videoPrompts = [];
    videoPromptStatus = [];
    videoLastFrames = [];
    extractedCharacters = [];
    characterDescriptionText = '';
    generatedNarration = ''; // 重置解说文案
    document.getElementById('charactersInfo').style.display = 'none';
    document.getElementById('promptsResult').style.display = 'none';
    document.getElementById('completionMessage').style.display = 'none';
    // 重置解说文案区域
    const narrationContainer = document.getElementById('narrationContainer');
    if (narrationContainer) narrationContainer.style.display = 'none';
    usedVideoDialogues = [];
    usedVideoDialogueSet = new Set();
    const promptNextStep = document.getElementById('promptNextStep');
    if (promptNextStep) promptNextStep.style.display = 'none';
    const manualBtn = document.getElementById('manualGeneratePromptsBtn');
    if (manualBtn) {
        manualBtn.disabled = true;
        manualBtn.textContent = '🧠 生成图片提示词';
    }
    const framesContainer = document.getElementById('framesContainer');
    if (framesContainer) framesContainer.innerHTML = '';
    
    // 显示加载状态
    document.getElementById('defaultMessage').style.display = 'none';
    document.getElementById('loadingPrompts').style.display = 'block';
    document.getElementById('videosContainer').style.display = 'none';
    document.getElementById('generatePromptsBtn').disabled = true;
    hideError();
    
    try {
        // 检查是否已上传参考图
        const hasUploadedImages = uploadedImages.length > 0;
        
        if (hasUploadedImages) {
            // 用户已上传参考图，直接使用作为角色设定图，跳过AI生成
            document.getElementById('loadingPrompts').querySelector('p').textContent = '检测到已上传参考图，将直接使用作为角色设定图...';
            
            // 使用第一张上传的图片作为主角色设定图
            const mainReferenceImage = uploadedImages[0];
            
            // 创建简化的角色信息（不调用AI）
            extractedCharacters = [{
                name: '角色（来自参考图）',
                description: '使用用户上传的参考图作为角色设定'
            }];
            characterDescriptionText = '使用用户上传的参考图作为角色设定，后续生成将严格遵循这些参考图中的角色造型。';
            
            // 构建角色设定图对象（使用上传的第一张图片）
            const base64Data = mainReferenceImage.dataUrl.split(',')[1];
            const mimeType = mainReferenceImage.dataUrl.split(';')[0].split(':')[1];
            
            const characterImage = {
                characters: extractedCharacters,
                characterText: characterDescriptionText,
                image: {
                    base64: base64Data,
                    mimeType: mimeType
                }
            };
            lastCharacterImage = characterImage;
            
            // 显示角色信息（使用上传的参考图）
            displayCharactersInfo(characterImage);
            document.getElementById('loadingPrompts').style.display = 'none';
            
            // 提示用户可以直接生成分镜提示词
            if (promptNextStep) {
                promptNextStep.style.display = 'block';
                const successMsg = promptNextStep.querySelector('.success-message p');
                if (successMsg) {
                    successMsg.textContent = '已使用您上传的参考图作为角色设定图，节省了AI生成成本。确认无误后，点击下方按钮生成图片提示词分镜。';
                }
            }
            if (manualBtn) {
                manualBtn.disabled = false;
                manualBtn.textContent = '🧠 生成图片提示词';
            }
            
        } else {
            // 没有上传参考图，使用原有的AI生成流程
            // 步骤1: 先提取角色信息
            document.getElementById('loadingPrompts').querySelector('p').textContent = '正在分析剧本，提取角色信息...';
            const characterInfo = await extractCharactersFromScript(apiKey, script, model, styleText, stylePreference);
            extractedCharacters = characterInfo.characters;
            characterDescriptionText = characterInfo.fullText;
            
            // 步骤2: 生成角色设定图
            document.getElementById('loadingPrompts').querySelector('p').textContent = '正在生成角色设定图...';
            const characterImage = await generateCharacterDesignImage(apiKey, script, characterInfo, styleText, stylePreference);
            lastCharacterImage = characterImage;
            
            // 将生成的角色设定图添加到左侧参考区域
            // 用"替换/插入"方式，避免反复生成导致叠加
            upsertGeneratedCharacterImage(characterImage);
            
            // 立即显示角色设定图（不等待分镜提示词）
            displayCharactersInfo(characterImage);
            document.getElementById('loadingPrompts').style.display = 'none';
            
            // 提示用户手动触发分镜提示词生成
            if (promptNextStep) {
                promptNextStep.style.display = 'block';
            }
            if (manualBtn) {
                manualBtn.disabled = false;
                manualBtn.textContent = '🧠 生成图片提示词';
            }
        }

    } catch (err) {
        console.error('生成角色设定图失败:', err);
        showError(`生成角色设定图失败: ${err.message}`);
        document.getElementById('loadingPrompts').style.display = 'none';
    } finally {
        document.getElementById('generatePromptsBtn').disabled = false;
    }
}

// 第二步：手动生成图片提示词（分镜）
async function generateImagePromptsManual() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const script = document.getElementById('script').value.trim();
    const model = document.getElementById('modelSelect').value;
    const frameCount = parseInt(document.getElementById('frameCount').value);
    const styleSelect = document.getElementById('styleSelect');
    const customStyleInput = document.getElementById('customStyle');
    const stylePreferenceInput = document.getElementById('stylePreference');
    const styleKey = styleSelect ? styleSelect.value : 'kawaii';
    const customStyle = customStyleInput ? customStyleInput.value.trim() : '';
    const stylePreference = stylePreferenceInput ? stylePreferenceInput.value.trim() : '';
    const styleText = getStyleText(styleKey, customStyle, stylePreference);
    const manualBtn = document.getElementById('manualGeneratePromptsBtn');
    const loadingEl = document.getElementById('loadingPrompts');
    const framesContainer = document.getElementById('framesContainer');

    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    if (!script) {
        showError('请输入剧本内容');
        return;
    }
    if (!characterDescriptionText || !lastCharacterImage) {
        showError('请先生成角色设定图');
        return;
    }

    // 同步风格，便于后续图片一致
    currentStyleText = styleText;
    currentStylePreference = stylePreference;

    hideError();
    document.getElementById('defaultMessage').style.display = 'none';
    document.getElementById('promptsResult').style.display = 'none';
    document.getElementById('videosContainer').style.display = 'none';
    if (framesContainer) framesContainer.innerHTML = '';

    if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.querySelector('p').textContent = '正在生成图片提示词...';
    }
    if (manualBtn) {
        manualBtn.disabled = true;
        manualBtn.textContent = '🧠 正在生成...';
    }

    const myToken = ++promptGenerationToken;

    try {
        const prompts = await generateImagePrompts(apiKey, script, frameCount, model, styleText, stylePreference, characterDescriptionText, lastCharacterImage);
        if (myToken !== promptGenerationToken) return;

        currentFramePrompts = prompts;
        generatedImages = new Array(frameCount).fill(null);
        videoPrompts = new Array(frameCount - 1).fill(null);
        videoPromptStatus = new Array(frameCount - 1).fill('pending');

        displayFramePrompts(prompts);
        document.getElementById('promptsResult').style.display = 'block';

        if (manualBtn) {
            manualBtn.disabled = false;
            manualBtn.textContent = '🧠 重新生成图片提示词';
        }
    } catch (err) {
        console.error('生成图片提示词失败:', err);
        showError(`生成图片提示词失败: ${err.message}`);
        if (manualBtn) {
            manualBtn.disabled = false;
            manualBtn.textContent = '🧠 生成图片提示词';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// 提取角色信息
async function extractCharactersFromScript(apiKey, script, model, styleText, stylePreference) {
    const isRealistic = styleText && (styleText.includes('真人') || styleText.includes('写实') || styleText.includes('摄影'));
    
    // 添加用户上传图片的说明
    let referenceImageNote = '';
    if (uploadedImages.length > 0) {
        referenceImageNote = `

【重要：参考图片说明】
我在这条消息中提供了 ${uploadedImages.length} 张角色参考图片（图片在文本之前）。
请仔细分析这些图片中的角色：
- 角色的外貌特征（发型、发色、五官、体型等）
- 服装细节和配色
- 角色的整体风格和气质
- ${isRealistic ? '真实人物的细节特征' : '二次元画风特点'}

然后基于这些参考图片中的角色特征，结合剧本内容，提取角色信息。
`;
    }
    
    const prompt = `你是一个专业的${isRealistic ? '影视角色设计师' : '动漫角色设计师'}。请从下面的剧本中提取所有出现的角色信息，创建详细的角色设定说明，以便后续每一帧都能保持角色造型完全一致。${referenceImageNote}

剧本内容：
${script}

整体风格：${styleText}${stylePreference ? `；偏好：${stylePreference}` : ''}

请分析剧本，提取所有角色（主角、配角），为每个角色提供详细的外观描述：
1. 角色名称/代号
2. ${isRealistic ? '真实人物特征：年龄、性别、种族、身高体型、脸型、五官细节（眼睛、鼻子、嘴唇）、皮肤特征' : '外貌特征：发型、发色、眼睛、身高体型、脸型、肤色'}
3. ${isRealistic ? '服装搭配：具体款式、颜色、材质、配饰（每一件衣物都要详细说明）' : '服装特点：款式、颜色、配饰'}
4. 标志性特征（便于识别的独特特征）
5. 性格特点（影响表情和肢体语言）

${isRealistic ? '【重要】真人风格要求：描述要像摄影师的拍摄笔记，包含具体的人物特征细节，如"30岁亚洲女性，椭圆脸型，单眼皮，黑色直长发及肩，身高165cm，身材匀称，穿白色衬衫、黑色西裤、黑色皮鞋"。' : ''}

输出格式（每个角色用<character>分隔）：

【角色名称】名字或代号
【外貌特征】详细描述${isRealistic ? '（真人特征）' : '（动漫风格）'}
【服装】详细描述每一件衣物
【标志性特征】独特识别点
【性格】影响表情和动作的性格特点

<character>

【角色名称】角色2
...

注意：
- 至少提取1-4个主要角色
- 描述要非常具体详细，后续每帧都要用这些描述保持一致
- ${uploadedImages.length > 0 ? '如果参考图片中有角色，请优先参考图片中的角色特征' : '如果剧本未明确某些细节，请根据剧情和风格合理补充'}
- 直接输出角色设定，不要有其他说明`;

    if (uploadedImages.length > 0) {
        // 使用 Gemini 多模态 API
        const parts = [];
        
        // 先添加图片
        uploadedImages.forEach((img, index) => {
            const base64Data = img.dataUrl.split(',')[1];
            const mimeType = img.dataUrl.split(';')[0].split(':')[1];
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            });
        });
        
        // 再添加文本提示词
        parts.push({
            text: prompt
        });
        
        const response = await fetch('https://api.antsk.cn/v1beta/models/gemini-3-pro-image-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': '*/*'
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: parts
                }]
            })
        });
        
        if (!response.ok) {
            let errorMessage = `HTTP错误: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
            } catch (e) {
                const errorText = await response.text();
                if (errorText) errorMessage = errorText;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const candidates = data.candidates || [];
        if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
            const textParts = candidates[0].content.parts.filter(p => p.text);
            if (textParts.length > 0) {
                const characterText = textParts.map(p => p.text).join('\n');
                
                // 解析角色信息
                const characters = [];
                const characterBlocks = characterText.split(/<character>/i);
                
                characterBlocks.forEach((block, index) => {
                    block = block.trim();
                    if (!block) return;
                    
                    const nameMatch = block.match(/【角色名称】(.+)/m);
                    const name = nameMatch ? nameMatch[1].trim() : `角色${index + 1}`;
                    
                    characters.push({
                        name: name,
                        description: block
                    });
                });
                
                return {
                    characters: characters,
                    fullText: characterText
                };
            }
        }
        throw new Error('角色信息提取失败');
    } else {
        // 没有图片，使用普通文本 API
        const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            let errorMessage = `HTTP错误: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
            } catch (e) {
                const errorText = await response.text();
                if (errorText) errorMessage = errorText;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const characterText = data.choices?.[0]?.message?.content;

        if (!characterText) {
            throw new Error('角色信息提取失败');
        }

        // 解析角色信息
        const characters = [];
        const characterBlocks = characterText.split(/<character>/i);
        
        characterBlocks.forEach((block, index) => {
            block = block.trim();
            if (!block) return;
            
            const nameMatch = block.match(/【角色名称】(.+)/m);
            const name = nameMatch ? nameMatch[1].trim() : `角色${index + 1}`;
            
            characters.push({
                name: name,
                description: block
            });
        });

        return {
            characters: characters,
            fullText: characterText
        };
    }
}

// 调用 AI 生成图片提示词
async function generateImagePrompts(apiKey, script, frameCount, model, styleText, stylePreference, characterDescription, characterImage) {
    const isRealistic = styleText && (styleText.includes('真人') || styleText.includes('写实') || styleText.includes('摄影'));
    const designerType = isRealistic ? '专业的影视分镜设计师和摄影导演' : '专业的二次元视频漫剧分镜设计师';
    const frameType = isRealistic ? '连续的关键镜头（真人拍摄场景）' : '连续的关键帧（单帧画面，不是多格漫画）';
    
    let characterSection = '';
    
    // 如果有角色设定图，优先引用
    if (characterImage && characterImage.image) {
        characterSection = `

【重要：角色造型设定图】
我在这条消息中提供了一张专业的角色设定图（图片在文本之前）。
这张图展示了所有主要角色的完整造型设计，包括：
- 每个角色的全身站立造型
- 详细的服装和配色
- 角色的外貌特征和风格
- 清晰的角色名称标注

请严格参考这张角色设定图中的角色造型，在后续每一帧中保持角色完全一致。

角色文字描述：
${characterDescription}

在每一帧的提示词中，当角色出现时，必须严格遵循角色设定图中该角色的具体外观。
`;
    } else if (characterDescription) {
        // 如果没有角色设定图，使用文字描述
        characterSection = `

【重要：角色造型设定】
以下是已提取的所有角色的详细外观设定，后续每一帧中出现这些角色时，必须严格遵循以下描述，保持角色造型完全一致：

${characterDescription}

在每一帧的提示词中，当角色出现时，必须引用上述角色设定中的具体外观描述。
`;
    }
    
    const prompt = `你是一个${designerType}。用户提供剧本，你需要将其拆分成 ${frameCount} 个${frameType}。每帧保持统一画风、角色与场景一致性，整体风格：${styleText || '二次元动漫风格'}。${characterSection}

用户剧本：
${script}

要求：
1. 生成 ${frameCount} 个${isRealistic ? '镜头' : '图片'}提示词，每帧描述单张画面（非多格），帧间连贯。
2. 详细描述：场景、角色外观与服装、动作、表情、氛围、镜头${isRealistic ? '（焦距、机位、景别）' : ''}、光影、配色${isRealistic ? '（自然真实）' : '（与风格设定和用户偏好一致）'}。
3. 提示词适合 AI 图像生成（Gemini/Midjourney/nano banana），直接给出中文完整提示词，用户可直接复制使用。
4. 【角色一致性】每一帧中出现的角色，必须严格引用上面【角色造型设定】中该角色的完整外观描述（发型、发色、五官、服装等所有细节），不得有任何改变。${isRealistic ? '真人风格需特别注意人物五官、发型、服装细节完全一致。' : ''}
5. 第一帧为开场，最后一帧为结尾或转场；中间帧需要过渡描述。
6. 有台词时给出对白/旁白，后续会放入视频或气泡。
7. 画面中的任何文字、路牌、标识、字幕一律使用简体中文，不允许出现英文、拼音或混合语言；如无必要可不放文字。
8. 风格说明：${styleText || '二次元动漫风格'}${stylePreference ? `；偏好：${stylePreference}` : ''}${isRealistic ? '。注意：使用真人摄影风格，追求照片级真实感。' : ''}

输出格式（严格遵守）：
使用 <frame> 标签分隔每个帧

<frame>
【帧序号】1
【场景描述】详细的场景描述（镜头、光影、环境）
【角色与动作】角色外观、服装、动作、表情
【对话/旁白】"这里是角色说的话或旁白"（如有，用双引号）
【风格/氛围】画风、色调（与风格设定和用户偏好一致）、情绪
【完整提示词】
一段完整的中文 AI 图像生成提示词，可直接用于 nano banana，包含所有细节
</frame>

<frame>
【帧序号】2
...
</frame>

现在，请为这个剧本生成 ${frameCount} 个关键帧的图片提示词：`;

    // 使用普通文本API生成提示词（角色信息已在prompt文本中）
    const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7
        })
    });

    if (!response.ok) {
        let errorMessage = `HTTP错误: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('AI 返回的内容为空');
    }

    // 解析提示词
    return parseFramePrompts(content);
}

// 解析图片提示词
function parseFramePrompts(content) {
    const frames = [];
    const frameBlocks = content.split(/<frame>/i);
    
    frameBlocks.forEach((block, index) => {
        block = block.trim();
        if (!block || block === '') return;
        
        // 提取帧序号
        const frameNumberMatch = block.match(/【帧序号】(\d+)/);
        const frameNumber = frameNumberMatch ? parseInt(frameNumberMatch[1]) : index;
        
        // 提取场景描述
        const sceneMatch = block.match(/【场景描述】(.+?)(?=【|$)/s);
        const scene = sceneMatch ? sceneMatch[1].trim() : '';
        
        // 提取角色与动作
        const characterMatch = block.match(/【角色与动作】(.+?)(?=【|$)/s);
        const character = characterMatch ? characterMatch[1].trim() : '';
        
        // 提取对话/旁白
        const dialogueMatch = block.match(/【对话\/旁白】(.+?)(?=【|$)/s);
        const dialogue = dialogueMatch ? dialogueMatch[1].trim() : '';
        
        // 提取视觉风格（兼容：旧版用【视觉风格】、新版用【风格/氛围】）
        const styleMatch = block.match(/【(?:视觉风格|风格\/氛围|风格)】(.+?)(?=【|$)/s);
        const style = styleMatch ? styleMatch[1].trim() : '';
        
        // 提取完整提示词
        const promptMatch = block.match(/【完整提示词】(.+?)(?=<frame>|$)/s);
        const fullPrompt = promptMatch ? promptMatch[1].trim() : block;
        
        frames.push({
            index: frameNumber,
            scene: scene,
            character: character,
            dialogue: dialogue,
            style: style,
            prompt: fullPrompt
        });
    });
    
    return frames;
}

// 生成角色设定图
async function generateCharacterDesignImage(apiKey, script, characterInfo, styleText, stylePreference) {
    const isRealistic = styleText && (styleText.includes('真人') || styleText.includes('写实') || styleText.includes('摄影'));
    
    // 构建角色设定图提示词
    const imagePrompt = buildCharacterDesignImagePrompt(characterInfo.characters, script, characterInfo.fullText, styleText, isRealistic, stylePreference);
    
    // 调用图片生成 API
    const imageBase64 = await generateCharacterImage(apiKey, imagePrompt);
    
    return {
        characters: characterInfo.characters,
        characterText: characterInfo.fullText,
        image: imageBase64
    };
}

// 构建角色设定图的图片生成提示词
function buildCharacterDesignImagePrompt(characters, userTopic, characterText, styleText, isRealistic, stylePreference) {
    // 添加用户上传图片的说明
    let referenceImageNote = '';
    if (uploadedImages.length > 0) {
        referenceImageNote = `\n\n【重要：参考图片说明】
我在这条消息中提供了 ${uploadedImages.length} 张参考图片（图片在文本之前）。
请仔细分析这些图片的：
- ${isRealistic ? '人物摄影风格和真实感' : '动漫画风和绘画风格'}
- 角色设计和造型特点
- 配色方案和色彩运用
- ${isRealistic ? '光影和摄影技巧' : '线条风格和细节处理'}
- ${isRealistic ? '真实人物特征' : '二次元美学特征'}

然后基于这些参考图片的风格特点，生成符合下面要求的角色设定图。`;
    }

    const designType = isRealistic ? '真人角色参考图' : '二次元动漫角色设定图（Character Design Sheet）';
    const styleDesc = isRealistic ? '真人写实摄影风格' : '日系二次元动漫风格';
    const colorDesc = isRealistic ? '自然真实的色彩' : '配色遵循所选风格设定，并优先满足用户的风格偏好（不要固定粉色主题）';
    
    let prompt = `请生成一张专业的${designType}。

${referenceImageNote}

这是一张用于${isRealistic ? '视频制作' : '动漫制作'}的角色参考图，需要展示所有主要角色的完整造型设计。

角色设定信息：
${characterText}

${uploadedImages.length > 0 ? `【风格参考】请严格遵循上面提供的参考图片的整体${isRealistic ? '摄影风格、光影、色调' : '画风、配色、角色设计风格'}。` : ''}

用户故事背景：
${userTopic}

设计要求：

1. 整体布局
- 横向排列所有角色（${characters.length}个角色）
- 每个角色占据相等的空间
- ${isRealistic ? '自然场景或工作室背景' : '白色或浅色背景，突出角色'}
- 16:9 横版比例

2. 角色展示
- 每个角色都是全身站立造型${isRealistic ? '（真人照片风格）' : '（Full Body Character Design）'}
- 正面站姿，展示完整的服装和造型
- 角色之间有适当间距
- 每个角色下方或旁边清晰标注角色名称（简体中文）

3. 标注样式
- 在每个角色下方用清晰的文字标注角色名称
- 字体要清晰易读，大小适中
- ${isRealistic ? '简洁专业的标注风格' : '可以用装饰性的标签框或线条连接名称和角色'}

4. ${isRealistic ? '摄影风格' : '角色设计风格'}
- ${styleDesc}
- 统一的${isRealistic ? '光影和色调' : '画风和线条风格'}
- 精美的细节和配色
- ${isRealistic ? '真实的人物特征和表情' : '大眼睛、精致五官等二次元特征'}
- ${colorDesc}${stylePreference ? `\n- 风格偏好：${stylePreference}` : ''}

5. 配色方案
- ${isRealistic ? '自然真实的色彩，专业摄影的色调' : '根据整体风格设定确定主色调（优先遵循用户偏好）'}
- 每个角色有独特的配色，但整体和谐统一
- ${isRealistic ? '色彩平衡，符合真实光线' : '高饱和度但不刺眼'}
- ${isRealistic ? '专业摄影的色彩处理' : '色彩鲜艳明快'}

6. 细节要求
- ${isRealistic ? '真实的发质和纹理' : '头发要有层次和光泽'}
- 服装要有细节和质感
- ${isRealistic ? '真实的眼神和表情' : '眼睛要有高光和细节'}
- ${isRealistic ? '自然的姿态和表情' : '线条流畅清晰'}
- 整体画面干净专业

7. 参考标准
- ${isRealistic ? '专业人像摄影标准，类似时尚杂志或演员定妆照' : '专业动画制作的角色设定图标准，类似《我的英雄学院》《鬼灭之刃》等的角色设定图风格'}
- 适合作为后续${isRealistic ? '视频拍摄' : '分镜绘制'}的参考

8. 重要提示
这张图片将作为后续所有${isRealistic ? '视频帧' : '分镜图片'}的角色参考，所以：
- 角色设计要完整详细
- 特征要明确突出
- 配色要准确
- 名称标注要清晰
- 所有文字（角色名称）必须使用简体中文

请生成一张高质量的${isRealistic ? '真人' : '动漫'}角色${isRealistic ? '参考' : '设定'}图，包含所有 ${characters.length} 个角色，每个角色都清晰标注简体中文名称。`;

    return prompt;
}

// 生成角色设定图片
async function generateCharacterImage(apiKey, prompt) {
    const parts = [];

    // 如果有上传的参考图片，先添加图片到请求中
        if (uploadedImages.length > 0) {
            uploadedImages.forEach(img => {
                const base64Data = img.dataUrl.split(',')[1];
                const mimeType = img.dataUrl.split(';')[0].split(':')[1];
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            });
        }
    
    // 然后再添加文本提示词
    parts.push({
        text: prompt
    });

    const response = await fetch('https://api.antsk.cn/v1beta/models/gemini-3-pro-image-preview:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': '*/*'
        },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ]
        })
    });

    if (!response.ok) {
        let errorMessage = `HTTP错误: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // 处理 Gemini 响应格式
    const candidates = data.candidates || [];
    if (candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        
        // 查找生成的图片
        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                return {
                    base64: part.inlineData.data,
                    mimeType: part.inlineData.mimeType
                };
            }
        }
    }
    
    throw new Error('未生成角色设定图');
}

// 显示角色信息
function displayCharactersInfo(characterImage) {
    const charactersInfoDiv = document.getElementById('charactersInfo');
    const charactersContentDiv = document.getElementById('charactersContent');
    
    if (!characterDescriptionText || extractedCharacters.length === 0) {
        charactersInfoDiv.style.display = 'none';
        return;
    }
    
    let html = '';
    
    // 检查是否使用了用户上传的参考图
    const isUserUploadedReference = characterDescriptionText.includes('使用用户上传的参考图');
    
    // 如果有生成的角色设定图，显示它（横向布局：图片在左，文字在右）
    if (characterImage && characterImage.image) {
        html += '<div style="margin-bottom: 15px;">';
        
        if (isUserUploadedReference) {
            // 使用用户上传的参考图
            html += '<div style="background: #dcfce7; padding: 10px; border-radius: 6px; border-left: 3px solid #22c55e; margin-bottom: 10px;">';
            html += '<h4 style="margin: 0 0 6px 0; color: #166534; font-size: 1em;">✅ 使用您上传的角色参考图</h4>';
            html += '<p style="margin: 0; color: #166534; font-size: 0.85em;">已跳过AI生成角色信息和设定图，节省Token费用！</p>';
            html += '</div>';
        } else {
            // AI生成的角色设定图
            html += '<h4 style="margin: 0 0 10px 0; color: #c2185b; font-size: 1em;">👥 AI 生成的角色设定图</h4>';
        }
        
        // 横向布局容器
        html += '<div style="display: flex; gap: 15px; align-items: flex-start;">';
        
        // 左侧：角色设定图
        const borderColor = isUserUploadedReference ? '#22c55e' : '#FF69B4';
        html += `<div style="flex: 0 0 45%; background: #f9fafb; padding: 12px; border-radius: 8px; border: 2px solid ${borderColor};">`;
        html += `<img src="data:${characterImage.image.mimeType};base64,${characterImage.image.base64}" `;
        html += `onclick="openImageModal('data:${characterImage.image.mimeType};base64,${characterImage.image.base64}')" `;
        html += 'style="width: 100%; height: auto; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); object-fit: contain;">';
        html += '<p style="margin: 8px 0 0 0; color: #666; font-size: 0.85em; text-align: center;">点击查看大图</p>';
        html += '</div>';
        
        // 右侧：角色设定文字（可编辑；用于重新出图）
        html += '<div style="flex: 1; background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; max-height: 500px; overflow-y: auto;">';
        html += '<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 8px 0;">';
        html += '<h5 style="margin: 0; color: #333; font-size: 0.95em; font-weight: 600;">📝 角色设定说明' + (isUserUploadedReference ? '' : '（可编辑）') + '</h5>';
        if (!isUserUploadedReference) {
            html += '<button class="action-btn btn-primary" onclick="regenerateCharacterDesignImageFromEditedText()" id="regenerateCharactersBtn" style="padding: 4px 8px; font-size: 0.75em; white-space: nowrap;">🖼️ 重新生成</button>';
        }
        html += '</div>';
        if (!isUserUploadedReference) {
            html += '<p style="margin: 0 0 6px 0; color: #666; font-size: 0.85em;">你可以直接在下面修改角色设定文本，然后点击右侧按钮重新生成角色设定图（不会重新提取角色）。</p>';
        }
        html += '<div id="regenerateCharactersStatus" style="margin: 0 0 8px 0; font-size: 0.85em; color: #666;"></div>';
        const editableAttr = isUserUploadedReference ? 'contenteditable="false"' : 'contenteditable="true"';
        const bgColor = isUserUploadedReference ? '#f9fafb' : 'white';
        html += `<div class="editable-prompt" ${editableAttr} id="characterTextEditor" style="white-space: pre-wrap; line-height: 1.8; color: #555; font-size: 0.9em; min-height: 160px; background: ${bgColor};"></div>`;
        html += '</div>';
        
        html += '</div>'; // 结束横向布局
        
        html += '<p style="margin: 10px 0 0 0; color: #666; font-size: 0.85em; text-align: center;">此图展示所有角色的完整造型设计，后续帧将参考此图保持一致</p>';
        html += '</div>';
    }
    
    // 如果有上传的参考图片，显示它们（仅显示用户上传的，不混入AI生成的设定图）
    const userUploadedImages = uploadedImages.filter(img => img && !img.isGenerated);
    if (userUploadedImages.length > 0) {
        html += '<div style="margin-bottom: 15px; padding: 12px; background: #fffbeb; border-radius: 8px; border-left: 3px solid #f59e0b;">';
        html += '<h4 style="margin: 0 0 10px 0; color: #92400e; font-size: 0.95em;">📷 您上传的角色参考图</h4>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">';
        userUploadedImages.forEach((img, index) => {
            html += `<img src="${img.dataUrl}" onclick="openImageModal('${img.dataUrl}')" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 2px solid #f59e0b;">`;
        });
        html += '</div>';
        html += '<p style="margin: 8px 0 0 0; color: #78350f; font-size: 0.85em;">AI 已分析这些图片并生成了角色设定图</p>';
        html += '</div>';
    }
    
    charactersContentDiv.innerHTML = html;
    charactersInfoDiv.style.display = 'block';

    // 用 textContent 填充，避免 <character> 等被当成 HTML 标签吞掉
    const editor = document.getElementById('characterTextEditor');
    if (editor) {
        editor.textContent = characterDescriptionText || '';
    }
    
    // 平滑滚动到角色信息区域
    setTimeout(() => {
        charactersInfoDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// 显示图片提示词
function displayFramePrompts(prompts) {
    const container = document.getElementById('framesContainer');
    const videosContainer = document.getElementById('videosContainer');
    container.innerHTML = '';
    if (videosContainer) videosContainer.style.display = 'none'; // 使用交错布局，不再单独展示

    const pairCount = prompts.length - 1;

    const buildFrameCard = (frame, index) => `
        <div class="frame-card" id="frameCard${index}">
            <h3>
                🖼️ 第 ${frame.index} 帧
                <span class="status-badge status-pending" id="frameStatus${index}">待生成</span>
            </h3>
            
            <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <p style="margin: 0 0 8px 0; color: #666; font-size: 0.9em;"><strong>场景：</strong>${frame.scene}</p>
                <p style="margin: 0 0 8px 0; color: #666; font-size: 0.9em;"><strong>角色：</strong>${frame.character}</p>
                ${frame.dialogue ? `<p style="margin: 0 0 8px 0; color: #FF69B4; font-size: 0.9em;"><strong>对话：</strong>${frame.dialogue}</p>` : ''}
                <p style="margin: 0; color: #666; font-size: 0.9em;"><strong>风格：</strong>${frame.style}</p>
            </div>
            
            ${index > 0 ? `<div class="frame-dependency-hint" style="background: #fffbeb; padding: 10px; border-radius: 6px; border-left: 3px solid #f59e0b; margin-bottom: 12px;">
                <p style="margin: 0; color: #92400e; font-size: 0.85em;">⚠️ 需要先生成第 ${index} 帧，才能生成本帧</p>
            </div>` : ''}
            
            <div>
                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 0.9em;">图片生成提示词（可编辑）：</label>
                <div class="editable-prompt" contenteditable="true" id="framePrompt${index}">${frame.prompt}</div>
            </div>
            
            <div class="action-buttons">
                <button class="action-btn btn-primary" onclick="generateImageForFrame(${index})" id="genFrameBtn${index}" ${index > 0 ? 'disabled' : ''}>
                    🖼️ 生成本帧图片
                </button>
            </div>

            <div id="frameImageContainer${index}"></div>
        </div>
    `;

    const buildVideoCard = (pairIndex) => {
        // 第一段视频：需要两张图片
        // 后续视频：需要前一段视频 + 结束帧图片
        let ready, statusText, hintText;
        if (pairIndex === 0) {
            ready = generatedImages[pairIndex] && generatedImages[pairIndex + 1];
            statusText = ready ? '待生成提示词' : '等待图片';
            hintText = '第一段视频：需要第1帧和第2帧图片生成完成。';
        } else {
            const hasEndFrame = generatedImages[pairIndex + 1];
            const hasPrevVideo = generatedVideos[pairIndex - 1];
            ready = hasEndFrame && hasPrevVideo;
            if (ready) {
                statusText = '待生成提示词';
            } else if (!hasPrevVideo) {
                statusText = `等待第${pairIndex}段视频`;
            } else if (!hasEndFrame) {
                statusText = `等待第${pairIndex + 2}帧`;
            } else {
                statusText = '等待前置条件';
            }
            hintText = `第${pairIndex + 1}段视频：使用第${pairIndex}段视频的最后一帧作为首帧，第${pairIndex + 2}帧图片作为尾帧。`;
        }
        
        return `
            <div class="video-section" id="videoSection${pairIndex}">
                <h4>
                    🎥 段落 ${pairIndex + 1}${pairIndex === 0 ? '：第1帧 → 第2帧' : `：前段视频尾帧 → 第${pairIndex + 2}帧`}
                    <span class="status-badge status-pending" id="videoStatus${pairIndex}">${statusText}</span>
                </h4>
                
                <div style="background: ${pairIndex === 0 ? '#e0f2fe' : '#fff7ed'}; border-radius: 8px; padding: 12px; margin-bottom: 12px; border-left: 3px solid ${pairIndex === 0 ? '#0ea5e9' : '#f97316'};">
                    <p style="margin: 0; color: #0f172a; font-size: 0.9em;">${hintText}</p>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #c2185b; font-size: 0.9em;">视频生成提示词（可编辑）：</label>
                    <div class="editable-prompt" contenteditable="true" id="videoPrompt${pairIndex}" placeholder="先生成提示词或自行填写"></div>
                </div>
                
                <div class="action-buttons">
                    <button onclick="generateVideoPromptForPair(${pairIndex})" class="action-btn btn-primary" id="generateVideoPromptBtn${pairIndex}" ${ready ? '' : 'disabled'}>
                        🧠 生成视频提示词
                    </button>
                    <button onclick="generateSingleVideo(${pairIndex})" class="action-btn btn-primary" id="generateVideoBtn${pairIndex}" disabled>
                        🎬 生成视频
                    </button>
                </div>
                
                <div id="videoLoadingContainer${pairIndex}" style="display: none;">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <p style="color: #666; font-weight: 600;">正在生成视频，请稍候（约需1-2分钟）...</p>
                    </div>
                </div>
                
                <div id="videoPreviewContainer${pairIndex}"></div>
            </div>
        `;
    };

    let timelineHtml = '';
    prompts.forEach((frame, index) => {
        timelineHtml += buildFrameCard(frame, index);
        if (index < prompts.length - 1) {
            timelineHtml += buildVideoCard(index);
        }
    });

    if (pairCount > 0) {
        timelineHtml += `
            <div class="grid-full" style="margin: 12px 0;">
                <button onclick="generateAllVideos()" class="generate-btn">
                    🎬 生成所有视频
                </button>
            </div>
        `;
    }

    container.innerHTML = timelineHtml;
}

// 生成所有图片（按顺序生成，确保场景连贯）
async function generateAllImages() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    
    if (currentFramePrompts.length === 0) {
        showError('请先生成图片提示词');
        return;
    }
    
    document.getElementById('generateImagesBtn').disabled = true;
    
    // 按顺序逐个生成图片，每一帧都引用前一帧
    for (let i = 0; i < currentFramePrompts.length; i++) {
        // 如果当前帧已生成，跳过
        if (generatedImages[i]) {
            continue;
        }
        
        // 生成当前帧
        const success = await generateSingleImage(i, apiKey);
        
        // 如果生成失败，停止后续生成
        if (!success) {
            showError(`第 ${i + 1} 帧生成失败，已停止后续生成`);
            break;
        }
    }
    
    document.getElementById('generateImagesBtn').disabled = false;
}

// 生成单张图片（返回成功/失败状态）
async function generateSingleImage(index, apiKey) {
    const statusBadge = document.getElementById(`frameStatus${index}`);
    const imageContainer = document.getElementById(`frameImageContainer${index}`);
    const promptElement = document.getElementById(`framePrompt${index}`);
    const genBtn = document.getElementById(`genFrameBtn${index}`);
    
    // 检查是否需要前一帧（第一帧除外）
    if (index > 0 && !generatedImages[index - 1]) {
        showError(`请先生成第 ${index} 帧，才能生成第 ${index + 1} 帧`);
        return false;
    }
    
    // 获取提示词（可能被用户编辑过）
    const prompt = promptElement.textContent.trim();
    
    // 更新状态
    statusBadge.textContent = '生成中...';
    statusBadge.className = 'status-badge status-generating';
    if (genBtn) genBtn.disabled = true;
    
    imageContainer.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
            <p style="color: #666; font-size: 0.9em;">正在生成图片...</p>
            ${index > 0 ? `<p style="color: #666; font-size: 0.85em; margin-top: 8px;">📌 参考第 ${index} 帧保持场景连贯</p>` : ''}
        </div>
    `;
    
    try {
        // 调用图片生成 API，传入前一帧图片
        const previousImage = index > 0 ? generatedImages[index - 1] : null;
        const imageData = await generateImage(apiKey, prompt, previousImage, index + 1);
        
        // 保存图片
        generatedImages[index] = imageData;
        
        // 显示图片
        imageContainer.innerHTML = `
            <img src="data:${imageData.mimeType};base64,${imageData.base64}" 
                 alt="第${index + 1}帧" 
                 class="frame-image"
                 onclick="openImageModal(this.src)">
            <button onclick="downloadImage('data:${imageData.mimeType};base64,${imageData.base64}', 'frame-${index + 1}')" class="download-btn">
                📥 下载图片
            </button>
        `;
        
        // 更新状态
        statusBadge.textContent = '已生成';
        statusBadge.className = 'status-badge status-completed';
        
        // 启用下一帧的生成按钮
        const nextBtn = document.getElementById(`genFrameBtn${index + 1}`);
        if (nextBtn) {
            nextBtn.disabled = false;
            // 更新下一帧的提示信息
            const nextWarning = document.querySelector(`#frameCard${index + 1} .frame-dependency-hint`);
            if (nextWarning) {
                nextWarning.style.background = '#dcfce7';
                nextWarning.style.borderColor = '#22c55e';
                nextWarning.innerHTML = '<p style="margin: 0; color: #166534; font-size: 0.85em;">✅ 前一帧已生成，可以开始生成本帧</p>';
            }
        }
        
        // 更新相邻视频段落的可用状态
        updateVideoPairReadiness(index - 1);
        updateVideoPairReadiness(index);
        
        return true; // 返回成功
        
    } catch (err) {
        console.error(`生成第${index + 1}帧图片失败:`, err);
        imageContainer.innerHTML = `
            <div style="background: #fef2f2; padding: 12px; border-radius: 8px; border-left: 3px solid #dc2626; margin-top: 12px;">
                <p style="color: #dc2626; margin: 0; font-size: 0.9em;">❌ 生成失败: ${err.message}</p>
                <p style="color: #666; margin: 8px 0 0 0; font-size: 0.85em;">请检查提示词或 API 配置后重试</p>
            </div>
        `;
        statusBadge.textContent = '失败';
        statusBadge.className = 'status-badge status-pending';
        
        return false; // 返回失败
        
    } finally {
        if (genBtn) genBtn.disabled = false;
    }
}

// 单帧生成入口（按钮点击）
async function generateImageForFrame(index) {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    
    // 检查是否需要先生成前一帧
    if (index > 0 && !generatedImages[index - 1]) {
        showError(`⚠️ 请先生成第 ${index} 帧，才能生成第 ${index + 1} 帧。图片需要按顺序生成以保持场景连贯性。`);
        
        // 高亮前一帧卡片
        const prevCard = document.getElementById(`frameCard${index - 1}`);
        if (prevCard) {
            prevCard.style.border = '3px solid #f59e0b';
            prevCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                prevCard.style.border = '';
            }, 2000);
        }
        
        return;
    }
    
    await generateSingleImage(index, apiKey);
}

// 调用图片生成 API
async function generateImage(apiKey, prompt, referenceImage = null, frameIndex = 1) {
    const isRealistic = currentStyleText && (currentStyleText.includes('真人') || currentStyleText.includes('写实') || currentStyleText.includes('摄影'));
    const roleType = isRealistic ? '专业摄影师和影视摄像师' : '二次元分镜插画师';
    const outputType = isRealistic ? '真人拍摄的照片级画面' : '单张关键画面';
    const styleDesc = isRealistic 
        ? '使用真人摄影风格，追求照片级真实感，自然光影，细腻肤质纹理，真实人物表情'
        : '干净线稿，柔和光晕，电影感灯光';
    
    // 构建角色设定图说明
    let characterImageNote = '';
    if (lastCharacterImage && lastCharacterImage.image) {
        characterImageNote = `

【重要：角色设定图参考】
我在这条消息的第一张图片提供了角色设定图。
这张图展示了所有主要角色的完整造型设计，请严格参考这张设定图中的角色外貌、服装、配色，确保生成的画面中角色造型与设定图完全一致。
`;
    }

    const finalPrompt = `你是一名${roleType}，请为第 ${frameIndex} 帧生成${outputType}。

用户输入：
${prompt}

风格：${currentStyleText || '中国都市动漫风格'}，${styleDesc}。
${characterImageNote}
${referenceImage ? `【重要：场景连贯性要求】
我还提供了前一帧（第 ${frameIndex - 1} 帧）的图片作为参考。
请严格保持以下要素的连贯性和一致性：
- 角色外貌：发型、发色、五官、体型${isRealistic ? '、肤色、面部特征' : ''}必须完全一致
- 服装配饰：服装款式、颜色、配饰必须完全一致
- 场景风格：场景的整体风格、色调、氛围保持连贯
- 光影效果：光线方向、明暗对比、整体光影氛围保持一致
- 画风统一：线条风格${isRealistic ? '、摄影风格' : '、绘画技法'}、细节处理保持统一

在此基础上，根据本帧的剧情需要，自然过渡镜头、动作和表情。` : ''}

画面禁止出现任何英文或拼音文字，所有可见文字必须为简体中文；如无必要，可不放文字。`;

    const parts = [];

    // 【新增】如果有最新的角色设定图，始终在第一位置添加它作为角色参考
    if (lastCharacterImage && lastCharacterImage.image && lastCharacterImage.image.mimeType && lastCharacterImage.image.base64) {
        parts.push({
            inlineData: {
                mimeType: lastCharacterImage.image.mimeType,
                data: lastCharacterImage.image.base64
            }
        });
    }

    // 如果有前一帧，添加前一帧作为场景连贯性参考
    if (referenceImage && referenceImage.mimeType && referenceImage.base64) {
        parts.push({
            inlineData: {
                mimeType: referenceImage.mimeType,
                data: referenceImage.base64
            }
        });
    }

    parts.push({ text: finalPrompt });

    const response = await fetch('https://api.antsk.cn/v1beta/models/gemini-3-pro-image-preview:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': '*/*'
        },
        body: JSON.stringify({
            contents: [
                {
                    role: "user",
                    parts: parts
                }
            ]
        })
    });

    if (!response.ok) {
        let errorMessage = `HTTP错误: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // 处理 Gemini 响应格式
    const candidates = data.candidates || [];
    if (candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        
        // 查找生成的图片
        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                return {
                    base64: part.inlineData.data,
                    mimeType: part.inlineData.mimeType
                };
            }
        }
    }
    
    throw new Error('未生成图片');
}

// 解析视频提示词
function parseVideoPrompts(content) {
    const videos = [];
    const videoBlocks = content.split(/<video>/i);
    
    videoBlocks.forEach((block, index) => {
        block = block.trim();
        if (!block || block === '') return;
        
        // 提取视频序号
        const videoNumberMatch = block.match(/【视频序号】(\d+)/);
        const videoNumber = videoNumberMatch ? parseInt(videoNumberMatch[1]) : index;
        
        // 提取起始帧和结束帧
        const startFrameMatch = block.match(/【起始帧】第(\d+)帧/);
        const endFrameMatch = block.match(/【结束帧】第(\d+)帧/);
        const startFrame = startFrameMatch ? parseInt(startFrameMatch[1]) - 1 : index;
        const endFrame = endFrameMatch ? parseInt(endFrameMatch[1]) - 1 : index + 1;
        
        // 提取过渡描述
        const transitionMatch = block.match(/【过渡描述】(.+?)(?=【|$)/s);
        const transition = transitionMatch ? transitionMatch[1].trim() : '';
        
        // 提取对话/旁白
        const dialogueMatch = block.match(/【对话\/旁白】(.+?)(?=【|$)/s);
        const dialogue = dialogueMatch ? dialogueMatch[1].trim() : '';
        
        // 提取音效
        const soundMatch = block.match(/【音效】(.+?)(?=【|$)/s);
        const sound = soundMatch ? soundMatch[1].trim() : '';
        
        // 提取完整提示词
        const promptMatch = block.match(/【完整提示词】(.+?)(?=<video>|$)/s);
        const fullPrompt = promptMatch ? promptMatch[1].trim() : block;
        
        videos.push({
            index: videoNumber,
            startFrame: startFrame,
            endFrame: endFrame,
            transition: transition,
            dialogue: dialogue,
            sound: sound,
            prompt: fullPrompt
        });
    });
    
    return videos;
}

// 渲染视频段落占位（在有帧提示词后即可显示，待帧图生成）
function renderVideoSections(frameCount) {
    const container = document.getElementById('videosContainer');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<h2 style="margin-bottom: 20px; color: #333; font-size: 1.5em;">🎬 视频过渡</h2>';

    const pairCount = frameCount - 1;
    for (let i = 0; i < pairCount; i++) {
        const ready = generatedImages[i] && generatedImages[i + 1];
        const html = `
            <div class="video-section" id="videoSection${i}">
                <h4>
                    🎥 段落 ${i + 1}：第${i + 1}帧 → 第${i + 2}帧
                    <span class="status-badge status-pending" id="videoStatus${i}">${ready ? '待生成提示词' : '等待图片'}</span>
                </h4>
                
                <div style="background: white; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <p style="margin: 0; color: #666; font-size: 0.9em;">两张连续帧生成完成后，可生成视频提示词并出视频。</p>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #c2185b; font-size: 0.9em;">视频生成提示词（可编辑）：</label>
                    <div class="editable-prompt" contenteditable="true" id="videoPrompt${i}" placeholder="先生成提示词或自行填写"></div>
                </div>
                
                <div class="action-buttons">
                    <button onclick="generateVideoPromptForPair(${i})" class="action-btn btn-primary" id="generateVideoPromptBtn${i}" ${ready ? '' : 'disabled'}>
                        🧠 生成视频提示词
                    </button>
                    <button onclick="generateSingleVideo(${i})" class="action-btn btn-primary" id="generateVideoBtn${i}" disabled>
                        🎬 生成视频
                    </button>
                </div>
                
                <div id="videoLoadingContainer${i}" style="display: none;">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <p style="color: #666; font-weight: 600;">正在生成视频，请稍候（约需1-2分钟）...</p>
                    </div>
                </div>
                
                <div id="videoPreviewContainer${i}"></div>
            </div>
        `;
        container.innerHTML += html;
    }

    container.innerHTML += `
        <button onclick="generateAllVideos()" class="generate-btn" style="margin-top: 20px;">
            🎬 生成所有视频
        </button>
    `;
}

// 更新某个视频段落按钮状态
function updateVideoPairReadiness(pairIndex) {
    if (pairIndex < 0 || pairIndex >= videoPromptStatus.length) return;
    
    const statusBadge = document.getElementById(`videoStatus${pairIndex}`);
    const promptBtn = document.getElementById(`generateVideoPromptBtn${pairIndex}`);
    const videoBtn = document.getElementById(`generateVideoBtn${pairIndex}`);

    if (!statusBadge || !promptBtn || !videoBtn) return;

    // 判断是否满足生成条件
    let ready;
    if (pairIndex === 0) {
        // 第一段视频：需要两张图片
        ready = generatedImages[pairIndex] && generatedImages[pairIndex + 1];
    } else {
        // 后续视频：需要前一段视频 + 结束帧图片
        ready = generatedVideos[pairIndex - 1] && videoLastFrames[pairIndex - 1] && generatedImages[pairIndex + 1];
    }

    if (ready) {
        if (videoPrompts[pairIndex]) {
            statusBadge.textContent = '提示词已就绪';
            statusBadge.className = 'status-badge status-generating';
            promptBtn.disabled = false;
            videoBtn.disabled = false;
        } else {
            statusBadge.textContent = '可生成提示词';
            statusBadge.className = 'status-badge status-pending';
            promptBtn.disabled = false;
            videoBtn.disabled = true;
        }
    } else {
        // 更详细的状态提示
        if (pairIndex === 0) {
            statusBadge.textContent = '等待图片';
        } else if (!generatedVideos[pairIndex - 1]) {
            statusBadge.textContent = `等待第${pairIndex}段视频`;
        } else if (!generatedImages[pairIndex + 1]) {
            statusBadge.textContent = `等待第${pairIndex + 2}帧`;
        } else {
            statusBadge.textContent = '等待前置条件';
        }
        statusBadge.className = 'status-badge status-pending';
        promptBtn.disabled = true;
        videoBtn.disabled = true;
    }
}

// 为单个相邻帧生成视频提示词
async function generateVideoPromptForPair(pairIndex) {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }

    if (!generatedImages[pairIndex] || !generatedImages[pairIndex + 1]) {
        showError(`请先生成第${pairIndex + 1}帧与第${pairIndex + 2}帧图片`);
        return;
    }

    const statusBadge = document.getElementById(`videoStatus${pairIndex}`);
    const promptBtn = document.getElementById(`generateVideoPromptBtn${pairIndex}`);
    const videoBtn = document.getElementById(`generateVideoBtn${pairIndex}`);
    const promptArea = document.getElementById(`videoPrompt${pairIndex}`);
    const model = document.getElementById('modelSelect').value;

    statusBadge.textContent = '生成提示词中...';
    statusBadge.className = 'status-badge status-generating';
    promptBtn.disabled = true;

    const frameA = currentFramePrompts[pairIndex];
    const frameB = currentFramePrompts[pairIndex + 1];

    const isRealistic = currentStyleText && (currentStyleText.includes('真人') || currentStyleText.includes('写实') || currentStyleText.includes('摄影'));
    const frameType = isRealistic ? '连续的真人拍摄画面' : '连续的漫剧帧画面';
    const motionDesc = isRealistic ? '镜头运动（推拉摇移）、人物动作、表情变化' : '镜头运动、角色动作';
    const styleNote = isRealistic ? '保持真人写实风格，自然真实的动作和表情' : '保持当前二次元风格与用户偏好一致';
    
    // 避免每段都塞入超长角色设定（提示词太长/太像）；这里改为短约束，依靠“设定图 + 已生成帧”来锁定一致性
    const characterSection = extractedCharacters && extractedCharacters.length > 0 ? `

【重要：角色一致性】
后续视频中的人物外貌与服装必须与已生成的图片帧完全一致（不允许更换发型/发色/五官/服装/配饰）。
` : '';

    // 仅允许每段输出“新增台词”，并把已用台词清单喂给模型做约束
    const suggestedDialogue = pickUniqueDialogueForPair(frameA.dialogue, frameB.dialogue);
    const usedDialogueHint = usedVideoDialogues.length > 0
        ? `\n\n【已用过的台词（禁止重复）】\n- ${usedVideoDialogues.slice(-8).join('\n- ')}`
        : '';
    
    const prompt = `你是专业的视频过渡设计师。现在有两张${frameType}，需要生成 10 秒视频过渡提示词（中文）。${characterSection}${usedDialogueHint}

起始帧（第${frameA.index}帧）：
场景：${frameA.scene}
角色：${frameA.character}
对白：${frameA.dialogue}

结束帧（第${frameB.index}帧）：
场景：${frameB.scene}
角色：${frameB.character}
对白：${frameB.dialogue}

要求：
1. 仅生成这两帧之间的过渡提示词（单条）。
2. 【画面比例】视频必须为 16:9 横屏格式（Landscape），宽屏构图。
3. 描述${motionDesc}、场景变化、光影与氛围，${styleNote}。
4. 【角色一致性】视频中出现的角色必须严格遵循上面【角色造型设定】中的外观描述，保持与图片帧完全一致。
5. 【台词去重】本段的【对话/旁白】必须与【已用过的台词】完全不同；禁止复述/重复上一段台词；如果确实没有新的台词可用，请输出"无"（不要硬编重复句）。
6. 本段建议可用的"新增台词素材"（优先使用它，且只取一句）：${suggestedDialogue ? `"${suggestedDialogue.replace(/["""]/g, '').trim()}"` : '无'}
7. 给出背景音效与配乐建议。
8. 视频中的字幕、路牌、UI 文本等所有可见文字必须为简体中文，严禁出现英文或拼音；如无必要可不放文字。
9. 画风一致性：${currentStyleText || '二次元动漫风格'}${currentStylePreference ? `；偏好：${currentStylePreference}` : ''}${isRealistic ? '。注意：使用真人影视风格，追求自然真实的表演和镜头语言。' : ''}
10. 【长度控制】输出要短，不要写大段说明；【完整提示词】控制在 6~10 行以内，避免与其他段落高度相似。

输出格式（严格遵守）：

【视频序号】${pairIndex + 1}
【起始帧】第${frameA.index}帧
【结束帧】第${frameB.index}帧
【过渡描述】...
【对话/旁白】"..."（如有）
【音效】...
【完整提示词】
一段完整的视频生成提示词（中文，直接用于视频生成）
`;

    try {
        const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('AI 返回的内容为空');
        }

        const parsed = parseVideoPrompts(content);
        const first = parsed[0] || {
            index: pairIndex + 1,
            startFrame: pairIndex,
            endFrame: pairIndex + 1,
            transition: '',
            dialogue: '',
            sound: '',
            prompt: content
        };

        // 本地二次去重：如果模型还是重复，就强制换成“未使用过的台词/或留空”
        let finalDialogue = '';
        const aiDialogue = (first.dialogue || '').trim();
        const aiDialogueNorm = normalizeDialogue(aiDialogue);
        if (aiDialogueNorm && !usedVideoDialogueSet.has(aiDialogueNorm) && aiDialogue !== '无') {
            finalDialogue = aiDialogue;
        } else {
            finalDialogue = suggestedDialogue || '';
        }

        const finalDialogueNorm = normalizeDialogue(finalDialogue);
        if (finalDialogueNorm) {
            usedVideoDialogueSet.add(finalDialogueNorm);
            usedVideoDialogues.push(finalDialogue.replace(/["“”]/g, '').trim());
        }

        // 生成“更短且更段落化”的最终提示词，避免每段都很长/很像
        const compactPrompt = buildCompactVideoPrompt({
            pairIndex,
            frameA,
            frameB,
            transition: first.transition,
            dialogue: finalDialogue,
            sound: first.sound
        });

        videoPrompts[pairIndex] = {
            ...first,
            startFrame: pairIndex,
            endFrame: pairIndex + 1,
            dialogue: finalDialogue,
            prompt: compactPrompt
        };
        videoPromptStatus[pairIndex] = 'ready';

        if (promptArea) {
            promptArea.textContent = compactPrompt;
        }

        statusBadge.textContent = '提示词已就绪';
        statusBadge.className = 'status-badge status-completed';
        promptBtn.disabled = false;
        videoBtn.disabled = false;

    } catch (err) {
        console.error(`生成视频提示词失败:`, err);
        showError(`生成视频提示词失败: ${err.message}`);
        statusBadge.textContent = '失败';
        statusBadge.className = 'status-badge status-pending';
        promptBtn.disabled = false;
    }
}

// 从视频中提取最后一帧
async function extractLastFrameFromVideo(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
            // 跳转到视频的最后一帧
            video.currentTime = video.duration - 0.1; // 提前0.1秒，确保能获取到帧
        };
        
        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // 转换为 base64
                canvas.toBlob((blob) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        resolve({
                            base64: base64data,
                            mimeType: 'image/png'
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                }, 'image/png');
            } catch (err) {
                reject(err);
            }
        };
        
        video.onerror = reject;
        video.src = videoUrl;
    });
}

// 生成单个视频
async function generateSingleVideo(index) {
    const apiKey = document.getElementById('apiKey').value.trim();
    const video = videoPrompts[index];
    const promptElement = document.getElementById(`videoPrompt${index}`);
    const prompt = promptElement ? promptElement.textContent.trim() : (video ? video.prompt : '');
    
    const statusBadge = document.getElementById(`videoStatus${index}`);
    const loadingContainer = document.getElementById(`videoLoadingContainer${index}`);
    const previewContainer = document.getElementById(`videoPreviewContainer${index}`);
    const generateBtn = document.getElementById(`generateVideoBtn${index}`);
    
    // 检查前置条件
    if (index === 0) {
        // 第一段视频：需要第1帧和第2帧的图片
        if (!generatedImages[video.startFrame] || !generatedImages[video.endFrame]) {
            showError(`请先生成第${video.startFrame + 1}帧和第${video.endFrame + 1}帧的图片`);
            return;
        }
    } else {
        // 后续视频：需要前一段视频已生成，并且需要结束帧的图片
        if (!generatedVideos[index - 1]) {
            showError(`请先生成第${index}段视频`);
            return;
        }
        if (!generatedImages[video.endFrame]) {
            showError(`请先生成第${video.endFrame + 1}帧的图片`);
            return;
        }
    }

    if (!prompt) {
        showError('请先生成视频提示词或填写提示词');
        return;
    }
    
    // 更新状态
    statusBadge.textContent = '生成中...';
    statusBadge.className = 'status-badge status-generating';
    loadingContainer.style.display = 'block';
    generateBtn.disabled = true;
    
    try {
        // 确定首帧：第一段用图片，后续用前一段视频的最后一帧
        let startFrameImage;
        if (index === 0) {
            // 第一段视频：使用生成的第1帧图片
            startFrameImage = generatedImages[video.startFrame];
        } else {
            // 后续视频：优先使用前一段视频的最后一帧，如果提取失败则使用当前段的起始帧图片
            if (videoLastFrames[index - 1]) {
                startFrameImage = videoLastFrames[index - 1];
            } else {
                // 回退：使用当前段视频的起始帧图片作为替代
                console.warn(`⚠️ 前一段视频的最后一帧未提取成功，使用第${video.startFrame + 1}帧图片作为替代`);
                startFrameImage = generatedImages[video.startFrame];
                if (!startFrameImage) {
                    throw new Error(`无法获取起始帧：前一段视频最后一帧未提取，且第${video.startFrame + 1}帧图片也不存在`);
                }
            }
        }
        
        // 调用 sora-2 生成视频
        const videoData = await generateVideo(
            apiKey,
            startFrameImage,
            generatedImages[video.endFrame],
            prompt,
            index
        );
        
        // 保存视频
        generatedVideos[index] = videoData;
        
        // 显示视频
        displayVideo(index, videoData);
        
        // 添加提取最后一帧的按钮（手动触发）
        addExtractLastFrameButton(index, videoData);
        
        // 更新状态
        statusBadge.textContent = '已完成';
        statusBadge.className = 'status-badge status-completed';
        
        // 检查是否所有视频都完成
        if (generatedVideos.filter(v => v !== null && v !== undefined).length === videoPrompts.length) {
            document.getElementById('completionMessage').style.display = 'block';
        }
        
    } catch (err) {
        console.error(`生成视频${index + 1}失败:`, err);
        previewContainer.innerHTML = `
            <div style="background: #fef2f2; padding: 12px; border-radius: 8px; border-left: 3px solid #dc2626; margin-top: 12px;">
                <p style="color: #dc2626; margin: 0; font-size: 0.9em;">❌ 视频生成失败: ${err.message}</p>
            </div>
        `;
        statusBadge.textContent = '失败';
        statusBadge.className = 'status-badge status-pending';
    } finally {
        loadingContainer.style.display = 'none';
        generateBtn.disabled = false;
    }
}

// 生成所有视频
async function generateAllVideos() {
    // 检查第一段视频的前置条件
    if (!generatedImages[0] || !generatedImages[1]) {
        showError('请先生成第1帧和第2帧的图片');
        return;
    }
    
    // 检查后续段落的结束帧是否已生成
    for (let i = 1; i < videoPromptStatus.length; i++) {
        if (!generatedImages[i + 1]) {
            showError(`请先生成第${i + 2}帧的图片`);
            return;
        }
    }

    // 按顺序生成所有视频
    for (let i = 0; i < videoPromptStatus.length; i++) {
        // 如果已经生成过，跳过
        if (generatedVideos[i]) {
            console.log(`第${i + 1}段视频已生成，跳过`);
            continue;
        }
        
        // 生成视频提示词（如果还没有）
        if (!videoPrompts[i]) {
            await generateVideoPromptForPair(i);
        }
        
        // 生成视频
        await generateSingleVideo(i);
        
        // 如果生成失败，停止后续生成
        if (!generatedVideos[i]) {
            showError(`第${i + 1}段视频生成失败，已停止后续生成`);
            break;
        }
    }
}

// 调用视频生成模型（支持 sora-2 和 veo_3_1_i2v_s_fast_fl_landscape）
// 使用流式模式调用，兼容不支持非流式的模型
async function generateVideo(apiKey, startFrame, endFrame, prompt, videoIndex = 0) {
    // 获取用户选择的视频生成模型
    const videoModelSelect = document.getElementById('videoModelSelect');
    const videoModel = videoModelSelect ? videoModelSelect.value : 'sora-2';
    
    const isRealistic = currentStyleText && (currentStyleText.includes('真人') || currentStyleText.includes('写实') || currentStyleText.includes('摄影'));
    const styleType = isRealistic ? '真人写实/当前摄影风格' : '二次元/当前风格';
    const motionType = isRealistic ? '镜头运动与人物表演自然真实' : '镜头与动作';
    
    // 根据是否是第一段视频，调整提示词
    const startFrameNote = videoIndex === 0 
        ? '视频的起始画面，视频必须从这张图片开始'
        : '视频的起始画面（这是从前一段视频的最后一帧提取的），视频必须从这个画面自然开始';
    
    // 构建完整的视频生成提示词
    const fullPrompt = `请生成一段 10 秒的视频。我提供了 2 张图片：
- 【图片1（首帧）】：${startFrameNote}
- 【图片2（尾帧）】：视频的结束画面参考

请严格按照以下要求生成视频：

${prompt}

核心要求：
- 时长：10 秒
- 画面比例：16:9 横屏（Landscape，宽屏格式）
- 【首帧约束】：视频的第 0 秒必须完全匹配图片1（首帧），包括人物姿态、场景、构图
- 【尾帧参考】：视频结束时应该向图片2（尾帧）的场景和状态自然过渡，但优先保证视频本身的流畅性和完整性
- 【过渡要求】：从图片1平滑自然地过渡，${motionType}流畅连贯
- 画面：风格与角色形象保持一致，色调统一${isRealistic ? '，追求真人影视效果' : ''}
- 文本：字幕、路牌、标识等全部使用简体中文，禁止出现任何英文或拼音；如无必要可不放文字
- 音频：包含对白与对应情绪的语音，以及提示词中的环境音/音效/配乐
- 画质：清晰、高质量输出${isRealistic ? '，真人摄影级别' : ''}

【重要】：请确保视频的最后画面稳定清晰，以便提取作为下一段视频的开始。`;

    const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: videoModel,
            stream: true,  // 启用流式模式
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${startFrame.mimeType};base64,${startFrame.base64}`
                            }
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${endFrame.mimeType};base64,${endFrame.base64}`
                            }
                        },
                        {
                            type: 'text',
                            text: fullPrompt
                        }
                    ]
                }
            ],
            temperature: 0.7
        })
    });

    if (!response.ok) {
        let errorMessage = `HTTP错误: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
    }

    // 处理流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // 处理 SSE 格式的数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // 保留未完成的行

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
            
            if (trimmedLine.startsWith('data: ')) {
                try {
                    const jsonStr = trimmedLine.slice(6);  // 移除 'data: ' 前缀
                    const chunk = JSON.parse(jsonStr);
                    
                    // 提取增量内容
                    const delta = chunk.choices?.[0]?.delta;
                    if (delta?.content) {
                        fullContent += delta.content;
                    }
                } catch (e) {
                    // 解析失败时跳过该行，可能是不完整的 JSON
                    console.warn('流式解析跳过:', trimmedLine);
                }
            }
        }
    }

    // 处理 buffer 中可能剩余的数据
    if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
        if (buffer.trim().startsWith('data: ')) {
            try {
                const jsonStr = buffer.trim().slice(6);
                const chunk = JSON.parse(jsonStr);
                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                    fullContent += delta.content;
                }
            } catch (e) {
                console.warn('流式解析最终buffer跳过:', buffer);
            }
        }
    }

    console.log('流式响应完整内容:', fullContent);

    // 统一字符串解析逻辑：支持裸链接和 Markdown 链接
    const tryParseUrlFromString = (text) => {
        if (!text || typeof text !== 'string') return null;
        // 先尝试匹配 markdown 链接 [xxx](http...)
        const markdownMatch = text.match(/\((https?:\/\/[^\s)]+)\)/i);
        if (markdownMatch && markdownMatch[1]) return markdownMatch[1];
        // 再匹配普通 http/https 链接
        const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
        if (urlMatch && urlMatch[0]) return urlMatch[0];
        return null;
    };

    // 从完整内容中提取视频链接
    if (fullContent) {
        const foundUrl = tryParseUrlFromString(fullContent);
        if (foundUrl) {
            return { type: 'url', url: foundUrl };
        }
        if (fullContent.includes('base64')) {
            return { type: 'base64', data: fullContent };
        }
    }
    
    throw new Error('未能从流式响应中提取视频数据，请检查 API 返回格式');
}

// 显示视频
function displayVideo(index, videoData) {
    const previewContainer = document.getElementById(`videoPreviewContainer${index}`);
    
    let videoHtml = '';
    
    if (videoData.type === 'url') {
        videoHtml = `
            <div class="video-preview">
                <video controls style="width: 100%; border-radius: 8px; margin-top: 12px;">
                    <source src="${videoData.url}" type="video/mp4">
                    您的浏览器不支持视频播放
                </video>
                <button onclick="downloadVideoUrl('${videoData.url}', 'video-${index + 1}')" class="download-btn">
                    📥 下载视频
                </button>
            </div>
        `;
    } else if (videoData.type === 'base64') {
        videoHtml = `
            <div class="video-preview">
                <video controls style="width: 100%; border-radius: 8px; margin-top: 12px;">
                    <source src="${videoData.data}" type="video/mp4">
                    您的浏览器不支持视频播放
                </video>
                <button onclick="downloadVideoBase64('${videoData.data}', 'video-${index + 1}')" class="download-btn">
                    📥 下载视频
                </button>
            </div>
        `;
    }
    
    previewContainer.innerHTML = videoHtml;
}

// 添加提取最后一帧的按钮
function addExtractLastFrameButton(index, videoData) {
    const previewContainer = document.getElementById(`videoPreviewContainer${index}`);
    
    // 如果这是最后一段视频，不需要提取按钮
    if (index >= videoPrompts.length - 1) {
        return;
    }
    
    // 如果已经提取过了，不再添加按钮
    if (videoLastFrames[index]) {
        const successMsg = document.createElement('div');
        successMsg.style.cssText = 'background: #f0fdf4; padding: 8px; border-radius: 6px; border-left: 3px solid #10b981; margin-top: 8px;';
        successMsg.innerHTML = `<p style="color: #059669; margin: 0; font-size: 0.85em;">✅ 已提取最后一帧，可用于下一段视频</p>`;
        previewContainer.appendChild(successMsg);
        return;
    }
    
    // 创建提取按钮容器
    const extractContainer = document.createElement('div');
    extractContainer.id = `extractContainer${index}`;
    extractContainer.style.cssText = 'margin-top: 8px;';
    
    const extractBtn = document.createElement('button');
    extractBtn.className = 'secondary-btn';
    extractBtn.style.cssText = 'width: 100%; padding: 8px; background: #8b5cf6; color: white;';
    extractBtn.innerHTML = '🎬 提取最后一帧（用于下一段视频）';
    extractBtn.onclick = async () => {
        extractBtn.disabled = true;
        extractBtn.innerHTML = '⏳ 正在提取...';
        
        try {
            const videoUrl = videoData.type === 'url' ? videoData.url : videoData.data;
            const lastFrame = await extractLastFrameFromVideo(videoUrl);
            videoLastFrames[index] = lastFrame;
            console.log(`✅ 已提取第${index + 1}段视频的最后一帧，将用于第${index + 2}段视频的首帧`);
            
            // 更新下一段视频的按钮状态（启用视频提示词和视频生成按钮）
            updateVideoPairReadiness(index + 1);
            
            // 显示成功消息
            extractContainer.innerHTML = `
                <div style="background: #f0fdf4; padding: 8px; border-radius: 6px; border-left: 3px solid #10b981;">
                    <p style="color: #059669; margin: 0; font-size: 0.85em;">✅ 已提取最后一帧，可用于下一段视频</p>
                </div>
            `;
        } catch (extractErr) {
            console.error('提取视频最后一帧失败:', extractErr);
            extractBtn.disabled = false;
            extractBtn.innerHTML = '🎬 提取最后一帧（用于下一段视频）';
            showError(`提取最后一帧失败: ${extractErr.message}`);
        }
    };
    
    extractContainer.appendChild(extractBtn);
    previewContainer.appendChild(extractContainer);
}

// 下载图片
function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 下载视频（URL 形式）
async function downloadVideoUrl(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${filename}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        alert('下载失败: ' + err.message);
    }
}

// 下载视频（base64 形式）
function downloadVideoBase64(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 显示错误信息
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 隐藏错误信息
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// 打开图片模态框
function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.classList.add('active');
    modalImg.src = imageSrc;
    document.body.style.overflow = 'hidden';
}

// 关闭图片模态框
function closeImageModal(event) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (event.target === modal || event.target.classList.contains('image-modal-close')) {
        modal.classList.remove('active');
        modalImg.src = '';
        document.body.style.overflow = '';
    }
}

// ESC键关闭模态框
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('imageModal');
        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
            document.getElementById('modalImage').src = '';
            document.body.style.overflow = '';
        }
    }
});

// ==================== 剧情解说文案生成功能 ====================

// 生成剧情解说文案
async function generateNarrationScript() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('modelSelect').value;
    const script = document.getElementById('script').value.trim();
    const btn = document.getElementById('generateNarrationBtn');
    const container = document.getElementById('narrationContainer');
    const contentDiv = document.getElementById('narrationContent');
    
    if (!apiKey) {
        showError('请输入 API 密钥');
        return;
    }
    
    if (currentFramePrompts.length === 0) {
        showError('请先生成图片提示词');
        return;
    }
    
    // 检查是否有生成的视频
    const hasVideos = generatedVideos.filter(v => v).length > 0;
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📝 正在生成解说文案...';
    }
    hideError();
    
    try {
        // 构建分镜信息摘要
        let framesInfo = '';
        currentFramePrompts.forEach((frame, index) => {
            framesInfo += `\n【第${frame.index}帧】\n`;
            framesInfo += `场景：${frame.scene}\n`;
            framesInfo += `角色动作：${frame.character}\n`;
            if (frame.dialogue) {
                framesInfo += `对话/旁白：${frame.dialogue}\n`;
            }
            framesInfo += `氛围：${frame.style}\n`;
        });
        
        // 构建视频段落信息（如果有）
        let videosInfo = '';
        if (videoPrompts.length > 0) {
            videosInfo = '\n\n【视频段落信息】';
            videoPrompts.forEach((video, index) => {
                if (video) {
                    videosInfo += `\n段落${index + 1}（第${video.startFrame + 1}帧→第${video.endFrame + 1}帧）：`;
                    if (video.transition) videosInfo += `\n过渡：${video.transition}`;
                    if (video.dialogue) videosInfo += `\n对白：${video.dialogue}`;
                }
            });
        }
        
        const isRealistic = currentStyleText && (currentStyleText.includes('真人') || currentStyleText.includes('写实') || currentStyleText.includes('摄影'));
        const narratorStyle = isRealistic ? '配音解说员' : '动漫解说主播';
        const contentStyle = isRealistic ? '悬疑/剧情片' : '漫剧/动漫';
        
        const prompt = `你是一位专业的${narratorStyle}，擅长为短视频创作引人入胜的剧情解说文案。

现在需要你根据以下视频漫剧的分镜信息，生成一份完整的剧情解说文案脚本。这份文案将用于视频的配音解说，需要能够快速连贯地解说整个剧情。

【原始剧本】
${script}

【角色信息】
${characterDescriptionText || '（未提取角色信息）'}

【分镜详情】${framesInfo}${videosInfo}

【风格】${currentStyleText || '二次元动漫风格'}${currentStylePreference ? `，偏好：${currentStylePreference}` : ''}

请生成符合以下要求的解说文案：

1. 【整体风格】
   - 采用${contentStyle}解说的口吻，生动有趣
   - 语言节奏明快，适合配音朗读
   - 能够吸引观众注意力，制造悬念感

2. 【结构要求】
   - 开场引入（吸引观众，设置悬念）
   - 按照分镜顺序推进剧情
   - 每个片段的解说要与画面配合
   - 结尾留有回味或引发思考

3. 【内容要点】
   - 描述关键场景和氛围
   - 解读角色的情绪和心理
   - 串联剧情发展的逻辑
   - 在合适的地方加入旁白或心理描写
   - 保持整体连贯性，不要割裂

4. 【时长控制】
   - 总共 ${currentFramePrompts.length} 个分镜，${videoPrompts.length} 段视频
   - 每段视频约 10 秒
   - 解说文案总时长约 ${currentFramePrompts.length * 10} 秒左右
   - 语速适中，不要太快也不要太慢

5. 【输出格式】
   请按以下格式输出：
【开场】
（开场解说词，1-2句话吸引观众）

【第1段】（对应第1帧→第2帧的视频）
（这段的解说词...）

【第2段】（对应第2帧→第3帧的视频）
（这段的解说词...）

...依此类推...

【结尾】
（收尾解说词，回味或悬念）

【完整连贯版】
（把上面的解说词按顺序连起来，形成一个可以直接朗读的完整文案，不包含段落标记）

现在请生成这份剧情解说文案：`;

        const response = await fetch('https://api.antsk.cn/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 3000
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || `API 请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        const narration = data.choices?.[0]?.message?.content;
        
        if (!narration) {
            throw new Error('AI 未返回解说文案');
        }
        
        // 保存生成的解说文案
        generatedNarration = narration;
        
        // 显示解说文案
        displayNarration(narration);
        
    } catch (err) {
        console.error('生成解说文案失败:', err);
        showError(`生成解说文案失败: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '📝 生成剧情解说文案';
        }
    }
}

// 显示解说文案
function displayNarration(narration) {
    const container = document.getElementById('narrationContainer');
    const contentDiv = document.getElementById('narrationContent');
    
    if (!container || !contentDiv) {
        console.error('解说文案容器不存在');
        return;
    }
    
    // 格式化显示
    let formattedHtml = narration
        .replace(/【开场】/g, '<div style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; margin: 15px 0 8px 0; color: #92400e; font-weight: 600;">🎬 开场</div>')
        .replace(/【结尾】/g, '<div style="background: #fef3c7; padding: 8px 12px; border-radius: 6px; margin: 15px 0 8px 0; color: #92400e; font-weight: 600;">🎬 结尾</div>')
        .replace(/【第(\d+)段】/g, '<div style="background: #ede9fe; padding: 8px 12px; border-radius: 6px; margin: 15px 0 8px 0; color: #7c3aed; font-weight: 600;">🎥 第$1段</div>')
        .replace(/【完整连贯版】/g, '<div style="background: #fee2e2; padding: 10px 14px; border-radius: 8px; margin: 20px 0 10px 0; color: #dc2626; font-weight: 700; font-size: 1.1em;">📋 完整连贯版（可直接用于配音）</div>')
        .replace(/（([^）]+)）/g, '<span style="color: #666; font-size: 0.9em;">（$1）</span>')
        .replace(/\n/g, '<br>');
    
    contentDiv.innerHTML = formattedHtml;
    container.style.display = 'block';
    
    // 滚动到解说文案区域
    setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// 下载解说文案
function downloadNarration() {
    if (!generatedNarration) {
        showError('请先生成解说文案');
        return;
    }
    
    const blob = new Blob([generatedNarration], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `剧情解说文案_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// 复制解说文案到剪贴板
async function copyNarration() {
    if (!generatedNarration) {
        showError('请先生成解说文案');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(generatedNarration);
        
        // 显示复制成功提示
        const btn = document.getElementById('copyNarrationBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ 已复制!';
            btn.style.background = '#22c55e';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }
    } catch (err) {
        showError('复制失败: ' + err.message);
    }
}
