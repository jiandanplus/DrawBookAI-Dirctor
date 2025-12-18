import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { ProjectState } from '../types';

let ffmpegInstance: FFmpeg | null = null;

/**
 * 初始化 FFmpeg 实例（懒加载）
 */
async function loadFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      onProgress(Math.round(progress * 100));
    }
  });

  // 加载 FFmpeg Core（从本地文件）
  const baseURL = '/ffmpeg';
  
  try {
    console.log('[FFmpeg] 正在从本地加载 FFmpeg Core...');
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    console.log('[FFmpeg] FFmpeg Core 加载成功');
  } catch (error) {
    console.error('[FFmpeg] 加载失败:', error);
    throw new Error(`无法加载 FFmpeg Core: ${error instanceof Error ? error.message : '未知错误'}`);
  }

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * 合并多个视频片段为一个 MP4 文件并下载
 */
export async function downloadMasterVideo(
  project: ProjectState,
  onProgress?: (phase: string, progress: number) => void
): Promise<void> {
  try {
    // 1. 筛选已完成的视频片段
    const completedShots = project.shots.filter(shot => shot.interval?.videoUrl);
    
    if (completedShots.length === 0) {
      throw new Error('没有可导出的视频片段');
    }

    onProgress?.('准备中...', 0);

    // 2. 加载 FFmpeg
    const ffmpeg = await loadFFmpeg((prog) => {
      onProgress?.('加载 FFmpeg...', Math.min(prog, 15));
    });

    onProgress?.('下载视频片段...', 20);

    // 3. 下载所有视频文件到 FFmpeg 虚拟文件系统
    const videoFiles: string[] = [];
    for (let i = 0; i < completedShots.length; i++) {
      const shot = completedShots[i];
      const videoUrl = shot.interval!.videoUrl!;
      const fileName = `video_${i}.mp4`;
      
      try {
        const videoData = await fetchFile(videoUrl);
        await ffmpeg.writeFile(fileName, videoData);
        videoFiles.push(fileName);
        
        const downloadProgress = 20 + Math.round((i + 1) / completedShots.length * 30);
        onProgress?.('下载视频片段...', downloadProgress);
      } catch (err) {
        console.error(`下载视频片段 ${i} 失败:`, err);
        throw new Error(`下载视频片段 ${i + 1} 失败`);
      }
    }

    // 4. 创建 FFmpeg concat 文件列表
    const concatFileContent = videoFiles.map(f => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatFileContent));

    onProgress?.('合并视频中...', 55);

    // 5. 使用 FFmpeg concat 协议合并视频
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy',  // 直接拷贝流，不重新编码（速度快）
      'output.mp4'
    ]);

    onProgress?.('准备下载...', 90);

    // 6. 读取合并后的视频
    const outputData = await ffmpeg.readFile('output.mp4');
    // 创建 Blob（强制类型转换以解决 TypeScript 类型推断问题）
    const blob = new Blob([outputData as BlobPart], { type: 'video/mp4' });

    // 7. 触发浏览器下载
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.scriptData?.title || project.title || 'master'}_master.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 8. 清理 FFmpeg 文件系统
    for (const file of videoFiles) {
      try {
        await ffmpeg.deleteFile(file);
      } catch (e) {
        // 忽略清理错误
      }
    }
    await ffmpeg.deleteFile('concat_list.txt');
    await ffmpeg.deleteFile('output.mp4');

    onProgress?.('完成！', 100);
  } catch (error) {
    console.error('视频导出失败:', error);
    throw error;
  }
}

/**
 * 估算合并后的视频总时长（秒）
 * 每个镜头默认10秒
 */
export function estimateTotalDuration(project: ProjectState): number {
  return project.shots.reduce((acc, shot) => {
    return acc + (shot.interval?.duration || 10);
  }, 0);
}

/**
 * 下载单个文件并转换为 Blob
 */
async function downloadFile(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.statusText}`);
  }
  return await response.blob();
}

/**
 * 创建 ZIP 文件并下载所有源资源
 */
export async function downloadSourceAssets(
  project: ProjectState,
  onProgress?: (phase: string, progress: number) => void
): Promise<void> {
  try {
    // 动态导入 JSZip
    onProgress?.('正在加载 ZIP 库...', 0);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // 收集所有需要下载的资源
    const assets: { url: string; path: string }[] = [];

    // 1. 角色参考图
    if (project.scriptData?.characters) {
      for (const char of project.scriptData.characters) {
        if (char.referenceImage) {
          assets.push({
            url: char.referenceImage,
            path: `characters/${char.name.replace(/[\/\\?%*:|"<>]/g, '_')}_base.jpg`
          });
        }
        // 角色变体图
        if (char.variations) {
          for (const variation of char.variations) {
            if (variation.referenceImage) {
              assets.push({
                url: variation.referenceImage,
                path: `characters/${char.name.replace(/[\/\\?%*:|"<>]/g, '_')}_${variation.name.replace(/[\/\\?%*:|"<>]/g, '_')}.jpg`
              });
            }
          }
        }
      }
    }

    // 2. 场景参考图
    if (project.scriptData?.scenes) {
      for (const scene of project.scriptData.scenes) {
        if (scene.referenceImage) {
          assets.push({
            url: scene.referenceImage,
            path: `scenes/${scene.location.replace(/[\/\\?%*:|"<>]/g, '_')}.jpg`
          });
        }
      }
    }

    // 3. 镜头关键帧图片
    if (project.shots) {
      for (let i = 0; i < project.shots.length; i++) {
        const shot = project.shots[i];
        const shotNum = String(i + 1).padStart(3, '0');
        
        if (shot.keyframes) {
          for (const keyframe of shot.keyframes) {
            if (keyframe.imageUrl) {
              assets.push({
                url: keyframe.imageUrl,
                path: `shots/shot_${shotNum}_${keyframe.type}_frame.jpg`
              });
            }
          }
        }

        // 4. 视频片段
        if (shot.interval?.videoUrl) {
          assets.push({
            url: shot.interval.videoUrl,
            path: `videos/shot_${shotNum}.mp4`
          });
        }
      }
    }

    if (assets.length === 0) {
      throw new Error('没有可下载的资源');
    }

    onProgress?.('正在下载资源...', 5);

    // 下载所有资源并添加到 ZIP
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      try {
        const blob = await downloadFile(asset.url);
        zip.file(asset.path, blob);
        
        const progress = 5 + Math.round((i + 1) / assets.length * 80);
        onProgress?.(`下载中 (${i + 1}/${assets.length})...`, progress);
      } catch (error) {
        console.error(`下载资源失败: ${asset.path}`, error);
        // 继续下载其他文件，不中断整个流程
      }
    }

    onProgress?.('正在生成 ZIP 文件...', 90);

    // 生成 ZIP 文件
    const zipBlob = await zip.generateAsync(
      { type: 'blob' },
      (metadata) => {
        const progress = 90 + Math.round(metadata.percent / 10);
        onProgress?.('正在压缩...', progress);
      }
    );

    // 触发下载
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.scriptData?.title || project.title || 'project'}_source_assets.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onProgress?.('完成！', 100);
  } catch (error) {
    console.error('下载源资源失败:', error);
    throw error;
  }
}
