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

  // 加载 FFmpeg Core（从 CDN）
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

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
 */
export function estimateTotalDuration(project: ProjectState): number {
  return project.shots.reduce((acc, shot) => {
    return acc + (shot.interval?.duration || 3);
  }, 0);
}
