import { ScriptData, Shot, Character, Scene } from "../types";
import { addRenderLogWithTokens } from './renderLogService';

// Module-level variable to store the key at runtime
let runtimeApiKey: string = process.env.API_KEY || "";

export const setGlobalApiKey = (key: string) => {
  runtimeApiKey = key;
};

// Helper to check API key is available
const checkApiKey = () => {
  if (!runtimeApiKey) throw new Error("API Key missing. Please configure your antsk API Key.");
  return runtimeApiKey;
};

// antsk API base URL
const ANTSK_API_BASE = 'https://api.antsk.cn';

/**
 * Verify API Key connectivity
 * Uses a minimal API call to test if the key is valid
 * @param key - API key to verify
 * @returns Promise<boolean> - true if key is valid, false otherwise
 */
export const verifyApiKey = async (key: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-41',
        messages: [{ role: 'user', content: '仅返回1' }],
        temperature: 0.1,
        max_tokens: 5
      })
    });

    if (!response.ok) {
      let errorMessage = `验证失败: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // ignore
      }
      return { success: false, message: errorMessage };
    }

    const data = await response.json();
    // Check if we got a valid response
    if (data.choices?.[0]?.message?.content !== undefined) {
      return { success: true, message: 'API Key 验证成功' };
    } else {
      return { success: false, message: '返回格式异常' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || '网络错误' };
  }
};

// Helper for retry logic on 429 errors
const retryOperation = async <T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 2000): Promise<T> => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (e: any) {
      lastError = e;
      // Check for quota/rate limit errors (429)
      if (e.status === 429 || e.code === 429 || e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('RESOURCE_EXHAUSTED')) {
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`Hit rate limit, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw e; // Throw other errors immediately
    }
  }
  throw lastError;
};

// Helper to clean JSON string from Markdown fences or accidental text
const cleanJsonString = (str: string): string => {
  if (!str) return "{}";
  // Remove ```json ... ``` or ``` ... ```
  let cleaned = str.replace(/```json\n?/g, '').replace(/```/g, '');
  return cleaned.trim();
};

// antsk chat completion API call
const chatCompletion = async (prompt: string, model: string = 'gpt-5.1', temperature: number = 0.7, maxTokens: number = 8192): Promise<string> => {
  const apiKey = checkApiKey();
  
  // console.log('🌐 API请求 - 模型:', model, '| 温度:', temperature);
  
  const response = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: temperature,
      max_tokens: maxTokens
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
  return data.choices?.[0]?.message?.content || '';
};

/**
 * Agent 1 & 2: Script Structuring & Breakdown
 * Uses antsk chat completion for fast, structured text generation.
 */
export const parseScriptToData = async (rawText: string, language: string = '中文', model: string = 'gpt-5.1'): Promise<ScriptData> => {
  console.log('📝 parseScriptToData 调用 - 使用模型:', model);
  const startTime = Date.now();
  
  const prompt = `
    Analyze the text and output a JSON object in the language: ${language}.
    
    Tasks:
    1. Extract title, genre, logline (in ${language}).
    2. Extract characters (id, name, gender, age, personality).
    3. Extract scenes (id, location, time, atmosphere).
    4. Break down the story into paragraphs linked to scenes.
    
    Input:
    "${rawText.slice(0, 30000)}" // Limit input context if needed
    
    Output ONLY valid JSON with this structure:
    {
      "title": "string",
      "genre": "string",
      "logline": "string",
      "characters": [{"id": "string", "name": "string", "gender": "string", "age": "string", "personality": "string"}],
      "scenes": [{"id": "string", "location": "string", "time": "string", "atmosphere": "string"}],
      "storyParagraphs": [{"id": number, "text": "string", "sceneRefId": "string"}]
    }
  `;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));

  let parsed: any = {};
  try {
    const text = cleanJsonString(responseText);
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse script data JSON:", e);
    parsed = {};
  }
  
  // Enforce String IDs for consistency and init variations
  const characters = Array.isArray(parsed.characters) ? parsed.characters.map((c: any) => ({
    ...c, 
    id: String(c.id),
    variations: [] // Initialize empty variations
  })) : [];
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.map((s: any) => ({...s, id: String(s.id)})) : [];
  const storyParagraphs = Array.isArray(parsed.storyParagraphs) ? parsed.storyParagraphs.map((p: any) => ({...p, sceneRefId: String(p.sceneRefId)})) : [];

  const genre = parsed.genre || "通用";

  // Generate visual prompts for characters and scenes
  console.log("🎨 正在为角色和场景生成视觉提示词...");
  
  // Generate character visual prompts
  for (let i = 0; i < characters.length; i++) {
    try {
      // Add delay to avoid rate limits (1.5s between requests)
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`  生成角色提示词: ${characters[i].name}`);
      characters[i].visualPrompt = await generateVisualPrompts('character', characters[i], genre, model);
    } catch (e) {
      console.error(`Failed to generate visual prompt for character ${characters[i].name}:`, e);
      // Continue with other characters even if one fails
    }
  }

  // Generate scene visual prompts
  for (let i = 0; i < scenes.length; i++) {
    try {
      // Add delay to avoid rate limits
      if (i > 0 || characters.length > 0) await new Promise(resolve => setTimeout(resolve, 1500));
      
      console.log(`  生成场景提示词: ${scenes[i].location}`);
      scenes[i].visualPrompt = await generateVisualPrompts('scene', scenes[i], genre, model);
    } catch (e) {
      console.error(`Failed to generate visual prompt for scene ${scenes[i].location}:`, e);
      // Continue with other scenes even if one fails
    }
  }

  console.log("✅ 视觉提示词生成完成！");

  const result = {
    title: parsed.title || "未命名剧本",
    genre: genre,
    logline: parsed.logline || "",
    language: language,
    characters,
    scenes,
    storyParagraphs
  };

  // Log successful script parsing
  addRenderLogWithTokens({
    type: 'script-parsing',
    resourceId: 'script-parse-' + Date.now(),
    resourceName: result.title,
    status: 'success',
    model: model,
    prompt: prompt.substring(0, 200) + '...',
    duration: Date.now() - startTime
  });

  return result;
  } catch (error: any) {
    // Log failed script parsing
    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: '剧本解析',
      status: 'failed',
      model: model,
      prompt: prompt.substring(0, 200) + '...',
      error: error.message,
      duration: Date.now() - startTime
    });
    throw error;
  }
};

export const generateShotList = async (scriptData: ScriptData, model: string = 'gpt-5.1'): Promise<Shot[]> => {
  console.log('🎬 generateShotList 调用 - 使用模型:', model);
  const overallStartTime = Date.now();
  
  if (!scriptData.scenes || scriptData.scenes.length === 0) {
    return [];
  }

  const lang = scriptData.language || '中文';
  
  // Helper to process a single scene
  // We process per-scene to avoid token limits and parsing errors with large JSONs
  const processScene = async (scene: Scene, index: number): Promise<Shot[]> => {
    const sceneStartTime = Date.now();
    const paragraphs = scriptData.storyParagraphs
      .filter(p => String(p.sceneRefId) === String(scene.id))
      .map(p => p.text)
      .join('\n');

    if (!paragraphs.trim()) return [];

    const prompt = `
      Act as a professional cinematographer. Generate a detailed shot list (Camera blocking) for Scene ${index + 1}.
      Language for Text Output: ${lang}.
      
      Scene Details:
      Location: ${scene.location}
      Time: ${scene.time}
      Atmosphere: ${scene.atmosphere}
      
      Scene Action:
      "${paragraphs.slice(0, 5000)}"
      
      Context:
      Genre: ${scriptData.genre}
      Target Duration (Whole Script): ${scriptData.targetDuration || 'Standard'}
      
      Characters:
      ${JSON.stringify(scriptData.characters.map(c => ({ id: c.id, name: c.name, desc: c.visualPrompt || c.personality })))}

      Instructions:
      1. Create a sequence of shots covering the action.
      2. IMPORTANT: Limit to maximum 6-8 shots per scene to prevent JSON truncation errors. If the scene is long, summarize the less critical actions.
      3. 'cameraMovement': Use professional terms (e.g., Dolly In, Pan Right, Static, Handheld, Tracking).
      4. 'shotSize': Specify the field of view (e.g., Extreme Close-up, Medium Shot, Wide Shot).
      5. 'actionSummary': Detailed description of what happens in the shot (in ${lang}).
      6. 'visualPrompt': Detailed English description for image generation. Keep it under 40 words to save tokens.
      
      Output ONLY a valid JSON array like:
      [
        {
          "id": "string",
          "sceneId": "${scene.id}",
          "actionSummary": "string",
          "dialogue": "string (empty if none)",
          "cameraMovement": "string",
          "shotSize": "string",
          "characters": ["string"],
          "keyframes": [
            {"id": "string", "type": "start|end", "visualPrompt": "string"}
          ]
        }
      ]
    `;

    try {
      console.log(`  📡 场景 ${index + 1} API调用 - 模型:`, model);
      const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));
      const text = cleanJsonString(responseText);
      const shots = JSON.parse(text);
      
      // FIX: Explicitly override the sceneId to match the source scene
      // This prevents the AI from hallucinating incorrect scene IDs
      const validShots = Array.isArray(shots) ? shots : [];
      const result = validShots.map(s => ({
        ...s,
        sceneId: String(scene.id) // Force String
      }));
      
      // Log successful shot generation for this scene
      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'success',
        model: model,
        prompt: prompt.substring(0, 200) + '...',
        duration: Date.now() - sceneStartTime
      });
      
      return result;

    } catch (e: any) {
      console.error(`Failed to generate shots for scene ${scene.id}`, e);
      
      // Log failed shot generation for this scene
      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'failed',
        model: model,
        prompt: prompt.substring(0, 200) + '...',
        error: e.message || String(e),
        duration: Date.now() - sceneStartTime
      });
      
      return [];
    }
  };

  // Process scenes sequentially (Batch Size 1) to strictly minimize rate limits
  const BATCH_SIZE = 1;
  const allShots: Shot[] = [];
  
  for (let i = 0; i < scriptData.scenes.length; i += BATCH_SIZE) {
    // Add delay between batches
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));
    
    const batch = scriptData.scenes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((scene, idx) => processScene(scene, i + idx))
    );
    batchResults.forEach(shots => allShots.push(...shots));
  }

  // Re-index shots to be sequential globally and set initial status
  return allShots.map((s, idx) => ({
    ...s,
    id: `shot-${idx + 1}`,
    keyframes: Array.isArray(s.keyframes) ? s.keyframes.map(k => ({ 
      ...k, 
      id: `kf-${idx + 1}-${k.type}`, // Normalized ID
      status: 'pending' 
    })) : []
  }));
};

/**
 * Agent 3: Visual Design (Prompt Generation)
 */
export const generateVisualPrompts = async (type: 'character' | 'scene', data: Character | Scene, genre: string, model: string = 'gpt-5.1'): Promise<string> => {
   const prompt = `Generate a high-fidelity visual prompt for a ${type} in a ${genre} movie. 
   Data: ${JSON.stringify(data)}. 
   Output only the prompt in English, comma-separated, focused on visual details (lighting, texture, appearance).`;

   return await retryOperation(() => chatCompletion(prompt, model, 0.7, 1024));
};

/**
 * Agent 4 & 6: Image Generation
 * Uses antsk image generation API (gemini-3-pro-image-preview)
 */
export const generateImage = async (prompt: string, referenceImages: string[] = []): Promise<string> => {
  const apiKey = checkApiKey();
  const startTime = Date.now();

  try {
    // If we have reference images, instruct the model to use them for consistency
    let finalPrompt = prompt;
    if (referenceImages.length > 0) {
      finalPrompt = `
      Reference Images Information:
      - The FIRST image provided is the Scene/Environment reference.
      - Any subsequent images are Character references (e.g. Base Look, or specific Variation).
      
      Task:
      Generate a cinematic shot matching this prompt: "${prompt}".
      
      Requirements:
      - STRICTLY maintain the visual style, lighting, and environment from the scene reference.
      - If characters are present, they MUST resemble the character reference images provided.
    `;
    }

  const parts: any[] = [{ text: finalPrompt }];

  // Attach reference images as inline data
  referenceImages.forEach((imgUrl) => {
    // Parse the data URL to get mimeType and base64 data
    const match = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
    }
  });

  const response = await retryOperation(async () => {
    const res = await fetch(`${ANTSK_API_BASE}/v1beta/models/gemini-3-pro-image-preview:generateContent`, {
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

    if (!res.ok) {
      let errorMessage = `HTTP错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  // Extract base64 image
  const candidates = response.candidates || [];
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        const result = `data:image/png;base64,${part.inlineData.data}`;
        
        // Log successful generation
        addRenderLogWithTokens({
          type: 'keyframe',
          resourceId: 'image-' + Date.now(),
          resourceName: prompt.substring(0, 50) + '...',
          status: 'success',
          model: 'imagen-3',
          prompt: prompt,
          duration: Date.now() - startTime
        });
        
        return result;
      }
    }
  }
  
  throw new Error("图片生成失败 (No image data returned)");
  } catch (error: any) {
    // Log failed generation
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'image-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: 'imagen-3',
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });
    
    throw error;
  }
};

/**
 * Agent 8: Video Generation
 * Uses antsk streaming video generation API (veo_3_1_i2v_s_fast_fl_landscape or sora-2)
 * Note: This is a simplified version - actual video generation might need polling/streaming
 */
export const generateVideo = async (prompt: string, startImageBase64?: string, endImageBase64?: string, model: string = 'veo_3_1_i2v_s_fast_fl_landscape'): Promise<string> => {
  const apiKey = checkApiKey();
  
  // Clean base64 strings
  const cleanStart = startImageBase64?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';
  const cleanEnd = endImageBase64?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';

  // Build request body based on model requirements
  const messages: any[] = [
    { role: 'user', content: prompt }
  ];

  // Add images as content if provided
  if (cleanStart) {
    messages[0].content = [
      { type: 'text', text: prompt },
      { 
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${cleanStart}` }
      }
    ];
  }

  if (cleanEnd) {
    if (Array.isArray(messages[0].content)) {
      messages[0].content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${cleanEnd}` }
      });
    }
  }

  // Use streaming to handle long video generation
  const response = await retryOperation(async () => {
    const res = await fetch(`${ANTSK_API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      let errorMessage = `HTTP错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return res;
  });

  // Parse streaming response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let videoUrl = '';
  let buffer = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            
            // Look for video URL in the content
            const urlMatch = content.match(/(https?:\/\/[^\s]+\.mp4)/);
            if (urlMatch) {
              videoUrl = urlMatch[1];
              break;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      
      if (videoUrl) break;
    }
  }

  if (!videoUrl) {
    throw new Error("视频生成失败 (No video URL returned)");
  }

  return videoUrl;
};
