import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const PLUGINS_DIR = '/root/ai-sec-web/plugins';

async function findPluginPackage(): Promise<string | null> {
  try {
    const files = await fs.readdir(PLUGINS_DIR);
    const tarFile = files.find(f => f.startsWith('aigov-insight-') && f.endsWith('.tar.gz'));
    return tarFile ? path.join(PLUGINS_DIR, tarFile) : null;
  } catch {
    return null;
  }
}

async function checkInstallScript(): Promise<boolean> {
  try {
    await fs.access(path.join(PLUGINS_DIR, 'install-plugin.sh'));
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const hasInstallScript = await checkInstallScript();
    
    if (!hasInstallScript) {
      const pluginPath = await findPluginPackage();
      
      if (!pluginPath) {
        return NextResponse.json({
          success: false,
          message: '未找到 AIGov 插件安装包，请确保 plugins/aigov-insight-*.tar.gz 文件存在',
        }, { status: 404 });
      }
      
      const pluginFile = path.basename(pluginPath);
      
      try {
        await execAsync(`cd ${PLUGINS_DIR} && tar -xzf ${pluginFile}`, { timeout: 30000 });
      } catch (extractError) {
        console.error('Extract error:', extractError);
        return NextResponse.json({
          success: false,
          message: '解压插件包失败',
        }, { status: 500 });
      }
    }

    try {
      await execAsync(`chmod +x ${PLUGINS_DIR}/install-plugin.sh`, { timeout: 5000 });
    } catch (chmodError) {
      console.log('Chmod warning:', chmodError);
    }
    
    try {
      await execAsync(`cd ${PLUGINS_DIR} && ./install-plugin.sh`, { timeout: 60000 });
    } catch (installError: any) {
      console.error('Install script error:', installError);
      return NextResponse.json({
        success: false,
        message: `安装脚本执行失败: ${installError.message}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'AIGov 安全防护服务安装成功，OpenClaw Gateway 已重启',
    });
  } catch (error) {
    console.error('Error installing plugin:', error);
    return NextResponse.json({
      success: false,
      message: `安装失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }, { status: 500 });
  }
}
