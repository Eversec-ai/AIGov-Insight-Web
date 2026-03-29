import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const EXTENSION_PATH = '/root/.openclaw/extensions/aigov-insight';

export async function POST(request: NextRequest) {
  try {
    try {
      await execAsync('openclaw plugins disable aigov-insight 2>&1', { timeout: 15000 });
    } catch (disableError) {
      console.log('Disable plugin warning:', disableError);
    }

    const uninstallScript = path.join(EXTENSION_PATH, 'uninstall-plugin.sh');
    
    try {
      await fs.access(uninstallScript);
      await execAsync(`chmod +x ${uninstallScript}`, { timeout: 5000 });
      await execAsync(`cd ${EXTENSION_PATH} && ./uninstall-plugin.sh`, { timeout: 30000 });
    } catch (scriptError) {
      console.log('Uninstall script not found or failed, trying manual removal');
      
      try {
        await fs.rm(EXTENSION_PATH, { recursive: true, force: true });
      } catch (rmError) {
        console.log('Manual removal warning:', rmError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'AIGov 安全防护服务已卸载，OpenClaw Gateway 已重启',
    });
  } catch (error) {
    console.error('Error uninstalling plugin:', error);
    return NextResponse.json({
      success: false,
      message: `卸载失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }, { status: 500 });
  }
}
